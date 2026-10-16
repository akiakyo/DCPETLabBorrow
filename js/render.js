/* state → dom. same state, same output */

const $ = selector => document.querySelector(selector);

function badge(status) {
  return `<span class="badge badge-${status}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

/* main render */
function render() {
  const today = toISODate(new Date());

  // clear selection if the record is gone or this user may not see it
  const selected = state.selectedId ? findById(state.records, state.selectedId) : null;
  if (!selected || !can(state.session, VIEW_PERMS, selected)) {
    state.selectedId = null;
    state.pendingAction = null;
  }

  // bulk selection only keeps requests that still exist and this user may still delete
  state.bulkSelection.forEach(id => {
    const record = findById(state.records, id);
    if (!record || !can(state.session, "request:delete", record)) state.bulkSelection.delete(id);
  });

  // everything below only sees what this user may view
  const scoped = visibleRecords(state.session, state.records);
  const allDerived = scoped.map(r => deriveRequest(r, today));
  const result = getExplorerResult(scoped, state, today);
  state.page = result.page; // fix page if results shrank
  const metrics = getMetrics(scoped, state.records, today);

  renderSummary(metrics);
  renderRecent(allDerived);
  renderDashboardGroups(metrics);
  renderResultCount(result);
  renderRangeError();

  if (result.total === 0) {
    renderEmptyState(scoped.length);
  } else {
    renderRecords(result.items);
  }
  renderBulkBar(result.items);
  renderPagination(result);
  renderDetails(allDerived);
  renderInventory();
  renderActivity(scoped);
  renderAudit();
  renderDataTools();
}

/* kpi cards. every value comes from getMetrics(); formulas are in metrics.js (METRIC_FORMULAS).
   a rate with nothing to divide by shows "—" and says why, never NaN or 0% */
function renderSummary(m) {
  const ownOnly = !can(state.session, "request:view-all");
  const cards = [
    { label: ownOnly ? "My requests" : "Total requests", value: m.total,
      note: ownOnly ? "Your borrow requests on record" : "All borrow requests on record", tone: "info" },
    { label: "Pending approval", value: m.pending,
      note: `${plural(m.pending, "request")} awaiting review`, tone: m.pending ? "warning" : "success" },
    { label: "Currently borrowed", value: m.borrowed, note: `${plural(m.unitsOut, "unit")} out of the lab`, tone: "info" },
    { label: "Overdue", value: m.overdue,
      note: m.overdue ? "Past due date and not yet returned" : "No overdue equipment", tone: m.overdue ? "danger" : "success" },
    { label: "Units available", value: `${m.availableUnits}/${m.totalUnits}`,
      note: `${formatPercent(m.utilization)} of all units approved or on loan`, tone: "success" },
    { label: "On-time return rate", value: formatPercent(m.onTimeRate),
      note: m.returned ? `${m.returnedOnTime} of ${plural(m.returned, "return")} on or before the due date` : "No returned requests yet",
      tone: m.onTimeRate === null ? "info" : m.onTimeRate >= 80 ? "success" : "warning" },
    { label: "Approval rate", value: formatPercent(m.approvalRate),
      note: m.reviewed ? `${m.passedReview} of ${plural(m.reviewed, "reviewed request")} approved` : "No requests reviewed yet", tone: "info" },
    { label: "Average loan length", value: m.avgLoanDays === null ? "—" : `${m.avgLoanDays.toFixed(1)} days`,
      note: m.returned ? `Borrow to return, over ${plural(m.returned, "returned request")}` : "No returned requests yet", tone: "info" }
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

/* grouped summaries as css bars. the bar is decoration (aria-hidden);
   the count and percentage beside it carry the information */
const STATUS_TONES = {
  PENDING: "warning", APPROVED: "info", BORROWED: "info", OVERDUE: "danger",
  RETURNED: "success", REJECTED: "muted", CANCELLED: "muted"
};

function renderBars(selector, rows) {
  $(selector).innerHTML = rows.map(row => `
    <li class="bar-row">
      <span class="bar-label">${row.label}</span>
      <span class="bar-track" aria-hidden="true"><span class="bar-fill" data-tone="${row.tone}" style="width:${(row.width ?? 0).toFixed(1)}%"></span></span>
      <span class="bar-value">${row.value}</span>
    </li>`).join("");
}

function renderDashboardGroups(m) {
  const share = value => (value === null ? "" : ` <span class="bar-share">· ${formatPercent(value)}</span>`);

  renderBars("#status-bars", m.byStatus.map(row => ({
    label: badge(row.key),
    width: row.share,
    tone: STATUS_TONES[row.key],
    value: `<strong>${row.count}</strong>${share(row.share)}`
  })));
  renderBars("#category-bars", m.byCategory.map(row => ({
    label: escapeHtml(row.key),
    width: row.share,
    tone: "info",
    value: `<strong>${row.count}</strong>${share(row.share)}`
  })));
  renderBars("#lab-bars", m.byLaboratory.map(row => ({
    label: escapeHtml(row.key),
    width: row.utilization,
    tone: row.utilization >= 75 ? "danger" : row.utilization >= 50 ? "warning" : "success",
    value: `<strong>${row.committed}</strong> of ${row.totalUnits} units${share(row.utilization)}`
  })));

  $("#status-bars-empty").hidden = m.total > 0;
  $("#category-bars-empty").hidden = m.total > 0;
}

// once at start: the formulas do not change at run time
function renderMetricFormulas() {
  $("#metric-formulas").innerHTML = METRIC_FORMULAS
    .map(([name, formula]) => `<dt>${escapeHtml(name)}</dt><dd>${escapeHtml(formula)}</dd>`).join("");
}

/* record list */
function renderResultCount(result) {
  $("#result-count").textContent = formatResultCount(result);
}

function renderRangeError() {
  const valid = isValidDateRange(state.filters);
  $("#err-dateRange").textContent = valid ? "" : "“Borrow date from” is later than “Borrow date to”, so the date range is not applied.";
  ["#filter-from", "#filter-to"].forEach(id => {
    if (valid) $(id).removeAttribute("aria-invalid");
    else $(id).setAttribute("aria-invalid", "true");
  });
}

// row buttons come from permission checks
function rowActions(r) {
  const id = escapeHtml(r.id);
  const buttons = [`<button type="button" class="btn btn-sm" data-action="view" data-id="${id}" aria-label="View ${id}">View</button>`];
  if (can(state.session, EDIT_PERMS, r)) {
    buttons.push(`<button type="button" class="btn btn-sm" data-action="edit" data-id="${id}" aria-label="Edit ${id}">Edit</button>`);
  }
  if (can(state.session, "request:delete", r)) {
    buttons.push(`<button type="button" class="btn btn-sm btn-danger" data-action="delete" data-id="${id}" aria-label="Delete ${id}">Delete</button>`);
  }
  return buttons.join("");
}

// left column: a box on every row for a role that may delete (the lab head)
function selectCell(r) {
  if (!can(state.session, "request:delete", r)) return `<td class="col-select is-empty"></td>`;
  const id = escapeHtml(r.id);
  return `
      <td class="col-select" data-label="Select">
        <label class="select-box">
          <input type="checkbox" id="select-${id}" data-select-id="${id}" ${state.bulkSelection.has(r.id) ? "checked" : ""}>
          <span class="visually-hidden">Select ${id} for deletion</span>
        </label>
      </td>`;
}

function deletableIds(records) {
  return records.filter(r => can(state.session, "request:delete", r)).map(r => r.id);
}

function renderRecords(pageRecords) {
  $("#empty-state").hidden = true;
  $("#table-wrap").hidden = false;

  $("#records-body").innerHTML = pageRecords.map(r => `
    <tr class="${r.id === state.selectedId ? "is-selected" : ""}${state.bulkSelection.has(r.id) ? " is-checked" : ""}">
      ${selectCell(r)}
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
        <span class="cell-sub">${plural(r.loanDays, "day")}${r.isOverdue ? ` · ${plural(r.daysOverdue, "day")} overdue` : ""}</span>
      </div></td>
      <td data-label="Status">${badge(r.displayStatus)}</td>
      <td class="cell-actions">${rowActions(r)}</td>
    </tr>`).join("");
}

function renderEmptyState(scopeCount = state.records.length) {
  $("#records-body").innerHTML = "";
  $("#table-wrap").hidden = true;
  const box = $("#empty-state");
  box.hidden = false;

  if (scopeCount === 0) {
    const ownOnly = !can(state.session, "request:view-all");
    box.innerHTML = `
      <p><strong>${ownOnly ? "You have no borrow requests yet." : "There are no borrow requests yet."}</strong></p>
      <p>New requests will appear here once they are submitted.</p>
      <a class="btn btn-primary" href="#new-request">Create a borrow request</a>`;
  } else {
    box.innerHTML = `
      <p><strong>No requests match your search or filters.</strong></p>
      <p>Try a different keyword, or clear the filters to see all ${plural(scopeCount, "request")}.</p>
      <button type="button" class="btn btn-primary" data-action="clear-filters">Clear search and filters</button>`;
  }
}

/* bulk delete bar + "select page" box. only for roles that can delete at all.
   the selection survives paging and filtering, so the count says how many are off this page */
function renderBulkBar(pageItems) {
  const enabled = allowed(state.session.role, "request:delete");
  $("#records-table").classList.toggle("has-select", enabled);
  $("#bulk-bar").hidden = !enabled;
  if (!enabled) return;

  const pageIds = deletableIds(pageItems);
  const count = state.bulkSelection.size;
  const onPage = pageIds.filter(id => state.bulkSelection.has(id)).length;
  const offPage = count - onPage;
  const message = count
    ? `${plural(count, "request")} selected${offPage ? ` (${offPage} not on this page)` : ""}.`
    : "Tick the box beside a request ID to select it, or the box in the header for the whole page.";
  // role=status: only touch the text when it changes, so it is not re-announced on every render
  if ($("#bulk-count").textContent !== message) $("#bulk-count").textContent = message;

  $("#bulk-delete").hidden = !count;
  $("#bulk-delete").textContent = `Delete selected (${count})`;
  $("#bulk-clear").hidden = !count;
  $("#bulk-select-page").disabled = !pageIds.length || onPage === pageIds.length;

  const box = $("#select-page");
  box.disabled = !pageIds.length;
  box.checked = pageIds.length > 0 && onPage === pageIds.length;
  box.indeterminate = onPage > 0 && onPage < pageIds.length;
}

// previous / numbered pages / next. impossible moves are disabled
function renderPagination(result) {
  const nav = $("#pagination");
  if (result.total === 0) { nav.innerHTML = ""; return; }
  const pages = pageWindow(result.page, result.totalPages).map(p => {
    if (p === null) return `<li class="page-gap" aria-hidden="true">…</li>`;
    const current = p === result.page;
    return `<li><button type="button" class="btn btn-sm" data-action="page-go" data-page="${p}"
      ${current ? 'aria-current="page"' : ""} aria-label="Page ${p}${current ? ", current page" : ""}">${p}</button></li>`;
  }).join("");
  nav.innerHTML = `
    <button type="button" class="btn btn-sm" data-action="page-prev" ${result.hasPrev ? "" : "disabled"}>← Previous</button>
    <ol class="page-list">${pages}</ol>
    <span class="page-status">Page ${result.page} of ${result.totalPages}</span>
    <button type="button" class="btn btn-sm" data-action="page-next" ${result.hasNext ? "" : "disabled"}>Next →</button>`;
}

/* details */
function renderProgress(r) {
  const progress = workflowProgress(r);
  const reached = new Set((r.history || []).map(h => h.to));
  const stateText = { done: "completed", current: "current stage", todo: "not yet reached", skipped: "not reached" };

  const steps = MAIN_PATH.map((status, i) => {
    let step;
    if (progress.linear) step = i < progress.index ? "done" : i === progress.index ? "current" : "todo";
    else step = reached.has(status) ? "done" : "skipped";
    return { label: STATUS_LABELS[status], step };
  });
  // off the main path: the outcome becomes the last step
  if (!progress.linear) steps.push({ label: STATUS_LABELS[r.status], step: "current" });

  const summary = progress.linear
    ? `Stage ${progress.index + 1} of ${progress.final + 1} · ${progress.percent}% of the borrowing path${r.isOverdue ? " · overdue" : ""}`
    : `Closed as ${STATUS_LABELS[r.status]}. This request left the normal borrowing path, so no percentage is shown.`;

  return `
    <ol class="stepper">
      ${steps.map(s => `<li data-step="${s.step}"><span class="step-label">${escapeHtml(s.label)}</span>
        <span class="step-state">${stateText[s.step]}</span></li>`).join("")}
    </ol>
    <p class="hint">${escapeHtml(summary)}</p>`;
}

function historyChange(entry) {
  if (!entry.from) return badge(entry.to);
  return `${badge(entry.from)} <span aria-hidden="true">→</span><span class="visually-hidden">to</span> ${badge(entry.to)}`;
}

function renderHistory(r) {
  const entries = [...(r.history || [])].reverse();
  if (!entries.length) return `<p class="empty-note">No status changes recorded.</p>`;
  return `
    <ol class="history-list">
      ${entries.map(h => `
        <li>
          <span class="history-change">${historyChange(h)}</span>
          <span class="history-meta"><strong>${escapeHtml(h.action)}</strong> by ${escapeHtml(h.actor)} · ${formatDateTime(h.at)}</span>
          ${h.note ? `<span class="history-note">“${escapeHtml(h.note)}”</span>` : ""}
        </li>`).join("")}
    </ol>`;
}

// only legal next steps, and only those this role has. blocked ones say why
function renderWorkflowActions(r) {
  const id = escapeHtml(r.id);

  if (TRANSITIONS[r.status].length === 0) {
    return `<p class="hint">${escapeHtml(STATUS_LABELS[r.status])} is a final state. No further status changes are possible.</p>`;
  }

  const pending = state.pendingAction && state.pendingAction.id === r.id ? state.pendingAction.to : null;
  if (pending) {
    const action = WORKFLOW_ACTIONS[pending];
    const required = action.note === "required";
    return `
      <form id="action-form" class="action-form" novalidate data-id="${id}" data-to="${pending}">
        <div class="field">
          <label for="action-note">${escapeHtml(action.noteLabel)}${required ? " *" : " (optional)"}</label>
          <textarea id="action-note" name="note" rows="2" maxlength="${NOTE_MAX}" ${required ? "required" : ""}
                    aria-describedby="err-action-note"></textarea>
          <p class="error" id="err-action-note"></p>
        </div>
        <div class="button-row">
          <button type="submit" class="btn btn-primary">Confirm: ${escapeHtml(action.label)}</button>
          <button type="button" class="btn" data-action="cancel-transition">Back</button>
        </div>
      </form>`;
  }

  const actions = availableActions(r, state.session, appContext());
  if (!actions.length) {
    return `<p class="hint">Your role (${escapeHtml(ROLE_LABELS[state.session.role])}) has no workflow actions for this request. Lab staff will process it.</p>`;
  }
  return `
    <div class="button-row">
      ${actions.map(a => `<button type="button" class="btn ${a.tone ? `btn-${a.tone}` : ""}" data-action="transition"
        data-id="${id}" data-to="${a.to}" ${a.blocked ? `disabled aria-describedby="blocked-${a.to}"` : ""}>${escapeHtml(a.label)}</button>`).join("")}
    </div>
    ${actions.filter(a => a.blocked).map(a => `
      <p class="hint blocked-note" id="blocked-${a.to}"><strong>${escapeHtml(a.label)} is unavailable:</strong> ${escapeHtml(a.blocked)}</p>`).join("")}`;
}

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
    [`Loan period ${derivedTag}`, plural(r.loanDays, "day")],
    ["Returned", r.returnedDate ? `${formatDate(r.returnedDate)}${r.returnedLate ? " (late)" : ""}` : "Not yet returned"],
    ["Remarks", r.remarks ? escapeHtml(r.remarks) : "—"],
    ["Requested", formatDateTime(r.createdAt)]
  ];
  if (r.isOverdue) rows.splice(13, 0, [`Days overdue ${derivedTag}`, `<strong>${r.daysOverdue}</strong>`]);
  if (r.updatedAt) rows.push(["Last edited", formatDateTime(r.updatedAt)]);

  // the panel is rebuilt on every render; keep a half-typed note (and its focus) if the same note form comes back
  const oldForm = $("#action-form");
  const draft = oldForm && {
    id: oldForm.dataset.id,
    to: oldForm.dataset.to,
    value: oldForm.elements.note.value,
    focused: document.activeElement === oldForm.elements.note
  };

  const id = escapeHtml(r.id);
  const recordButtons = [`<button type="button" class="btn" data-action="close-details">Close details</button>`];
  if (can(state.session, EDIT_PERMS, r)) {
    recordButtons.push(`<button type="button" class="btn" data-action="edit" data-id="${id}">Edit request</button>`);
  }
  if (can(state.session, "request:delete", r)) {
    recordButtons.push(`<button type="button" class="btn btn-danger" data-action="delete" data-id="${id}">Delete request</button>`);
  }

  $("#details-body").innerHTML = `
    <dl class="details-list">
      ${rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("")}
    </dl>

    <section class="details-section" aria-labelledby="progress-title">
      <h3 id="progress-title">Workflow progress</h3>
      ${renderProgress(r)}
    </section>

    <section class="details-section" aria-labelledby="actions-title">
      <h3 id="actions-title">Next actions</h3>
      ${renderWorkflowActions(r)}
    </section>

    <section class="details-section" aria-labelledby="history-title">
      <h3 id="history-title">Status history</h3>
      ${renderHistory(r)}
    </section>

    <div class="button-row">${recordButtons.join("")}</div>`;

  const newForm = $("#action-form");
  if (draft && newForm && newForm.dataset.id === draft.id && newForm.dataset.to === draft.to) {
    newForm.elements.note.value = draft.value;
    if (draft.focused) newForm.elements.note.focus();
  }
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

/* activity log: status history of every request this user may see */
function renderActivity(records) {
  const entries = collectHistory(records);
  $("#activity-wrap").hidden = entries.length === 0;
  $("#activity-empty").hidden = entries.length > 0;
  $("#activity-body").innerHTML = entries.map(h => `
    <tr>
      <td data-label="When">${formatDateTime(h.at)}</td>
      <td data-label="Request"><button type="button" class="link-button cell-id" data-action="view"
        data-id="${escapeHtml(h.recordId)}" aria-label="View ${escapeHtml(h.recordId)}">${escapeHtml(h.recordId)}</button></td>
      <td data-label="Status change"><div>${historyChange(h)}</div></td>
      <td data-label="Action">${escapeHtml(h.action)}</td>
      <td data-label="By">${escapeHtml(h.actor)}</td>
      <td data-label="Note">${h.note ? escapeHtml(h.note) : "—"}</td>
    </tr>`).join("");
}

/* audit trail (unit 8), newest first */
function renderAudit() {
  const entries = [...state.audit].reverse();
  $("#audit-wrap").hidden = entries.length === 0;
  $("#audit-empty").hidden = entries.length > 0;
  $("#audit-body").innerHTML = entries.map(e => {
    const record = e.recordId && findById(state.records, e.recordId);
    const id = escapeHtml(e.recordId || "");
    const request = !e.recordId ? "—"
      : record ? `<button type="button" class="link-button cell-id" data-action="view" data-id="${id}" aria-label="View ${id}">${id}</button>`
      : `<span class="cell-id">${id}</span> <span class="cell-sub">no longer exists</span>`;
    return `
      <tr>
        <td data-label="When">${formatDateTime(e.timestamp)}</td>
        <td data-label="Action"><span class="audit-tag" data-audit="${escapeHtml(e.action)}">${escapeHtml(AUDIT_LABELS[e.action] || e.action)}</span></td>
        <td data-label="Request"><div>${request}</div></td>
        <td data-label="By">${escapeHtml(e.actor)}</td>
        <td data-label="Details">${escapeHtml(e.details)}</td>
      </tr>`;
  }).join("");
}

/* settings: storage status, backup, import preview (unit 8) */
function renderStorageStatus() {
  const s = state.storage;
  const counts = `${plural(state.records.length, "request")} · ${plural(state.audit.length, "audit entry", "audit entries")}`;
  let line;
  if (s.status === "unavailable") {
    line = `<p class="alert alert-error"><strong>Not saved.</strong> Browser storage is unavailable, so changes are lost when this page closes.</p>`;
  } else if (s.error) {
    line = `<p class="alert alert-error"><strong>Last save failed.</strong> ${escapeHtml(s.error)}</p>`;
  } else {
    line = `<p><strong>Saved in this browser.</strong> Last saved ${s.lastSavedAt ? formatDateTime(s.lastSavedAt) : "—"}.</p>`;
  }
  $("#storage-status").innerHTML = `
    ${line}
    <p class="hint">${counts} · storage key <code>${escapeHtml(STORAGE_KEY)}</code>, schema version ${SCHEMA_VERSION}.</p>`;
  $("#backup-tools").hidden = !(s.hasBackup && can(state.session, "data:manage"));
}

function renderImportPreview() {
  const box = $("#import-preview");
  const p = state.pendingImport;
  box.hidden = !p;
  if (!p) { box.innerHTML = ""; return; }

  const d = p.data;
  const newCount = p.newIds.length;
  const dupes = p.duplicateIds;
  const warnings = [...p.warnings, ...p.overcommitted];
  box.innerHTML = `
    <h4 id="import-preview-title" tabindex="-1">Check before importing: ${escapeHtml(p.fileName)}</h4>
    <ul class="import-facts">
      <li><strong>${plural(d.records.length, "request")}</strong> in the file${d.savedAt ? `, saved ${formatDateTime(d.savedAt)}` : ""}</li>
      <li>${plural(newCount, "new request")} · ${plural(dupes.length, "request")} with an ID already here${dupes.length ? ` (${escapeHtml(dupes.slice(0, 5).join(", "))}${dupes.length > 5 ? ", …" : ""})` : ""}</li>
      <li>${plural(d.audit.length, "audit entry", "audit entries")}</li>
    </ul>
    ${warnings.length ? `<div class="alert alert-warning"><p><strong>Please note:</strong></p><ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("")}</ul></div>` : ""}
    <fieldset class="radio-group import-mode">
      <legend>How should it be imported?</legend>
      <label><input type="radio" name="import-mode" value="replace" ${p.mode === "replace" ? "checked" : ""}>
        Replace: discard the current ${plural(state.records.length, "request")} and audit trail, use the file</label>
      <label><input type="radio" name="import-mode" value="merge" ${p.mode === "merge" ? "checked" : ""} ${newCount ? "" : "disabled"}>
        Merge: keep everything here and add the ${plural(newCount, "new request")}${newCount ? "" : " (nothing new to add)"}</label>
    </fieldset>
    <div class="button-row">
      <button type="button" class="btn btn-primary" data-action="confirm-import">Confirm import</button>
      <button type="button" class="btn" data-action="cancel-import">Cancel</button>
    </div>`;
}

function renderDataTools() {
  renderStorageStatus();
  renderImportPreview();
}

/* session: who is signed in, and what that role gets to see */
function renderNav() {
  const ownOnly = !can(state.session, "request:view-all");
  $("#nav-list").innerHTML = navItemsFor(state.session).map(item => `
    <li><a href="#${item.view}" data-view-link="${item.view}"${item.view === state.view ? ' aria-current="page"' : ""}>${
      escapeHtml(ownOnly && item.ownLabel ? item.ownLabel : item.label)}</a></li>`).join("");
}

function renderSession() {
  const session = state.session;
  const ownOnly = !can(session, "request:view-all");
  $("#session-name").textContent = session.displayName;
  $("#session-role").textContent = ROLE_LABELS[session.role];
  $("#role-switch").value = session.userId;

  $("#requests-title").textContent = ownOnly ? "My Borrow Requests" : "Borrow Requests";
  $("#dashboard-lead").textContent = ownOnly
    ? "Current state of your own borrow requests. Values are computed from the request records."
    : "Current state of all borrow requests. Values are computed from the request records.";

  const manage = can(session, "data:manage");
  $("#data-tools").hidden = !manage;
  $("#data-forbidden").hidden = manage;

  renderNav();
}

/* option lists from data */
function renderOptionLists() {
  const categories = [...new Set(EQUIPMENT.map(e => e.category))].sort();
  $("#filter-category").insertAdjacentHTML("beforeend",
    categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(""));

  $("#f-equipmentId").insertAdjacentHTML("beforeend",
    EQUIPMENT.map(e => `<option value="${e.id}">${escapeHtml(e.name)} (${escapeHtml(e.laboratory)})</option>`).join(""));

  $("#role-switch").innerHTML = USERS.map(u =>
    `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} — ${escapeHtml(ROLE_LABELS[u.role])}</option>`).join("");
}

// the matrix on the settings page is printed from the same sets the checks use
function renderPermissionMatrix() {
  const roles = Object.keys(ROLE_PERMISSIONS);
  $("#permission-head").innerHTML = `
    <tr>
      <th scope="col">Capability</th>
      ${roles.map(role => `<th scope="col">${escapeHtml(ROLE_LABELS[role])}</th>`).join("")}
      <th scope="col">Condition</th>
    </tr>`;
  $("#permission-body").innerHTML = Object.entries(PERMISSION_LABELS).map(([permission, label]) => `
    <tr>
      <th scope="row" data-label="Capability">${escapeHtml(label.charAt(0).toUpperCase() + label.slice(1))}</th>
      ${roles.map(role => `<td data-label="${escapeHtml(ROLE_LABELS[role])}">${allowed(role, permission) ? "✓ Yes" : "— No"}</td>`).join("")}
      <td data-label="Condition">${escapeHtml(PERMISSION_CONDITIONS[permission] || "—")}</td>
    </tr>`).join("");
}
