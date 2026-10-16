# DCPET LabBorrow — Guided Activity, Units 8–10

**System:** Lab Equipment Borrowing and Inventory System
**Scope of this submission:** Guided Questions 8, 9 and 10 (front-end only: HTML, CSS, vanilla JavaScript)
**Builds on:** `docs/UNITS-1-3.md`, `docs/UNITS-4-7.md`

Files added or changed:

| File | Purpose |
|---|---|
| `js/storage.js` (new) | Versioned payload, `validatePayload()`, `parsePayload()`, merge, audit helpers, `readStoredState()` / `writeStoredState()` (Q8) |
| `js/metrics.js` (new) | `getMetrics()`, `percentOf()`, `formatPercent()`, `METRIC_FORMULAS` (Q9) |
| `js/app.js` | `persist()`, `recordAudit()`, `exportData()`, `previewImportText()`, `importData()`, `resetData()`, `restoreSavedState()`, global error handlers |
| `js/render.js` | 8 KPI cards, 3 bar summaries, formula list, audit table, storage status, import preview |
| `js/state.js` | `audit`, `pendingImport`, `storage`; defaults from `DEFAULT_PREFERENCES` |
| `js/data.js`, `js/model.js` | `seedRecords()`, `SORT_KEYS` |
| `js/tests.js` | 33 new console tests (`runPersistenceTests()`, `runMetricTests()`); 102 in total, including 2 for bulk delete |
| `index.html`, `css/styles.css` | Dashboard groups, audit trail, Saved data panel, Export / Import / Reset tools; table no longer scrolls sideways at 1024–1440 px |
| `docs/screenshots/` | Evidence screenshots from the verification run |

Open `index.html` in a browser. The tests run on load and print six tables in the console; re-run them with `runAllTests()`.

---

## GUIDED QUESTION 8 — Durable Browser Persistence and Recovery

### 8.1 What is saved

One `localStorage` key, `dcpet-labborrow`, holding a versioned envelope (`buildPayload()`):

```json
{
  "app": "dcpet-labborrow",
  "schemaVersion": 1,
  "savedAt": "2026-10-16T09:05:12",
  "records": [ … every request, with its status history … ],
  "nextSeq": 19,
  "session": { "userId": "F-0017" },
  "preferences": { "theme": "dark", "pageSize": 5, "sort": { "key": "createdAt", "direction": "desc" } },
  "audit": [ … ]
}
```

