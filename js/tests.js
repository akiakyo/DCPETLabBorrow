/* console test suites. rerun any time: runAllTests()
   they work on copies and a fixed date, so results don't depend on today.
   the "live" cases call the real handlers with input that must be refused,
   then prove state did not change */

const TEST_TODAY = "2026-10-02"; // a friday
const TEST_NOW = "2026-10-02T09:00:00";

function testRecords() {
  return seedRecords();
}

function testContext(userId, records = testRecords(), extra = {}) {
  return { session: sessionFor(userId), records, today: TEST_TODAY, now: TEST_NOW, ...extra };
}

// collects { id, test, expected, actual, result } rows for one suite
function createSuite(title) {
  const rows = [];
  return {
    rows,
    check(id, test, expected, actual) {
      const pass = JSON.stringify(expected) === JSON.stringify(actual);
      console.assert(pass, `FAILED ${id}: ${test}`, { expected, actual });
      rows.push({ id, test, expected: JSON.stringify(expected), actual: JSON.stringify(actual), result: pass ? "PASS" : "FAIL" });
    },
    report() {
      console.info(title);
      console.table(rows);
      return rows.every(row => row.result === "PASS");
    }
  };
}

// name of the AppError a call throws, or "no error"
function thrownBy(fn) {
  try { fn(); return "no error"; } catch (error) { return error.name; }
}

function shortIds(records) {
  return records.map(r => r.id.slice(-4));
}

/* unit 3: stable ids */
function runStableIdTests() {
  const original = SEED_REQUESTS.map(r => ({ ...r }));
  const snapshot = new Map(original.map(r => [r.id, JSON.stringify(r)]));
  const results = [];

  function check(name, condition) {
    console.assert(condition, `FAILED: ${name}`);
    results.push({ test: name, result: condition ? "PASS" : "FAIL" });
  }

  // 1. sort: only order changes, same data per id
  const sorted = sortRecords(original, { key: "borrowerName", direction: "desc" });
  check(
    "A1: After sorting by borrower name (Z–A), every ID still maps to identical record data",
    sorted.length === original.length &&
    sorted.every(r => snapshot.get(r.id) === JSON.stringify(r)) &&
    sorted[0].id !== original[0].id // proves order changed
  );

  // 2. delete: other ids don't shift
  const afterDelete = deleteById(sorted, "BR-2026-0004");
  const next = findById(afterDelete, "BR-2026-0005");
  check(
    "A2: After deleting BR-2026-0004, it is gone and BR-2026-0005 is still Kristine Lim / EQ-005",
    afterDelete.length === original.length - 1 &&
    findById(afterDelete, "BR-2026-0004") === null &&
    next !== null && next.borrowerName === "Kristine Lim" && next.equipmentId === "EQ-005" &&
    afterDelete.every(r => snapshot.get(r.id) === JSON.stringify(r))
  );

  // 3. deleted id never reused, all ids unique
  const seq = nextSequenceFrom(original);
  const withoutLast = deleteById(original, "BR-2026-0017");
  const newId = formatRequestId(seq, 2026);
  const combined = [...withoutLast, { ...original[0], id: newId }];
  check(
    "A3: After deleting BR-2026-0017, the next new ID is BR-2026-0018 (no reuse) and all IDs are unique",
    newId === "BR-2026-0018" &&
    new Set(combined.map(r => r.id)).size === combined.length
  );

  console.info("Stable ID assertions (Unit 3)");
  console.table(results);
  return results.every(r => r.result === "PASS");
}

/* unit 4: validation */
const VALID_INPUT = {
  borrowerId: "2023-00999", borrowerName: "Test Student", borrowerEmail: "tstudent@school.edu.ph",
  borrowerType: "Student", equipmentId: "EQ-008", quantity: 2,
  borrowDate: "2026-10-05", dueDate: "2026-10-09", purpose: "Project", purposeDetails: ""
};

// fields rejected by validateRequest()
function invalidFields(changes, ctxExtra = {}, userId = "S-0004") {
  return Object.keys(validateRequest({ ...VALID_INPUT, ...changes }, testContext(userId, testRecords(), ctxExtra))).sort();
}

// fields rejected by the html attributes, on a detached copy of the form
function nativeInvalidFields(changes) {
  const copy = $("#request-form").cloneNode(true);
  Array.from(copy.elements).forEach(el => { el.readOnly = false; el.disabled = false; });
  copy.elements.purposeDetails.required = false;
  Object.entries({ ...VALID_INPUT, ...changes }).forEach(([name, value]) => { copy.elements[name].value = value; });
  return Object.keys(nativeErrors(copy)).sort();
}

