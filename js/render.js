/* state → dom. same state, same output */

const $ = selector => document.querySelector(selector);

function badge(status) {
  return `<span class="badge badge-${status}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

/* main render */
function render() {
  const today = toISODate(new Date());
  const allDerived = state.records.map(r => deriveRequest(r, today));
  const visible = getVisibleRecords(state.records, state, today);

  // fix page if results shrank
  const totalPages = getTotalPages(visible.length, state.pageSize);
  if (state.page > totalPages) state.page = totalPages;

  // clear selection if record is gone
  if (state.selectedId && !findById(state.records, state.selectedId)) state.selectedId = null;

  renderSummary(allDerived);
  renderRecent(allDerived);
  renderStatusBreakdown(allDerived);
  renderResultCount(visible.length);

  if (visible.length === 0) {
    renderEmptyState();
  } else {
    renderRecords(selectPage(visible, state.page, state.pageSize));
  }
  renderPagination(visible.length);
  renderDetails(allDerived);
  renderInventory();
}

/* kpi cards
   total = all records, pending = PENDING,
   borrowed = BORROWED (incl. overdue), overdue = BORROWED past due,
   units available = sum of available across inventory */
function renderSummary(records) {
  const total = records.length;
  const pending = records.filter(r => r.status === "PENDING").length;
  const borrowed = records.filter(r => r.status === "BORROWED");
  const unitsOut = borrowed.reduce((sum, r) => sum + r.quantity, 0);
  const overdue = records.filter(r => r.isOverdue).length;
  const inventory = deriveInventory(state.records);
  const available = inventory.reduce((sum, i) => sum + i.available, 0);
  const totalUnits = inventory.reduce((sum, i) => sum + i.totalUnits, 0);

  const cards = [
    { label: "Total requests", value: total, note: "All borrow requests on record", tone: "info" },
    { label: "Pending approval", value: pending, note: pending === 1 ? "1 request awaiting review" : `${pending} requests awaiting review`, tone: pending ? "warning" : "success" },
    { label: "Currently borrowed", value: borrowed.length, note: `${unitsOut} unit${unitsOut === 1 ? "" : "s"} out of the lab`, tone: "info" },
    { label: "Overdue", value: overdue, note: overdue ? "Past due date and not yet returned" : "No overdue equipment", tone: overdue ? "danger" : "success" },
    { label: "Units available", value: `${available}/${totalUnits}`, note: "Across all inventory items", tone: "success" }
  ];

  $("#kpi-grid").innerHTML = cards.map(card => `
    <article class="kpi-card" data-tone="${card.tone}">
      <h2 class="kpi-label">${escapeHtml(card.label)}</h2>
      <p class="kpi-value">${escapeHtml(card.value)}</p>
      <p class="kpi-note">${escapeHtml(card.note)}</p>
    </article>`).join("");
}

function renderRecent(records) {
  const recent = sortRecords(records, { key: "createdAt", direction: "desc" }).slice(0, 5);
  $("#recent-empty").hidden = recent.length > 0;
  $("#recent-list").innerHTML = recent.map(r => `
    <li>
      <button type="button" data-action="view" data-id="${escapeHtml(r.id)}">
        <span>
          <span class="recent-title">${escapeHtml(r.equipmentName)} × ${r.quantity}</span>
          <span class="recent-meta">${escapeHtml(r.id)} · ${escapeHtml(r.borrowerName)}</span>
        </span>
        ${badge(r.displayStatus)}
      </button>
    </li>`).join("");
}

function renderStatusBreakdown(records) {
  const counts = countBy(records, r => r.displayStatus);
  const order = ["PENDING", "APPROVED", "BORROWED", "OVERDUE", "RETURNED", "REJECTED"];
  $("#status-list").innerHTML = order.map(status => `
    <li>${badge(status)} <strong>${counts[status] || 0}</strong></li>`).join("");
}

/* record list */
function renderResultCount(count) {
  const el = $("#result-count");
  if (count === 0) {
    el.textContent = "Showing 0 of 0 matching requests.";
    return;
  }
  const start = (state.page - 1) * state.pageSize + 1;
  const end = Math.min(state.page * state.pageSize, count);
  el.textContent = `Showing ${start}–${end} of ${count} matching request${count === 1 ? "" : "s"}.`;
}

function renderRecords(pageRecords) {
  $("#empty-state").hidden = true;
  $("#table-wrap").hidden = false;

  $("#records-body").innerHTML = pageRecords.map(r => `
    <tr class="${r.id === state.selectedId ? "is-selected" : ""}">
      <td data-label="Request ID" class="cell-id">${escapeHtml(r.id)}</td>
      <td data-label="Borrower"><div>
        ${escapeHtml(r.borrowerName)}
        <span class="cell-sub">${escapeHtml(r.borrowerType)} · ${escapeHtml(r.borrowerId)}</span>
      </div></td>
      <td data-label="Equipment"><div>
        ${escapeHtml(r.equipmentName)}
        <span class="cell-sub">${escapeHtml(r.category)}</span>
      </div></td>
      <td data-label="Qty" class="col-optional">${r.quantity}</td>
      <td data-label="Borrow → Due"><div>
        ${formatDate(r.borrowDate)} → ${formatDate(r.dueDate)}
        <span class="cell-sub">${r.loanDays} day${r.loanDays === 1 ? "" : "s"}${r.isOverdue ? ` · ${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"} overdue` : ""}</span>
      </div></td>
      <td data-label="Status">${badge(r.displayStatus)}</td>
      <td class="cell-actions">
        <button type="button" class="btn btn-sm" data-action="view" data-id="${escapeHtml(r.id)}"
                aria-label="View ${escapeHtml(r.id)}">View</button>
        <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-id="${escapeHtml(r.id)}"
                aria-label="Delete ${escapeHtml(r.id)}">Delete</button>
      </td>
    </tr>`).join("");
}

function renderEmptyState() {
  $("#records-body").innerHTML = "";
  $("#table-wrap").hidden = true;
  const box = $("#empty-state");
  box.hidden = false;

  if (state.records.length === 0) {
    box.innerHTML = `
      <p><strong>There are no borrow requests yet.</strong></p>
      <p>New requests will appear here once they are submitted.</p>
      <a class="btn btn-primary" href="#new-request">Create a borrow request</a>`;
  } else {
    box.innerHTML = `
      <p><strong>No requests match your search or filters.</strong></p>
      <p>Try a different keyword, or clear the filters to see all ${state.records.length} requests.</p>
      <button type="button" class="btn btn-primary" data-action="clear-filters">Clear search and filters</button>`;
  }
}

function renderPagination(count) {
  const nav = $("#pagination");
  if (count === 0) { nav.innerHTML = ""; return; }
  const totalPages = getTotalPages(count, state.pageSize);
  nav.innerHTML = `
    <button type="button" class="btn btn-sm" data-action="page-prev" ${state.page <= 1 ? "disabled" : ""}>← Previous</button>
    <span>Page ${state.page} of ${totalPages}</span>
    <button type="button" class="btn btn-sm" data-action="page-next" ${state.page >= totalPages ? "disabled" : ""}>Next →</button>`;
}

/* details */
function renderDetails(records) {
  const panel = $("#request-details");
  const layout = $("#requests-layout");
  const r = records.find(rec => rec.id === state.selectedId);

  panel.hidden = !r;
  layout.classList.toggle("has-details", Boolean(r));
  if (!r) { $("#details-body").innerHTML = ""; return; }

  const derivedTag = '<span class="derived-tag">(derived)</span>';
  const rows = [
    ["Request ID", `<span class="cell-id">${escapeHtml(r.id)}</span>`],
    ["Status", `${badge(r.displayStatus)} ${r.displayStatus === "OVERDUE" ? derivedTag : ""}`],
    ["Borrower", `${escapeHtml(r.borrowerName)} (${escapeHtml(r.borrowerType)})`],
    ["Borrower ID", escapeHtml(r.borrowerId)],
    ["Email", escapeHtml(r.borrowerEmail)],
    [`Equipment ${derivedTag}`, `${escapeHtml(r.equipmentName)} <span class="cell-sub">${escapeHtml(r.equipmentId)}</span>`],
    [`Category ${derivedTag}`, escapeHtml(r.category)],
    [`Laboratory ${derivedTag}`, escapeHtml(r.laboratory)],
    ["Quantity", r.quantity],
    ["Purpose", escapeHtml(r.purpose) + (r.purposeDetails ? ` — ${escapeHtml(r.purposeDetails)}` : "")],
    ["Borrow date", formatDate(r.borrowDate)],
    ["Due date", formatDate(r.dueDate)],
    [`Loan period ${derivedTag}`, `${r.loanDays} day${r.loanDays === 1 ? "" : "s"}`],
    ["Returned", r.returnedDate ? `${formatDate(r.returnedDate)}${r.returnedLate ? " (late)" : ""}` : "Not yet returned"],
    ["Remarks", r.remarks ? escapeHtml(r.remarks) : "—"],
    ["Requested", formatDateTime(r.createdAt)]
  ];
  if (r.isOverdue) rows.splice(13, 0, [`Days overdue ${derivedTag}`, `<strong>${r.daysOverdue}</strong>`]);

  $("#details-body").innerHTML = `
    <dl class="details-list">
      ${rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("")}
    </dl>
    <p class="hint">Workflow actions (approve, release, return) are added in Unit 6.</p>
    <div class="button-row">
      <button type="button" class="btn" data-action="close-details">Close details</button>
      <button type="button" class="btn btn-danger" data-action="delete" data-id="${escapeHtml(r.id)}">Delete request</button>
    </div>`;
}

/* inventory */
function renderInventory() {
  const inventory = deriveInventory(state.records);
  const levelLabel = { OK: "In stock", LOW: "Low stock", OUT: "Out of stock" };

  $("#equipment-grid").innerHTML = inventory.map(item => {
    const pct = Math.round((item.available / item.totalUnits) * 100);
    return `
      <article class="panel equipment-card">
        <h2>${escapeHtml(item.name)}</h2>
        <span class="cell-sub">${escapeHtml(item.id)} · ${escapeHtml(item.category)} · ${escapeHtml(item.laboratory)}</span>
        <p>${`<span class="badge badge-${item.stockLevel}">${levelLabel[item.stockLevel]}</span>`}</p>
        <div class="stock-meter" data-level="${item.stockLevel}" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <p class="stock-numbers">
          <span><strong>${item.available}</strong> of ${item.totalUnits} available</span>
          <span>${item.committed} committed</span>
        </p>
        <p class="hint">Condition: ${escapeHtml(item.condition)}</p>
      </article>`;
  }).join("");
}

/* option lists from data */
function renderOptionLists() {
  const categories = [...new Set(EQUIPMENT.map(e => e.category))].sort();
  $("#filter-category").insertAdjacentHTML("beforeend",
    categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(""));

  $("#f-equipmentId").insertAdjacentHTML("beforeend",
    EQUIPMENT.map(e => `<option value="${e.id}">${escapeHtml(e.name)} (${escapeHtml(e.laboratory)})</option>`).join(""));
}
