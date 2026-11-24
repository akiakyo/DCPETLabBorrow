/* small helpers for the php pages, everything works without js too */

// mobile menu
const navToggle = document.getElementById("nav-toggle");
const nav = document.getElementById("sidenav");
if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.focus();
    }
  });
}

// in-app confirm for forms with data-confirm
const dialog = document.getElementById("confirm-dialog");
document.addEventListener("submit", event => {
  const form = event.target;
  if (!form.matches("form[data-confirm]") || form.dataset.confirmed === "1" || !dialog || !dialog.showModal) return;
  event.preventDefault();
  dialog.querySelector("#confirm-title").textContent = form.dataset.confirmTitle || "Are you sure?";
  dialog.querySelector("#confirm-message").textContent = form.dataset.confirm;
  dialog.querySelector("#confirm-ok").textContent = form.dataset.confirmLabel || "Delete";
  dialog.returnValue = "";
  dialog.showModal();
  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "ok") {
      form.dataset.confirmed = "1";
      form.requestSubmit ? form.requestSubmit() : form.submit();
    }
  }, { once: true });
});

// filters apply as soon as they change
document.querySelectorAll("select[data-autosubmit]").forEach(select => {
  select.addEventListener("change", () => select.form.requestSubmit ? select.form.requestSubmit() : select.form.submit());
});

// demo accounts fill the sign-in field
document.querySelectorAll("[data-fill]").forEach(button => {
  button.addEventListener("click", () => {
    const login = document.getElementById("login");
    const password = document.getElementById("password");
    if (!login) return;
    login.value = button.dataset.fill;
    if (password) { password.value = ""; password.focus(); }
  });
});

// purpose details only for "other"
const purpose = document.getElementById("purpose");
const details = document.getElementById("purpose-details-field");
if (purpose && details) {
  purpose.addEventListener("change", () => {
    details.hidden = purpose.value !== "Other";
    if (!details.hidden) details.querySelector("input").focus();
  });
}

// focus the first invalid field so errors are easy to fix
const firstInvalid = document.querySelector('[aria-invalid="true"]');
if (firstInvalid) firstInvalid.focus();
