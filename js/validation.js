/* validation rules for the request form (unit 4). pure: data in, errors out.
   the html attributes are the first layer; these rules repeat them so a call
   from the console is rejected too, then add the system-specific rules */

const LOAN_LIMIT_DAYS = { Student: 14, Faculty: 30 };
const SCHOOL_EMAIL_DOMAIN = "@school.edu.ph";
const QUANTITY_MIN = 1;
const QUANTITY_MAX = 5;
const ID_PATTERNS = { Student: /^\d{4}-\d{5}$/, Faculty: /^F-\d{4}$/ };
const PURPOSES = ["Class activity", "Project", "Thesis", "Other"];
const DETAILS_MIN = 10;

// form order, also the order of the error summary
const FORM_FIELDS = [
  "borrowerId", "borrowerName", "borrowerEmail", "borrowerType",
  "equipmentId", "quantity", "borrowDate", "dueDate", "purpose", "purposeDetails"
];

// trim, collapse spaces, fix case. whitespace-only becomes empty
function normalizeRequestInput(raw) {
  const text = value => String(value ?? "").trim().replace(/\s+/g, " ");
  return {
    borrowerId: text(raw.borrowerId).toUpperCase(),
    borrowerName: text(raw.borrowerName),
    borrowerEmail: text(raw.borrowerEmail).toLowerCase(),
    borrowerType: text(raw.borrowerType),
    equipmentId: text(raw.equipmentId).toUpperCase(),
    quantity: text(raw.quantity) === "" ? NaN : Number(raw.quantity),
    borrowDate: text(raw.borrowDate),
    dueDate: text(raw.dueDate),
    purpose: text(raw.purpose),
    purposeDetails: text(raw.purposeDetails)
  };
}

/* ctx: { records, today, editingId, session, catalog }
   returns { field: message }, one message per field, {} when valid */