function runValidationTests() {
  const t = createSuite("Validation tests (Unit 4)");

  t.check("V-01", "Valid request passes both layers", [[], []], [nativeInvalidFields({}), invalidFields({})]);

  // native html rules
  t.check("V-02", "N1 required: empty full name", ["borrowerName"], nativeInvalidFields({ borrowerName: "" }));
  t.check("V-03", "N2 pattern: ID \"23-142\"", ["borrowerId"], nativeInvalidFields({ borrowerId: "23-142" }));
  t.check("V-04", "N3 type=email: \"not-an-email\"", ["borrowerEmail"], nativeInvalidFields({ borrowerEmail: "not-an-email" }));
  t.check("V-05", "N4 min/max: quantity 9", ["quantity"], nativeInvalidFields({ quantity: 9 }));
  t.check("V-06", "N5 step: quantity 1.5", ["quantity"], nativeInvalidFields({ quantity: 1.5 }));

  // javascript field rules
  t.check("V-07", "J1 full name needs first and last name: \"Madonna\"", ["borrowerName"], invalidFields({ borrowerName: "Madonna" }));
  t.check("V-08", "J2 school email domain: gmail address", ["borrowerEmail"], invalidFields({ borrowerEmail: "tstudent@gmail.com" }));
  t.check("V-09", "J3 borrow date in the past (2026-10-01)", ["borrowDate"], invalidFields({ borrowDate: "2026-10-01" }));
  t.check("V-10", "J4 borrow date on a Sunday (2026-10-04)", ["borrowDate"], invalidFields({ borrowDate: "2026-10-04" }));
  t.check("V-11", "J5 equipment not in inventory: EQ-999", ["equipmentId"], invalidFields({ equipmentId: "EQ-999" }));
  t.check("V-12", "Whitespace-only name counts as empty", ["borrowerName"], invalidFields({ borrowerName: "    " }));

  // cross-field rules
  t.check("V-13", "X1 due date before borrow date", ["dueDate"], invalidFields({ dueDate: "2026-10-03" }));
  t.check("V-14", "X2 student loan over 14 days is rejected; same dates for faculty pass",
    [["dueDate"], []],
    [invalidFields({ dueDate: "2026-10-20" }), invalidFields({ dueDate: "2026-10-20", borrowerId: "F-0099", borrowerType: "Faculty" })]);
  t.check("V-15", "X3 faculty ID with borrower type Student", ["borrowerId"], invalidFields({ borrowerId: "F-0099" }));
  t.check("V-16", "X4 quantity above available units (EQ-009 has 2, asks 3)", ["quantity"], invalidFields({ equipmentId: "EQ-009", quantity: 3 }));

  // conditional field
  t.check("V-17", "C1 purpose Other: details missing → rejected, 10+ characters → accepted",
    [["purposeDetails"], []],
    [invalidFields({ purpose: "Other" }), invalidFields({ purpose: "Other", purposeDetails: "Robotics club demo" })]);

  // duplicate rule
  t.check("V-18", "D1 same borrower + same equipment with an open request (BR-2026-0010); ID typed with spaces",
    ["equipmentId"], invalidFields({ borrowerId: "  2024-00188 " }));
  t.check("V-19", "D1 does not flag the request being edited", [], invalidFields({ borrowerId: "2024-00188" }, { editingId: "BR-2026-0010" }));

  // session rule
  t.check("V-20", "S1 borrower filing under someone else's ID", ["borrowerId"], invalidFields({}, {}, "2024-00077"));

  // live: invalid input never reaches state
  const before = JSON.stringify(state.records);
  const seqBefore = state.nextSeq;
  const error = thrownBy(() => saveRequest({ ...VALID_INPUT, borrowerName: "", quantity: 99 }, null));
  t.check("V-21", "Live: saveRequest() with invalid data throws and state.records / nextSeq are unchanged",
    ["ValidationError", true, true],
    [error, JSON.stringify(state.records) === before, state.nextSeq === seqBefore]);

  return t;
}

