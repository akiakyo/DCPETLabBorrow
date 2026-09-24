/* events and actions: update state → render() → announce */

const VIEWS = ["dashboard", "requests", "new-request", "equipment", "activity", "settings"];
let pendingFocus = null; // focus target after view switch
let toastTimer = null;

/* feedback */
function announce(message, tone = "info") {
  $("#live").textContent = "";
  // small delay so repeated msgs still get announced
  setTimeout(() => { $("#live").textContent = message; }, 50);

  const toast = $("#toast");
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

/* navigation (hash) */
function showView(name, { moveFocus = true } = {}) {
  if (!VIEWS.includes(name)) return;
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
  if (VIEWS.includes(name)) showView(name);
});

$("#nav-toggle").addEventListener("click", () => {
  const nav = $("#primary-nav");
  const open = nav.classList.toggle("is-open");
  $("#nav-toggle").setAttribute("aria-expanded", String(open));
});

/* record actions */
function handleAction(action, id) {
  switch (action) {
    case "view": return viewRecord(id);
    case "delete": return deleteRecord(id);
    case "close-details": return closeDetails();
    case "clear-filters": return clearFilters();
    case "page-prev": return goToPage(state.page - 1);
    case "page-next": return goToPage(state.page + 1);
    default: throw new Error(`Unknown action: ${action}`);
  }
}

function viewRecord(id) {
  if (!findById(state.records, id)) throw new Error(`Request ${id} no longer exists.`);
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
  const record = findById(state.records, id);
  if (!record) throw new Error(`Request ${id} no longer exists.`);
  if (!confirm(`Delete request ${id} (${record.borrowerName})? This cannot be undone.`)) {
    announce("Delete cancelled. No changes were made.");
    return;
  }
  state.records = deleteById(state.records, id);
  if (state.selectedId === id) state.selectedId = null;
  render();
  $("#requests-title").focus();
  announce(`Request ${id} was deleted.`, "success");
}

function closeDetails() {
  const id = state.selectedId;
  state.selectedId = null;
  render();
  const rowButton = document.querySelector(`#records-body [data-action="view"][data-id="${id}"]`);
  (rowButton || $("#requests-title")).focus();
}

function clearFilters() {
  state.query = "";
  state.filters = { status: "ALL", category: "ALL", borrowerType: "ALL" };
  state.page = 1;
  $("#toolbar").reset();
  syncToolbar();
  render();
  $("#search").focus();
  announce("Search and filters cleared.");
}

function goToPage(page) {
  const totalPages = getTotalPages(getVisibleRecords(state.records, state).length, state.pageSize);
  if (page < 1 || page > totalPages) return;
  state.page = page;
  render();
  $("#result-count").scrollIntoView({ block: "nearest" });
}

// one listener for every [data-action], even new rows
document.addEventListener("click", event => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  try {
    handleAction(control.dataset.action, control.dataset.id);
  } catch (error) {
    console.error(error);
    announce(error.message || "The action could not be completed.", "error");
  }
});

/* toolbar */
function syncToolbar() {
  $("#search").value = state.query;
  $("#filter-status").value = state.filters.status;
  $("#filter-category").value = state.filters.category;
  $("#filter-type").value = state.filters.borrowerType;
  $("#sort-key").value = state.sort.key;
  $("#sort-dir").value = state.sort.direction;
}

$("#toolbar").addEventListener("submit", event => event.preventDefault());

$("#search").addEventListener("input", event => {
  state.query = event.target.value;
  state.page = 1;
  render();
});

$("#toolbar").addEventListener("change", event => {
  const { id, value } = event.target;
  if (id === "filter-status") state.filters.status = value;
  else if (id === "filter-category") state.filters.category = value;
  else if (id === "filter-type") state.filters.borrowerType = value;
  else if (id === "sort-key") state.sort.key = value;
  else if (id === "sort-dir") state.sort.direction = value;
  else return;
  state.page = 1;
  render();
});

/* form, basic for now (full engine in unit 4) */
const form = $("#request-form");

function fieldLabel(control) {
  const label = control.type === "radio"
    ? control.closest("fieldset").querySelector("legend")
    : document.querySelector(`label[for="${control.id}"]`);
  return label ? label.textContent.replace("*", "").trim() : control.name;
}

function messageFor(control) {
  const v = control.validity;
  const label = fieldLabel(control);
  if (v.valueMissing) return `${label} is required.`;
  if (v.typeMismatch) return `${label}: enter a valid email address.`;
  if (v.patternMismatch) return `${label}: use the format 2023-00142 (student) or F-0031 (faculty).`;
  if (v.tooShort) return `${label}: use at least ${control.minLength} characters.`;
  if (v.rangeUnderflow || v.rangeOverflow) return `${label}: enter a number from ${control.min} to ${control.max}.`;
  if (v.stepMismatch) return `${label}: enter a whole number.`;
  return `${label}: ${control.validationMessage}`;
}