function validateRequest(input, ctx) {
  const data = normalizeRequestInput(input);
  const { records, today, editingId = null, session = null, catalog = EQUIPMENT } = ctx;
  const errors = {};
  const fail = (field, message) => { if (!errors[field]) errors[field] = message; };

  // borrower id
  if (!data.borrowerId) fail("borrowerId", "Student / Faculty ID is required.");
  else if (!ID_PATTERNS.Student.test(data.borrowerId) && !ID_PATTERNS.Faculty.test(data.borrowerId)) {
    fail("borrowerId", "Student / Faculty ID: use the format 2023-00142 (student) or F-0031 (faculty).");
  }

  // borrower type
  if (!Object.hasOwn(ID_PATTERNS, data.borrowerType)) fail("borrowerType", "Borrower type is required.");

  // X3 id format must agree with borrower type
  if (!errors.borrowerId && !errors.borrowerType && !ID_PATTERNS[data.borrowerType].test(data.borrowerId)) {
    fail("borrowerId", data.borrowerType === "Student"
      ? "This is a faculty ID, but the borrower type is Student."
      : "This is a student ID, but the borrower type is Faculty.");
  }

  // S1 borrowers file under their own id only
  if (!errors.borrowerId && session && !can(session, "request:create-for-others") && data.borrowerId !== session.userId) {
    fail("borrowerId", `You can only file a request under your own ID (${session.userId}).`);
  }

  // J1 full name
  if (!data.borrowerName) fail("borrowerName", "Full name is required.");
  else if (data.borrowerName.length < 3 || data.borrowerName.length > 60) fail("borrowerName", "Full name: use 3 to 60 characters.");
  else if (!/^\p{L}[\p{L} .'\-]*$/u.test(data.borrowerName)) fail("borrowerName", "Full name: use letters, spaces, periods, apostrophes and hyphens only.");
  else if (data.borrowerName.split(" ").filter(part => /\p{L}{2,}/u.test(part)).length < 2) fail("borrowerName", "Full name: enter both first and last name.");

  // J2 school email
  if (!data.borrowerEmail) fail("borrowerEmail", "School email is required.");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.borrowerEmail) || data.borrowerEmail.length > 80) fail("borrowerEmail", "School email: enter a valid email address.");
  else if (!data.borrowerEmail.endsWith(SCHOOL_EMAIL_DOMAIN)) fail("borrowerEmail", `School email: use your ${SCHOOL_EMAIL_DOMAIN} address.`);

  // J5 equipment must be in the catalog
  const equipment = findEquipment(data.equipmentId, catalog);
  if (!data.equipmentId) fail("equipmentId", "Equipment is required.");
  else if (!equipment) fail("equipmentId", `Equipment ${data.equipmentId} is not in the inventory.`);

  // quantity
  if (Number.isNaN(data.quantity)) fail("quantity", "Quantity is required.");
  else if (!Number.isInteger(data.quantity)) fail("quantity", "Quantity: enter a whole number.");
  else if (data.quantity < QUANTITY_MIN || data.quantity > QUANTITY_MAX) fail("quantity", `Quantity: enter a number from ${QUANTITY_MIN} to ${QUANTITY_MAX}.`);

  // X4 quantity against units available right now
  if (equipment && !errors.quantity) {
    const item = deriveInventory(records, catalog).find(i => i.id === equipment.id);
    if (data.quantity > item.available) {
      fail("quantity", item.available === 0
        ? `${equipment.name} has no units available right now.`
        : `Only ${item.available} unit${item.available === 1 ? "" : "s"} of ${equipment.name} ${item.available === 1 ? "is" : "are"} available.`);
    }
  }

  // J3, J4 borrow date
  if (!data.borrowDate) fail("borrowDate", "Borrow date is required.");
  else if (!isValidISODate(data.borrowDate)) fail("borrowDate", "Borrow date: enter a valid date.");
  else if (data.borrowDate < today) fail("borrowDate", "Borrow date cannot be in the past.");
  else if (weekdayOf(data.borrowDate) === 0) fail("borrowDate", "The laboratory is closed on Sundays. Choose another borrow date.");

  // X1, X2 due date against borrow date and borrower type
  if (!data.dueDate) fail("dueDate", "Return due date is required.");
  else if (!isValidISODate(data.dueDate)) fail("dueDate", "Return due date: enter a valid date.");
  else if (isValidISODate(data.borrowDate)) {
    const limit = errors.borrowerType ? null : LOAN_LIMIT_DAYS[data.borrowerType];
    if (data.dueDate < data.borrowDate) fail("dueDate", "Return due date cannot be earlier than the borrow date.");
    else if (limit && daysBetween(data.borrowDate, data.dueDate) > limit) {
      fail("dueDate", `${data.borrowerType} loans are limited to ${limit} days. Choose a due date on or before ${formatDate(addDays(data.borrowDate, limit))}.`);
    }
  }

  // purpose, C1 details required only for "Other"
  if (!data.purpose) fail("purpose", "Purpose is required.");
  else if (!PURPOSES.includes(data.purpose)) fail("purpose", "Purpose: choose one of the listed options.");
  if (data.purpose === "Other") {
    if (!data.purposeDetails) fail("purposeDetails", "Purpose details are required when the purpose is “Other”.");
    else if (data.purposeDetails.length < DETAILS_MIN) fail("purposeDetails", `Purpose details: use at least ${DETAILS_MIN} characters.`);
  }
  if (data.purposeDetails.length > 200) fail("purposeDetails", "Purpose details: use 200 characters or fewer.");

  // D1 one open request per borrower per equipment
  if (!errors.borrowerId && !errors.equipmentId) {
    const duplicate = records.find(r =>
      r.id !== editingId &&
      OPEN_STATUSES.includes(r.status) &&
      normalize(r.borrowerId) === normalize(data.borrowerId) &&
      r.equipmentId === data.equipmentId);
    if (duplicate) {
      fail("equipmentId", `This borrower already has an open request for ${equipment.name} (${duplicate.id}, ${STATUS_LABELS[duplicate.status]}).`);
    }
  }

  return errors;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
