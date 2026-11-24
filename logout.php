<?php
require __DIR__ . '/includes/auth.php';

if (is_post()) {
    check_csrf();
    if ($me = current_user()) {
        log_activity('logout', 'user', (int) $me['id'], $me['full_name'] . ' signed out');
    }
    $_SESSION = [];
    session_regenerate_id(true);
    flash('success', 'You’re signed out.');
}
redirect('login.php');
