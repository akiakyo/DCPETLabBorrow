/* mock data. requests only store equipmentId,
   name/category/lab come from the catalog */

// stored statuses only, overdue is derived
const STATUSES = ["PENDING", "APPROVED", "BORROWED", "RETURNED", "REJECTED", "CANCELLED"];

const STATUS_LABELS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  BORROWED: "Borrowed",
  OVERDUE: "Overdue",
  RETURNED: "Returned",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled"
};

// these statuses take units out of available
const COMMITTED_STATUSES = ["APPROVED", "BORROWED"];

// open = still in progress, closed = final
const OPEN_STATUSES = ["PENDING", "APPROVED", "BORROWED"];
const CLOSED_STATUSES = ["RETURNED", "REJECTED", "CANCELLED"];

/* mock users for the role switch (unit 7). no passwords, demo only.
   the lab head is also a faculty borrower, so "not your own request" rules can be shown */
const ROLE_LABELS = { BORROWER: "Borrower", STAFF: "Lab staff", ADMIN: "Lab head (admin)" };

const USERS = [
  { id: "2024-00077", name: "Paolo Reyes",        role: "BORROWER", borrowerType: "Student", email: "preyes@school.edu.ph" },
  { id: "F-0031",     name: "Engr. Liza Ramos",   role: "BORROWER", borrowerType: "Faculty", email: "lramos@school.edu.ph" },
  { id: "S-0004",     name: "Jun Dela Cruz",      role: "STAFF",    borrowerType: null,      email: "jdelacruz@school.edu.ph" },
  { id: "F-0017",     name: "Engr. Ramon Garcia", role: "ADMIN",    borrowerType: "Faculty", email: "rgarcia@school.edu.ph" }
];

const DEFAULT_USER_ID = "S-0004";

const EQUIPMENT = [
  { id: "EQ-001", name: "Digital Oscilloscope",      category: "Electronics",      laboratory: "Electronics Lab (EN-201)",      totalUnits: 4,  condition: "Good" },
  { id: "EQ-002", name: "Function Generator",        category: "Electronics",      laboratory: "Electronics Lab (EN-201)",      totalUnits: 4,  condition: "Good" },
  { id: "EQ-003", name: "Digital Multimeter",        category: "Measurement",      laboratory: "Electronics Lab (EN-201)",      totalUnits: 12, condition: "Good" },
  { id: "EQ-004", name: "Arduino Uno Starter Kit",   category: "Microcontrollers", laboratory: "Embedded Systems Lab (ES-204)", totalUnits: 10, condition: "Good" },
  { id: "EQ-005", name: "Raspberry Pi 4 Kit",        category: "Microcontrollers", laboratory: "Embedded Systems Lab (ES-204)", totalUnits: 6,  condition: "Good" },
  { id: "EQ-006", name: "Soldering Station",         category: "Tools",            laboratory: "Embedded Systems Lab (ES-204)", totalUnits: 5,  condition: "Needs calibration" },
  { id: "EQ-007", name: "Network Cable Tester",      category: "Networking",       laboratory: "Networking Lab (NL-302)",       totalUnits: 3,  condition: "Good" },
  { id: "EQ-008", name: "RJ45 Crimping Tool",        category: "Networking",       laboratory: "Networking Lab (NL-302)",       totalUnits: 6,  condition: "Good" },
  { id: "EQ-009", name: "24-Port Managed Switch",    category: "Networking",       laboratory: "Networking Lab (NL-302)",       totalUnits: 2,  condition: "Good" },
  { id: "EQ-010", name: "Laptop (Core i5, 16 GB)",   category: "Computing",        laboratory: "Computer Lab (CL-105)",         totalUnits: 8,  condition: "Good" },
  { id: "EQ-011", name: "DC Power Supply",           category: "Electronics",      laboratory: "Electronics Lab (EN-201)",      totalUnits: 5,  condition: "Good" },
  { id: "EQ-012", name: "Logic Analyzer",            category: "Measurement",      laboratory: "Electronics Lab (EN-201)",      totalUnits: 2,  condition: "Good" }
];

/* stored: id, borrower info, equipmentId, quantity, purpose, dates, status, remarks, createdAt, createdBy, history
   derived (model.js): equipmentName, category, laboratory, loanDays, isOverdue, daysOverdue, displayStatus, returnedLate */
