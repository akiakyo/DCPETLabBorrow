# DCPET LabBorrow — Guided Activity, Units 1–3

**System:** Lab Equipment Borrowing and Inventory System
**Scope of this submission:** Guided Questions 1, 2 and 3 (front-end only: HTML, CSS, vanilla JavaScript)

Files:

| File | Purpose |
|---|---|
| `index.html` | Semantic application shell (Q1) |
| `css/styles.css` | Design tokens and responsive layout (Q2) |
| `js/data.js` | Mock inventory and borrow-request records (Q3) |
| `js/model.js` | Pure functions: derived fields, search/filter/sort/page, IDs (Q3) |
| `js/state.js` | The single authoritative `state` object (Q3) |
| `js/render.js` | `render()`, `renderRecords()`, `renderSummary()`, `renderEmptyState()` and others (Q3) |
| `js/app.js` | Navigation, delegated event handling, form, preferences |
| `js/tests.js` | Console assertions for stable IDs (Q3) |

Open `index.html` directly in a browser. No server or build step is needed.

---

## GUIDED QUESTION 1 — System Blueprint and Semantic Shell

### 1.1 System scope

The DCPET Lab Equipment Borrowing and Inventory System serves three groups: **students** who borrow laboratory equipment for class activities, projects and theses; **faculty** who borrow equipment for class demonstrations; and **laboratory staff** who approve requests, release and receive equipment, and keep the inventory accurate. The main record is the **borrow request**. It links one borrower to one inventory item, with a quantity, a borrow date, a due date and a status. The system solves a problem that paper logbooks and verbal requests cannot. Staff cannot tell at a glance which units are available, who has which equipment, or which items are overdue. As a result, equipment is double-booked, lost or returned late with no record. The system keeps every request and every inventory item in one place. It derives availability and overdue status automatically, so the displayed numbers always match the records.

### 1.2 Functional decomposition (10 modules)

| # | Module | User goal | Required input | Visible output | JavaScript behavior |
|---|---|---|---|---|---|
| M1 | Primary navigation | Move between parts of the system | Nav link click / keyboard | Active view shown, current link highlighted (`aria-current`) | `showView()` switches views from `location.hash`; focus moves to view heading; mobile menu toggle updates `aria-expanded` |
| M2 | Dashboard | Understand the current state of lending | `state.records`, inventory | 5 KPI cards, 5 most recent requests, count per status | `renderSummary()`, `renderRecent()`, `renderStatusBreakdown()`, all computed from state |
| M3 | Borrow request list | Find and review existing requests | Current page of visible records | Table (desktop) / stacked cards (mobile), result count, pagination | `renderRecords()`, `renderResultCount()`, `renderPagination()`; delegated clicks on row actions |
| M4 | Search, filter and sort toolbar | Narrow the list to relevant requests | Search text, status, category, borrower type, sort key, direction | Updated list and “Showing X–Y of Z” | Updates `state.query/filters/sort`, resets `state.page` to 1, calls `render()` |
| M5 | Request details | Inspect every field of one request | `state.selectedId` | Details panel with stored and *(derived)* fields | `renderDetails()`; opened by `[data-action="view"]`, closed by `[data-action="close-details"]` |
| M6 | New borrow request form | Submit a valid request | 10 form fields | Inline errors, error summary, success message | Native constraint check, conditional field, `addRecord()` with stable ID (full engine in Unit 4) |
| M7 | Equipment inventory | Check what is available to borrow | `EQUIPMENT` catalog + `state.records` | Card per item: available/total, committed, stock level, condition | `deriveInventory()` computes availability; `renderInventory()` |
| M8 | Activity log | See how records reached their current state | Status history and audit entries | Timeline list (empty state for now) | Placeholder; filled in Unit 6 (status history) and Unit 8 (audit) |
| M9 | Session / role | Know who is acting and with what permissions | Session object | Signed-in name and role | Placeholder text; role switcher in Unit 7 |
| M10 | Settings and data | Control display, back up or reset data | Theme choice; files (Unit 8) | Theme applied; export/import/reset controls | Theme works now (`applyTheme()`); saving preferences and data tools in Unit 8 |

### 1.3 Traceability matrix (20 user actions)