/* unit 5: search + filter + sort + page, combined */
function runExplorerTests() {
  const t = createSuite("Explorer interaction tests (Unit 5)");
  const records = testRecords();
  const base = { query: "", filters: { ...DEFAULT_FILTERS }, sort: { key: "createdAt", direction: "desc" }, page: 1, pageSize: 10 };
  const run = (ui, ...changes) => {
    const finalUi = changes.reduce(applyExplorerChange, ui);
    const result = getExplorerResult(records, finalUi, TEST_TODAY);
    return { ui: finalUi, result, ids: shortIds(result.items), count: formatResultCount(result) };
  };

  let r = run(base, { type: "query", value: "kristine" });
  t.check("E-01", "Search \"kristine\", default sort (newest request first)",
    [["0005", "0017"], "Showing 1–2 of 2 matching requests."], [r.ids, r.count]);

  r = run(base, { type: "pageSize", value: 5 }, { type: "page", value: 2 }, { type: "filter", name: "status", value: "OVERDUE" });
  t.check("E-02", "Page reset: on page 2 (5 per page), then filter Status = Overdue",
    [1, 6, 2, "Showing 1–5 of 6 matching requests."], [r.result.page, r.result.total, r.result.totalPages, r.count]);

  r = run(base, { type: "pageSize", value: 5 }, { type: "page", value: 3 }, { type: "pageSize", value: 20 });
  t.check("E-03", "Page reset: on page 3 (5 per page), then page size → 20",
    [1, 1, "Showing 1–17 of 17 matching requests."], [r.result.page, r.result.totalPages, r.count]);

  r = run(base, { type: "query", value: "class" }, { type: "filter", name: "borrowerType", value: "Faculty" },
    { type: "sort", value: { key: "borrowerName", direction: "asc" } });
  t.check("E-04", "Search \"class\" + Borrower type = Faculty + sort by name A–Z (equal names tie-break by ID)",
    ["0003", "0015", "0009"], r.ids);

  r = run(base, { type: "filter", name: "dateFrom", value: "2026-09-15" }, { type: "filter", name: "dateTo", value: "2026-09-25" },
    { type: "filter", name: "category", value: "Microcontrollers" }, { type: "sort", value: { key: "dueDate", direction: "asc" } });
  t.check("E-05", "Borrow date 15–25 Sep + Category = Microcontrollers + sort by due date ascending",
    ["0014", "0015", "0005"], r.ids);

  r = run(base, { type: "pageSize", value: 5 }, { type: "page", value: 3 }, { type: "sort", value: { key: "quantity", direction: "desc" } });
  t.check("E-06", "Sort by quantity descending from page 3: page returns to 1; equal quantities stay in ID order",
    [1, ["0015", "0007", "0003", "0014", "0001"]], [r.result.page, r.ids]);

  r = run(base, { type: "query", value: "zzz" }, { type: "filter", name: "status", value: "PENDING" });
  t.check("E-07", "No match: search \"zzz\" + Status = Pending (Z = 0)",
    [0, 1, 1, false, false, "Showing 0 of 0 matching requests."],
    [r.result.total, r.result.page, r.result.totalPages, r.result.hasPrev, r.result.hasNext, r.count]);

  r = run(base, { type: "pageSize", value: 5 }, { type: "page", value: 9 });
  t.check("E-08", "Impossible page 9 of 4 is clamped to the last page; Next is disabled, Previous is not",
    [4, true, false, "Showing 16–17 of 17 matching requests."], [r.result.page, r.result.hasPrev, r.result.hasNext, r.count]);

  r = run(base, { type: "query", value: "   PAOLO    reyes " }, { type: "sort", value: { key: "borrowDate", direction: "asc" } });
  t.check("E-09", "Normalized search (\"   PAOLO    reyes \") + sort by borrow date ascending", ["0004", "0016"], r.ids);

  r = run(base, { type: "filter", name: "dateFrom", value: "2026-09-30" }, { type: "filter", name: "dateTo", value: "2026-09-01" },
    { type: "filter", name: "status", value: "PENDING" });
  t.check("E-10", "Reversed date range is flagged and ignored; Status = Pending still applies",
    [false, ["0016", "0012", "0011", "0010"]], [isValidDateRange(r.ui.filters), r.ids]);

  r = run(base, { type: "query", value: "thesis" }, { type: "filter", name: "status", value: "RETURNED" },
    { type: "pageSize", value: 5 }, { type: "page", value: 2 }, { type: "clear" });
  t.check("E-11", "Clear search and filters: all 17 back, page 1, page size kept at 5",
    [17, 1, 5, "Showing 1–5 of 17 matching requests."], [r.result.total, r.result.page, r.ui.pageSize, r.count]);

  r = run(base, { type: "pageSize", value: 5 }, { type: "page", value: 2 }, { type: "query", value: "eq" });
  const noMatch = run(base, { type: "pageSize", value: 7 });
  t.check("E-12", "Typing a search from page 2 returns to page 1; an unsupported page size (7) is refused",
    [1, 10], [r.result.page, noMatch.ui.pageSize]);

  return t;
}

