<?php
require __DIR__ . '/includes/auth.php';
require __DIR__ . '/includes/inventory.php';

$me = require_login();
$all = can('dashboard.all');

// users only see their own numbers
$scope = $all ? '1=1' : 'r.user_id = ?';
$args = $all ? [] : [$me['id']];

$counts = db_one("
  SELECT COUNT(*) AS total,
         SUM(r.status = 'PENDING') AS pending,
         SUM(r.status = 'APPROVED') AS approved,
         SUM(r.status = 'BORROWED' AND r.due_date >= CURDATE()) AS borrowed,
         SUM(r.status = 'BORROWED' AND r.due_date < CURDATE()) AS overdue,
         SUM(r.status = 'RETURNED') AS returned,
         SUM(r.status = 'REJECTED') AS rejected
  FROM borrow_requests r WHERE $scope", $args);
$counts = array_map('intval', $counts);

$units = db_one('SELECT SUM(total_units) AS total FROM equipment WHERE item_condition <> \'Retired\'');
$committed = (int) db_value("SELECT COALESCE(SUM(r.quantity),0) FROM borrow_requests r JOIN equipment e ON e.id = r.equipment_id WHERE e.item_condition <> 'Retired' AND r." . COMMITTED_SQL);
$totalUnits = (int) $units['total'];

$recent = db_all(REQUEST_SELECT . " WHERE $scope ORDER BY r.created_at DESC LIMIT 5", $args);
$overdueList = db_all(REQUEST_SELECT . " WHERE $scope AND r.status = 'BORROWED' AND r.due_date < CURDATE() ORDER BY r.due_date LIMIT 5", $args);

$page_title = 'Dashboard';
$active_nav = 'dashboard';
require __DIR__ . '/includes/layout/header.php';
?>
<h1 class="view-title">Dashboard</h1>
<p class="view-lead">
  <?= $all
      ? 'Live numbers for every borrow request and item, read from the database.'
      : 'Hi, ' . e(explode(' ', $me['full_name'])[0]) . '. Here are your borrow requests at a glance.' ?>
</p>

<div class="kpi-grid">
  <div class="kpi-card"><p class="kpi-label"><?= $all ? 'All requests' : 'My requests' ?></p><p class="kpi-value"><?= $counts['total'] ?></p><p class="kpi-note"><?= $counts['returned'] ?> returned</p></div>
  <div class="kpi-card" data-tone="warning"><p class="kpi-label">Pending approval</p><p class="kpi-value"><?= $counts['pending'] ?></p><p class="kpi-note"><?= $counts['approved'] ?> approved, waiting for pickup</p></div>
  <div class="kpi-card"><p class="kpi-label">Borrowed now</p><p class="kpi-value"><?= $counts['borrowed'] ?></p><p class="kpi-note">Within the due date</p></div>
  <div class="kpi-card" data-tone="danger"><p class="kpi-label">Overdue</p><p class="kpi-value"><?= $counts['overdue'] ?></p><p class="kpi-note">Past the due date</p></div>
  <div class="kpi-card" data-tone="success"><p class="kpi-label">Units available</p><p class="kpi-value"><?= max(0, $totalUnits - $committed) ?></p><p class="kpi-note">of <?= $totalUnits ?> units in the labs</p></div>
</div>

<div class="dashboard-grid">
  <section class="panel" aria-labelledby="recent-title">
    <h2 id="recent-title">Recent requests</h2>
    <?php if (!$recent): ?>
      <p class="empty-note">No borrow requests yet. <a href="requests.php?action=new">Make your first request</a>.</p>
    <?php else: ?>
      <ul class="recent-list">
        <?php foreach ($recent as $r): ?>
          <li>
            <a class="recent-link" href="requests.php?action=view&amp;id=<?= (int) $r['id'] ?>">
              <span><span class="recent-title"><?= e($r['equipment_name']) ?></span>
                <span class="recent-meta"><?= e($r['code']) ?><?= $all ? ' · ' . e($r['borrower_name']) : '' ?></span></span>
              <?= badge($r['display_status']) ?>
            </a>
          </li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  </section>

  <section class="panel" aria-labelledby="overdue-title">
    <h2 id="overdue-title">Overdue items</h2>
    <?php if (!$overdueList): ?>
      <p class="empty-note">Nothing is overdue.</p>
    <?php else: ?>
      <ul class="recent-list">
        <?php foreach ($overdueList as $r): ?>
          <li>
            <a class="recent-link" href="requests.php?action=view&amp;id=<?= (int) $r['id'] ?>">
              <span><span class="recent-title"><?= e($r['equipment_name']) ?></span>
                <span class="recent-meta"><?= e($r['borrower_name']) ?> · due <?= fmt_date($r['due_date']) ?></span></span>
              <span class="badge badge-OVERDUE"><?= (int) $r['days_overdue'] ?> day<?= $r['days_overdue'] == 1 ? '' : 's' ?> late</span>
            </a>
          </li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  </section>

  <section class="panel" aria-labelledby="status-title">
    <h2 id="status-title">Requests by status</h2>
    <ul class="status-list">
      <?php foreach (['pending' => 'PENDING', 'approved' => 'APPROVED', 'borrowed' => 'BORROWED', 'overdue' => 'OVERDUE', 'returned' => 'RETURNED', 'rejected' => 'REJECTED'] as $k => $s): ?>
        <li><a href="requests.php?status=<?= $s ?>"><?= badge($s) ?></a><strong><?= $counts[$k] ?></strong></li>
      <?php endforeach; ?>
    </ul>
  </section>
</div>
<?php require __DIR__ . '/includes/layout/footer.php'; ?>
