/* browser persistence (unit 8). what is saved is a versioned envelope, never a bare array.
   building, checking and merging are pure; only the read/write functions at the
   bottom touch localStorage. nothing loaded is used until validatePayload() accepts it */

const APP_ID = "dcpet-labborrow";
const STORAGE_KEY = "dcpet-labborrow";
const BACKUP_KEY = "dcpet-labborrow-unreadable"; // raw text of saved data that failed the checks
const SCHEMA_VERSION = 1;

const THEMES = ["system", "light", "dark"];
const DEFAULT_PREFERENCES = { theme: "system", pageSize: 10, sort: { key: "createdAt", direction: "desc" } };

const AUDIT_ACTIONS = ["CREATE", "UPDATE", "STATUS_CHANGE", "DELETE", "IMPORT", "RESET", "RECOVERY"];
const AUDIT_LABELS = {
  CREATE: "Created", UPDATE: "Updated", STATUS_CHANGE: "Status change", DELETE: "Deleted",
  IMPORT: "Imported", RESET: "Reset", RECOVERY: "Recovered"
};
const AUDIT_LIMIT = 500; // oldest entries drop off so storage cannot grow without bound
const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const RESET_PHRASE = "RESET";
const MAX_REPORTED_PROBLEMS = 5;

/* envelope */
function buildPayload(s, savedAt = localDateTime()) {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    savedAt,
    records: s.records,
    nextSeq: s.nextSeq,
    session: { userId: s.session.userId },
    preferences: { theme: s.preferences.theme, pageSize: s.pageSize, sort: { ...s.sort } },
    audit: s.audit
  };
}

/* checks */
const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = value => typeof value === "string" && value.trim() !== "";
const isDateTime = value =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) && isValidISODate(value.slice(0, 10));

const RECORD_TEXT_FIELDS = [
  "id", "borrowerId", "borrowerName", "borrowerEmail", "borrowerType", "equipmentId",
  "purpose", "borrowDate", "dueDate", "status", "createdAt", "createdBy"
];

function historyEntryOk(h) {
  return isPlainObject(h) && isDateTime(h.at) && STATUSES.includes(h.to) &&
    (h.from === null || STATUSES.includes(h.from)) &&
    isText(h.action) && isText(h.actor) && typeof h.note === "string";
}

// first problem in one saved request, or null. same rules a request had to pass to be created
function recordProblem(r, catalog = EQUIPMENT) {
  if (!isPlainObject(r)) return "is not an object";
  const missing = RECORD_TEXT_FIELDS.find(field => !isText(r[field]));
  if (missing) return `is missing "${missing}"`;
  if (!("returnedDate" in r)) return 'is missing "returnedDate"';
  if (typeof r.purposeDetails !== "string") return 'is missing "purposeDetails"';
  if (typeof r.remarks !== "string") return 'is missing "remarks"';
  if (!/^BR-\d{4}-\d{4,}$/.test(r.id)) return `has an invalid ID "${r.id}"`;
  if (!Object.hasOwn(ID_PATTERNS, r.borrowerType)) return `has an unknown borrower type "${r.borrowerType}"`;
  if (!ID_PATTERNS[r.borrowerType].test(r.borrowerId)) return `has borrower ID "${r.borrowerId}", which is not a ${r.borrowerType} ID`;
  if (!findEquipment(r.equipmentId, catalog)) return `refers to equipment "${r.equipmentId}", which is not in the inventory`;
  if (!Number.isInteger(r.quantity) || r.quantity < QUANTITY_MIN || r.quantity > QUANTITY_MAX) return `has an invalid quantity (${JSON.stringify(r.quantity)})`;
  if (!PURPOSES.includes(r.purpose)) return `has an unknown purpose "${r.purpose}"`;
  if (!isValidISODate(r.borrowDate) || !isValidISODate(r.dueDate)) return "has an invalid borrow or due date";
  if (r.dueDate < r.borrowDate) return "is due before it is borrowed";
  if (!STATUSES.includes(r.status)) return `has an unknown status "${r.status}"`;
  if (r.returnedDate !== null && !isValidISODate(r.returnedDate)) return "has an invalid return date";
  if (r.status === "RETURNED" && !r.returnedDate) return "is Returned but has no return date";
  if (!isDateTime(r.createdAt)) return "has an invalid creation time";
  if (r.updatedAt !== undefined && !isDateTime(r.updatedAt)) return "has an invalid last-edited time";
  if (!Array.isArray(r.history) || r.history.length === 0) return 'is missing its status "history"';
  if (!r.history.every(historyEntryOk)) return "has an invalid status-history entry";
  if (r.history[r.history.length - 1].to !== r.status) return "has a status that does not match its history";
  return null;
}