/* unit 6: workflow */
function runWorkflowTests() {
  const t = createSuite("Workflow tests (Unit 6)");
  const records = testRecords();
  const ctx = testContext("S-0004", records, { note: "Not needed anymore" });
  const get = id => findById(records, `BR-2026-${id}`);

  // illegal transitions: error thrown and the record is byte-for-byte the same
  const illegal = (id, test, recordId, to) => {
    const record = get(recordId);
    const before = JSON.stringify(record);
    const error = thrownBy(() => transitionRecord(record, to, ctx));
    t.check(id, test, ["WorkflowError", true, false], [error, JSON.stringify(record) === before, canTransition(record.status, to)]);
  };
  illegal("W-01", "Illegal: Returned → Approved (BR-2026-0001)", "0001", "APPROVED");
  illegal("W-02", "Illegal: Pending → Borrowed, skipping approval (BR-2026-0010)", "0010", "BORROWED");
  illegal("W-03", "Illegal: Pending → Returned (BR-2026-0010)", "0010", "RETURNED");
  illegal("W-04", "Illegal: Borrowed → Pending (BR-2026-0004)", "0004", "PENDING");
  illegal("W-05", "Illegal: Rejected → Pending, reopening a final state (BR-2026-0013)", "0013", "PENDING");
  illegal("W-06", "Illegal: Approved → Returned without release (BR-2026-0008)", "0008", "RETURNED");
  illegal("W-07", "Illegal: unknown target status \"ARCHIVED\" (BR-2026-0010)", "0010", "ARCHIVED");

  const cancelled = transitionRecord(get("0010"), "CANCELLED", ctx);
  t.check("W-08", "Illegal: Cancelled → Approved (after a legal cancel of BR-2026-0010)",
    ["WorkflowError", "CANCELLED"], [thrownBy(() => transitionRecord(cancelled, "APPROVED", ctx)), cancelled.status]);

  // legal transition: new object, history grows by one, original untouched
  const pending = get("0010");
  const approved = transitionRecord(pending, "APPROVED", ctx);
  const last = approved.history[approved.history.length - 1];
  t.check("W-09", "Legal: Pending → Approved returns a new record with one more history entry; the original is untouched",
    ["APPROVED", "PENDING", 2, 1, "PENDING", "APPROVED", "Approved", "Jun Dela Cruz", TEST_NOW],
    [approved.status, pending.status, approved.history.length, pending.history.length, last.from, last.to, last.action, last.actor, last.at]);

  const returned = transitionRecord(get("0004"), "RETURNED", ctx);
  t.check("W-10", "Legal: Borrowed → Returned stamps the return date", [TEST_TODAY, "RETURNED"], [returned.returnedDate, returned.status]);

  // guards
  const early = { ...get("0008"), borrowDate: "2026-10-05", dueDate: "2026-10-09" };
  t.check("W-11", "Guard: release before the borrow date is refused", "WorkflowError", thrownBy(() => transitionRecord(early, "BORROWED", ctx)));

  const noStock = { ...get("0010"), equipmentId: "EQ-005", quantity: 1 };
  t.check("W-12", "Guard: approve when no units are available (EQ-005 is fully lent out)", "WorkflowError",
    thrownBy(() => transitionRecord(noStock, "APPROVED", ctx)));

  t.check("W-13", "Guard: reject without a reason is refused", "ValidationError",
    thrownBy(() => transitionRecord(get("0010"), "REJECTED", { ...ctx, note: "  " })));

  // matrix and progress
  const legalPairs = STATUSES.flatMap(from => STATUSES.filter(to => canTransition(from, to)).map(to => `${from}>${to}`));
  t.check("W-14", "Transition matrix allows exactly 7 of the 36 status pairs", 7, legalPairs.length);
  t.check("W-15", "Progress: Pending 0%, Approved 33%, Borrowed 67%, Returned 100%; Rejected and Cancelled have no percentage",
    [0, 33, 67, 100, null, null],
    ["PENDING", "APPROVED", "BORROWED", "RETURNED", "REJECTED", "CANCELLED"].map(status => workflowProgress({ status }).percent));

  // live: the real handler refuses, state stays as it was
  const closed = state.records.find(rec => CLOSED_STATUSES.includes(rec.status));
  if (closed) {
    const before = JSON.stringify(state.records);
    const error = thrownBy(() => transitionRequest(closed.id, "APPROVED"));
    t.check("W-16", `Live: transitionRequest("${closed.id}", "APPROVED") on a closed request throws and state.records is unchanged`,
      ["WorkflowError", true], [error, JSON.stringify(state.records) === before]);
  }

  return t;
}

