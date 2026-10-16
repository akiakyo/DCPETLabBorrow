# DCPET LabBorrow — Guided Activity, Units 4–7

**System:** Lab Equipment Borrowing and Inventory System
**Scope of this submission:** Guided Questions 4, 5, 6 and 7 (front-end only: HTML, CSS, vanilla JavaScript)
**Builds on:** `docs/UNITS-1-3.md`

Files added or changed:

| File | Purpose |
|---|---|
| `js/validation.js` (new) | `validateRequest()` and `normalizeRequestInput()` — pure validation rules (Q4) |
| `js/workflow.js` (new) | `TRANSITIONS`, `canTransition()`, `transitionRecord()`, guards, progress, history (Q6) |
| `js/permissions.js` (new) | `ROLE_PERMISSIONS`, `allowed()`, `can()`, `requirePermission()`, navigation items (Q7) |
| `js/model.js` | `applyExplorerChange()`, `getExplorerResult()`, date-range filter, page window (Q5) |
| `js/data.js` | `CANCELLED` status, mock users, seeded status history |
| `js/state.js` | `session`, `editingId`, `pendingAction`, date-range filters |
| `js/render.js` | Permission-driven nav and buttons, workflow panel, history, activity log, numbered pages |
| `js/app.js` | Guarded handlers: `saveRequest()`, `transitionRequest()`, `deleteRecord()`, `switchUser()`, debounce |
| `js/tests.js` | 67 console tests for Units 4–7 (`runAllTests()`) |
| `index.html`, `css/styles.css` | Role switch, extra toolbar controls, notice region, activity table, permission matrix |

Open `index.html` in a browser. The tests run on load and print four tables in the console; re-run them with `runAllTests()`.

---

## GUIDED QUESTION 4 — Validation Engine

### 4.1 Form fields and control types

The form is used for both **create** and **edit** (the *Edit request* button loads a Pending request into the same form).

| Field | Control type |
|---|---|
| Student / Faculty ID | `input type="text"` |
| Full name | `input type="text"` |
| School email | `input type="email"` |
| Borrower type | `input type="radio"` |
| Equipment | `select` |
| Quantity | `input type="number"` |
| Borrow date, Return due date | `input type="date"` |
| Purpose | `select` |
| Purpose details (conditional) | `textarea` |

10 fields, 7 distinct control types.

### 4.2 Validation layers

1. **HTML constraints** (`nativeErrors()` in `app.js`) — what the attributes reject.
2. **JavaScript rules** (`validateRequest()` in `validation.js`) — a pure function: data in, `{ field: message }` out. It repeats the HTML rules, so a call from the console is rejected the same way, then adds the system rules.
3. **Guarded save** (`saveRequest()`) — checks permission, runs `validateRequest()` again, and only then changes `state.records`.

### 4.3 Declared rules (16)

| ID | Type | Rule |
|---|---|---|
| N1 | Native | `required` on ID, name, email, borrower type, equipment, quantity, both dates, purpose |
| N2 | Native | `pattern` on ID: `2023-00142` or `F-0031` |
| N3 | Native | `type="email"` |
| N4 | Native | `min="1"` `max="5"` on quantity |
| N5 | Native | `step="1"` on quantity (whole numbers) |
| J1 | JS field | Full name: 3–60 characters, letters only, first **and** last name |
| J2 | JS field | Email must end in `@school.edu.ph` |
| J3 | JS field | Borrow date cannot be in the past |
| J4 | JS field | Borrow date cannot be a Sunday (laboratory closed) |
| J5 | JS field | Equipment must exist in the inventory catalog |
| X1 | Cross-field | Due date ≥ borrow date |
| X2 | Cross-field | Loan length ≤ limit for the borrower type (Student 14 days, Faculty 30 days) |
| X3 | Cross-field | ID format must agree with borrower type |
| X4 | Cross-field | Quantity ≤ units currently available for the chosen equipment |
| C1 | Conditional | Purpose details required (≥ 10 characters) only when purpose is “Other” |
| D1 | Duplicate | One open request (Pending / Approved / Borrowed) per borrower per equipment; IDs are normalized first; the request being edited is excluded |