function auditEntryOk(e) {
  return isPlainObject(e) && isDateTime(e.timestamp) && isText(e.actor) &&
    (e.actorId === undefined || e.actorId === null || typeof e.actorId === "string") &&
    AUDIT_ACTIONS.includes(e.action) &&
    (e.recordId === null || isText(e.recordId)) && typeof e.details === "string";
}

function duplicateIds(records) {
  const seen = new Set();
  const dupes = new Set();
  records.forEach(r => {
    if (!isPlainObject(r)) return;
    if (seen.has(r.id)) dupes.add(r.id);
    seen.add(r.id);
  });
  return [...dupes];
}

function refused(problems) {
  const shown = problems.slice(0, MAX_REPORTED_PROBLEMS);
  if (problems.length > shown.length) shown.push(`…and ${problems.length - shown.length} more problems.`);
  return { ok: false, errors: shown, warnings: [], data: null };
}

/* returns { ok, errors, warnings, data }.
   records, schema and audit must be right or the whole payload is refused.
   preferences, session and the id counter are repaired instead: a bad theme should not cost the records */
function validatePayload(payload, { catalog = EQUIPMENT, users = USERS } = {}) {
  if (!isPlainObject(payload)) return refused(["It is not a LabBorrow data object."]);
  if (!("schemaVersion" in payload)) return refused(["It has no schemaVersion, so its format is unknown."]);
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    const v = payload.schemaVersion;
    return refused([typeof v === "number" && v > SCHEMA_VERSION
      ? `It was saved by a newer version of LabBorrow (schema ${v}); this version reads schema ${SCHEMA_VERSION}.`
      : `It uses an unsupported schema version (${JSON.stringify(v)}); this version reads schema ${SCHEMA_VERSION}.`]);
  }
  if (!Array.isArray(payload.records)) return refused(['"records" is missing or is not a list.']);

  const problems = [];
  payload.records.forEach((r, i) => {
    const problem = recordProblem(r, catalog);
    if (problem) problems.push(`Record ${i + 1}${isPlainObject(r) && isText(r.id) ? ` (${r.id})` : ""} ${problem}.`);
  });
  const dupes = duplicateIds(payload.records);
  if (dupes.length) problems.push(`Duplicate request IDs: ${dupes.join(", ")}.`);

  const warnings = [];
  let audit = payload.audit;
  if (audit === undefined) {
    audit = [];
    warnings.push("No audit trail was included, so it starts empty.");
  } else if (!Array.isArray(audit)) {
    problems.push('"audit" is not a list.');
  } else {
    const bad = audit.findIndex(entry => !auditEntryOk(entry));
    if (bad !== -1) problems.push(`Audit entry ${bad + 1} is incomplete or invalid.`);
  }
  if (problems.length) return refused(problems);

  // deep copies, so later edits never reach back into the parsed object
  const records = structuredClone(payload.records);

  const minSeq = nextSequenceFrom(records);
  let nextSeq = payload.nextSeq;
  if (!Number.isInteger(nextSeq) || nextSeq < minSeq) {
    warnings.push(`The next request number was missing or too low and was recalculated (next ID ${formatRequestId(minSeq)}).`);
    nextSeq = minSeq;
  }

  let userId = payload.session?.userId;
  if (!findUser(userId, users)) {
    if (userId !== undefined) warnings.push(`Saved user "${userId}" is unknown; signed in as the default user instead.`);
    userId = DEFAULT_USER_ID;
  }

  const prefs = isPlainObject(payload.preferences) ? payload.preferences : {};
  const preferences = structuredClone(DEFAULT_PREFERENCES);
  if (prefs.theme !== undefined) {
    if (THEMES.includes(prefs.theme)) preferences.theme = prefs.theme;
    else warnings.push(`Theme "${prefs.theme}" is unknown; using the default.`);
  }
  if (prefs.pageSize !== undefined) {
    if (PAGE_SIZES.includes(prefs.pageSize)) preferences.pageSize = prefs.pageSize;
    else warnings.push(`Page size ${JSON.stringify(prefs.pageSize)} is not offered; using ${DEFAULT_PREFERENCES.pageSize}.`);
  }
  if (prefs.sort !== undefined) {
    if (isPlainObject(prefs.sort) && SORT_KEYS.includes(prefs.sort.key) && ["asc", "desc"].includes(prefs.sort.direction)) {
      preferences.sort = { key: prefs.sort.key, direction: prefs.sort.direction };
    } else {
      warnings.push("The saved sort order is invalid; using the default.");
    }
  }

  return {
    ok: true,
    errors: [],
    warnings,
    data: {
      records,
      nextSeq,
      session: { userId },
      preferences,
      audit: structuredClone(audit),
      savedAt: isDateTime(payload.savedAt) ? payload.savedAt : null
    }
  };
}

