<?php
// approved and borrowed requests take units out of available
const COMMITTED_SQL = "status IN ('APPROVED','BORROWED')";

// request row with joins and derived fields (display_status, days_overdue)
const REQUEST_SELECT = "
  SELECT r.*,
         u.full_name AS borrower_name, u.school_id AS borrower_school_id,
         u.borrower_type, u.email AS borrower_email,
         e.code AS equipment_code, e.name AS equipment_name, e.category, e.laboratory,
         c.full_name AS created_by_name, p.full_name AS processed_by_name,
         CASE WHEN r.status = 'BORROWED' AND r.due_date < CURDATE() THEN 'OVERDUE' ELSE r.status END AS display_status,
         CASE WHEN r.status = 'BORROWED' AND r.due_date < CURDATE() THEN DATEDIFF(CURDATE(), r.due_date) ELSE 0 END AS days_overdue,
         DATEDIFF(r.due_date, r.borrow_date) + 1 AS loan_days
  FROM borrow_requests r
  JOIN users u ON u.id = r.user_id
  JOIN equipment e ON e.id = r.equipment_id
  LEFT JOIN users c ON c.id = r.created_by
  LEFT JOIN users p ON p.id = r.processed_by
";

const EQUIPMENT_SELECT = "
  SELECT e.*,
         COALESCE(SUM(CASE WHEN r.status IN ('APPROVED','BORROWED') THEN r.quantity END), 0) AS committed,
         e.total_units - COALESCE(SUM(CASE WHEN r.status IN ('APPROVED','BORROWED') THEN r.quantity END), 0) AS available
  FROM equipment e
  LEFT JOIN borrow_requests r ON r.equipment_id = e.id
";

function find_request(int $id): ?array
{
    return db_one(REQUEST_SELECT . ' WHERE r.id = ?', [$id]);
}

function find_equipment(int $id): ?array
{
    return db_one(EQUIPMENT_SELECT . ' WHERE e.id = ? GROUP BY e.id', [$id]);
}

// units free right now, optionally ignoring one request (when editing it)
function available_units(int $equipmentId, int $excludeRequestId = 0): int
{
    $total = (int) db_value('SELECT total_units FROM equipment WHERE id = ?', [$equipmentId]);
    $committed = (int) db_value(
        'SELECT COALESCE(SUM(quantity), 0) FROM borrow_requests WHERE equipment_id = ? AND id <> ? AND ' . COMMITTED_SQL,
        [$equipmentId, $excludeRequestId]
    );
    return max(0, $total - $committed);
}

function equipment_options(): array
{
    return db_all(EQUIPMENT_SELECT . " WHERE e.item_condition <> 'Retired' GROUP BY e.id ORDER BY e.name");
}

function distinct_values(string $column): array
{
    // column comes from code, never from input
    return db_all("SELECT DISTINCT $column AS v FROM equipment ORDER BY $column");
}
