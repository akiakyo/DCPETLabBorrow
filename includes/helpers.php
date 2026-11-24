<?php
function e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function redirect(string $to): void
{
    header('Location: ' . $to);
    exit;
}

function is_post(): bool
{
    return $_SERVER['REQUEST_METHOD'] === 'POST';
}

function input(string $key, $default = '')
{
    $value = $_POST[$key] ?? $_GET[$key] ?? $default;
    return is_string($value) ? trim($value) : $value;
}

/* flash messages survive one redirect */
function flash(string $tone, string $message): void
{
    $_SESSION['flash'][] = ['tone' => $tone, 'message' => $message];
}

function take_flashes(): array
{
    $items = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $items;
}

/* csrf */
function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf" value="' . e(csrf_token()) . '">';
}

function check_csrf(): void
{
    $sent = $_POST['csrf'] ?? '';
    if (!is_string($sent) || !hash_equals(csrf_token(), $sent)) {
        http_response_code(400);
        flash('error', 'Your session expired. Please try again.');
        redirect($_SERVER['HTTP_REFERER'] ?? 'dashboard.php');
    }
}

/* dates */
function today(): string
{
    return date('Y-m-d');
}

function fmt_date(?string $iso): string
{
    if (!$iso) return '—';
    return date('M j, Y', strtotime($iso));
}

function fmt_datetime(?string $iso): string
{
    if (!$iso) return '—';
    return date('M j, Y g:i A', strtotime($iso));
}

function is_valid_date(string $value): bool
{
    $d = DateTime::createFromFormat('Y-m-d', $value);
    return $d && $d->format('Y-m-d') === $value;
}

function days_between(string $a, string $b): int
{
    return (int) (new DateTime($a))->diff(new DateTime($b))->format('%r%a');
}

/* labels */
const STATUS_LABELS = [
    'PENDING' => 'Pending',
    'APPROVED' => 'Approved',
    'BORROWED' => 'Borrowed',
    'OVERDUE' => 'Overdue',
    'RETURNED' => 'Returned',
    'REJECTED' => 'Rejected',
];

const ROLE_LABELS = [
    'super_admin' => 'Super Admin',
    'admin' => 'Admin (Lab Staff)',
    'user' => 'User',
];

const PURPOSES = ['Class activity', 'Project', 'Thesis', 'Other'];
const BORROWER_TYPES = ['Student', 'Faculty', 'Staff'];
const CONDITIONS = ['Good', 'Needs calibration', 'Under repair', 'Retired'];

function badge(string $status): string
{
    $label = STATUS_LABELS[$status] ?? $status;
    return '<span class="badge badge-' . e($status) . '">' . e($label) . '</span>';
}

function stock_level(int $available, int $total): string
{
    if ($available <= 0) return 'OUT';
    if ($total > 0 && $available / $total <= 0.25) return 'LOW';
    return 'OK';
}

/* keeps current filters when building links */
function query_with(array $changes): string
{
    $params = array_merge($_GET, $changes);
    $params = array_filter($params, fn($v) => $v !== null && $v !== '');
    return '?' . http_build_query($params);
}

function selected($a, $b): string
{
    return (string) $a === (string) $b ? ' selected' : '';
}

/* audit trail */
function log_activity(string $action, string $entityType, ?int $entityId, string $summary, ?int $actorId = null): void
{
    db_run(
        'INSERT INTO activity_log (user_id, action, entity_type, entity_id, summary) VALUES (?, ?, ?, ?, ?)',
        [$actorId ?? $_SESSION['user_id'] ?? null, $action, $entityType, $entityId, $summary]
    );
}