| # | User action | Module | Exact HTML section / component | Status |
|---|---|---|---|---|
| A01 | Open the dashboard | M1, M2 | `nav#primary-nav a[href="#dashboard"]` → `section#dashboard` | Implemented |
| A02 | Read KPI summary | M2 | `section#dashboard div#kpi-grid` | Implemented |
| A03 | Open a recent request from the dashboard | M2, M5 | `ol#recent-list button[data-action="view"]` | Implemented |
| A04 | Browse all borrow requests | M3 | `section#requests table.data-table tbody#records-body` | Implemented |
| A05 | Search by ID, borrower, equipment or purpose | M4 | `form#toolbar input#search` | Implemented |
| A06 | Filter by status, category or borrower type | M4 | `select#filter-status`, `select#filter-category`, `select#filter-type` | Implemented |
| A07 | Sort the list and change order | M4 | `select#sort-key`, `select#sort-dir` | Implemented |
| A08 | Move between result pages | M3 | `nav#pagination [data-action="page-prev" / "page-next"]` | Implemented |
| A09 | Recover from “no results” | M3 | `div#empty-state [data-action="clear-filters"]` | Implemented |
| A10 | View full request details | M5 | `[data-action="view"]` → `section#request-details` | Implemented |
| A11 | Close the details panel | M5 | `section#request-details [data-action="close-details"]` | Implemented |
| A12 | Delete a request | M3, M5 | `[data-action="delete"]` (row and details panel) | Implemented |
| A13 | Submit a new borrow request | M6 | `section#new-request form#request-form` | Implemented (basic) |
| A14 | See and fix validation errors | M6 | `div#error-summary`, `[data-error-for]` messages | Implemented (basic) |
| A15 | Check equipment availability | M7 | `section#equipment div#equipment-grid` | Implemented |
| A16 | Approve / release / return a request | M5 | Action area in `section#request-details` | Placeholder (Unit 6) |
| A17 | Review status history and audit trail | M8 | `section#activity` | Placeholder (Units 6, 8) |
| A18 | See the signed-in user and role | M9 | `header section#session` | Placeholder (Unit 7) |
| A19 | Change the display theme | M10 | `section#settings select#pref-theme` | Implemented |
| A20 | Export, import or reset data | M10 | `section#settings` data management buttons | Placeholder (Unit 8) |

### 1.4 Traceability coverage

Traceability Coverage (%) = (Mapped Required Functions / Total Required Functions) × 100
= (20 / 20) × 100 = **100%**

Every declared user action maps to a specific element or section in `index.html`. Actions marked *Placeholder* already have their location in the shell. Later units add the behavior without restructuring the page.

### 1.5 Semantic shell summary

- Landmarks: `header.app-header`, `nav#primary-nav` (`aria-label="Primary"`), `main#app`, `footer.app-footer`, plus a skip link.
- **12 `<section>` elements**, each with `aria-labelledby`: `#session`, `#dashboard`, `#requests`, `#request-details`, `#new-request`, `#equipment`, `#activity`, `#settings`, and four nested panels (recent requests, status summary, preferences, data management).
- **Form:** `form#request-form` with `fieldset`/`legend` groups and a label for every control.
- **Data-display region:** `table.data-table` with `<caption>` and `<th scope="col">`.
- **State placeholders:**
  - Normal: `#kpi-grid`, `#records-body`
  - Empty: `#empty-state`, `#recent-empty`, activity empty state
  - Validation error: `#error-summary` and `[data-error-for]` elements
  - Success: `#form-success`
  - Status announcements: `#live` (`role="status"`)

---

## GUIDED QUESTION 2 — Responsive Visual System

### 2.1 Design tokens (40 custom properties)

| Group | Tokens |
|---|---|
| Spacing | `--space-1` … `--space-6` |
| Typography | `--font-body`, `--font-mono`, `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-kpi`, `--line-height` |
| Borders / radius / elevation | `--radius`, `--radius-sm`, `--border-color`, `--border`, `--shadow` |
| Surfaces / text | `--bg`, `--surface`, `--surface-muted`, `--text`, `--text-muted`, `--brand`, `--brand-strong`, `--on-brand` |
| Feedback states | `--success`, `--success-bg`, `--warning`, `--warning-bg`, `--danger`, `--danger-bg`, `--info`, `--info-bg` |
| Layout / interaction | `--max-content`, `--nav-width`, `--touch-target`, `--focus-ring`, `--transition` |

