/* pure functions only, no dom */

/* dates (yyyy-mm-dd compares fine as strings) */
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// utc so dst can't shift it
function daysBetween(isoA, isoB) {
  const [ay, am, ad] = isoA.split("-").map(Number);
  const [by, bm, bd] = isoB.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
  });
}

/* lookups and derived values */
function findEquipment(equipmentId, catalog = EQUIPMENT) {
  return catalog.find(item => item.id === equipmentId) || null;
}

// returns a new object, stored record untouched
function deriveRequest(request, today = toISODate(new Date()), catalog = EQUIPMENT) {
  const equipment = findEquipment(request.equipmentId, catalog);
  const isOverdue = request.status === "BORROWED" && today > request.dueDate;
  return {
    ...request,
    equipmentName: equipment ? equipment.name : "Unknown equipment",
    category: equipment ? equipment.category : "Uncategorized",
    laboratory: equipment ? equipment.laboratory : "—",
    loanDays: daysBetween(request.borrowDate, request.dueDate) + 1,
    isOverdue,
    daysOverdue: isOverdue ? daysBetween(request.dueDate, today) : 0,
    displayStatus: isOverdue ? "OVERDUE" : request.status,
    returnedLate: Boolean(request.returnedDate && request.returnedDate > request.dueDate)
  };
}

// available = total − qty on approved/borrowed
function deriveInventory(requests, catalog = EQUIPMENT) {
  return catalog.map(item => {
    const committed = requests
      .filter(r => r.equipmentId === item.id && COMMITTED_STATUSES.includes(r.status))
      .reduce((sum, r) => sum + r.quantity, 0);
    const available = Math.max(0, item.totalUnits - committed);
    let stockLevel = "OK";
    if (available === 0) stockLevel = "OUT";
    else if (available / item.totalUnits <= 0.25) stockLevel = "LOW";
    return { ...item, committed, available, stockLevel };
  });
}

/* search, filter, sort, page */
function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesQuery(record, query) {
  const q = normalize(query);
  if (!q) return true;
  return [record.id, record.borrowerName, record.borrowerId, record.equipmentName, record.purpose, record.purposeDetails]
    .some(value => normalize(value).includes(q));
}

function matchesFilters(record, filters) {
  if (filters.status !== "ALL" && record.displayStatus !== filters.status) return false;
  if (filters.category !== "ALL" && record.category !== filters.category) return false;
  if (filters.borrowerType !== "ALL" && record.borrowerType !== filters.borrowerType) return false;
  return true;
}

// tie-break on id so sort is stable
function compareRecords(a, b, sort) {
  const dir = sort.direction === "asc" ? 1 : -1;
  const av = a[sort.key];
  const bv = b[sort.key];
  let result;
  if (typeof av === "number" && typeof bv === "number") result = av - bv;
  else result = String(av ?? "").localeCompare(String(bv ?? ""), "en", { sensitivity: "base" });
  if (result === 0) result = a.id.localeCompare(b.id);
  else result *= dir;
  return result;
}

// new array, no mutation
function sortRecords(records, sort) {
  return [...records].sort((a, b) => compareRecords(a, b, sort));
}

function getVisibleRecords(records, ui, today = toISODate(new Date())) {
  const derived = records.map(r => deriveRequest(r, today));
  const matching = derived
    .filter(r => matchesQuery(r, ui.query))
    .filter(r => matchesFilters(r, ui.filters));
  return sortRecords(matching, ui.sort);
}

function getTotalPages(count, pageSize) {
  return Math.max(1, Math.ceil(count / pageSize));
}

function selectPage(records, page, pageSize) {
  const start = (page - 1) * pageSize;
  return records.slice(start, start + pageSize);
}

/* record changes, always new arrays */
function deleteById(records, id) {
  return records.filter(r => r.id !== id);
}

function findById(records, id) {
  return records.find(r => r.id === id) || null;
}

// seq only goes up, deleted ids never reused
function formatRequestId(seq, year = new Date().getFullYear()) {
  return `BR-${year}-${String(seq).padStart(4, "0")}`;
}

function nextSequenceFrom(records) {
  const max = records.reduce((m, r) => Math.max(m, Number(r.id.split("-")[2]) || 0), 0);
  return max + 1;
}

/* grouping */
function countBy(records, keyFn) {
  return records.reduce((acc, r) => {
    const key = keyFn(r);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

/* escape before rendering */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
