<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';

session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
session_name('labborrow');
session_start();

/* one place for every role rule, the pages only ask can() */
const PERMISSIONS = [
    'super_admin' => [
        'dashboard.all', 'equipment.view', 'equipment.create', 'equipment.update', 'equipment.delete',
        'requests.view_all', 'requests.create_for_others', 'requests.update_any', 'requests.process', 'requests.delete_any',
        'users.manage', 'activity.view',
    ],
    'admin' => [
        'dashboard.all', 'equipment.view', 'equipment.create', 'equipment.update',
        'requests.view_all', 'requests.create_for_others', 'requests.update_any', 'requests.process', 'requests.delete_any',
    ],
    'user' => [
        'equipment.view',
    ],
];

// read from the db every request so role changes and deactivation apply at once
function current_user(): ?array
{
    static $user = false;
    if ($user === false) {
        $user = null;
        if (!empty($_SESSION['user_id'])) {
            $user = db_one('SELECT * FROM users WHERE id = ? AND is_active = 1', [$_SESSION['user_id']]);
            if (!$user) {
                $_SESSION = [];
            }
        }
    }
    return $user;
}

function can(string $permission): bool
{
    $user = current_user();
    return $user && in_array($permission, PERMISSIONS[$user['role']] ?? [], true);
}

function require_login(): array
{
    $user = current_user();
    if (!$user) {
        flash('info', 'Please sign in to continue.');
        redirect('login.php');
    }
    return $user;
}

function forbid(): void
{
    http_response_code(403);
    $page_title = 'Access denied';
    require __DIR__ . '/layout/header.php';
    echo '<div class="denied">' . icon('lock')
        . '<h1 class="page-title">Access denied</h1>'
        . '<p class="page-lead">Your role, ' . e(ROLE_LABELS[current_user()['role']]) . ', can’t open this page or do this action.</p>'
        . '<a class="btn btn-primary" href="dashboard.php">' . icon('dashboard') . 'Back to Dashboard</a></div>';
    require __DIR__ . '/layout/footer.php';
    exit;
}

function require_permission(string $permission): array
{
    $user = require_login();
    if (!can($permission)) {
        log_activity('denied', 'page', null, 'Blocked: ' . $permission . ' (' . basename($_SERVER['SCRIPT_NAME']) . ')');
        forbid();
    }
    return $user;
}

function attempt_login(string $login, string $password): ?string
{
    $user = db_one('SELECT * FROM users WHERE email = ? OR school_id = ?', [$login, $login]);
    if (!$user || !password_verify($password, $user['password_hash'])) {
        return 'That email or ID and password don’t match.';
    }
    if (!$user['is_active']) {
        return 'This account is deactivated. Please ask the lab office.';
    }
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $user['id'];
    db_run('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$user['id']]);
    log_activity('login', 'user', (int) $user['id'], $user['full_name'] . ' signed in');
    return null;
}