// text → validated data. parse errors come back the same way as rule errors
function parsePayload(text, options) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    return refused([`It is not valid JSON (${error.message}).`]);
  }
  return validatePayload(payload, options);
}

/* import helpers */
// adds incoming requests whose id is not already present. existing records always win
function mergeRecords(current, incoming) {
  const existing = new Set(current.map(r => r.id));
  const added = incoming.filter(r => !existing.has(r.id));
  return {
    records: [...current, ...added],
    added: added.map(r => r.id),
    skipped: incoming.filter(r => existing.has(r.id)).map(r => r.id)
  };
}

// equipment that would have more units approved/borrowed than exist
function overcommitted(records, catalog = EQUIPMENT) {
  return deriveInventory(records, catalog).filter(item => item.committed > item.totalUnits);
}

function resetPhraseError(phrase) {
  return String(phrase ?? "").trim() === RESET_PHRASE
    ? null
    : `Type ${RESET_PHRASE} in capital letters to confirm the reset.`;
}

/* audit trail */
function auditEntry(session, action, recordId, details, timestamp = localDateTime()) {
  return { timestamp, actor: session.displayName, actorId: session.userId ?? null, action, recordId: recordId || null, details };
}

function appendAudit(audit, entry) {
  return [...audit, entry].slice(-AUDIT_LIMIT);
}

const AUDIT_FIELD_LABELS = {
  borrowerId: "borrower ID", borrowerName: "name", borrowerEmail: "email", borrowerType: "borrower type",
  equipmentId: "equipment", quantity: "quantity", borrowDate: "borrow date", dueDate: "due date",
  purpose: "purpose", purposeDetails: "purpose details"
};

// "quantity 2 → 3; due date 2026-10-09 → 2026-10-10"
function describeChanges(before, after) {
  const shown = value => (value === "" || value === null || value === undefined ? "(empty)" : String(value));
  const changes = Object.keys(AUDIT_FIELD_LABELS)
    .filter(field => shown(before[field]) !== shown(after[field]))
    .map(field => `${AUDIT_FIELD_LABELS[field]} ${shown(before[field])} → ${shown(after[field])}`);
  return changes.length ? changes.join("; ") : "Saved with no field changes";
}

/* storage access. the only functions here that are not pure */
function browserStorage() {
  try {
    return window.localStorage; // reading the property itself throws when storage is blocked
  } catch {
    return null;
  }
}

// { status: "empty" | "ok" | "invalid" | "unavailable", ... }
function readStoredState(storage = browserStorage(), options) {
  if (!storage) return { status: "unavailable", errors: ["Browser storage is blocked."] };
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (error) {
    return { status: "unavailable", errors: [error.message] };
  }
  if (raw === null) return { status: "empty" };
  const result = parsePayload(raw, options);
  return result.ok ? { status: "ok", ...result } : { status: "invalid", raw, ...result };
}

// throws when storage is missing or full; the caller reports it
function writeStoredState(payload, storage = browserStorage()) {
  if (!storage) throw new Error("Browser storage is not available.");
  storage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function writeBackup(raw, storage = browserStorage()) {
  try { storage.setItem(BACKUP_KEY, raw); return true; } catch { return false; }
}

function readBackup(storage = browserStorage()) {
  try { return storage.getItem(BACKUP_KEY); } catch { return null; }
}

function clearBackup(storage = browserStorage()) {
  try { storage.removeItem(BACKUP_KEY); } catch { /* nothing to clear */ }
}