/* unit 7: permissions */
function runPermissionTests() {
  const t = createSuite("Permission tests (Unit 7)");
  const records = testRecords();
  const get = id => findById(records, `BR-2026-${id}`);
  const student = sessionFor("2024-00077"); // Paolo Reyes: owns 0004 (Borrowed) and 0016 (Pending)
  const staff = sessionFor("S-0004");
  const admin = sessionFor("F-0017");       // Engr. Ramon Garcia: owns 0009 (Approved)

  t.check("P-01", "Borrower views own request (0016) but not someone else's (0010)",
    [true, false], [can(student, VIEW_PERMS, get("0016")), can(student, VIEW_PERMS, get("0010"))]);
  t.check("P-02", "Borrower's list contains only their own requests; staff see all 17",
    [["0004", "0016"], 17], [shortIds(visibleRecords(student, records)), visibleRecords(staff, records).length]);
  t.check("P-03", "Borrower edits own Pending request (0016)", true, can(student, EDIT_PERMS, get("0016")));
  t.check("P-04", "Status: borrower cannot edit own request once it is Borrowed (0004)", false, can(student, EDIT_PERMS, get("0004")));
  t.check("P-05", "Ownership: borrower cannot edit another borrower's Pending request (0010)", false, can(student, EDIT_PERMS, get("0010")));
  t.check("P-06", "Staff edit any Pending request (0010) but not an Approved one (0008)",
    [true, false], [can(staff, EDIT_PERMS, get("0010")), can(staff, EDIT_PERMS, get("0008"))]);
  t.check("P-07", "Role: borrower cannot approve (0010); staff can",
    [false, true], [can(student, "request:review", get("0010")), can(staff, "request:review", get("0010"))]);
  t.check("P-08", "Ownership: lab head cannot release equipment for his own request (0009); staff can",
    [false, true], [can(admin, "request:release", get("0009")), can(staff, "request:release", get("0009"))]);
  t.check("P-09", "Borrower cancels own Pending request (0016) but not own Borrowed one (0004)",
    [true, false], [can(student, CANCEL_PERMS, get("0016")), can(student, CANCEL_PERMS, get("0004"))]);
  t.check("P-10", "Staff cancel an Approved request that is not theirs (0008); a borrower cannot",
    [true, false], [can(staff, CANCEL_PERMS, get("0008")), can(student, CANCEL_PERMS, get("0008"))]);
  t.check("P-11", "Role: staff cannot delete a closed request (0001); lab head can",
    [false, true], [can(staff, "request:delete", get("0001")), can(admin, "request:delete", get("0001"))]);
  t.check("P-12", "Lab head may delete a request in any status (Borrowed 0004, Pending 0016); staff and borrowers may not",
    [true, true, false, false],
    [can(admin, "request:delete", get("0004")), can(admin, "request:delete", get("0016")), can(staff, "request:delete", get("0004")), can(student, "request:delete", get("0016"))]);
  t.check("P-13", "Navigation: Activity Log is offered to staff and lab head, not to borrowers",
    [false, true, true], [student, staff, admin].map(s => navItemsFor(s).some(item => item.view === "activity")));
  t.check("P-14", "Only the lab head can manage data; only staff and lab head can file for another borrower",
    [[false, false, true], [false, true, true]],
    [[student, staff, admin].map(s => can(s, "data:manage")), [student, staff, admin].map(s => can(s, "request:create-for-others"))]);

  // guarded handlers: the pure transition refuses a forbidden caller and returns nothing
  const target = get("0010");
  const before = JSON.stringify(target);
  const error = thrownBy(() => transitionRecord(target, "APPROVED", testContext("2024-00077", records)));
  t.check("P-15", "Guard: a borrower calling approve on 0010 gets ForbiddenError; the record is unchanged",
    ["ForbiddenError", true], [error, JSON.stringify(target) === before]);
  t.check("P-16", "Guard: the lab head approving his own new request gets ForbiddenError",
    "ForbiddenError", thrownBy(() => transitionRecord({ ...target, borrowerId: "F-0017" }, "APPROVED", testContext("F-0017", records))));
  t.check("P-17", "Workflow buttons: borrower gets only Cancel on own Pending request; staff get Approve, Reject, Cancel",
    [["CANCELLED"], ["APPROVED", "REJECTED", "CANCELLED"]],
    [availableActions(get("0016"), student, testContext("2024-00077", records)).map(a => a.to),
      availableActions(get("0016"), staff, testContext("S-0004", records)).map(a => a.to)]);

  // live: these run as a fixed user and must be refused before the confirm dialog, so nothing is ever deleted on load
  const asUser = (userId, fn) => {
    const savedSession = state.session;
    state.session = sessionFor(userId);
    try { return thrownBy(fn); } finally { state.session = savedSession; }
  };
  const first = state.records[0];
  if (first) {
    const snapshot = JSON.stringify([state.records, state.audit]);
    t.check("P-18", `Live: lab staff calling deleteRecord("${first.id}") gets ForbiddenError; records and audit unchanged`,
      ["ForbiddenError", true], [asUser("S-0004", () => deleteRecord(first.id)), JSON.stringify([state.records, state.audit]) === snapshot]);
    t.check("P-19", `Live: lab head bulk-deleting ${first.id} + a request that does not exist is refused as a whole; nothing deleted`,
      ["NotFoundError", true], [asUser("F-0017", () => deleteRecords([first.id, "BR-2026-9999"])), JSON.stringify([state.records, state.audit]) === snapshot]);
  }
  t.check("P-20", "Live: bulk delete with nothing selected is refused", "ValidationError", asUser("F-0017", () => deleteRecords([])));

  return t;
}