Also enforced but not counted: `minlength`/`maxlength`, and S1 (a borrower can only file under their own ID — see Q7).

### 4.4 Feedback behavior

- Inline message under each field (`[data-error-for]`) and `aria-invalid` on the control.
- Error summary at the top (`#error-summary`, `role="alert"`) receives focus; each item is a link that focuses its field.
- Entered values are preserved on failure. Whitespace-only text counts as empty.
- On success: green message with the request ID and a *View request* button.

### 4.5 Validation test table

Fixed test date: 2026-10-02 (Friday). Base input is a valid request; each case changes one thing. “Result” is the list of fields rejected.

| ID | Rule | Test case | Expected | Actual | P/F |
|---|---|---|---|---|---|
| V-01 | — | Fully valid request, both layers | no errors | no errors | PASS |
| V-02 | N1 | Empty full name | `borrowerName` | `borrowerName` | PASS |
| V-03 | N2 | ID `23-142` | `borrowerId` | `borrowerId` | PASS |
| V-04 | N3 | Email `not-an-email` | `borrowerEmail` | `borrowerEmail` | PASS |
| V-05 | N4 | Quantity 9 | `quantity` | `quantity` | PASS |
| V-06 | N5 | Quantity 1.5 | `quantity` | `quantity` | PASS |
| V-07 | J1 | Name `Madonna` | `borrowerName` | `borrowerName` | PASS |
| V-08 | J2 | Email at `gmail.com` | `borrowerEmail` | `borrowerEmail` | PASS |
| V-09 | J3 | Borrow date 2026-10-01 (yesterday) | `borrowDate` | `borrowDate` | PASS |
| V-10 | J4 | Borrow date 2026-10-04 (Sunday) | `borrowDate` | `borrowDate` | PASS |
| V-11 | J5 | Equipment `EQ-999` | `equipmentId` | `equipmentId` | PASS |
| V-12 | N1/J1 | Name of spaces only | `borrowerName` | `borrowerName` | PASS |
| V-13 | X1 | Due date before borrow date | `dueDate` | `dueDate` | PASS |
| V-14 | X2 | 15-day loan: student rejected, faculty accepted | `dueDate` / none | `dueDate` / none | PASS |
| V-15 | X3 | Faculty ID with type Student | `borrowerId` | `borrowerId` | PASS |
| V-16 | X4 | 3 units of EQ-009 (2 available) | `quantity` | `quantity` | PASS |
| V-17 | C1 | Purpose Other: no details rejected, 18 characters accepted | `purposeDetails` / none | `purposeDetails` / none | PASS |
| V-18 | D1 | Same borrower and equipment as open BR-2026-0010, ID typed with spaces | `equipmentId` | `equipmentId` | PASS |
| V-19 | D1 | Same data while editing BR-2026-0010 itself | no errors | no errors | PASS |
| V-20 | S1 | Borrower filing under another ID | `borrowerId` | `borrowerId` | PASS |
| V-21 | Guard | `saveRequest()` with invalid data from the console | `ValidationError`, state unchanged | `ValidationError`, state unchanged | PASS |

### 4.6 Validation completeness

Validation Completeness (%) = (Passed Required Rules / Total Required Rules) × 100
= (16 / 16) × 100 = **100%**

Every declared rule N1–N5, J1–J5, X1–X4, C1 and D1 has at least one passing test above.

---

## GUIDED QUESTION 5 — Integrated Record Explorer

### 5.1 Controls

