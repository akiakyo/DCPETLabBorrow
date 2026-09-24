/* single state = source of truth, dom is just a view */

const state = {
  // copy so seed stays untouched
  records: SEED_REQUESTS.map(r => ({ ...r })),
  nextSeq: nextSequenceFrom(SEED_REQUESTS),

  // ui
  view: "dashboard",
  query: "",
  filters: { status: "ALL", category: "ALL", borrowerType: "ALL" },
  sort: { key: "createdAt", direction: "desc" },
  page: 1,
  pageSize: 10,
  selectedId: null,

  // saved in unit 8
  preferences: { theme: "system" }
};