A dark theme redefines the surface, text and feedback tokens. It follows the operating-system setting, or the choice made in Settings.

### 2.2 Layout behavior

| Width | Structure |
|---|---|
| **Desktop ≥ 1024px (64em)** | `grid-template-areas` puts the navigation in a sticky sidebar beside the content. Above 1280px (80em), the request list and the details panel sit side by side. |
| **Tablet 768–1023px** | Navigation becomes a horizontal bar that wraps (`flex-wrap`). Content stacks. The table hides the low-priority Qty column. |
| **Mobile < 768px** | Navigation collapses behind a **Menu** button (`aria-expanded`). Each table row becomes a stacked card with its column labels shown. The toolbar becomes one column. |

Breakpoints use `em`, so zooming the browser triggers the same structural changes as a narrower screen.

### 2.3 Modern layout techniques used (7)

- `minmax()`
- `repeat(auto-fit, …)` / `repeat(auto-fill, …)`
- `clamp()` for fluid headings and KPI numbers
- `min()` for the shell width and card minimums
- `flex-wrap`
- `grid-template-areas`
- `max-content` columns in the details list

### 2.4 Responsive data-display strategy

The strategy is a **hybrid of priority columns and stacked cards**, documented in the `data display: hybrid` comment in `css/styles.css`:

- **Desktop:** the full table is kept, because it is the best way to compare requests row by row.
- **Tablet:** a lower-priority column (Qty) is hidden, since the details panel still shows it.
- **Mobile:** rows become cards with a label for every value. A horizontal-scroll table was rejected because on a phone it would push Status and the View/Delete buttons off-screen, and those are the parts the user needs most.

### 2.5 Viewport test table

**Method:**
- Tested in headless Chrome at exact CSS widths.
- The horizontal-overflow check compared `scrollWidth` with `clientWidth` on every view.
- 200% zoom was simulated with a 683px viewport (1366 ÷ 2), which is the CSS width a 1366px laptop has at 200% zoom.
- Screenshots were inspected for layout.

| Check | 360px | 768px | 1024px | 1440px | 200% zoom |
|---|---|---|---|---|---|
| Navigation reachable and usable | Pass (Menu button) | Pass (wrapped bar) | Pass (sidebar) | Pass (sidebar) | Pass (wrapped bar) |
| Form usable (labels, one/two columns) | Pass | Pass | Pass | Pass | Pass |
| Data display readable | Pass (cards) | Pass (priority columns) | Pass (table) | Pass (table) | Pass (priority columns) |
| No horizontal page overflow | Pass | Pass | Pass | Pass | Pass |
| Touch targets ≥ 44px | Pass | Pass* | Pass* | Pass* | Pass* |
| Text readable, nothing clipped | Pass | Pass | Pass | Pass | Pass |

\* Main buttons, nav links and form controls are 44px tall. The compact row buttons (View/Delete) are 36px on tablet and desktop, which is above the WCAG 2.2 AA minimum of 24px. On mobile they grow to 44px.

---

## GUIDED QUESTION 3 — Front-End Data Engine

### 3.1 Mock data

- **17 borrow requests** in `js/data.js`. Each has a stable ID (`BR-2026-0001` …) and **16 stored fields**.
- **12 inventory items** (`EQ-001` … `EQ-012`).
- The requests cover every status, including 3 that are currently overdue.

### 3.2 Stored vs. derived fields

| Field | Stored / Derived | Rule |
|---|---|---|
| `id` | Stored | Stable ID `BR-YYYY-NNNN`, never reused |
| `borrowerId`, `borrowerName`, `borrowerType`, `borrowerEmail` | Stored | Entered on the form |
| `equipmentId`, `quantity` | Stored | Reference to the inventory item, and the number of units |
| `purpose`, `purposeDetails` | Stored | `purposeDetails` is only used when purpose is “Other” |
| `borrowDate`, `dueDate`, `returnedDate` | Stored | ISO dates (`YYYY-MM-DD`) |
| `status` | Stored | One of `PENDING`, `APPROVED`, `BORROWED`, `RETURNED`, `REJECTED` |
| `remarks`, `createdAt`, `createdBy` | Stored | Staff note, creation time, creator ID (used by roles in Unit 7) |
| `equipmentName`, `category`, `laboratory` | **Derived** | Looked up from `EQUIPMENT` by `equipmentId` |
| `loanDays` | **Derived** | `dueDate − borrowDate + 1` |
| `isOverdue` | **Derived** | `status === "BORROWED"` and today > `dueDate` |
| `daysOverdue` | **Derived** | `today − dueDate` when overdue |
| `displayStatus` | **Derived** | `"OVERDUE"` when overdue, otherwise `status` |
| `returnedLate` | **Derived** | `returnedDate > dueDate` |
| Inventory `available`, `committed`, `stockLevel` | **Derived** | `available = totalUnits − Σ quantity of APPROVED/BORROWED requests` |