const SEED_REQUESTS = [
  { id: "BR-2026-0001", borrowerId: "2023-00142", borrowerName: "Andrea Santos",     borrowerType: "Student", borrowerEmail: "asantos@school.edu.ph",   equipmentId: "EQ-004", quantity: 2, purpose: "Class activity", purposeDetails: "",                               borrowDate: "2026-09-01", dueDate: "2026-09-05", returnedDate: "2026-09-05", status: "RETURNED", remarks: "",                          createdAt: "2026-08-30T09:15:00", createdBy: "2023-00142" },
  { id: "BR-2026-0002", borrowerId: "2022-00318", borrowerName: "Mark Villanueva",   borrowerType: "Student", borrowerEmail: "mvillanueva@school.edu.ph", equipmentId: "EQ-001", quantity: 1, purpose: "Thesis",         purposeDetails: "",                               borrowDate: "2026-09-03", dueDate: "2026-09-10", returnedDate: "2026-09-11", status: "RETURNED", remarks: "Returned one day late.",    createdAt: "2026-09-01T14:02:00", createdBy: "2022-00318" },
  { id: "BR-2026-0003", borrowerId: "F-0031",     borrowerName: "Engr. Liza Ramos",  borrowerType: "Faculty", borrowerEmail: "lramos@school.edu.ph",      equipmentId: "EQ-010", quantity: 3, purpose: "Class activity", purposeDetails: "",                               borrowDate: "2026-09-08", dueDate: "2026-09-12", returnedDate: "2026-09-12", status: "RETURNED", remarks: "",                          createdAt: "2026-09-05T08:40:00", createdBy: "F-0031" },
  { id: "BR-2026-0004", borrowerId: "2024-00077", borrowerName: "Paolo Reyes",       borrowerType: "Student", borrowerEmail: "preyes@school.edu.ph",      equipmentId: "EQ-007", quantity: 1, purpose: "Project",        purposeDetails: "",                               borrowDate: "2026-09-10", dueDate: "2026-09-17", returnedDate: null,         status: "BORROWED", remarks: "",                          createdAt: "2026-09-09T10:20:00", createdBy: "2024-00077" },
  { id: "BR-2026-0005", borrowerId: "2022-00451", borrowerName: "Kristine Lim",      borrowerType: "Student", borrowerEmail: "klim@school.edu.ph",        equipmentId: "EQ-005", quantity: 1, purpose: "Thesis",         purposeDetails: "",                               borrowDate: "2026-09-15", dueDate: "2026-09-29", returnedDate: null,         status: "BORROWED", remarks: "",                          createdAt: "2026-09-12T16:45:00", createdBy: "2022-00451" },
  { id: "BR-2026-0006", borrowerId: "2023-00219", borrowerName: "Joshua Tan",        borrowerType: "Student", borrowerEmail: "jtan@school.edu.ph",        equipmentId: "EQ-006", quantity: 1, purpose: "Project",        purposeDetails: "",                               borrowDate: "2026-09-16", dueDate: "2026-09-19", returnedDate: null,         status: "BORROWED", remarks: "",                          createdAt: "2026-09-15T11:05:00", createdBy: "2023-00219" },
  { id: "BR-2026-0007", borrowerId: "2024-00103", borrowerName: "Maria Cruz",        borrowerType: "Student", borrowerEmail: "mcruz@school.edu.ph",       equipmentId: "EQ-003", quantity: 4, purpose: "Class activity", purposeDetails: "",                               borrowDate: "2026-09-22", dueDate: "2026-09-26", returnedDate: null,         status: "BORROWED", remarks: "",                          createdAt: "2026-09-20T09:30:00", createdBy: "2024-00103" },
  { id: "BR-2026-0008", borrowerId: "2022-00502", borrowerName: "Carlo Mendoza",     borrowerType: "Student", borrowerEmail: "cmendoza@school.edu.ph",    equipmentId: "EQ-012", quantity: 1, purpose: "Thesis",         purposeDetails: "",                               borrowDate: "2026-09-25", dueDate: "2026-10-02", returnedDate: null,         status: "APPROVED", remarks: "",                          createdAt: "2026-09-21T13:10:00", createdBy: "2022-00502" },
  { id: "BR-2026-0009", borrowerId: "F-0017",     borrowerName: "Engr. Ramon Garcia", borrowerType: "Faculty", borrowerEmail: "rgarcia@school.edu.ph",    equipmentId: "EQ-002", quantity: 2, purpose: "Class activity", purposeDetails: "",                               borrowDate: "2026-09-26", dueDate: "2026-09-26", returnedDate: null,         status: "APPROVED", remarks: "",                          createdAt: "2026-09-22T07:55:00", createdBy: "F-0017" },
  { id: "BR-2026-0010", borrowerId: "2024-00188", borrowerName: "Bea Navarro",       borrowerType: "Student", borrowerEmail: "bnavarro@school.edu.ph",    equipmentId: "EQ-008", quantity: 2, purpose: "Project",        purposeDetails: "",                               borrowDate: "2026-09-28", dueDate: "2026-10-01", returnedDate: null,         status: "PENDING",  remarks: "",                          createdAt: "2026-09-23T15:25:00", createdBy: "2024-00188" },
  { id: "BR-2026-0011", borrowerId: "2023-00390", borrowerName: "Enzo Aquino",       borrowerType: "Student", borrowerEmail: "eaquino@school.edu.ph",     equipmentId: "EQ-009", quantity: 1, purpose: "Other",          purposeDetails: "Network certification review", borrowDate: "2026-09-29", dueDate: "2026-10-03", returnedDate: null,         status: "PENDING",  remarks: "",                          createdAt: "2026-09-23T17:40:00", createdBy: "2023-00390" },
  { id: "BR-2026-0012", borrowerId: "2024-00055", borrowerName: "Trisha Gomez",      borrowerType: "Student", borrowerEmail: "tgomez@school.edu.ph",      equipmentId: "EQ-011", quantity: 1, purpose: "Project",        purposeDetails: "",                               borrowDate: "2026-09-30", dueDate: "2026-10-02", returnedDate: null,         status: "PENDING",  remarks: "",                          createdAt: "2026-09-24T08:05:00", createdBy: "2024-00055" },
  { id: "BR-2026-0013", borrowerId: "2023-00264", borrowerName: "Nathan Flores",     borrowerType: "Student", borrowerEmail: "nflores@school.edu.ph",     equipmentId: "EQ-001", quantity: 2, purpose: "Project",        purposeDetails: "",                               borrowDate: "2026-09-18", dueDate: "2026-09-20", returnedDate: null,         status: "REJECTED", remarks: "Only one unit allowed per student group.", createdAt: "2026-09-16T10:00:00", createdBy: "2023-00264" },
  { id: "BR-2026-0014", borrowerId: "2024-00126", borrowerName: "Ella Bautista",     borrowerType: "Student", borrowerEmail: "ebautista@school.edu.ph",   equipmentId: "EQ-004", quantity: 3, purpose: "Class activity", purposeDetails: "",                               borrowDate: "2026-09-19", dueDate: "2026-09-23", returnedDate: null,         status: "BORROWED", remarks: "",                          createdAt: "2026-09-18T12:35:00", createdBy: "2024-00126" },
  { id: "BR-2026-0015", borrowerId: "F-0031",     borrowerName: "Engr. Liza Ramos",  borrowerType: "Faculty", borrowerEmail: "lramos@school.edu.ph",      equipmentId: "EQ-005", quantity: 5, purpose: "Class activity", purposeDetails: "",                               borrowDate: "2026-09-24", dueDate: "2026-09-24", returnedDate: null,         status: "BORROWED", remarks: "Laboratory exercise 4.",    createdAt: "2026-09-22T09:00:00", createdBy: "F-0031" },
  { id: "BR-2026-0016", borrowerId: "2024-00077", borrowerName: "Paolo Reyes",       borrowerType: "Student", borrowerEmail: "preyes@school.edu.ph",      equipmentId: "EQ-003", quantity: 1, purpose: "Thesis",         purposeDetails: "",                               borrowDate: "2026-10-01", dueDate: "2026-10-05", returnedDate: null,         status: "PENDING",  remarks: "",                          createdAt: "2026-09-24T10:12:00", createdBy: "2024-00077" },
  { id: "BR-2026-0017", borrowerId: "2022-00451", borrowerName: "Kristine Lim",      borrowerType: "Student", borrowerEmail: "klim@school.edu.ph",        equipmentId: "EQ-010", quantity: 1, purpose: "Thesis",         purposeDetails: "",                               borrowDate: "2026-09-05", dueDate: "2026-09-09", returnedDate: "2026-09-08", status: "RETURNED", remarks: "",                          createdAt: "2026-09-03T15:50:00", createdBy: "2022-00451" }
];

