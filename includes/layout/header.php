<?php
require_once __DIR__ . '/../icons.php';
$me = current_user();
$active_nav = $active_nav ?? '';
$nav = [];
if ($me) {
    $nav[] = ['dashboard', 'dashboard.php', 'Dashboard', 'dashboard'];
    $nav[] = ['requests', 'requests.php', can('requests.view_all') ? 'Borrow Requests' : 'My Requests', 'requests'];
    $nav[] = ['new-request', 'requests.php?action=new', 'New Request', 'new'];
    $nav[] = ['equipment', 'equipment.php', 'Equipment', 'equipment'];
    if (can('users.manage')) $nav[] = ['users', 'users.php', 'Users', 'users'];
    if (can('activity.view')) $nav[] = ['activity', 'activity.php', 'Activity Log', 'activity'];
    $nav[] = ['account', 'account.php', 'My Account', 'account'];

    // two initials for the avatar
    $parts = preg_split('/\s+/', preg_replace('/^(Dr|Engr|Prof|Mr|Ms|Mrs)\.?\s+/i', '', $me['full_name']));
    $initials = strtoupper(mb_substr($parts[0], 0, 1) . (count($parts) > 1 ? mb_substr(end($parts), 0, 1) : ''));
}
$flashIcons = ['success' => 'check', 'error' => 'danger', 'info' => 'info', 'warning' => 'danger'];
?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1f5fbf">
  <title><?= e(($page_title ?? 'Home') . ' · ' . APP_NAME) ?></title>
  <link rel="icon" href="img/logo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="css/app/tokens.css">
  <link rel="stylesheet" href="css/app/shell.css">
  <link rel="stylesheet" href="css/app/components.css">
  <link rel="stylesheet" href="css/app/pages.css">
</head>
<body>
  <a class="skip-link" href="#app">Skip to main content</a>

  <header class="topbar">
    <a class="brand" href="<?= $me ? 'dashboard.php' : 'login.php' ?>" aria-label="<?= e(APP_NAME) ?> home">
      <?= logo_mark() ?>
      <span class="brand-text"><span class="brand-name"><?= e(APP_NAME) ?></span><span class="brand-sub">Lab Equipment Borrowing &amp; Inventory</span></span>
    </a>

    <?php if ($me): ?>
      <div class="session">
        <a class="account-chip" href="account.php" title="My Account">
          <span class="avatar avatar-<?= e($me['role']) ?>" aria-hidden="true"><?= e($initials) ?></span>
          <span class="account-text">
            <span class="account-name"><?= e($me['full_name']) ?></span>
            <span class="account-role"><?= e(ROLE_LABELS[$me['role']]) ?></span>
          </span>
        </a>
        <span class="topbar-divider" aria-hidden="true"></span>
        <form action="logout.php" method="post" class="inline-form">
          <?= csrf_field() ?>
          <button type="submit" class="btn btn-tertiary signout" aria-label="Sign Out"><?= icon('logout') ?><span class="signout-label">Sign Out</span></button>
        </form>
        <button type="button" class="btn btn-tertiary nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="sidenav" aria-label="Menu">
          <?= icon('menu') ?>
        </button>
      </div>
    <?php elseif (basename($_SERVER['SCRIPT_NAME']) !== 'register.php'): ?>
      <a class="btn btn-tertiary topbar-link" href="register.php"><?= icon('user-plus') ?>Create Account</a>
    <?php else: ?>
      <a class="btn btn-tertiary topbar-link" href="login.php"><?= icon('login') ?>Sign In</a>
    <?php endif; ?>
  </header>

  <div class="layout<?= $me ? ' has-nav' : '' ?>">
    <?php if ($me): ?>
      <nav class="sidenav" id="sidenav" aria-label="Primary">
        <div class="nav-user">
          <span class="avatar avatar-<?= e($me['role']) ?>" aria-hidden="true"><?= e($initials) ?></span>
          <span><span class="account-name"><?= e($me['full_name']) ?></span><span class="account-role"><?= e(ROLE_LABELS[$me['role']]) ?></span></span>
        </div>
        <ul>
          <?php foreach ($nav as [$key, $href, $label, $ic]): ?>
            <li><a href="<?= e($href) ?>"<?= $key === $active_nav ? ' aria-current="page"' : '' ?>><?= icon($ic) ?><?= e($label) ?></a></li>
          <?php endforeach; ?>
        </ul>
      </nav>
    <?php endif; ?>

    <div class="main-col">
    <main id="app" tabindex="-1" class="content<?= $me ? '' : ' content-solo' ?>">
      <?php foreach (take_flashes() as $f): ?>
        <div class="flash flash-<?= e($f['tone']) ?>" role="status"><?= icon($flashIcons[$f['tone']] ?? 'info') ?><p><?= e($f['message']) ?></p></div>
      <?php endforeach; ?>