| Requirement | Implementation |
|---|---|
| Normalized search over ≥ 4 fields | 6 fields: request ID, borrower name, borrower ID, equipment name, purpose, purpose details. `normalize()` trims, lowercases and collapses spaces. |
| ≥ 3 simultaneous filters, one range-based | Status (incl. derived Overdue), Category, Borrower type, **Borrow date from–to** (inclusive range) |
| ≥ 3 sort modes, both directions | Date requested, Borrow date, Due date, Borrower name, Equipment, Quantity × ascending/descending |
| Stable tie-break | Equal values are ordered by request ID, in both directions |
| Page sizes | 5, 10, 20 |
| Pagination | Previous / numbered pages / Next. Previous and Next are `disabled` at the ends; the current page has `aria-current="page"` |
| Debounce | 300 ms on the search input (`SEARCH_DEBOUNCE_MS`). Enter searches immediately. |
| Result count | “Showing X–Y of Z matching requests.” and “Showing 0 of 0 matching requests.” when Z = 0 |

### 5.2 Pipeline

`getExplorerResult(records, ui, today)` in `model.js`:

1. Start from the records the signed-in user may view
2. Add derived fields (equipment name, overdue status)
3. Apply normalized search
4. Apply all active filters
5. Sort, with ID as tie-break
6. Compute total and total pages = ceil(total / page size)
7. Clamp the page into 1…total pages
8. Slice the current page

**Page reset rule.** `applyExplorerChange(ui, change)` is the only place the page changes. Search, any filter, sort and page-size changes set the page to 1. A page change keeps everything else. Because it is one pure function, the reset behavior is tested without the DOM.

**Invalid date range.** If *from* is later than *to*, the range is not applied and a message under the toolbar says so. The other filters still work.

### 5.3 Interaction tests

Data: the 17 seed requests on 2026-10-02 (6 of them overdue). IDs are shortened to their last four digits.

| ID | Interaction | Expected | Actual | P/F |
|---|---|---|---|---|
| E-01 | Search “kristine”, default sort | 0005, 0017 · “Showing 1–2 of 2” | same | PASS |
| E-02 | **Page reset:** page 2 at 5 per page → filter Status = Overdue | page 1, 6 results, 2 pages, “Showing 1–5 of 6” | same | PASS |
| E-03 | **Page reset:** page 3 at 5 per page → page size 20 | page 1 of 1, “Showing 1–17 of 17” | same | PASS |
| E-04 | Search “class” + Borrower type Faculty + sort name A–Z | 0003, 0015, 0009 (equal names in ID order) | same | PASS |
| E-05 | Borrow date 15–25 Sep + Category Microcontrollers + sort due date ascending | 0014, 0015, 0005 | same | PASS |
| E-06 | **Page reset:** page 3 → sort quantity descending | page 1; 0015, 0007, 0003, 0014, 0001 | same | PASS |
| E-07 | Search “zzz” + Status Pending | 0 results, page 1 of 1, both nav buttons disabled, “Showing 0 of 0” | same | PASS |
| E-08 | Ask for page 9 when there are 4 | clamped to page 4, Next disabled, “Showing 16–17 of 17” | same | PASS |
| E-09 | Search “   PAOLO    reyes ” + sort borrow date ascending | 0004, 0016 | same | PASS |
| E-10 | Date range reversed (30 Sep → 1 Sep) + Status Pending | range flagged and ignored; 0016, 0012, 0011, 0010 | same | PASS |
| E-11 | Search + filter + page 2, then Clear | 17 results, page 1, page size still 5 | same | PASS |
| E-12 | **Page reset:** page 2 → type a search; page size 7 requested | page 1; size 7 refused (stays 10) | same | PASS |

12 of 12 pass. Four cases (E-02, E-03, E-06, E-12) show the automatic page reset.

---

## GUIDED QUESTION 6 — Workflow State Machine

### 6.1 States

Six stored states: **Pending, Approved, Borrowed, Returned, Rejected, Cancelled**.
*Overdue* is not a state. It is Borrowed past the due date, derived from the date, so it can never go stale.

### 6.2 Transition matrix

