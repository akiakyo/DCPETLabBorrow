/* single state = source of truth, dom is just a view */

// mock sign-in (unit 7)
function sessionFor(userId) {
  const user = findUser(userId);
  return { userId: user.id, displayName: user.name, role: user.role };
}

const state = {
  // replaced by the saved copy on load when there is one (unit 8)
  records: seedRecords(),
  nextSeq: nextSequenceFrom(SEED_REQUESTS),
  audit: [], // who changed what, saved with the records (unit 8)

  session: sessionFor(DEFAULT_USER_ID),

  // ui
  view: "dashboard",
  query: "",
  filters: { ...DEFAULT_FILTERS },
  sort: { ...DEFAULT_PREFERENCES.sort },
  page: 1,
  pageSize: DEFAULT_PREFERENCES.pageSize,
  selectedId: null,
  editingId: null,      // request loaded in the form
  pendingAction: null,  // { id, to } while a workflow note is being typed
  pendingImport: null,  // checked file waiting for confirm (unit 8)

  // theme, page size and sort are saved (unit 8)
  preferences: { theme: DEFAULT_PREFERENCES.theme },

  // what the last load / save did. shown in settings
  storage: { status: "new", lastSavedAt: null, error: null, hasBackup: false }
};

// what the pure rules need to know about "now"
function appContext(extra = {}) {
  return {
    session: state.session,
    records: state.records,
    today: toISODate(new Date()),
    now: localDateTime(),
    ...extra
  };
}
