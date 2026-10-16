/* borrow request life cycle as a state machine (unit 6). pure, no dom.
   overdue is not a state: it is BORROWED past the due date, derived in model.js */

const TRANSITIONS = {
  PENDING:   ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED:  ["BORROWED", "PENDING", "CANCELLED"],
  BORROWED:  ["RETURNED"],
  RETURNED:  [],
  REJECTED:  [],
  CANCELLED: []
};

function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// one action per target status. note: none | optional | required
const WORKFLOW_ACTIONS = {
  APPROVED:  { label: "Approve",           done: "Approved",         permissions: ["request:review"],  note: "none", tone: "primary" },
  REJECTED:  { label: "Reject",            done: "Rejected",         permissions: ["request:review"],  note: "required", noteLabel: "Reason for rejection", tone: "danger" },
  CANCELLED: { label: "Cancel request",    done: "Cancelled",        permissions: CANCEL_PERMS,        note: "optional", noteLabel: "Reason for cancelling", tone: "danger" },
  BORROWED:  { label: "Release equipment", done: "Released",         permissions: ["request:release"], note: "none", tone: "primary" },
  PENDING:   { label: "Revoke approval",   done: "Approval revoked", permissions: ["request:review"],  note: "required", noteLabel: "Reason for revoking approval", tone: "" },
  RETURNED:  { label: "Mark as returned",  done: "Returned",         permissions: ["request:return"],  note: "optional", noteLabel: "Condition on return / remarks", tone: "primary" }
};

const NOTE_MIN = 5;
const NOTE_MAX = 200;

// conditions beyond role and status: stock and dates. reason when blocked, null when fine
function transitionGuard(record, to, ctx) {
  if (to === "APPROVED") {
    const item = deriveInventory(ctx.records).find(i => i.id === record.equipmentId);
    if (!item) return "The equipment on this request is no longer in the inventory.";
    if (record.quantity > item.available) {
      return `Only ${item.available} unit${item.available === 1 ? "" : "s"} of ${item.name} ${item.available === 1 ? "is" : "are"} available; this request needs ${record.quantity}.`;
    }
  }
  if (to === "BORROWED" && ctx.today < record.borrowDate) {
    return `Equipment can only be released on or after the borrow date (${formatDate(record.borrowDate)}).`;
  }
  return null;
}

// legality → permission → guard. throws, never changes anything
function assertTransition(record, to, ctx) {
  if (!WORKFLOW_ACTIONS[to] || !canTransition(record.status, to)) {
    const next = (TRANSITIONS[record.status] || []).map(s => STATUS_LABELS[s]).join(", ") || "none (final state)";
    throw new AppError("WorkflowError",
      `Illegal transition: ${record.id} is ${STATUS_LABELS[record.status] || record.status} and cannot become ${STATUS_LABELS[to] || to}. Allowed next: ${next}.`);
  }
  requirePermission(ctx.session, WORKFLOW_ACTIONS[to].permissions, record);
  const blocked = transitionGuard(record, to, ctx);
  if (blocked) throw new AppError("WorkflowError", blocked);
}

// returns a new record with the new status and one more history entry
function transitionRecord(record, to, ctx) {
  assertTransition(record, to, ctx);
  const action = WORKFLOW_ACTIONS[to];
  const note = String(ctx.note ?? "").trim().replace(/\s+/g, " ");
  if (action.note === "required" && note.length < NOTE_MIN) {
    throw new AppError("ValidationError", `${action.noteLabel} is required (at least ${NOTE_MIN} characters).`);
  }
  if (note.length > NOTE_MAX) {
    throw new AppError("ValidationError", `${action.noteLabel || "Note"}: use ${NOTE_MAX} characters or fewer.`);
  }
  return {
    ...record,
    status: to,
    returnedDate: to === "RETURNED" ? ctx.today : record.returnedDate,
    remarks: note || record.remarks,
    history: [
      ...(record.history || []),
      { at: ctx.now, from: record.status, to, action: action.done, actor: ctx.session.displayName, note }
    ]
  };
}

// next actions for this user. role lacks it → left out; rule or guard fails → kept with a reason
function availableActions(record, session, ctx) {
  return (TRANSITIONS[record.status] || [])
    .map(to => ({ to, ...WORKFLOW_ACTIONS[to] }))
    .filter(action => action.permissions.some(p => allowed(session.role, p)))
    .map(action => {
      const access = checkAny(session, action.permissions, record);
      return { ...action, blocked: access.ok ? transitionGuard(record, action.to, ctx) : access.reason };
    });
}

/* progress. the model is not linear: Rejected and Cancelled leave the main path,
   so a percentage is only given while the request is on it */
const MAIN_PATH = ["PENDING", "APPROVED", "BORROWED", "RETURNED"];

function workflowProgress(record) {
  const index = MAIN_PATH.indexOf(record.status);
  const final = MAIN_PATH.length - 1;
  if (index === -1) return { linear: false, index: -1, final, percent: null };
  return { linear: true, index, final, percent: Math.round((index / final) * 100) };
}

// every status change across records, newest first
function collectHistory(records) {
  return records
    .flatMap(r => (r.history || []).map((entry, seq) => ({ ...entry, recordId: r.id, seq })))
    .sort((a, b) => b.at.localeCompare(a.at) || b.recordId.localeCompare(a.recordId) || b.seq - a.seq);
}
