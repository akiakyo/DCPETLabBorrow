/* events and actions: check → update state → render() → announce */

const VIEWS = NAV_ITEMS.map(item => item.view);
const SEARCH_DEBOUNCE_MS = 300;
let pendingFocus = null; // focus target after view switch
let toastTimer = null;

/* feedback */
function showToast(message, tone = "info") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, tone === "error" ? 7000 : 4000);
}

function announce(message, tone = "info") {
  $("#live").textContent = "";
  // small delay so repeated msgs still get announced
  setTimeout(() => { $("#live").textContent = message; }, 50);
  showToast(message, tone);
}

// forbidden / invalid-transition / failed actions / recovery. stays until dismissed or the next action
function showNotice(message, title = "Action not completed.") {
  $("#notice-region").innerHTML = `
    <div class="alert alert-error notice">
      <p><strong>${escapeHtml(title)}</strong> ${escapeHtml(message)}</p>
      <button type="button" class="btn btn-sm" data-action="dismiss-notice">Dismiss</button>
    </div>`;
  showToast(message, "error"); // #notice-region is the screen-reader alert, the toast is for sighted users further down the page
}

function hideNotice() {
  $("#notice-region").innerHTML = "";
}

function reportError(error) {
  // expected rejections are warnings, anything else is a real bug
  if (error instanceof AppError) console.warn(`${error.name}: ${error.message}`);
  else console.error(error);
  showNotice(error.message || "The action could not be completed.");
}

/* persistence + audit (unit 8). every function that changes records calls both,
   so a change made from the console is saved and logged the same way */
function persist() {
  const payload = buildPayload(state);
  try {
    writeStoredState(payload);
    state.storage.lastSavedAt = payload.savedAt;
    state.storage.error = null;
    if (state.storage.status !== "unavailable") state.storage.status = "saved";
  } catch (error) {
    // the change stays on screen; the user is told it will not survive a refresh
    state.storage.error = `${error.message} Changes are shown but will be lost on refresh. Export your data to keep it.`;
    console.warn("Save failed:", error);
    showNotice(state.storage.error, "Could not save.");
  }
}

function recordAudit(action, recordId, details, actor = state.session) {
  state.audit = appendAudit(state.audit, auditEntry(actor, action, recordId, details));
}

function debounce(fn, delay) {
  let timer = null;
  const run = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, delay);
  };
  run.cancel = () => { clearTimeout(timer); timer = null; };
  return run;
}

/* navigation (hash) */
// change the address without firing hashchange
function setHash(name) {
  history.replaceState(null, "", `${location.pathname}${location.search}#${name}`);
}

function viewAllowed(name) {
  return navItemsFor(state.session).some(item => item.view === name);
}