| Current state | Next state | Action | Who | Condition |
|---|---|---|---|---|
| Pending | Approved | Approve | Staff, Lab head | Enough units available; not the reviewer's own request |
| Pending | Rejected | Reject | Staff, Lab head | Reason required (≥ 5 characters); not own request |
| Pending | Cancelled | Cancel request | Owner, Staff, Lab head | — (reason optional) |
| Approved | Borrowed | Release equipment | Staff, Lab head | Today ≥ borrow date; not own request |
| Approved | Pending | Revoke approval | Staff, Lab head | Reason required; not own request (controlled rollback) |
| Approved | Cancelled | Cancel request | Owner, Staff, Lab head | — |
| Borrowed | Returned | Mark as returned | Staff, Lab head | Return date is stamped; remarks optional |
| Returned | — | — | — | Final state |
| Rejected | — | — | — | Final state |
| Cancelled | — | — | — | Final state |

7 legal transitions out of 36 possible pairs.

### 6.3 Enforcement

- `TRANSITIONS` and `canTransition(from, to)` are in `workflow.js`.
- `transitionRecord(record, to, ctx)` checks, in order: transition is legal → caller has permission → guard condition holds → required note present. It returns a **new** record. If any check fails it throws and nothing is changed.
- `transitionRequest(id, to, note)` in `app.js` is the only function that writes a status. The buttons call it, and a console call goes through the same checks.
- The details panel shows only legal next actions that the role has. An action that is legal but blocked by a condition is shown disabled with the reason written under it.
- A rejected attempt shows a persistent “Action not completed” notice and a toast.

### 6.4 Status history

Every successful transition appends `{ at, from, to, action, actor, note }` to the record's `history`. It is shown in two places:

- **Request details → Status history** (newest first)
- **Activity Log** view: all status changes across the requests the user may see

### 6.5 Workflow progress

The model is intentionally **non-linear**: Rejected and Cancelled leave the main path, and Approved can go back to Pending.

- On the main path (Pending → Approved → Borrowed → Returned) progress is shown as a stepper plus
  Workflow Progress (%) = (Reached Stage Index / Final Stage Index) × 100 → 0%, 33%, 67%, 100%.
- For Rejected and Cancelled **no percentage is shown**. A percentage would be misleading there. The stepper marks the stages that were reached, strikes out the ones that were not, and adds the outcome as the last step with the text “Closed as Rejected/Cancelled”.

### 6.6 Workflow tests

Each illegal case asserts three things: a `WorkflowError` was thrown, the record's JSON is identical before and after, and `canTransition()` returns `false`.

| ID | Test | Expected | Actual | P/F |
|---|---|---|---|---|
| W-01 | Illegal: Returned → Approved (BR-2026-0001) | Error, record unchanged | Error, record unchanged | PASS |
| W-02 | Illegal: Pending → Borrowed, skipping approval (0010) | Error, record unchanged | Error, record unchanged | PASS |
| W-03 | Illegal: Pending → Returned (0010) | Error, record unchanged | Error, record unchanged | PASS |
| W-04 | Illegal: Borrowed → Pending (0004) | Error, record unchanged | Error, record unchanged | PASS |
| W-05 | Illegal: Rejected → Pending (0013) | Error, record unchanged | Error, record unchanged | PASS |
| W-06 | Illegal: Approved → Returned without release (0008) | Error, record unchanged | Error, record unchanged | PASS |
| W-07 | Illegal: unknown status `ARCHIVED` | Error, record unchanged | Error, record unchanged | PASS |
| W-08 | Illegal: Cancelled → Approved | Error, still Cancelled | Error, still Cancelled | PASS |
| W-09 | Legal: Pending → Approved | New record, history +1, original untouched | same | PASS |
| W-10 | Legal: Borrowed → Returned | Return date stamped | same | PASS |
| W-11 | Guard: release before the borrow date | `WorkflowError` | `WorkflowError` | PASS |
| W-12 | Guard: approve with no units available | `WorkflowError` | `WorkflowError` | PASS |
| W-13 | Guard: reject without a reason | `ValidationError` | `ValidationError` | PASS |
| W-14 | Matrix allows exactly 7 of 36 pairs | 7 | 7 | PASS |
| W-15 | Progress values per state | 0, 33, 67, 100, none, none | same | PASS |
| W-16 | Live: `transitionRequest("BR-2026-0001", "APPROVED")` | Error, `state.records` unchanged | same | PASS |