**Why overdue is derived rather than stored:** a stored “OVERDUE” status would be wrong the day after it was saved, because nothing updates it as time passes. Deriving it from `dueDate` and today's date keeps it correct.

### 3.3 State object (`js/state.js`)

```js
const state = {
  records: [...],            // business data
  nextSeq: 18,               // ID sequence, only moves forward
  view: "dashboard",
  query: "",
  filters: { status: "ALL", category: "ALL", borrowerType: "ALL" },
  sort: { key: "createdAt", direction: "desc" },
  page: 1,
  pageSize: 10,
  selectedId: null,
  preferences: { theme: "system" }
};
```

### 3.4 Rendering and events

- `render()` is the single entry point that projects `state` into the DOM. It calls `renderSummary()`, `renderRecent()`, `renderStatusBreakdown()`, `renderResultCount()`, `renderRecords()` **or** `renderEmptyState()`, `renderPagination()`, `renderDetails()` and `renderInventory()`.
- `renderEmptyState()` has two variants: no records at all (link to create one), or no matches (button to clear filters).
- **Event delegation:** one `document` click listener handles every `[data-action]` element (`view`, `delete`, `close-details`, `clear-filters`, `page-prev`, `page-next`). Rows created by later renders work without new listeners. Errors are caught and shown to the user rather than failing silently.
- Every change follows the same order: update `state` → `render()` → announce the result in `#live`.

### 3.5 Console assertions (`js/tests.js`)

They run on page load and can be re-run with `runStableIdTests()` in DevTools. They work on a copy of the data, so the live state is never changed.

| ID | Assertion | Result |
|---|---|---|
| A1 | After sorting by borrower name (Z–A), the order changes but every ID still maps to identical record data | PASS |
| A2 | After deleting `BR-2026-0004`, that ID is gone and `BR-2026-0005` is still Kristine Lim / EQ-005; no remaining record changed | PASS |
| A3 | After deleting `BR-2026-0017`, the next new ID is `BR-2026-0018` (a deleted ID is never reused) and all IDs are unique | PASS |

### 3.6 Verification run (headless Chrome, 2026-09-24)

- **19 page loads** across all views and widths, plus a scripted interaction run: **0 uncaught errors, 0 `console.error` calls, 0 failed assertions.**
- **Interaction results:**

| Action | Result |
|---|---|
| Initial list | “Showing 1–10 of 17” |
| Next page | “Showing 11–17 of 17” |
| Search “kristine” | Page reset to 1, 2 results |
| Search “zzz” | Empty state shown, “Showing 0 of 0” |
| Clear filters | Back to 17 |
| Filter Overdue | `BR-2026-0014`, `BR-2026-0006`, `BR-2026-0004` |
| Sort by name A–Z | Andrea Santos, Bea Navarro, Carlo Mendoza |
| View → Delete | Details panel closed, 16 records, toast shown |
| Submit empty form | 7 errors listed, focus on the summary |
| Purpose “Other” with no details | Conditional error shown |
| Valid submit | `BR-2026-0018` created as PENDING, dashboard updated |

**Note:** results that depend on the date, such as the overdue count, are based on 2026-09-24. On a later date, more borrowed items will correctly show as overdue.

---

## Carried forward to later units

- **Unit 4:** JavaScript field rules, cross-field rules (due date ≥ borrow date, quantity ≤ available units), duplicate-request rule and validation test table. The form currently uses native constraints and the conditional “Other” rule only.
- **Unit 5:** search debounce, a date-range filter, page-size selector (5/10/20) and numbered pages.
- **Unit 6:** workflow transitions and status history.
- **Unit 7:** roles and permissions.
- **Unit 8:** localStorage, import/export, reset and audit trail.
