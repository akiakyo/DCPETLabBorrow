<?php
$me = current_user();
$active_nav = $active_nav ?? '';
$nav = [];
if ($me) {
    $nav[] = ['dashboard', 'dashboard.php', 'Dashboard'];
    $nav[] = ['requests', 'requests.php', can('requests.view_all') ? 'Borrow Requests' : 'My Requests'];
    $nav[] = ['new-request', 'requests.php?action=new', 'New Request'];
    $nav[] = ['equipment', 'equipment.php', 'Equipment'];
    if (can('users.manage')) $nav[] = ['users', 'users.php', 'Users'];
    if (can('activity.view')) $nav[] = ['activity', 'activity.php', 'Activity Log'];
    $nav[] = ['account', 'account.php', 'My Account'];
}
?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= e(($page_title ?? 'Home') . ' · ' . APP_NAME) ?></title>
  <link rel="stylesheet" href="css/styles.css">
  <link rel="stylesheet" href="css/app.css">
</head>
<body>
  <a class="skip-link" href="#app">Skip to main content</a>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">LB</span>
        <div>
          <p class="brand-title"><?= e(APP_NAME) ?></p>
          <p class="brand-subtitle">Lab Equipment Borrowing &amp; Inventory System</p>
        </div>
      </div>

      <?php if ($me): ?>
      <section class="session-box" aria-label="Current session">
        <p class="session-text">Signed in as <strong><?= e($me['full_name']) ?></strong></p>
        <div class="session-note">
          <span class="role-tag role-<?= e($me['role']) ?>"><?= e(ROLE_LABELS[$me['role']]) ?></span>
          <form action="logout.php" method="post" class="inline-form">
            <?= csrf_field() ?>
            <button type="submit" class="link-button">Sign Out</button>
          </form>
        </div>
      </section>

      <button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="primary-nav">
        <span aria-hidden="true">☰</span> Menu
      </button>
      <?php endif; ?>
    </header>

    <?php if ($me): ?>
    <nav class="primary-nav" id="primary-nav" aria-label="Primary">
      <ul>
        <?php foreach ($nav as [$key, $href, $label]): ?>
          <li><a href="<?= e($href) ?>"<?= $key === $active_nav ? ' aria-current="page"' : '' ?>><?= e($label) ?></a></li>
        <?php endforeach; ?>
      </ul>
    </nav>
    <?php endif; ?>

    <main id="app" tabindex="-1" class="<?= $me ? '' : 'main-solo' ?>">
      <?php foreach (take_flashes() as $f): ?>
        <div class="alert alert-<?= e($f['tone']) ?>" role="status"><?= e($f['message']) ?></div>
      <?php endforeach; ?>