16 of 16 pass (8 illegal-transition cases).

---

## GUIDED QUESTION 7 — Role-Aware Front-End

### 7.1 Roles and mock users

| Role | Mock user | Notes |
|---|---|---|
| Borrower | Paolo Reyes (2024-00077), student | Owns BR-2026-0004 (Borrowed) and 0016 (Pending) |
| Borrower | Engr. Liza Ramos (F-0031), faculty | Owns 0003 and 0015 |
| Lab staff | Jun Dela Cruz (S-0004) | Default session |
| Lab head (admin) | Engr. Ramon Garcia (F-0017) | Also a faculty borrower: owns 0009 (Approved) |

Session object: `state.session = { userId, displayName, role }`.
The **Demo: switch user / role** control in the header is for demonstration and testing only.

### 7.2 Permission matrix (15 capabilities)

| Capability | Borrower | Lab staff | Lab head | Condition (ownership / status) |
|---|---|---|---|---|
| View own requests | ✓ | ✓ | ✓ | **Own requests only** |
| View all requests | — | ✓ | ✓ | |
| Submit a request | ✓ | ✓ | ✓ | |
| File a request for another borrower | — | ✓ | ✓ | |
| Edit own request | ✓ | ✓ | ✓ | **Own request, while Pending** |
| Edit any request | — | ✓ | ✓ | **While Pending** |
| Cancel own request | ✓ | ✓ | ✓ | **Own request, while Pending or Approved** |
| Cancel any request | — | ✓ | ✓ | **While Pending or Approved** |
| Approve or reject | — | ✓ | ✓ | **Not your own request** |
| Release equipment | — | ✓ | ✓ | **Not your own request** |
| Receive returned equipment | — | ✓ | ✓ | |
| Delete requests | — | — | ✓ | **Closed requests only** |
| View the inventory | ✓ | ✓ | ✓ | |
| View the activity log | — | ✓ | ✓ | |
| Manage system data | — | — | ✓ | |

Eight capabilities depend on ownership or record status. The same matrix is printed in **Settings & Data → Roles and permissions**, generated from `ROLE_PERMISSIONS`, so the page cannot disagree with the code.

### 7.3 How the model is applied

- `ROLE_PERMISSIONS` (role → set of capabilities) and `RECORD_RULES` (ownership/status conditions) are defined once in `permissions.js`.
- `can(session, permission, record)` is used for **navigation** (`navItemsFor()`), **buttons** (row actions, details actions, workflow actions) and **record visibility** (`visibleRecords()`).
- `requirePermission()` is called at the top of every handler (`viewRecord`, `startEdit`, `saveRequest`, `transitionRequest`, `deleteRecord`). A forbidden call from the console throws `ForbiddenError` and state is not changed.
- A borrower sees only their own requests everywhere: list, dashboard counts, details. Their form has the borrower fields filled in and locked.
- Opening a view the role cannot use (for example typing `#activity` as a borrower) shows a notice and returns to the Dashboard.
- Switching user clears the selection and any edit in progress.

### 7.4 Authorization note

Roles in this prototype are simulated in the browser. Anyone can change the role with the switch or the console. **Real authorization requires a trusted back end and is outside the scope of this activity.** This note also appears in the page footer and above the permission matrix in Settings.

### 7.5 Permission tests