// seed records get the status history that would have led to their status (unit 6)
function seedHistory(r) {
  const staff = "Jun Dela Cruz";
  const reviewedAt = `${r.createdAt.slice(0, 10)}T17:30:00`;
  const steps = [{ at: r.createdAt, from: null, to: "PENDING", action: "Submitted", actor: r.borrowerName, note: "" }];
  if (r.status === "PENDING") return steps;
  if (r.status === "REJECTED") {
    steps.push({ at: reviewedAt, from: "PENDING", to: "REJECTED", action: "Rejected", actor: staff, note: r.remarks });
    return steps;
  }
  steps.push({ at: reviewedAt, from: "PENDING", to: "APPROVED", action: "Approved", actor: staff, note: "" });
  if (r.status === "APPROVED") return steps;
  steps.push({ at: `${r.borrowDate}T08:30:00`, from: "APPROVED", to: "BORROWED", action: "Released", actor: staff, note: "" });
  if (r.status === "RETURNED") {
    steps.push({ at: `${r.returnedDate}T16:00:00`, from: "BORROWED", to: "RETURNED", action: "Returned", actor: staff, note: r.remarks });
  }
  return steps;
}

// fresh copy of the sample data: first visit, reset (unit 8) and the tests
function seedRecords() {
  return SEED_REQUESTS.map(r => ({ ...r, history: seedHistory(r) }));
}