/* unit 8: persistence. a fake storage object stands in for localStorage,
   so these never touch the real saved data */
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: key => (Object.hasOwn(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: key => { delete data[key]; }
  };
}

function testPayload(changes = {}) {
  const s = {
    records: testRecords(), nextSeq: 18, session: sessionFor("S-0004"),
    preferences: { theme: "dark" }, pageSize: 5, sort: { key: "dueDate", direction: "asc" },
    audit: [auditEntry(sessionFor("S-0004"), "CREATE", "BR-2026-0017", "test entry", TEST_NOW)]
  };
  return { ...JSON.parse(JSON.stringify(buildPayload(s, TEST_NOW))), ...changes };
}

// stored text → { status, ok, first error }
function loadFrom(text) {
  const result = readStoredState(memoryStorage({ [STORAGE_KEY]: text }));
  return { status: result.status, error: result.errors?.[0] || "" };
}

function withRecord(index, changes) {
  const payload = testPayload();
  payload.records[index] = { ...payload.records[index], ...changes };
  return JSON.stringify(payload);
}

function runPersistenceTests() {
  const t = createSuite("Persistence tests (Unit 8)");

  t.check("S-01", "Empty storage: nothing to restore, sample data is used", "empty", readStoredState(memoryStorage()).status);

  const store = memoryStorage();
  writeStoredState(testPayload(), store);
  const restored = readStoredState(store);
  t.check("S-02", "Successful restore: records, id counter, user, preferences and audit come back exactly",
    ["ok", true, 18, "S-0004", "dark", 5, "dueDate", 1, []],
    [restored.status, JSON.stringify(restored.data.records) === JSON.stringify(testRecords()), restored.data.nextSeq,
      restored.data.session.userId, restored.data.preferences.theme, restored.data.preferences.pageSize,
      restored.data.preferences.sort.key, restored.data.audit.length, restored.warnings]);

  const malformed = loadFrom('{"schemaVersion": 1, "records": [');
  t.check("S-03", "Malformed JSON is refused", ["invalid", true], [malformed.status, malformed.error.startsWith("It is not valid JSON")]);

  const newer = loadFrom(JSON.stringify(testPayload({ schemaVersion: 2 })));
  const textVersion = loadFrom(JSON.stringify(testPayload({ schemaVersion: "1" })));
  const noVersion = loadFrom(JSON.stringify({ records: testRecords() }));
  t.check("S-04", "Wrong schema version: 2 (newer), \"1\" (text) and missing are all refused",
    [["invalid", true], ["invalid", true], "invalid"],
    [[newer.status, newer.error.includes("newer version")], [textVersion.status, textVersion.error.includes("unsupported")], noVersion.status]);

  t.check("S-05", "Bare array (no envelope) and records that are not a list are refused",
    ["invalid", "invalid"], [loadFrom(JSON.stringify(testRecords())).status, loadFrom(JSON.stringify(testPayload({ records: {} }))).status]);

  const missing = testPayload();
  delete missing.records[2].borrowerName;
  const missingResult = loadFrom(JSON.stringify(missing));
  t.check("S-06", "Missing field: record 3 without borrowerName is refused and named in the message",
    ["invalid", "Record 3 (BR-2026-0003) is missing \"borrowerName\"."], [missingResult.status, missingResult.error]);

  const dupes = loadFrom(withRecord(1, { id: "BR-2026-0001" }));
  t.check("S-07", "Duplicate IDs: two records with BR-2026-0001 are refused",
    ["invalid", "Duplicate request IDs: BR-2026-0001."], [dupes.status, dupes.error]);

  t.check("S-08", "Wrong values: unknown status, quantity 0, unknown equipment, status not matching history",
    ["invalid", "invalid", "invalid", "invalid"],
    [withRecord(0, { status: "LOST" }), withRecord(0, { quantity: 0 }), withRecord(0, { equipmentId: "EQ-999" }), withRecord(9, { status: "APPROVED" })]
      .map(text => loadFrom(text).status));

  const badAudit = testPayload();
  badAudit.audit.push({ timestamp: TEST_NOW, actor: "x", action: "HACK", recordId: null, details: "" });
  t.check("S-09", "An invalid audit entry refuses the whole payload", "invalid", loadFrom(JSON.stringify(badAudit)).status);

  const repairable = readStoredState(memoryStorage({ [STORAGE_KEY]: JSON.stringify(testPayload({
    nextSeq: 3, session: { userId: "X-9999" }, preferences: { theme: "neon", pageSize: 7, sort: { key: "id", direction: "up" } }
  })) }));
  t.check("S-10", "Repairable: id counter too low, unknown user, bad theme/page size/sort → loaded with 5 warnings and safe defaults",
    ["ok", 5, 18, DEFAULT_USER_ID, "system", 10, "createdAt", 17],
    [repairable.status, repairable.warnings.length, repairable.data.nextSeq, repairable.data.session.userId,
      repairable.data.preferences.theme, repairable.data.preferences.pageSize, repairable.data.preferences.sort.key, repairable.data.records.length]);

  const blocked = { getItem() { throw new Error("SecurityError: storage is disabled"); } };
  t.check("S-11", "Storage that throws (private mode / blocked) is reported as unavailable, not a crash",
    ["unavailable", "unavailable"], [readStoredState(blocked).status, readStoredState(null).status]);

  const incoming = [testRecords()[0], testRecords()[1], { ...testRecords()[16], id: "BR-2026-0050" }];
  const merged = mergeRecords(testRecords(), incoming);
  t.check("S-12", "Merge: IDs already present are skipped, new ones are added",
    [18, ["BR-2026-0050"], ["BR-2026-0001", "BR-2026-0002"]], [merged.records.length, merged.added, merged.skipped]);

  const exported = JSON.stringify(testPayload(), null, 2);
  const reimported = parsePayload(exported);
  t.check("S-13", "Export → import round trip: the exported file passes the import checks unchanged",
    [true, 17, 1], [reimported.ok, reimported.data.records.length, reimported.data.audit.length]);

  const before = testRecords()[9];
  const after = { ...before, quantity: 3, dueDate: "2026-10-02" };
  const long = Array.from({ length: AUDIT_LIMIT + 1 }, (_, i) => ({ n: i }))
    .reduce((audit, entry) => appendAudit(audit, entry), []);
  t.check("S-14", "Audit: update details list each changed field; the trail keeps the newest 500 entries",
    ["quantity 2 → 3; due date 2026-10-01 → 2026-10-02", "Saved with no field changes", AUDIT_LIMIT, 1],
    [describeChanges(before, after), describeChanges(before, before), long.length, long[0].n]);

  t.check("S-15", "Reset needs the typed word RESET exactly (spaces around it are ignored)",
    [false, false, false, true],
    ["reset", "", "RESET please", "  RESET "].map(phrase => resetPhraseError(phrase) === null));

  const overloaded = testRecords().map(r => (r.id === "BR-2026-0016" ? { ...r, equipmentId: "EQ-005", status: "APPROVED", history: [...r.history, { ...r.history[0], from: "PENDING", to: "APPROVED" }] } : r));
  t.check("S-16", "Import preview warns when a file would commit more units than exist (EQ-005: 7 of 6)",
    [["EQ-005"], 7], [overcommitted(overloaded).map(item => item.id), overcommitted(overloaded)[0]?.committed]);

  // live: the real handlers refuse a borrower and leave state alone
  const savedSession = state.session;
  const snapshot = JSON.stringify([state.records, state.audit, state.nextSeq]);
  let importError;
  let resetError;
  state.session = sessionFor("2024-00077");
  try {
    importError = thrownBy(() => importData(testPayload(), "replace", "test.json"));
    resetError = thrownBy(() => resetData("RESET"));
  } finally {
    state.session = savedSession;
  }
  t.check("S-17", "Live: importData() and resetData() called by a borrower throw ForbiddenError; records, audit and id counter unchanged",
    ["ForbiddenError", "ForbiddenError", true], [importError, resetError, JSON.stringify([state.records, state.audit, state.nextSeq]) === snapshot]);

  return t;
}