function updateConditionalFields() {
  const needsDetails = form.purpose.value === "Other";
  form.purposeDetails.required = needsDetails;
  $("#details-required-mark").hidden = !needsDetails;
}

function clearFormErrors() {
  form.querySelectorAll("[data-error-for]").forEach(el => { el.textContent = ""; });
  form.querySelectorAll("[aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
  $("#error-summary").hidden = true;
  $("#error-list").innerHTML = "";
}

function showFormErrors(errors) {
  errors.forEach(({ name, control, message }) => {
    const box = form.querySelector(`[data-error-for="${name}"]`);
    if (box) box.textContent = message;
    control.setAttribute("aria-invalid", "true");
  });
  $("#error-list").innerHTML = errors
    .map(({ control, message }) => `<li><a href="#${control.id || control.name}" data-focus-field="${control.id}">${escapeHtml(message)}</a></li>`)
    .join("");
  $("#error-summary").hidden = false;
  $("#error-summary").focus();
}

// focus the field, don't change the hash
$("#error-summary").addEventListener("click", event => {
  const link = event.target.closest("[data-focus-field]");
  if (!link) return;
  event.preventDefault();
  const control = document.getElementById(link.dataset.focusField) || form.borrowerType[0];
  control.focus();
});

form.purpose.addEventListener("change", updateConditionalFields);

form.addEventListener("reset", () => {
  clearFormErrors();
  $("#form-success").hidden = true;
  setTimeout(updateConditionalFields, 0); // wait for browser reset
});

function localDateTime(date = new Date()) {
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(n => String(n).padStart(2, "0")).join(":");
  return `${toISODate(date)}T${time}`;
}

function addRecord(record) {
  state.records = [...state.records, record];
  state.nextSeq += 1;
  render();
}

form.addEventListener("submit", event => {
  event.preventDefault();
  clearFormErrors();
  $("#form-success").hidden = true;
  updateConditionalFields();

  // whitespace only = empty
  form.querySelectorAll('input[type="text"], input[type="email"], textarea').forEach(el => { el.value = el.value.trim(); });

  const errors = [];
  const seen = new Set();
  Array.from(form.elements).forEach(control => {
    if (!control.willValidate || control.checkValidity() || seen.has(control.name)) return;
    seen.add(control.name);
    errors.push({ name: control.name, control, message: messageFor(control) });
  });

  if (errors.length) {
    showFormErrors(errors);
    announce(`The request was not saved. ${errors.length} field${errors.length === 1 ? " needs" : "s need"} attention.`, "error");
    return;
  }

  const data = new FormData(form);
  const record = {
    id: formatRequestId(state.nextSeq),
    borrowerId: data.get("borrowerId"),
    borrowerName: data.get("borrowerName"),
    borrowerType: data.get("borrowerType"),
    borrowerEmail: data.get("borrowerEmail").toLowerCase(),
    equipmentId: data.get("equipmentId"),
    quantity: Number(data.get("quantity")),
    purpose: data.get("purpose"),
    purposeDetails: data.get("purpose") === "Other" ? data.get("purposeDetails") : "",
    borrowDate: data.get("borrowDate"),
    dueDate: data.get("dueDate"),
    returnedDate: null,
    status: "PENDING",
    remarks: "",
    createdAt: localDateTime(),
    createdBy: data.get("borrowerId") // session user in unit 7
  };

  addRecord(record);
  form.reset();
  const success = $("#form-success");
  success.innerHTML = `Request <strong>${escapeHtml(record.id)}</strong> was submitted and is pending approval.
    <button type="button" class="btn btn-sm" data-action="view" data-id="${escapeHtml(record.id)}">View request</button>`;
  success.hidden = false;
  announce(`Request ${record.id} submitted.`, "success");
});

/* preferences */
function applyTheme(theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
}

$("#pref-theme").addEventListener("change", event => {
  state.preferences.theme = event.target.value;
  applyTheme(state.preferences.theme);
  announce(`Theme set to ${event.target.selectedOptions[0].textContent}.`);
});

/* start */
function init() {
  renderOptionLists();
  syncToolbar();
  $("#pref-theme").value = state.preferences.theme;
  applyTheme(state.preferences.theme);
  render();
  const initial = location.hash.slice(1);
  showView(VIEWS.includes(initial) ? initial : "dashboard", { moveFocus: false });
}

init();