function showView(name, { moveFocus = true } = {}) {
  if (!VIEWS.includes(name)) return;

  // typing a hash by hand must not get around the role
  if (!viewAllowed(name)) {
    const label = NAV_ITEMS.find(item => item.view === name).label;
    showNotice(`Your role (${ROLE_LABELS[state.session.role]}) cannot open ${label}. You were taken to the Dashboard.`);
    name = "dashboard";
    setHash("dashboard");
  }
  state.view = name;

  document.querySelectorAll(".view").forEach(section => {
    section.hidden = section.id !== name;
  });
  document.querySelectorAll("[data-view-link]").forEach(link => {
    if (link.dataset.viewLink === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  closeMobileNav();

  if (moveFocus) {
    const target = pendingFocus ? $(pendingFocus) : $(`#${name}-title`);
    pendingFocus = null;
    if (target) {
      target.focus();
      target.scrollIntoView({ block: "start" });
    }
  }
}

function closeMobileNav() {
  $("#primary-nav").classList.remove("is-open");
  $("#nav-toggle").setAttribute("aria-expanded", "false");
}

window.addEventListener("hashchange", () => {
  const name = location.hash.slice(1);
  if (!VIEWS.includes(name)) return;
  hideNotice();
  showView(name);
});

$("#nav-toggle").addEventListener("click", () => {
  const nav = $("#primary-nav");
  const open = nav.classList.toggle("is-open");
  $("#nav-toggle").setAttribute("aria-expanded", String(open));
});

/* record actions. every handler checks first, so a call from the console is refused the same way */
function handleAction(action, data = {}) {
  switch (action) {
    case "view": return viewRecord(data.id);
    case "edit": return startEdit(data.id);
    case "cancel-edit": return cancelEdit();
    case "delete": return deleteRecord(data.id);
    case "close-details": return closeDetails();
    case "transition": return startTransition(data.id, data.to);
    case "cancel-transition": return cancelTransition();
    case "clear-filters": return clearFilters();
    case "page-prev": return goToPage(state.page - 1, action);
    case "page-next": return goToPage(state.page + 1, action);
    case "page-go": return goToPage(Number(data.page));
    case "dismiss-notice": return $(`#${state.view}-title`).focus();
    case "export-data": return exportData();
    case "confirm-import": return confirmImport();
    case "cancel-import": return cancelImport();
    case "reset-data": return resetFromForm();
    case "download-backup": return downloadBackup();
    case "discard-backup": return discardBackup();
    default: throw new Error(`Unknown action: ${action}`);
  }
}

function getRecord(id) {
  const record = findById(state.records, id);
  if (!record) throw new AppError("NotFoundError", `Request ${id} no longer exists.`);
  return record;
}

function viewRecord(id) {
  const record = getRecord(id);
  requirePermission(state.session, VIEW_PERMS, record);
  if (state.selectedId !== id) state.pendingAction = null;
  state.selectedId = id;
  render();
  if (state.view !== "requests") {
    pendingFocus = "#details-title";
    location.hash = "#requests";
  } else {
    $("#details-title").focus();
    $("#request-details").scrollIntoView({ block: "nearest" });
  }
}

function deleteRecord(id) {
  const record = getRecord(id);
  requirePermission(state.session, "request:delete", record);
  if (!confirm(`Delete request ${id} (${record.borrowerName})? This cannot be undone.`)) {
    announce("Delete cancelled. No changes were made.");
    return;
  }
  state.records = deleteById(state.records, id);
  if (state.selectedId === id) state.selectedId = null;
  if (state.editingId === id) stopEditing();
  recordAudit("DELETE", id, `Deleted ${statusWord(record)} request of ${record.borrowerName} for ${deriveRequest(record).equipmentName} × ${record.quantity}.`);
  persist();
  render();
  $("#requests-title").focus();
  announce(`Request ${id} was deleted.`, "success");
}

function closeDetails() {
  const id = state.selectedId;
  state.selectedId = null;
  state.pendingAction = null;
  render();
  const rowButton = document.querySelector(`#records-body [data-action="view"][data-id="${id}"]`);
  (rowButton || $("#requests-title")).focus();
}

/* workflow (unit 6) */
function startTransition(id, to) {
  const record = getRecord(id);
  // refuse before opening the note form, not after the user has typed a reason
  assertTransition(record, to, appContext());
  if (WORKFLOW_ACTIONS[to].note === "none") return transitionRequest(id, to);
  state.selectedId = id;
  state.pendingAction = { id, to };
  render();
  $("#action-note").focus();
}

function cancelTransition() {
  const to = state.pendingAction ? state.pendingAction.to : null;
  state.pendingAction = null;
  render();
  (document.querySelector(`#details-body [data-action="transition"][data-to="${to}"]`) || $("#details-title")).focus();
}

// the only way a status changes. illegal or forbidden calls throw and leave state untouched
function transitionRequest(id, to, note = "") {
  const record = getRecord(id);
  const updated = transitionRecord(record, to, appContext({ note }));
  state.records = replaceById(state.records, updated);
  state.pendingAction = null;
  const savedNote = updated.history[updated.history.length - 1].note;
  recordAudit("STATUS_CHANGE", id,
    `${STATUS_LABELS[record.status]} → ${STATUS_LABELS[to]} (${WORKFLOW_ACTIONS[to].done})${savedNote ? `: “${savedNote}”` : ""}.`);
  persist();
  render();
  if (state.selectedId === id && state.view === "requests") $("#details-title").focus();
  announce(`${id}: ${STATUS_LABELS[record.status]} → ${STATUS_LABELS[to]} (${WORKFLOW_ACTIONS[to].done}).`, "success");
  return updated;
}

document.addEventListener("submit", event => {
  if (event.target.id !== "action-form") return;
  event.preventDefault();
  hideNotice();
  const { id, to } = event.target.dataset;
  const noteField = event.target.elements.note;
  try {
    transitionRequest(id, to, noteField.value);
  } catch (error) {
    if (error.name !== "ValidationError") { reportError(error); return; }
    // keep what was typed, point at the field
    $("#err-action-note").textContent = error.message;
    noteField.setAttribute("aria-invalid", "true");
    noteField.focus();
    announce(error.message, "error");
  }
});

/* explorer (unit 5) */
function updateExplorer(change) {
  Object.assign(state, applyExplorerChange(state, change));
  // sort and page size are saved preferences; search and filters are not
  if (change.type === "sort" || change.type === "pageSize") persist();
  render();
}

function clearFilters() {
  onSearchInput.cancel();
  updateExplorer({ type: "clear" });
  syncToolbar();
  $("#search").focus();
  announce("Search and filters cleared.");
}

function goToPage(page, actionName) {
  const { totalPages } = getExplorerResult(visibleRecords(state.session, state.records), state);
  if (!Number.isInteger(page) || page < 1 || page > totalPages) return;
  updateExplorer({ type: "page", value: page });
  // render replaced the buttons, put focus back on the matching one
  const again = actionName && document.querySelector(`#pagination [data-action="${actionName}"]:not(:disabled)`);
  (again || document.querySelector('#pagination [aria-current="page"]'))?.focus();
  $("#result-count").scrollIntoView({ block: "nearest" });
}

// one listener for every [data-action], even new rows
document.addEventListener("click", event => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  hideNotice();
  try {
    handleAction(control.dataset.action, control.dataset);
  } catch (error) {
    reportError(error);
  }
});

/* toolbar */
function syncToolbar() {
  $("#search").value = state.query;
  $("#filter-status").value = state.filters.status;
  $("#filter-category").value = state.filters.category;
  $("#filter-type").value = state.filters.borrowerType;
  $("#filter-from").value = state.filters.dateFrom;
  $("#filter-to").value = state.filters.dateTo;
  $("#sort-key").value = state.sort.key;
  $("#sort-dir").value = state.sort.direction;
  $("#page-size").value = String(state.pageSize);
}

// wait until typing pauses before filtering
const onSearchInput = debounce(value => updateExplorer({ type: "query", value }), SEARCH_DEBOUNCE_MS);

$("#search").addEventListener("input", event => onSearchInput(event.target.value));

// enter searches right away
$("#toolbar").addEventListener("submit", event => {
  event.preventDefault();
  onSearchInput.cancel();
  updateExplorer({ type: "query", value: $("#search").value });
});

$("#toolbar").addEventListener("change", event => {
  const control = event.target;
  if (control.dataset.filter) updateExplorer({ type: "filter", name: control.dataset.filter, value: control.value });
  else if (control.dataset.sort) updateExplorer({ type: "sort", value: { [control.dataset.sort]: control.value } });
  else if (control.id === "page-size") updateExplorer({ type: "pageSize", value: Number(control.value) });
});

/* request form (unit 4): html constraints first, then validateRequest() */
const form = $("#request-form");

function fieldLabel(control) {
  const label = control.type === "radio"
    ? control.closest("fieldset").querySelector("legend")
    : control.form.querySelector(`label[for="${control.id}"]`);
  return label ? label.textContent.replace("*", "").trim() : control.name;
}

function messageFor(control) {
  const v = control.validity;
  const label = fieldLabel(control);
  if (v.valueMissing) return `${label} is required.`;
  if (v.typeMismatch) return `${label}: enter a valid email address.`;
  if (v.patternMismatch) return `${label}: use the format 2023-00142 (student) or F-0031 (faculty).`;
  if (v.tooShort) return `${label}: use at least ${control.minLength} characters.`;
  if (v.tooLong) return `${label}: use ${control.maxLength} characters or fewer.`;
  if (v.rangeUnderflow || v.rangeOverflow) return `${label}: enter a number from ${control.min} to ${control.max}.`;
  if (v.stepMismatch) return `${label}: enter a whole number.`;
  if (v.badInput) return `${label}: enter a valid value.`;
  return `${label}: ${control.validationMessage}`;
}

// layer 1: what the html attributes reject. { field: message }
function nativeErrors(formEl) {
  const errors = {};
  Array.from(formEl.elements).forEach(control => {
    if (!control.name || !control.willValidate || control.validity.valid || errors[control.name]) return;
    errors[control.name] = messageFor(control);
  });
  return errors;
}

function readForm() {
  const data = new FormData(form);
  return normalizeRequestInput(Object.fromEntries(FORM_FIELDS.map(name => [name, data.get(name)])));
}

function firstControl(name) {
  const control = form.elements[name];
  return control instanceof RadioNodeList
    ? Array.from(control).find(radio => !radio.disabled) || control[0]
    : control;
}

function updateConditionalFields() {
  const needsDetails = form.purpose.value === "Other";
  form.purposeDetails.required = needsDetails;
  $("#details-required-mark").hidden = !needsDetails;
}

// borrowers file for themselves: their details are filled in and locked
function syncFormToSession() {
  const locked = !can(state.session, "request:create-for-others");
  const user = findUser(state.session.userId);
  ["borrowerId", "borrowerName", "borrowerEmail"].forEach(name => { form.elements[name].readOnly = locked; });
  if (locked) {
    form.elements.borrowerId.value = user.id;
    form.elements.borrowerName.value = user.name;
    form.elements.borrowerEmail.value = user.email;
    form.elements.borrowerType.value = user.borrowerType;
  }
  form.querySelectorAll('[name="borrowerType"]').forEach(radio => { radio.disabled = locked && !radio.checked; });
  $("#borrower-lock-note").hidden = !locked;
}

function renderFormMode() {
  const editing = Boolean(state.editingId);
  $("#new-request-title").textContent = editing ? `Edit Borrow Request ${state.editingId}` : "New Borrow Request";
  $("#form-submit").textContent = editing ? "Save changes" : "Submit request";
  $("#form-reset").hidden = editing;
  $("#form-cancel-edit").hidden = !editing;
}

function clearFormErrors() {
  form.querySelectorAll("[data-error-for]").forEach(el => { el.textContent = ""; });
  form.querySelectorAll("[aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
  $("#error-summary").hidden = true;
  $("#error-list").innerHTML = "";
}

// inline message per field + a summary that links to each field. values are left as typed
function showFormErrors(errors) {
  const failed = FORM_FIELDS.filter(name => errors[name]);
  failed.forEach(name => {
    const box = form.querySelector(`[data-error-for="${name}"]`);
    if (box) box.textContent = errors[name];
    form.querySelectorAll(`[name="${name}"]`).forEach(control => control.setAttribute("aria-invalid", "true"));
  });
  $("#error-list").innerHTML = failed
    .map(name => `<li><a href="#${firstControl(name).id}" data-focus-field="${name}">${escapeHtml(errors[name])}</a></li>`)
    .join("");
  $("#error-summary").hidden = false;
  $("#error-summary").focus();
}

// focus the field, don't change the hash
$("#error-summary").addEventListener("click", event => {
  const link = event.target.closest("[data-focus-field]");
  if (!link) return;
  event.preventDefault();
  firstControl(link.dataset.focusField).focus();
});

form.purpose.addEventListener("change", updateConditionalFields);

form.addEventListener("reset", () => {
  clearFormErrors();
  $("#form-success").hidden = true;
  // wait for browser reset
  setTimeout(() => { updateConditionalFields(); syncFormToSession(); }, 0);
});

/* the only way a request is created or edited. permission, then every rule, then state.
   throws without changing anything when either check fails */
function saveRequest(input, editingId = state.editingId) {
  const data = normalizeRequestInput(input);
  const existing = editingId ? getRecord(editingId) : null;
  if (existing) requirePermission(state.session, EDIT_PERMS, existing);
  else requirePermission(state.session, "request:create");

  const errors = validateRequest(data, appContext({ editingId }));
  const failed = FORM_FIELDS.filter(name => errors[name]);
  if (failed.length) {
    throw new AppError("ValidationError", `The request was not saved. ${errors[failed[0]]}`, errors);
  }

  const now = localDateTime();
  const fields = { ...data, purposeDetails: data.purpose === "Other" ? data.purposeDetails : "" };
  let record;
  if (existing) {
    record = { ...existing, ...fields, updatedAt: now };
    state.records = replaceById(state.records, record);
    recordAudit("UPDATE", record.id, describeChanges(existing, record));
  } else {
    record = {
      id: formatRequestId(state.nextSeq),
      ...fields,
      returnedDate: null,
      status: "PENDING",
      remarks: "",
      createdAt: now,
      createdBy: state.session.userId,
      history: [{ at: now, from: null, to: "PENDING", action: "Submitted", actor: state.session.displayName, note: "" }]
    };
    state.records = [...state.records, record];
    state.nextSeq += 1;
    recordAudit("CREATE", record.id,
      `Submitted for ${record.borrowerName}: ${deriveRequest(record).equipmentName} × ${record.quantity}, ${record.borrowDate} to ${record.dueDate}.`);
  }
  persist();
  render();
  return record;
}

function startEdit(id) {
  const record = getRecord(id);
  requirePermission(state.session, EDIT_PERMS, record);
  state.editingId = id;
  state.pendingAction = null;
  clearFormErrors();
  $("#form-success").hidden = true;
  FORM_FIELDS.forEach(name => { form.elements[name].value = record[name]; });
  updateConditionalFields();
  syncFormToSession();
  renderFormMode();
  render();
  if (state.view === "new-request") $("#new-request-title").focus();
  else location.hash = "#new-request";
}

function stopEditing() {
  state.editingId = null;
  form.reset();
  renderFormMode();
}

function cancelEdit() {
  const id = state.editingId;
  stopEditing();
  announce("Editing cancelled. No changes were saved.");
  if (id && findById(state.records, id)) viewRecord(id);
}

form.addEventListener("submit", event => {
  event.preventDefault();
  hideNotice();
  clearFormErrors();
  $("#form-success").hidden = true;
  updateConditionalFields();

  // whitespace only = empty
  form.querySelectorAll('input[type="text"], input[type="email"], textarea').forEach(el => { el.value = el.value.trim(); });

  const editingId = state.editingId;
  if (editingId && !findById(state.records, editingId)) {
    stopEditing();
    reportError(new AppError("NotFoundError", `Request ${editingId} no longer exists, so it cannot be edited.`));
    return;
  }

  // both layers; when a field fails both, the more specific javascript message is the one shown
  const errors = { ...nativeErrors(form), ...validateRequest(readForm(), appContext({ editingId })) };
  const count = FORM_FIELDS.filter(name => errors[name]).length;
  if (count) {
    showFormErrors(errors);
    announce(`The request was not saved. ${count} field${count === 1 ? " needs" : "s need"} attention.`, "error");
    return;
  }

  let record;
  try {
    record = saveRequest(readForm(), editingId);
  } catch (error) {
    reportError(error);
    return;
  }

  stopEditing();
  const success = $("#form-success");
  const id = escapeHtml(record.id);
  success.innerHTML = `Request <strong>${id}</strong> ${editingId ? "was updated." : "was submitted and is pending approval."}
    <button type="button" class="btn btn-sm" data-action="view" data-id="${id}">View request</button>`;
  success.hidden = false;
  $("#new-request-title").focus();
  announce(editingId ? `Request ${record.id} updated.` : `Request ${record.id} submitted.`, "success");
});

/* session (unit 7). demo switch only, there is no real sign-in */
function switchUser(userId) {
  if (!findUser(userId)) throw new AppError("NotFoundError", `Unknown demo user: ${userId}`);
  state.session = sessionFor(userId);
  state.selectedId = null;
  state.pendingAction = null;
  state.pendingImport = null;
  state.page = 1;
  stopEditing(); // the form belongs to the previous user
  persist(); // the active demo user is restored after a refresh
  renderSession();
  render();
  if (!viewAllowed(state.view)) {
    showView("dashboard", { moveFocus: false });
    setHash("dashboard");
  }
  announce(`Now acting as ${state.session.displayName} (${ROLE_LABELS[state.session.role]}).`);
}

$("#role-switch").addEventListener("change", event => {
  hideNotice();
  try {
    switchUser(event.target.value);
  } catch (error) {
    reportError(error);
  }
});

/* preferences */
function applyTheme(theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
}

$("#pref-theme").addEventListener("change", event => {
  state.preferences.theme = event.target.value;
  applyTheme(state.preferences.theme);
  persist();
  renderStorageStatus();
  announce(`Theme set to ${event.target.selectedOptions[0].textContent}.`);
});

/* data management (unit 8). lab head only; every function checks first,
   so the same call from the console is refused the same way */
const IMPORT_CHECK_DELAY_MS = 400; // short simulated loading state while a file is checked

function downloadJson(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportData() {
  requirePermission(state.session, "data:manage");
  const payload = buildPayload(state);
  const fileName = `labborrow-export-${payload.savedAt.slice(0, 10)}.json`;
  downloadJson(JSON.stringify(payload, null, 2), fileName);
  announce(`Exported ${plural(state.records.length, "request")} and ${plural(state.audit.length, "audit entry", "audit entries")} to ${fileName}.`, "success");
  return payload;
}

function setImportBusy(busy) {
  $("#import-file").disabled = busy;
  $("#import-tool").setAttribute("aria-busy", String(busy));
  $("#import-status").textContent = busy ? "Checking file…" : "";
}

function clearImportError() {
  $("#err-import").innerHTML = "";
  $("#import-file").removeAttribute("aria-invalid");
}

// step 1: check the text and show what would happen. state.records is not touched
function previewImportText(text, fileName = "import.json") {
  requirePermission(state.session, "data:manage");
  const result = parsePayload(text);
  if (!result.ok) {
    throw new AppError("ValidationError", `${fileName} was not imported. ${result.errors.join(" ")}`, result.errors);
  }
  const { added, skipped } = mergeRecords(state.records, result.data.records);
  state.pendingImport = {
    fileName,
    payload: JSON.parse(text),
    data: result.data,
    warnings: result.warnings,
    overcommitted: overcommitted(result.data.records).map(item =>
      `${item.name} has ${item.committed} units approved or borrowed in this file but only ${item.totalUnits} exist.`),
    newIds: added,
    duplicateIds: skipped,
    mode: "replace"
  };
  render();
  return state.pendingImport;
}

async function previewImportFile(file) {
  requirePermission(state.session, "data:manage");
  state.pendingImport = null;
  render();
  if (!/\.json$/i.test(file.name) && file.type !== "application/json") {
    throw new AppError("ValidationError", `${file.name} was not imported. Choose a .json file exported from LabBorrow.`);
  }
  if (file.size > IMPORT_MAX_BYTES) {
    throw new AppError("ValidationError", `${file.name} was not imported. It is larger than ${IMPORT_MAX_BYTES / 1024 / 1024} MB.`);
  }
  setImportBusy(true);
  try {
    const [text] = await Promise.all([file.text(), new Promise(done => setTimeout(done, IMPORT_CHECK_DELAY_MS))]);
    return previewImportText(text, file.name);
  } finally {
    setImportBusy(false);
  }
}

// step 2: the only function that replaces or merges records from a file. checks again before changing anything
function importData(payload, mode = "replace", fileName = "import.json") {
  requirePermission(state.session, "data:manage");
  if (!["replace", "merge"].includes(mode)) throw new AppError("ValidationError", `Unknown import mode "${mode}". Use replace or merge.`);
  const result = validatePayload(payload);
  if (!result.ok) throw new AppError("ValidationError", `Import refused. ${result.errors.join(" ")}`, result.errors);

  const incoming = result.data;
  let details;
  if (mode === "replace") {
    details = `Replaced ${plural(state.records.length, "request")} with ${plural(incoming.records.length, "request")} from ${fileName}.`;
    state.records = incoming.records;
    state.audit = incoming.audit;
  } else {
    const merged = mergeRecords(state.records, incoming.records);
    details = `Merged ${plural(merged.added.length, "new request")} from ${fileName}` +
      (merged.skipped.length ? `; skipped ${plural(merged.skipped.length, "request")} whose ID was already here.` : ".");
    state.records = merged.records;
  }
  // ids only go up, so an id this browser already handed out is never reused
  state.nextSeq = Math.max(state.nextSeq, incoming.nextSeq, nextSequenceFrom(state.records));
  state.pendingImport = null;
  state.selectedId = null;
  state.pendingAction = null;
  if (state.editingId) stopEditing();
  state.page = 1;
  recordAudit("IMPORT", null, details);
  persist();
  render();
  return details;
}

function confirmImport() {
  const pending = state.pendingImport;
  if (!pending) throw new AppError("NotFoundError", "There is no checked file to import. Choose a file first.");
  const details = importData(pending.payload, pending.mode, pending.fileName);
  $("#data-title").focus();
  announce(details, "success");
}

function cancelImport() {
  state.pendingImport = null;
  render();
  $("#import-file").focus();
  announce("Import cancelled. No changes were made.");
}

function resetData(phrase) {
  requirePermission(state.session, "data:manage");
  const problem = resetPhraseError(phrase);
  if (problem) throw new AppError("ValidationError", problem);

  const details = `Restored the ${plural(SEED_REQUESTS.length, "sample request")}. ` +
    `Cleared ${plural(state.records.length, "request")} and ${plural(state.audit.length, "audit entry", "audit entries")}.`;
  state.records = seedRecords();
  state.nextSeq = Math.max(state.nextSeq, nextSequenceFrom(SEED_REQUESTS));
  state.audit = [];
  state.pendingImport = null;
  state.selectedId = null;
  state.pendingAction = null;
  if (state.editingId) stopEditing();
  state.page = 1;
  recordAudit("RESET", null, details);
  persist();
  render();
  return details;
}

function resetFromForm() {
  const input = $("#reset-confirm");
  $("#err-reset").textContent = "";
  input.removeAttribute("aria-invalid");
  try {
    const details = resetData(input.value);
    input.value = "";
    $("#data-title").focus();
    announce(details, "success");
  } catch (error) {
    if (error.name !== "ValidationError") throw error;
    $("#err-reset").textContent = error.message;
    input.setAttribute("aria-invalid", "true");
    input.focus();
    announce(error.message, "error");
  }
}

function downloadBackup() {
  requirePermission(state.session, "data:manage");
  const raw = readBackup();
  if (raw === null) throw new AppError("NotFoundError", "There is no backup of unreadable data.");
  downloadJson(raw, "labborrow-unreadable-backup.json");
  announce("Unreadable data downloaded.", "success");
}

function discardBackup() {
  requirePermission(state.session, "data:manage");
  if (!confirm("Discard the backup of unreadable data? It cannot be recovered afterwards.")) {
    announce("Backup kept.");
    return;
  }
  clearBackup();
  state.storage.hasBackup = false;
  renderStorageStatus();
  $("#storage-title").focus();
  announce("Backup discarded.", "success");
}

$("#import-file").addEventListener("change", async event => {
  const input = event.target;
  const file = input.files[0];
  hideNotice();
  clearImportError();
  if (!file) return;
  try {
    await previewImportFile(file);
    $("#import-preview-title").focus();
    announce(`${file.name} checked. Choose replace or merge, then confirm.`);
  } catch (error) {
    if (error.name !== "ValidationError") { reportError(error); return; }
    const problems = error.details || [error.message];
    $("#err-import").innerHTML = `<p>${escapeHtml(file.name)} was not imported:</p>
      <ul>${problems.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`;
    input.setAttribute("aria-invalid", "true");
    input.focus();
    announce(error.message, "error");
  } finally {
    input.value = ""; // picking the same file again fires change again
  }
});

$("#import-preview").addEventListener("change", event => {
  if (event.target.name === "import-mode" && state.pendingImport) state.pendingImport.mode = event.target.value;
});

/* restore on load. bad saved data never reaches state: it is backed up,
   the app starts from the sample data and says so */
function applyLoadedData(data) {
  state.records = data.records;
  state.nextSeq = data.nextSeq;
  state.audit = data.audit;
  state.session = sessionFor(data.session.userId);
  state.preferences.theme = data.preferences.theme;
  state.pageSize = data.preferences.pageSize;
  state.sort = { ...data.preferences.sort };
}

function restoreSavedState() {
  const result = readStoredState();
  state.storage.hasBackup = readBackup() !== null;

  if (result.status === "unavailable") {
    state.storage.status = "unavailable";
    showNotice("Browser storage is unavailable (private mode or blocked site data), so changes will be lost when the page closes.", "Not saving.");
    return;
  }
  if (result.status === "empty") {
    persist(); // first visit: save the sample data so every later load goes through the same checks
    return;
  }
  if (result.status === "ok") {
    applyLoadedData(result.data);
    state.storage.status = "saved";
    state.storage.lastSavedAt = result.data.savedAt;
    if (result.warnings.length) {
      persist(); // save the corrected copy so the same warning does not come back on every load
      showNotice(result.warnings.join(" "), "Saved data restored with corrections.");
    }
    return;
  }

  // invalid: keep the raw text, start clean, leave a trail
  state.storage.hasBackup = writeBackup(result.raw);
  const system = { displayName: "System", userId: null };
  recordAudit("RECOVERY", null,
    `Saved data could not be read (${result.errors[0]}). Started from the sample data${state.storage.hasBackup ? "; the unreadable data was kept as a backup" : ""}.`,
    system);
  persist();
  showNotice(`${result.errors.join(" ")} The app started from the sample data.` +
    (state.storage.hasBackup ? " The unreadable data was kept and can be downloaded from Settings & Data." : ""),
    "Saved data could not be loaded.");
}

/* last line of defense: an unexpected error is shown, never silent */
window.addEventListener("error", event => {
  showNotice(`${event.message}. Reload the page if something looks wrong; saved data is kept.`, "Something went wrong.");
});
window.addEventListener("unhandledrejection", event => {
  showNotice(`${event.reason?.message || event.reason}. Reload the page if something looks wrong; saved data is kept.`, "Something went wrong.");
});

/* start */
function init() {
  restoreSavedState();
  renderOptionLists();
  renderPermissionMatrix();
  renderMetricFormulas();
  syncToolbar();
  $("#pref-theme").value = state.preferences.theme;
  applyTheme(state.preferences.theme);
  renderSession();
  renderFormMode();
  updateConditionalFields();
  syncFormToSession();
  render();
  const initial = location.hash.slice(1);
  showView(VIEWS.includes(initial) ? initial : "dashboard", { moveFocus: false });
}

init();
