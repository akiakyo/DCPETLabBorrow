/* dashboard metrics (unit 9). pure: records in, numbers out.
   nothing on the dashboard is typed into the html. render() calls getMetrics()
   with the same records the list uses, so the two views cannot disagree */

// a percentage always has a named denominator. null when it is 0, so the ui never shows NaN or Infinity
function percentOf(part, whole) {
  return whole > 0 ? (part / whole) * 100 : null;
}

function formatPercent(value) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function sumOf(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}

const DISPLAY_STATUS_ORDER = ["PENDING", "APPROVED", "BORROWED", "OVERDUE", "RETURNED", "REJECTED", "CANCELLED"];
const PASSED_REVIEW = ["APPROVED", "BORROWED", "RETURNED"]; // approved at some point and not cancelled

/* scoped: requests this viewer may see → counts, rates and groups
   all:    every request → stock, because the inventory is shared by everyone */
function getMetrics(scoped, all, today = toISODate(new Date()), catalog = EQUIPMENT) {
  const records = scoped.map(r => deriveRequest(r, today, catalog));
  const total = records.length;
  const withStatus = (...statuses) => records.filter(r => statuses.includes(r.status));

  const borrowed = withStatus("BORROWED");
  const returned = withStatus("RETURNED");
  const returnedOnTime = returned.filter(r => !r.returnedLate).length;
  // inclusive, like loanDays: borrowed and returned the same day = 1 day
  const loanDaysTotal = returned.reduce((days, r) => days + daysBetween(r.borrowDate, r.returnedDate) + 1, 0);
  const passedReview = withStatus(...PASSED_REVIEW).length;
  const reviewed = passedReview + withStatus("REJECTED").length;

  const inventory = deriveInventory(all, catalog);
  const totalUnits = sumOf(inventory, "totalUnits");
  const committedUnits = sumOf(inventory, "committed");

  const statusCounts = countBy(records, r => r.displayStatus);
  const byStatus = DISPLAY_STATUS_ORDER.map(status => ({
    key: status,
    count: statusCounts[status] || 0,
    share: percentOf(statusCounts[status] || 0, total)
  }));

  // every catalog category is listed, also the ones with no requests
  const categoryCounts = countBy(records, r => r.category);
  const byCategory = [...new Set(catalog.map(item => item.category))]
    .map(category => ({
      key: category,
      count: categoryCounts[category] || 0,
      share: percentOf(categoryCounts[category] || 0, total)
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const byLaboratory = [...new Set(catalog.map(item => item.laboratory))]
    .map(lab => {
      const items = inventory.filter(item => item.laboratory === lab);
      const units = sumOf(items, "totalUnits");
      const committed = sumOf(items, "committed");
      return { key: lab, totalUnits: units, committed, utilization: percentOf(committed, units) };
    })
    .sort((a, b) => (b.utilization ?? -1) - (a.utilization ?? -1) || a.key.localeCompare(b.key));

  return {
    total,
    pending: withStatus("PENDING").length,
    borrowed: borrowed.length,
    unitsOut: sumOf(borrowed, "quantity"),
    overdue: records.filter(r => r.isOverdue).length,
    returned: returned.length,
    returnedOnTime,
    onTimeRate: percentOf(returnedOnTime, returned.length),
    reviewed,
    passedReview,
    approvalRate: percentOf(passedReview, reviewed),
    avgLoanDays: returned.length ? loanDaysTotal / returned.length : null,
    totalUnits,
    committedUnits,
    availableUnits: sumOf(inventory, "available"),
    utilization: percentOf(committedUnits, totalUnits),
    byStatus,
    byCategory,
    byLaboratory
  };
}

// printed under "How these numbers are computed"; the same wording is in the docs
const METRIC_FORMULAS = [
  ["Total requests", "Number of requests you can see. Borrowers see only their own."],
  ["Pending approval", "Requests with status Pending."],
  ["Currently borrowed", "Requests with status Borrowed, overdue ones included. Units out = sum of their quantities."],
  ["Overdue", "Borrowed requests whose due date is before today."],
  ["Units available", "Σ total units − Σ units on Approved or Borrowed requests, over all equipment. Committed share = committed ÷ total units × 100."],
  ["On-time return rate", "Returned on or before the due date ÷ all Returned requests × 100. Shown as — when nothing has been returned."],
  ["Approval rate", "Approved, Borrowed or Returned ÷ (those + Rejected) × 100. Pending and Cancelled are not counted. — when nothing has been reviewed."],
  ["Average loan length", "Σ (return date − borrow date + 1 day) ÷ number of Returned requests. — when nothing has been returned."],
  ["Requests by status", "Count per status ÷ total requests × 100. Overdue is counted on its own, not inside Borrowed."],
  ["Requests by category", "Count per equipment category ÷ total requests × 100."],
  ["Inventory use by laboratory", "Units on Approved or Borrowed requests ÷ total units in that laboratory × 100."]
];