/* unit 9: dashboard. expected values were counted by hand from the 17 seed requests on 2026-10-02
   (see the verification table in docs/UNITS-8-10.md) */
function hasBadNumber(value) {
  if (typeof value === "number") return !Number.isFinite(value);
  if (value && typeof value === "object") return Object.values(value).some(hasBadNumber);
  return false;
}

const oneDecimal = value => (value === null ? null : Math.round(value * 10) / 10);

function runMetricTests() {
  const t = createSuite("Dashboard metric tests (Unit 9)");
  const records = testRecords();
  const m = getMetrics(records, records, TEST_TODAY);

  t.check("D-01", "Total requests", 17, m.total);
  t.check("D-02", "Pending approval", 4, m.pending);
  t.check("D-03", "Currently borrowed (requests, units out)", [6, 15], [m.borrowed, m.unitsOut]);
  t.check("D-04", "Overdue", 6, m.overdue);
  t.check("D-05", "Units available / committed / total", [49, 18, 67], [m.availableUnits, m.committedUnits, m.totalUnits]);
  t.check("D-06", "Committed share of all units (18 ÷ 67)", 26.9, oneDecimal(m.utilization));
  t.check("D-07", "On-time return rate (3 of 4 returns)", [3, 4, 75], [m.returnedOnTime, m.returned, m.onTimeRate]);
  t.check("D-08", "Approval rate (12 of 13 reviewed)", [12, 13, 92.3], [m.passedReview, m.reviewed, oneDecimal(m.approvalRate)]);
  t.check("D-09", "Average loan length ((5 + 9 + 5 + 4) ÷ 4)", 5.75, m.avgLoanDays);
  t.check("D-10", "Requests by status: Pending, Approved, Borrowed, Overdue, Returned, Rejected, Cancelled",
    [4, 2, 0, 6, 4, 1, 0], m.byStatus.map(row => row.count));
  t.check("D-11", "Requests by category, most first (ties A–Z)",
    ["Electronics 4", "Microcontrollers 4", "Measurement 3", "Networking 3", "Computing 2", "Tools 1"],
    m.byCategory.map(row => `${row.key} ${row.count}`));
  t.check("D-12", "Inventory use by laboratory, highest first (%)",
    [["Embedded Systems Lab (ES-204)", 47.6], ["Electronics Lab (EN-201)", 25.9], ["Networking Lab (NL-302)", 9.1], ["Computer Lab (CL-105)", 0]],
    m.byLaboratory.map(row => [row.key, oneDecimal(row.utilization)]));

  const empty = getMetrics([], [], TEST_TODAY);
  t.check("D-13", "No requests: rates are null (shown as —), never NaN or Infinity",
    [0, null, null, null, false, "—", 67], [empty.total, empty.onTimeRate, empty.approvalRate, empty.avgLoanDays,
      hasBadNumber(empty), formatPercent(empty.byStatus[0].share), empty.availableUnits]);

  const paolo = getMetrics(visibleRecords(sessionFor("2024-00077"), records), records, TEST_TODAY);
  t.check("D-14", "Borrower scope: Paolo's own counts, shared stock", [2, 1, 1, 49, null], [paolo.total, paolo.pending, paolo.overdue, paolo.availableUnits, paolo.onTimeRate]);

  // refresh: recomputing after each kind of change gives the new numbers with no other step
  const ctx = testContext("S-0004", records);
  const created = [...records, { ...records[9], id: "BR-2026-0018", borrowerId: "2023-00999", equipmentId: "EQ-010" }];
  const approved = replaceById(records, transitionRecord(findById(records, "BR-2026-0010"), "APPROVED", ctx));
  const edited = replaceById(records, { ...findById(records, "BR-2026-0010"), equipmentId: "EQ-001" });
  const lateReturn = { ...records[0], id: "BR-2026-0050", returnedDate: "2026-09-08", remarks: "late" };
  const imported = mergeRecords(records, [lateReturn]).records;
  const after = list => getMetrics(list, list, TEST_TODAY);
  t.check("D-15", "Refresh after create (+1 Pending), approve 0010 (−1 Pending, +2 units committed), edit 0010 to EQ-001 (Electronics 5)",
    [[18, 5], [3, 20, 47], 5],
    [[after(created).total, after(created).pending], [after(approved).pending, after(approved).committedUnits, after(approved).availableUnits],
      after(edited).byCategory.find(row => row.key === "Electronics").count]);
  t.check("D-16", "Refresh after import of one late return: on-time rate 3 of 5 = 60%", [5, 60], [after(imported).returned, after(imported).onTimeRate]);

  return t;
}

function runAllTests() {
  const suites = [runValidationTests(), runExplorerTests(), runWorkflowTests(), runPermissionTests(),
    runPersistenceTests(), runMetricTests()];
  const stable = runStableIdTests();
  const passed = suites.map(suite => suite.report());
  const rows = suites.flatMap(suite => suite.rows);
  const failed = rows.filter(row => row.result !== "PASS").length;
  console.info(`Units 4–9: ${rows.length - failed} of ${rows.length} tests passed.`);
  return stable && passed.every(Boolean);
}

runAllTests();
