# DCPET LabBorrow — Lab Equipment Borrowing & Inventory System

A database-driven web app for the DCPET laboratories. Students and faculty request lab equipment online. Lab staff approve, release and receive the items. The Super Admin manages accounts and reviews the activity log. Every screen reads from and writes to a MySQL database.

**Stack:** PHP 8 (PDO) · MySQL/MariaDB via XAMPP · HTML, CSS, a little vanilla JavaScript

## Setup (XAMPP)

1. Copy this folder into `C:\xampp\htdocs\` and name it `labborrow`.
2. In the XAMPP Control Panel, start **Apache** and **MySQL**.
3. Open http://localhost/phpmyadmin, go to **Import**, choose `database/labborrow_db.sql` and click **Import**. This creates the `labborrow_db` database with demo records.
4. Open http://localhost/labborrow.

If your MySQL root account has a password, set it in `includes/config.php`.

## Demo accounts

All demo accounts use the password `password123`.

| Role | Sign in with |
|---|---|
| Super Admin | `superadmin@school.edu.ph` |
| Admin (Lab Staff) | `admin@school.edu.ph` |
| User (Student) | `asantos@school.edu.ph` or ID `2023-00142` |
| User (Faculty) | `lramos@school.edu.ph` or ID `F-0031` |

## Roles and permissions

| Feature | Super Admin | Admin (Lab Staff) | User (Student/Faculty) |
|---|---|---|---|
| Dashboard | All records | All records | Own requests only |
| View and search equipment | ✓ | ✓ | ✓ |
| Add and edit equipment | ✓ | ✓ | — |
| Delete equipment | ✓ | — | — |
| View and search borrow requests | All | All | Own only |
| Create a borrow request | For any borrower | For any borrower | For themselves |
| Edit a borrow request | Any open request | Any open request | Own, while Pending |
| Approve, reject, release, return | ✓ | ✓ | — |
| Delete a borrow request | ✓ | ✓ | Own, while Pending (cancel) |
| Manage accounts and roles | ✓ | — | — |
| Activity log | ✓ | — | — |

All the rules live in one place, the `PERMISSIONS` map in `includes/auth.php`. Every page and action checks them on the server, so hiding a menu item is never the only protection. Opening a blocked page by URL shows **Access denied** (HTTP 403) and writes the attempt to the activity log.

## CRUD by module

| Module | Create | Read / Search | Update | Delete |
|---|---|---|---|---|
| Borrow requests (`requests.php`) | New Request form | List with search, filters, sort, pages; details page | Edit form; status changes (approve → release → return, or reject) | Delete / Cancel |
| Equipment (`equipment.php`) | Add Equipment | List with search, category and availability filters | Edit form | Delete (blocked if the item has request history) |
| Accounts (`users.php`, `register.php`, `account.php`) | Sign-up page; New Account (Super Admin) | List with search, role and status filters | Edit account, change role, deactivate, reset password; My Account | Delete (blocked if the user has request history) |
| Activity log (`activity.php`) | Written on every change | Search and filter | — | — |

## Search

Search runs on the server as SQL `LIKE` queries with bound parameters.

- **Borrow requests:** searches request ID, borrower name, borrower ID number, item name, item code, purpose and remarks. You can filter by status (including Overdue), category and borrower type, then sort and page through the results.
- **Equipment:** searches code, name, category, laboratory and description. You can filter by category and availability.
- **Accounts:** searches name, email and ID number. You can filter by role and status.
- **Activity log:** searches the summary text and the person's name.

## How the app uses the database

Tables: `users`, `equipment`, `borrow_requests`, `activity_log`. Foreign keys link each request to its borrower and its equipment.

- **Prepared statements everywhere.** All queries go through PDO prepared statements, in `includes/db.php`.
- **Hashed passwords.** Passwords are stored with `password_hash()`. Sign-in checks them with `password_verify()`.
- **Live sessions.** The signed-in user is reloaded from the database on every request, so a role change or deactivation takes effect immediately.
- **Derived values, not stored ones.**
  - Free units = total units − units on Approved or Borrowed requests. This is computed in SQL.
  - Overdue = Borrowed and past the due date. It is computed from `CURDATE()`, so it is always current.
- **Data protection.**
  - Foreign keys stop anyone from deleting equipment or accounts that have request history. The app suggests marking them Retired or deactivating them instead.
  - Approval is refused when not enough units are free.
- **Request IDs.** Each request ID (`BR-YYYY-NNNN`) is built from the auto-increment key, so an ID is never reused.
- **Form security.** Every form carries a CSRF token, and all output is HTML-escaped.

## Suggested demo order

1. **Sign in as User** (`asantos@…`).
   - The dashboard shows only Andrea's own requests.
   - Create a request (Create).
   - Edit it while it is Pending (Update).
   - Search for another student's name: no results.
   - Open `users.php` in the address bar: Access denied.
2. **Sign in as Admin** (`admin@…`).
   - Find the new request with Search.
   - Approve it, mark it Released, then mark it Returned. Watch the free units change on the Equipment page.
   - Add an item and edit it.
   - Note that there is no Delete button on equipment and no Users page.
3. **Sign in as Super Admin** (`superadmin@…`).
   - Create an account, change its role and deactivate it.
   - Try to delete an item that has history: it is blocked by the foreign key.
   - Delete a request.
   - Show the Activity Log.
4. **Show the database.** In phpMyAdmin, show the same rows changing in `borrow_requests`, `equipment`, `users` and `activity_log`.

## Files

| Path | Purpose |
|---|---|
| `index.php`, `login.php`, `register.php`, `logout.php` | Entry point and authentication |
| `dashboard.php`, `requests.php`, `equipment.php`, `users.php`, `account.php`, `activity.php` | One file per feature |
| `includes/` | Config, database helpers, auth and permissions, shared logic, page layout |
| `css/app/` | Styles for the system: `tokens.css` (colors, spacing, motion, dark mode), `shell.css` (top bar, menu, footer), `components.css` (buttons, forms, tables), `pages.css` (sign-in, dashboard, activity) |
| `includes/icons.php`, `img/logo.svg` | Solar line icons and the LabBorrow logo (a flask inside a return arrow) |
| `js/site.js` | Mobile menu, in-app confirm dialog, filters that apply on change, form helpers |
| `database/labborrow_db.sql` | Full structure and demo records |
| `index.html`, `css/styles.css`, `js/*.js` (except `site.js`), `docs/UNITS-1-3.md` | Earlier front-end prototype (Units 1–3) |

## Design

The interface is a minimal single column. Sections are separated by spacing and 1px lines rather than boxes and shadows. It follows the system light or dark setting.

- **Motion:** short one-time entrance animations that only move or fade elements. They turn off when the device asks for reduced motion.
- **Touch:** every control is at least 44px tall.
- **Confirmations:** deleting anything opens an in-app confirm dialog instead of the browser's pop-up.
- **Icons:** [Solar](https://icon-sets.iconify.design/solar/) by 480 Design, licensed CC BY 4.0. They are bundled in the project, so the system works offline.