| Requirement | Saved as |
|---|---|
| Primary records | `records` (including each request's status `history`) and `nextSeq`, so deleted IDs are never reused |
| User preferences | `preferences`: theme, page size, sort key and direction. Search text and filters are not saved on purpose. |
| Active mock role | `session.userId` (the role comes from the user) |
| Audit log | `audit` |

The app saves after every change: create, edit, status change, delete, import, reset, user switch, theme, sort and page size. `persist()` is called inside the mutation functions themselves (`saveRequest`, `transitionRequest`, `deleteRecord`, `importData`, `resetData`), so a change made from the console is saved and audited the same way as a click.

### 8.2 Loading safely

`readStoredState()` → `parsePayload()` → `validatePayload()`. Nothing is assigned to `state` until the whole payload passes.

**Refused** (the whole payload is rejected):

- not valid JSON
- not an object, or a bare array without the envelope
- `schemaVersion` missing, not the number `1`, or newer than this version (“saved by a newer version (schema 2)”)
- `records` missing or not a list
- any record failing `recordProblem()`: missing field, bad ID format, ID not matching borrower type, unknown equipment, quantity outside 1–5, unknown purpose or status, invalid dates, due before borrow, Returned without a return date, missing or invalid history, status not matching the last history entry
- duplicate request IDs
- an invalid audit entry

**Repaired** (loaded, with a notice saying what was corrected):

- `nextSeq` missing or lower than the highest ID → recalculated
- unknown saved user → default user
- unknown theme, page size or sort → that preference's default

The rule behind the split: records, schema and audit decide what is true, so they must be correct or not used. A bad preference should not cost the user their records.

### 8.3 Recovery behavior

| Situation | What happens |
|---|---|
| Empty storage (first visit) | Sample data is loaded and saved immediately, so every later load goes through the same checks |
| Valid data | Restored silently; *Settings & Data → Saved data* shows the last save time |
| Repairable data | Restored; notice “Saved data restored with corrections.” lists each correction; the corrected copy is saved |
| Invalid data | Notice “Saved data could not be loaded.” with the reasons. The app starts from the sample data. The unreadable text is copied to `dcpet-labborrow-unreadable`, and the lab head can **Download unreadable data** or **Discard backup**. A `RECOVERY` audit entry is written. |
| Storage blocked (private mode) | Notice “Not saving.”; the app still works for the session |
| Storage full when saving | The change stays on screen; notice “Could not save.”; *Saved data* shows “Last save failed” and recommends exporting |

### 8.4 Export, import, reset (lab head only)

All three are in *Settings & Data → Data management*. Every function calls `requirePermission(session, "data:manage")` first, so a console call by another role throws `ForbiddenError`.

- **Export JSON**: downloads `labborrow-export-YYYY-MM-DD.json`, the same envelope that is saved to storage.
- **Import JSON** has two steps:
  1. Choosing a file shows a short **“Checking file…”** loading state (400 ms, input disabled, `aria-busy`), then `previewImportText()` validates it. An invalid file gets an inline list of every problem, and nothing changes. A valid file shows a **preview**: number of requests, how many are new and how many have an ID already here, number of audit entries, any repair warnings, and a warning if the file would commit more units of an item than exist.
  2. The user picks **Replace** or **Merge** and presses **Confirm import**. `importData()` validates again before changing anything.
     - Replace: records and audit trail come from the file.
     - Merge: requests with new IDs are added; existing records always win; the file's audit entries are not merged.
     - Both keep the current user and preferences, keep `nextSeq` at the highest value seen, and add an `IMPORT` audit entry. **Cancel** changes nothing.
- **Reset data**: the user must type `RESET` (capitals; surrounding spaces ignored). It restores the 17 sample requests and starts a new audit trail with one `RESET` entry that says how many requests and entries were cleared. Preferences are kept. The panel recommends exporting first.

### 8.5 Audit trail

Entry: `{ timestamp, actor, actorId, action, recordId, details }`. Kept to the newest 500 entries.

| Action | Written by | Example details |
|---|---|---|
| `CREATE` | `saveRequest()` | Submitted for Test Student: Laptop (Core i5, 16 GB) × 2, 2026-10-16 to 2026-10-19. |
| `UPDATE` | `saveRequest()` (edit) | quantity 2 → 3 |
| `STATUS_CHANGE` | `transitionRequest()` | Pending → Approved (Approved). |
| `DELETE` | `deleteRecord()` | Deleted Rejected request of Nathan Flores for Digital Oscilloscope × 2. |
| `IMPORT` | `importData()` | Merged 7 new requests from full-export.json; skipped 10 requests whose ID was already here. |
| `RESET` | `resetData()` | Restored the 17 sample requests. Cleared 17 requests and 4 audit entries. |
| `RECOVERY` | `restoreSavedState()` | Saved data could not be read (It is not valid JSON …). Started from the sample data; the unreadable data was kept as a backup. |

Shown in **Activity Log → Audit trail**, newest first. Deleted requests are marked “no longer exists”. The existing *Status changes* table is still below it.

### 8.6 Persistence tests

S-01 to S-17 run in the console against a fake storage object, so they never touch real saved data. N-01 to N-09 in §10.5 repeat the important cases in the real browser.

| ID | Test | Expected | Actual | P/F |
|---|---|---|---|---|
| S-01 | **Empty storage** | `empty`, sample data used | same | PASS |
| S-02 | **Successful restore** | records, `nextSeq` 18, user, theme, page size, sort and audit identical; no warnings | same | PASS |
| S-03 | **Malformed JSON** `{"schemaVersion": 1, "records": [` | refused: “It is not valid JSON …” | same | PASS |
| S-04 | **Wrong schema version**: 2, `"1"` (text), missing | all refused, with “newer version” / “unsupported” messages | same | PASS |
| S-05 | Bare array; `records` not a list | refused | refused | PASS |
| S-06 | **Missing field**: record 3 without `borrowerName` | refused: “Record 3 (BR-2026-0003) is missing "borrowerName".” | same | PASS |
| S-07 | **Duplicate IDs** (two BR-2026-0001) | refused: “Duplicate request IDs: BR-2026-0001.” | same | PASS |
| S-08 | Status `LOST`, quantity 0, equipment `EQ-999`, status not matching history | all refused | all refused | PASS |
| S-09 | Audit entry with action `HACK` | whole payload refused | refused | PASS |
| S-10 | Repairable: `nextSeq` 3, unknown user, theme “neon”, page size 7, bad sort | loaded, 5 warnings, defaults, `nextSeq` 18 | same | PASS |
| S-11 | Storage that throws / is `null` | `unavailable`, no crash | same | PASS |
| S-12 | Merge 3 requests (2 IDs already here) | 1 added, 2 skipped, 18 total | same | PASS |
| S-13 | Export → import round trip | exported file passes import unchanged | same | PASS |
| S-14 | Audit details and limit | “quantity 2 → 3; due date 2026-10-01 → 2026-10-02”; 500 kept, oldest dropped | same | PASS |
| S-15 | Reset phrase: `reset`, empty, `RESET please`, `  RESET ` | only the last accepted | same | PASS |
| S-16 | Over-committed file (EQ-005: 7 of 6) | flagged in the preview | same | PASS |
| S-17 | Live: borrower calls `importData()` and `resetData()` | `ForbiddenError` twice; records, audit, `nextSeq` unchanged | same | PASS |

17 of 17 pass. They cover every case the activity names: malformed JSON (S-03), wrong schema version (S-04), missing fields (S-06), duplicate IDs (S-07), empty storage (S-01) and successful restore (S-02).

---

## GUIDED QUESTION 9 — Live, Verifiable Dashboard

### 9.1 KPI cards (8)

All values come from `getMetrics(scoped, all, today)` in `metrics.js`. `scoped` is the requests the signed-in user may see, the same set the list uses; a borrower sees their own numbers. `all` is used only for stock, because the inventory is shared.

| KPI | Formula / counting rule | No-data display |
|---|---|---|
| Total requests | count of requests you can see | 0 |
| Pending approval | status = Pending | 0 |
| Currently borrowed | status = Borrowed (overdue included); note: Σ quantity = units out | 0 |
| Overdue | status = Borrowed **and** due date < today (derived, never stored) | 0 |
| Units available | Σ total units − Σ quantity on Approved/Borrowed; note: committed ÷ total units × 100 | — |
| On-time return rate | Returned with return date ≤ due date ÷ all Returned × 100 | “—”, “No returned requests yet” |
| Approval rate | (Approved + Borrowed + Returned) ÷ (those + Rejected) × 100. Pending and Cancelled are excluded because they were never decided. | “—”, “No requests reviewed yet” |
| Average loan length | Σ (return date − borrow date + 1) ÷ number of Returned (inclusive days, same as the loan period in details) | “—” |

The same formulas are shown on the dashboard under **How these numbers are computed**, generated from `METRIC_FORMULAS`.

**Zero denominators.** `percentOf(part, whole)` returns `null` when `whole` is 0, and `formatPercent(null)` shows “—”, so the dashboard never shows `NaN`, `Infinity` or a misleading 0%. Test F-21 imports an empty file and checks the whole page text for `NaN`, `Infinity` and `undefined`.

### 9.2 Grouped summaries (3)

| Summary | Group | Bar width |
|---|---|---|
| Requests by status | 7 display statuses (Overdue separate from Borrowed) | count ÷ total requests |
| Requests by equipment category | 6 catalog categories (zero-count ones included), most first | count ÷ total requests |
| Inventory use by laboratory | 4 laboratories, highest first | committed units ÷ the lab's total units |

The bars are plain CSS (`.bar-track` / `.bar-fill`, width from the value) with no chart library. The bar is `aria-hidden`. The count and percentage are printed next to it, so nothing depends on color or length alone. When there are no requests, the status and category panels say so instead of showing 0% bars.

### 9.3 Dashboard verification table

Data: the 17 seed requests on 2026-10-02 (fixed date used by the tests). “Manual” values were counted by hand from `data.js`; “Program” is `getMetrics()` (tests D-01 to D-12).

| # | Metric | Manual count | Program | Match |
|---|---|---|---|---|
| 1 | Total requests | 17 | 17 | ✓ |
| 2 | Pending | 0010, 0011, 0012, 0016 = 4 | 4 | ✓ |
| 3 | Currently borrowed / units out | 0004, 0005, 0006, 0007, 0014, 0015 = 6 · 1+1+1+4+3+5 = 15 | 6 / 15 | ✓ |
| 4 | Overdue | all 6 borrowed are past due on 2 Oct = 6 | 6 | ✓ |
| 5 | Units available | 67 total − (15 borrowed + 0008: 1 + 0009: 2) = 67 − 18 = 49 | 49 / 67 | ✓ |
| 6 | Committed share | 18 ÷ 67 = 26.9% | 26.9% | ✓ |
| 7 | On-time return rate | Returned: 0001 (on time), 0002 (late), 0003 (on time), 0017 (on time) = 3 ÷ 4 = 75% | 75% | ✓ |
| 8 | Approval rate | Approved 2 + Borrowed 6 + Returned 4 = 12; + Rejected 1 = 13; 12 ÷ 13 = 92.3% | 92.3% | ✓ |
| 9 | Average loan length | 0001: 5, 0002: 9, 0003: 5, 0017: 4 → 23 ÷ 4 = 5.75 days | 5.75 | ✓ |
| 10 | By status | Pending 4, Approved 2, Borrowed 0, Overdue 6, Returned 4, Rejected 1, Cancelled 0 | same | ✓ |
| 11 | By category | Electronics 4, Microcontrollers 4, Measurement 3, Networking 3, Computing 2, Tools 1 | same | ✓ |
| 12 | By laboratory | Embedded 10/21 = 47.6%, Electronics 7/27 = 25.9%, Networking 1/11 = 9.1%, Computer 0/8 = 0% | same | ✓ |

12 of 12 match. More metric tests:

| ID | Test | Expected | Actual | P/F |
|---|---|---|---|---|
| D-13 | No requests at all | total 0; rates `null` (shown “—”); no `NaN`/`Infinity` anywhere; stock still 67 | same | PASS |
| D-14 | Borrower scope (Paolo) | 2 requests, 1 pending, 1 overdue; shared stock 49 | same | PASS |
| D-15 | Recompute after **create** / **approve 0010** / **edit 0010 to EQ-001** | total 18, pending 5 / pending 3, 20 committed, 47 available / Electronics 5 | same | PASS |
| D-16 | Recompute after **import** of one late return | 5 returned, on-time 60% | same | PASS |

### 9.4 Live refresh in the real page

`render()` calls `getMetrics()` on every change; the dashboard has no separate update step. The verification run checked it in the browser after each kind of change:

| Change | Dashboard result | Test |
|---|---|---|
| Approve BR-2026-0010 | Pending 4 → 3, Units available 49/67 → 47/67, status bar Approved +1 | F-04 |
| Create BR-2026-0018 | Total 17 → 18, Pending 3 → 4 | F-08 |
| Edit BR-2026-0018 | saved, audit updated, dashboard redrawn | F-10 |
| Mark BR-2026-0004 returned (late) | Overdue 6 → 5, On-time rate 75% → 60% | F-24 |
| Import 10 requests (replace) | Total → 10 | F-19 |
| Import an empty file | 0 and “—” everywhere, explanatory notes | F-21 |

---

## GUIDED QUESTION 10 — Integration, Stress Test and Defense

### 10.1 Integration

- **One design system.** Every new component (bars, audit tags, import preview, warning alert, data tools) uses the existing tokens in `:root`, works in light and dark themes, and follows the same em breakpoints.
- **One state model.** `state` in `state.js` is the only source of truth. The dashboard, list, details, inventory, activity log and settings are all drawn from it by `render()`. Pure modules (`model`, `validation`, `workflow`, `permissions`, `storage`, `metrics`) do not touch the DOM.
- **One way to change data.** Every mutation goes through a guarded function: permission → validation → new state → audit → save → render. The buttons, the console and the tests all use these same functions.

### 10.2 States

| State | Where it appears |
|---|---|
| Normal | All views with data |
| Empty | Request list (“no requests yet” / “nothing matches”), dashboard after importing an empty file, recent list, audit trail, status-change log |
| Validation error | Request form (inline + summary), workflow note, date-range filter, import file, reset phrase |
| Forbidden action | Notice “Action not completed. Your role (…) cannot …”; Settings “Only the lab head…”; hash navigation to a forbidden view |
| Invalid transition | Notice “Illegal transition: …”; blocked actions shown disabled with the reason |
| Recovery | “Saved data could not be loaded.”, “Saved data restored with corrections.”, “Could not save.”, “Not saving.” |
| Loading (simulated) | “Checking file…” while an import file is read and validated |
| Unexpected error | `window` `error` / `unhandledrejection` handlers show “Something went wrong.” instead of failing silently |

### 10.3 Verification method

Headless Chrome was driven over the DevTools protocol by a script that clicks, types and presses keys in the real page, reloads it, writes broken data into `localStorage`, and picks files for import. Same steps, same results each run. The run was on 2026-10-16, the real date, so date-dependent results use that day; the console suites use a fixed 2026-10-02.

### 10.4 Functional tests (28)

| ID | Area | Precondition → action | Expected | Actual | P/F |
|---|---|---|---|---|---|
| F-01 | Persistence | First visit | Schema-1 envelope saved, 17 requests, `nextSeq` 18, dashboard 17 | same | PASS |
| F-02 | Explorer | Status Pending + Category Networking + name A–Z | “Showing 1–2 of 2”, 0010 then 0011 | same | PASS |
| F-03 | Explorer | Page 2 at 5 per page → Status Overdue | page resets to 1, “Showing 1–5 of 6” | same | PASS |
| F-04 | Workflow + dashboard | Staff approves BR-2026-0010 | Approved, history +1, audit STATUS_CHANGE, Pending 3, Units 47/67 | same | PASS |
| F-05 | Inventory | After F-04 | RJ45 Crimping Tool “4 of 6 available” | same | PASS |
| F-06 | Workflow | Reject 0011 with empty reason | inline error; still Pending; no audit entry | same | PASS |
| F-07 | Workflow | Tampered button: Returned → Approved | “Illegal transition” notice; records unchanged | same | PASS |
| F-08 | Create | Valid form submitted | BR-2026-0018 Pending; audit CREATE; Total 18, Pending 4 | same | PASS |
| F-09 | Validation | Empty form submitted | summary lists ≥ 6 fields; nothing saved | same | PASS |
| F-10 | Update | Edit 0018 quantity 2 → 3 | saved; audit UPDATE “quantity 2 → 3” | same | PASS |
| F-11 | Audit | Open Activity Log | Updated, Created, Status change (newest first) | same | PASS |
| F-12 | Permissions | Switch to borrower Paolo | no Activity Log in nav; 2 own requests; data tools hidden | same | PASS |
| F-13 | Permissions | Borrower: tampered Approve and Export buttons | forbidden notices; nothing changed | same | PASS |
| F-14 | Delete | Lab head deletes closed 0013, confirms | removed; audit DELETE | same | PASS |
| F-15 | Persistence | Set dark theme + 5 per page, reload | 17 requests, 4 audit entries, lab head, dark, 5, 0010 Approved | same | PASS |
| F-16 | Export | Export JSON | `labborrow-export-2026-10-16.json`, schema 1, 17 requests, 4 audit entries | same | PASS |
| F-17 | Import | Choose a 10-request file | preview: “10 requests in the file”, “0 new”; state still 17 | same | PASS |
| F-18 | Import | Cancel | preview closed; nothing changed | same | PASS |
| F-19 | Import | Replace with the 10-request file | 10 requests; file audit + IMPORT; dashboard 10 | same | PASS |
| F-20 | Import | Merge the full export | 7 added, 17 total | same | PASS |
| F-21 | Dashboard | Replace with an empty file | 0 / “—” KPIs, empty notes, empty list state, no NaN/Infinity/undefined on the page | same | PASS |
| F-22 | Reset | Type `reset`, then `RESET` | first refused; then 17 sample requests, audit = [RESET], `nextSeq` 19 (no ID reuse) | same | PASS |
| F-23 | Navigation | 360 px: Menu button | nav hidden → opens → navigates → closes (`aria-expanded`) | same | PASS |
| F-24 | Workflow + dashboard | Mark 0004 returned (late) | Overdue 6 → 5, on-time 75% → 60%, approval rate unchanged | same | PASS |
| F-25 | Bulk delete | Lab head: Status Returned → select page → untick 0004 → change filter and page size → Delete selected | 5 ticked, then 4 (header box indeterminate, focus stays on the box); selection kept with “not on this page” count; one confirm deletes the 4; 4 DELETE audit entries “(bulk delete of 4)”; selection cleared; scroll position kept | same | PASS |
| F-26 | Bulk delete + roles | Lab head on page 1 (only open requests); then staff | lab head: a box beside every request ID, header box enabled and ticks every row on the page; staff: no checkbox column, no bulk bar | same | PASS |
| F-27 | Scroll position | Scroll to the bottom → Next page; scroll Approve far below the details heading → Approve | page stays where it was (moves only if the page got shorter and the browser clamps to the new bottom); request Approved; focus on the panel heading without scrolling to it | same | PASS |
| F-28 | Bulk delete, open request | Lab head ticks an overdue Borrowed request → Delete selected | confirm warns it is still open and equipment is out on loan; request removed; audit DELETE | same | PASS |

**28 of 28 pass.**

### 10.5 Negative / resilience tests (9)

| ID | Failure injected | Expected | Actual | P/F |
|---|---|---|---|---|
| N-01 | **Malformed storage** `{"schemaVersion": 1, "records": [`, reload | recovery notice; sample data; raw text in backup key; audit = [RECOVERY]; default user; no crash | same | PASS |
| N-02 | Stored schema version 2, reload | refused, “newer version” explained; sample data | same | PASS |
| N-03 | **Duplicate IDs** in storage, reload | refused, “Duplicate request IDs: BR-2026-0001” | same | PASS |
| N-04 | Stored record missing `dueDate`, reload | refused, record and field named | same | PASS |
| N-05 | Stored theme “neon”, reload | data restored; “restored with corrections”; no backup | same | PASS |
| N-06 | **Invalid import**: non-JSON file | inline error, `aria-invalid`, no preview, state unchanged | same | PASS |
| N-07 | Import with status `LOST` and quantity 99 | both problems listed; state unchanged | same | PASS |
| N-08 | Console: **illegal transition** 0001 → Borrowed; **forbidden role**: borrower `deleteRecord`, `importData`, `resetData` | WorkflowError, ForbiddenError × 3; state unchanged | same | PASS |
| N-09 | `localStorage.setItem` throws QuotaExceededError while saving | change applied; “Could not save” notice; Settings “Last save failed” | same | PASS |

**9 of 9 pass.** The console suites add many more negative cases: invalid form input (V-02–V-21), illegal transitions and guards (W-01–W-08, W-11–W-13), forbidden calls (P-15, P-16, P-18) and bad stored data (S-03–S-11, S-17).

### 10.6 Responsive tests (5)

Each viewport was tested on all 6 views, in their heaviest states: details panel open, form showing errors, import preview open. “Overflow” covers page-level horizontal scroll, any element outside the viewport, and any table that has to scroll sideways.

| ID | Viewport | Navigation | Records | KPI columns | Overflow | Touch targets < 44 px | P/F |
|---|---|---|---|---|---|---|---|
| R-360 | 360 px | Menu button | cards | 1 | none | none | PASS |
| R-768 | 768 px | top bar | table (Qty hidden) | 3 | none | n/a | PASS |
| R-1024 | 1024 px | sidebar | table | 3 | none | n/a | PASS |
| R-1440 | 1440 px | sidebar | table + docked details | 5 | none | n/a | PASS |
| R-720 | 1440 px at **200% zoom** (720 CSS px) | Menu button | cards | 3 | none | n/a | PASS |

**Fixed during this unit.** The first run found that the request table scrolled sideways inside its frame at 1024 px (16 px) and whenever the details panel was docked beside it (80–130 px at 1280–1440). The cause was the row buttons, which could not wrap. Now the buttons wrap under each other, the Qty column is hidden while details are docked (Qty is in the panel), and the panel docks only from 1440 px. After the fix the table fits at every width.

Screenshots: `docs/screenshots/dashboard-{360,768,1024,1440}.png`, `settings-import-preview-360.png`, `activity-log-1280.png`, `recovery-notice-1280.png`, `empty-dashboard-1280.png`.

### 10.7 Accessibility tests (9)

| ID | Test | Expected | Actual | P/F |
|---|---|---|---|---|
| A-01 | **Keyboard-only navigation** from a fresh load | Tab order: skip link → role switch → all 6 nav links → recent requests → formula toggle; focus never lost to `<body>` | same | PASS |
| A-02 | **Focus visibility** on every element reached by Tab | outline ≥ 2 px | all 14 | PASS |
| A-03 | Keyboard-only workflow | Enter on View → focus on “Request details”; Tab reaches Approve; Enter approves; focus stays on the panel heading after re-render | same | PASS |
| A-04 | **Status message perceivability** | outcome written to `#live` (`role="status"`), not only a toast | “… Pending → Approved (Approved).” | PASS |
| A-05 | **Form labels** | every input/select/textarea in every view has a label | 0 missing | PASS |
| A-06 | **Form errors** | focus on `#error-summary` (`role="alert"`); each invalid field `aria-invalid` and described by its message; one summary link per field | same | PASS |
| A-07 | **Heading / landmark structure** | one `h1` per view, no skipped levels (all 6 views); header/main/footer once; every `nav` labelled; all tables have captions and `scope="col"` | same | PASS |
| A-08 | Text contrast, light and dark theme | ≥ 4.5:1 for muted text, badges, buttons, links, errors | lowest 4.76:1 (light, “In stock” badge), 5.73:1 (dark) | PASS |
| A-09 | Not color alone | every badge, audit tag and bar has text; bars `aria-hidden` | same | PASS |

**9 of 9 pass.**

### 10.8 Console run

| Check | Result |
|---|---|
| Console test suites (V, E, W, P, S, D) | **102 of 102 pass** (21 + 12 + 16 + 20 + 17 + 16), plus the 3 Unit 3 stable-ID assertions |
| Uncaught exceptions during the full run | **0** |
| `console.error` / failed `console.assert` | **0** |
| `console.warn` | 4, all expected: refused actions (`ForbiddenError`, `WorkflowError`) and the simulated full-storage save |

### 10.9 Code quality checklist

| # | Item | Result |
|---|---|---|
| C-1 | No uncaught errors or `console.error` in the full run | Pass |
| C-2 | All console tests pass | Pass |
| C-3 | No framework or library; all scripts are local files | Pass |
| C-4 | One state object; the DOM is drawn from it and never read back as data | Pass |
| C-5 | Business rules in pure modules, separate from rendering and storage access | Pass |
| C-6 | Every mutation goes through one guarded function that audits and saves | Pass |
| C-7 | Event delegation, no inline `on…=` handlers (checked by search) | Pass |
| C-8 | No duplicated logic: seed copying (`seedRecords()`), validation rules and metric formulas each exist once | Pass |

### 10.10 Quality score

| Dimension | Evidence | Passed | Score |
|---|---|---|---|
| F — Functionality | §10.4 | 28 / 28 | 100% |
| R — Responsiveness | §10.6 | 5 / 5 | 100% |
| A — Accessibility | §10.7 | 9 / 9 | 100% |
| V — Validation / resilience | §10.5 | 9 / 9 | 100% |
| C — Code quality | §10.9 | 8 / 8 | 100% |

Q = 0.30F + 0.20R + 0.20A + 0.15V + 0.15C
= 0.30(100) + 0.20(100) + 0.20(100) + 0.15(100) + 0.15(100)
= 30 + 20 + 20 + 15 + 15 = **100**

**What this score does not cover.** It measures the tests listed above, and all of them were automated in Chrome. Not tested:

- a real screen reader (NVDA or Narrator)
- Firefox and Safari
- physical phones and tablets
- a human doing a full keyboard-only session

These are the next checks a reviewer should do, and any failure found there would lower A or R.

### 10.11 Technical defense — the three hardest decisions

**1. Saved data is checked as strictly as new input, but only some of it can be refused.**
`localStorage` can be edited by hand, left behind by an older version, or truncated. Loading it without checks would let one broken record crash rendering or slip past the workflow and permission rules. So `validatePayload()` applies the same rules a request had to pass when it was created, plus integrity checks: unique IDs, and a status that matches the history. The hard part was deciding what to refuse and what to repair. Records, schema and audit decide what is true, so any error there refuses the whole payload. A bad preference or an unknown demo user only falls back to a default with a notice, because losing every request over a theme value would be worse than the bug. Refused data is never discarded silently: it is kept as a downloadable backup and a `RECOVERY` entry explains what happened. This suits a lab system, where losing borrowing records means losing track of equipment.

**2. Dashboard numbers are derived from the same records as the list, with stated denominators.**
The easy option was to store counters such as “pending” or “overdue” and update them on each action. Every new action, import or reset would then be one more place where a counter could drift from the table. Instead `getMetrics()` recomputes everything from the records on each render. Overdue is computed from today's date and never stored, so it cannot go stale. Two choices needed care:

- **Scope.** A borrower's counts use only their own requests (the same rule as the list), but stock uses all requests, because units lent to someone else are just as unavailable.
- **Denominators.** Approval rate excludes Pending and Cancelled because nobody decided them. Every rate returns `null` instead of dividing by zero.

The verification table in §9.3 matched the hand count on all 12 metrics.

**3. Rules are enforced in the action functions, not by hiding buttons.**
With no back end, the UI is the only place rules can live. Hiding a button stops nobody who has DevTools open. Every change therefore goes through one function per action: `saveRequest`, `transitionRequest`, `deleteRecord`, `importData`, `resetData`. Each one checks permission, then legality and guard conditions, then validation, and only then builds new state, writes the audit entry and saves. The buttons are only a convenience view of the same checks (`can()`, `availableActions()`). The tests click tampered buttons and call these functions from the console as the wrong role (F-07, F-13, N-08, S-17, P-18), and in every case the state is unchanged. The cost is that the checks run twice, once to draw a button and once to act, but that is what keeps the console, the UI, the import path and the tests consistent. Real security still needs a server; that limit is stated in the footer and in Settings.

### 10.12 Added after review: bulk delete and scroll position

**Bulk delete.** The request list has a checkbox beside every request ID for the lab head, the only role that can delete. After the review the delete rule was widened: the lab head may delete a request in **any status**, not only closed ones (see the Unit 7 permission table).

- Every row gets a box. The header box selects or clears every row on the current page, and shows a mixed state when only some are ticked.
- If the selection includes open requests, the confirm dialog lists them with their status; for Borrowed (including overdue) requests it also warns that the equipment is still out on loan and deleting removes that record.
- A bar above the table offers *Select all on this page*, *Delete selected (n)* and *Clear selection*. Its count is a `role="status"` live region and says how many ticked requests are on other pages, because the selection is kept across paging, search and filters.
- `deleteRecords(ids)` in `app.js` is now the only delete function; the single-row delete calls it with one ID. It checks every ID before changing anything, so one missing request or a role without delete permission refuses the whole batch (P-18, P-19). It asks for one confirmation listing the IDs and writes one `DELETE` audit entry per request. An empty batch is refused (P-20).
- The selection is UI state, not saved. It is cleared on user switch, import and reset, and pruned on every render to requests that still exist and can still be deleted.
- On phones each card starts with a “Select” line whose box has a 44 px tap target; the header box is replaced by “Select all on this page” in the bar. With the extra column, Qty moves to the details panel below 1280 px, and docked-panel cells use less side padding, so the table still never scrolls sideways (R-360 to R-1440).

**Scroll position.** After an action (approve or other status changes, delete, bulk select, next/previous page, clear filters, closing details, import, reset, saving the form), keyboard focus still moves for screen-reader and keyboard users, but with `focus({ preventScroll: true })` (`focusQuietly()`), so the page stays where the user scrolled it. The page still scrolls in three cases:

- switching to another view opens it at the top
- opening a request's details scrolls just enough to bring the panel into view if it is off screen
- a form submitted with errors moves to the error summary, so the problems can be seen

Screenshots: `docs/screenshots/bulk-delete-1280.png`, `bulk-delete-360.png`.

---

## Final submission checklist

| Requirement | Evidence | Check |
|---|---|---|
| Semantic, traceable application shell | `index.html`, `docs/UNITS-1-3.md` | ☑ |
| Responsive design system | `css/styles.css`, §10.6, screenshots | ☑ |
| Central state and deterministic rendering | `js/state.js`, `js/render.js`, Unit 3 assertions | ☑ |
| Advanced form validation | `js/validation.js`, `docs/UNITS-4-7.md` §4 | ☑ |
| Search / filter / sort / pagination | `js/model.js`, `docs/UNITS-4-7.md` §5 | ☑ |
| Guarded workflow state machine | `js/workflow.js`, `docs/UNITS-4-7.md` §6 | ☑ |
| Role-aware interface | `js/permissions.js`, `docs/UNITS-4-7.md` §7 | ☑ |
| localStorage + import/export + audit | `js/storage.js`, §8 | ☑ |
| Live metrics / dashboard | `js/metrics.js`, §9 | ☑ |
| Integrated QA | §10 | ☑ |
