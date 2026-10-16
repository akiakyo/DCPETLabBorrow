/* who can do what (unit 7). pure, no dom.
   roles are bundles of capabilities; record rules add ownership and status.
   this is ui simulation only: real authorization needs a trusted back end */

const PERMISSION_LABELS = {
  "request:view-own": "view your own requests",
  "request:view-all": "view all borrow requests",
  "request:create": "submit a borrow request",
  "request:create-for-others": "file a request for another borrower",
  "request:edit-own": "edit your own request",
  "request:edit-any": "edit any request",
  "request:cancel-own": "cancel your own request",
  "request:cancel-any": "cancel any request",
  "request:review": "approve or reject requests",
  "request:release": "release equipment",
  "request:return": "receive returned equipment",
  "request:delete": "delete requests",
  "inventory:view": "view the inventory",
  "activity:view": "view the activity log",
  "data:manage": "manage system data"
};

// shown in the permission matrix
const PERMISSION_CONDITIONS = {
  "request:view-own": "Own requests only",
  "request:edit-own": "Own request, while Pending",
  "request:edit-any": "While Pending",
  "request:cancel-own": "Own request, while Pending or Approved",
  "request:cancel-any": "While Pending or Approved",
  "request:review": "Not your own request",
  "request:release": "Not your own request",
  "request:delete": "Closed requests only (Returned, Rejected, Cancelled)"
};

const BORROWER_PERMISSIONS = [
  "request:view-own", "request:create", "request:edit-own", "request:cancel-own", "inventory:view"
];
const STAFF_PERMISSIONS = [
  ...BORROWER_PERMISSIONS,
  "request:view-all", "request:create-for-others", "request:edit-any", "request:cancel-any",
  "request:review", "request:release", "request:return", "activity:view"
];

const ROLE_PERMISSIONS = {
  BORROWER: new Set(BORROWER_PERMISSIONS),
  STAFF: new Set(STAFF_PERMISSIONS),
  ADMIN: new Set([...STAFF_PERMISSIONS, "request:delete", "data:manage"])
};

// "either of these is enough" groups
const VIEW_PERMS = ["request:view-all", "request:view-own"];
const EDIT_PERMS = ["request:edit-any", "request:edit-own"];
const CANCEL_PERMS = ["request:cancel-any", "request:cancel-own"];

function allowed(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

// the borrower owns the request, even when staff encoded it
function isOwner(session, record) {
  return Boolean(session && record) && record.borrowerId === session.userId;
}

function statusWord(record) {
  return STATUS_LABELS[record.status] || record.status;
}

// ownership / status conditions. each returns a reason when blocked, null when fine
const RECORD_RULES = {
  "request:view-own": (s, r) => (isOwner(s, r) ? null : "You can only view your own requests."),
  "request:edit-own": (s, r) => {
    if (!isOwner(s, r)) return "You can only edit your own requests.";
    if (r.status !== "PENDING") return `A request can only be edited while it is Pending. ${r.id} is ${statusWord(r)}.`;
    return null;
  },
  "request:edit-any": (s, r) =>
    (r.status !== "PENDING" ? `A request can only be edited while it is Pending. ${r.id} is ${statusWord(r)}.` : null),
  "request:cancel-own": (s, r) => {
    if (!isOwner(s, r)) return "You can only cancel your own requests.";
    if (!["PENDING", "APPROVED"].includes(r.status)) return `Only Pending or Approved requests can be cancelled. ${r.id} is ${statusWord(r)}.`;
    return null;
  },
  "request:cancel-any": (s, r) =>
    (!["PENDING", "APPROVED"].includes(r.status) ? `Only Pending or Approved requests can be cancelled. ${r.id} is ${statusWord(r)}.` : null),
  "request:review": (s, r) =>
    (isOwner(s, r) ? "You cannot approve or reject your own request. Another staff member must review it." : null),
  "request:release": (s, r) =>
    (isOwner(s, r) ? "You cannot release equipment for your own request. Another staff member must release it." : null),
  "request:delete": (s, r) =>
    (!CLOSED_STATUSES.includes(r.status) ? `Only closed requests (Returned, Rejected or Cancelled) can be deleted. ${r.id} is ${statusWord(r)}.` : null)
};

// without a record this is a role-level check (used for navigation)
function checkPermission(session, permission, record = null) {
  if (!session || !allowed(session.role, permission)) {
    const role = ROLE_LABELS[session?.role] || "none";
    return { ok: false, reason: `Your role (${role}) cannot ${PERMISSION_LABELS[permission] || permission}.` };
  }
  const rule = RECORD_RULES[permission];
  const reason = rule && record ? rule(session, record) : null;
  return reason ? { ok: false, reason } : { ok: true, reason: "" };
}

// passes if any one permission passes. the reason prefers a capability the role does have
function checkAny(session, permissions, record = null) {
  let ruleMiss = null;
  let roleMiss = null;
  for (const permission of [].concat(permissions)) {
    const result = checkPermission(session, permission, record);
    if (result.ok) return result;
    if (allowed(session?.role, permission)) ruleMiss = ruleMiss || result;
    else roleMiss = roleMiss || result;
  }
  return ruleMiss || roleMiss;
}

function can(session, permissions, record = null) {
  return checkAny(session, permissions, record).ok;
}

// for action handlers: stop before any state change
function requirePermission(session, permissions, record = null) {
  const result = checkAny(session, permissions, record);
  if (!result.ok) throw new AppError("ForbiddenError", result.reason);
}

function visibleRecords(session, records) {
  return records.filter(r => can(session, VIEW_PERMS, r));
}

/* navigation is derived from the same checks */
const NAV_ITEMS = [
  { view: "dashboard",   label: "Dashboard",       permission: null },
  { view: "requests",    label: "Borrow Requests", ownLabel: "My Requests", permission: VIEW_PERMS },
  { view: "new-request", label: "New Request",     permission: "request:create" },
  { view: "equipment",   label: "Inventory",       permission: "inventory:view" },
  { view: "activity",    label: "Activity Log",    permission: "activity:view" },
  { view: "settings",    label: "Settings & Data", permission: null }
];

function navItemsFor(session) {
  return NAV_ITEMS.filter(item => !item.permission || can(session, item.permission));
}