| ID | Test | Expected | Actual | P/F |
|---|---|---|---|---|
| P-01 | Borrower views own request (0016) / someone else's (0010) | allowed / denied | allowed / denied | PASS |
| P-02 | Borrower's list is only 0004 and 0016; staff see 17 | 2 / 17 | 2 / 17 | PASS |
| P-03 | Borrower edits own Pending request | allowed | allowed | PASS |
| P-04 | **Status:** borrower edits own Borrowed request | denied | denied | PASS |
| P-05 | **Ownership:** borrower edits another borrower's Pending request | denied | denied | PASS |
| P-06 | Staff edit a Pending request / an Approved one | allowed / denied | allowed / denied | PASS |
| P-07 | **Role:** approve as borrower / as staff | denied / allowed | denied / allowed | PASS |
| P-08 | **Ownership:** lab head releases his own request (0009) / staff release it | denied / allowed | denied / allowed | PASS |
| P-09 | Borrower cancels own Pending / own Borrowed | allowed / denied | allowed / denied | PASS |
| P-10 | Cancel someone else's Approved request as staff / as borrower | allowed / denied | allowed / denied | PASS |
| P-11 | **Role:** delete a closed request as staff / as lab head | denied / allowed | denied / allowed | PASS |
| P-12 | **Status:** lab head deletes a Borrowed request | denied | denied | PASS |
| P-13 | Activity Log in navigation: borrower / staff / lab head | no / yes / yes | no / yes / yes | PASS |
| P-14 | Manage data and file-for-others per role | head only / staff + head | same | PASS |
| P-15 | Borrower calls approve directly | `ForbiddenError`, record unchanged | same | PASS |
| P-16 | Lab head approves his own new request | `ForbiddenError` | `ForbiddenError` | PASS |
| P-17 | Workflow buttons on a Pending request: borrower / staff | Cancel only / Approve, Reject, Cancel | same | PASS |
| P-18 | Live: `deleteRecord()` on an open request | `ForbiddenError`, `state.records` unchanged | same | PASS |

18 of 18 pass.

---

## Verification run (headless Chrome, 2026-10-02)

- **Console tests:** 67 of 67 pass (21 validation, 12 explorer, 16 workflow, 18 permission), plus the 3 Unit 3 assertions.
- **Console:** 0 uncaught errors and 0 `console.error` calls. Refused actions are logged with `console.warn` on purpose.
- **Scripted interaction run:**

| Action | Result |
|---|---|
| Page size 5 → page 3 | “Showing 11–15 of 17” |
| Then filter Status = Pending | “Showing 1–4 of 4”, page back to 1 |
| Approve BR-2026-0010 as staff | Approved; next actions become Release, Revoke, Cancel |
| Revoke approval with empty reason | Inline error, nothing changed |
| Revoke with a reason | Back to Pending, 3 history entries |
| Trigger Returned → Approved | Notice: “Illegal transition… Allowed next: none (final state)” |
| Submit empty form | 7 errors listed |
| Submit valid request | BR-2026-0018 created, Pending |
| Submit the same borrower + equipment again | Duplicate error, typed values kept |
| Edit BR-2026-0018, quantity 2 → 3 | Saved, “was updated” |
| Switch to Paolo Reyes (borrower) | Nav loses Activity Log, list shows his 2 requests, form locked to his ID |
| As borrower: view another request, approve, delete, open `#activity` | All four refused with a message |
| Type “arduino” in search | State unchanged immediately, updated after 300 ms |
| Switch to lab head, open own request 0009 | Release and Revoke disabled with the reason shown |
| Lab head deletes closed BR-2026-0001 | Deleted |

- **Layout:** no horizontal overflow on any of the 6 views at 360, 683 (200% zoom), 768, 1024 and 1440 px, including the details panel with a note form open and the form with errors shown.

Not covered by the automated run: a manual keyboard-only pass and a screen-reader pass. These belong to the Unit 10 accessibility tests.

---

## Carried forward to later units

- **Unit 8:** save records, session and preferences to localStorage; export/import/reset; audit entries for create, update and delete (status changes are already recorded in `history`).
- **Unit 9:** dashboard formulas, grouped summaries and verification table.
- **Unit 10:** full functional, responsive, accessibility and resilience test package and quality score.
