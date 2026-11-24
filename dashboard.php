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
<div class="page-head">
  <div>
    <h1 class="page-title"><?= $all ? 'Dashboard' : 'Hi, ' . e(explode(' ', $me['full_name'])[0]) ?></h1>
    <p class="page-lead"><?= $all ? 'Live numbers for every request and item, read from the database.' : 'Here are your borrow requests at a glance.' ?></p>
  </div>
  <a class="btn btn-primary" href="requests.php?action=new"><?= icon('new') ?>New Request</a>
</div>

<div class="stats">
  <div class="stat">
    <p class="stat-label"><?= icon('requests') ?><?= $all ? 'All requests' : 'My requests' ?></p>
    <p class="stat-value"><?= $counts['total'] ?></p>
    <p class="stat-note"><?= $counts['returned'] ?> returned</p>
  </div>
  <div class="stat" data-tone="warning">
    <p class="stat-label"><?= icon('clock') ?>Pending</p>
    <p class="stat-value"><?= $counts['pending'] ?></p>
    <p class="stat-note"><?= $counts['approved'] ?> approved, not picked up</p>
  </div>
  <div class="stat">
    <p class="stat-label"><?= icon('release') ?>Borrowed</p>
    <p class="stat-value"><?= $counts['borrowed'] ?></p>
    <p class="stat-note">Within the due date</p>
  </div>
  <div class="stat"<?= $counts['overdue'] ? ' data-tone="danger"' : '' ?>>
    <p class="stat-label"><?= icon('danger') ?>Overdue</p>
    <p class="stat-value"><?= $counts['overdue'] ?></p>
    <p class="stat-note">Past the due date</p>
  </div>
  <div class="stat">
    <p class="stat-label"><?= icon('equipment') ?>Units free</p>
    <p class="stat-value"><?= max(0, $totalUnits - $committed) ?></p>
    <p class="stat-note">of <?= $totalUnits ?> in the labs</p>
  </div>
</div>

<section class="section" aria-labelledby="status-title">
  <h2 id="status-title" class="section-title">By status</h2>
  <div class="status-row">
    <?php foreach (['pending' => 'PENDING', 'approved' => 'APPROVED', 'borrowed' => 'BORROWED', 'overdue' => 'OVERDUE', 'returned' => 'RETURNED', 'rejected' => 'REJECTED'] as $k => $s): ?>
      <a class="status-chip" href="requests.php?status=<?= $s ?>"><?= badge($s) ?><?= $counts[$k] ?></a>
    <?php endforeach; ?>
  </div>
</section>

<?php if ($overdueList): ?>
<section class="section" aria-labelledby="overdue-title">
  <h2 id="overdue-title" class="section-title">Overdue</h2>
  <ul class="rows">
    <?php foreach ($overdueList as $r): ?>
      <li>
        <a class="row-link" href="requests.php?action=view&amp;id=<?= (int) $r['id'] ?>">
          <span class="row-main"><span class="row-title"><?= e($r['equipment_name']) ?></span>
            <span class="sub"><?= e($r['borrower_name']) ?> · due <?= fmt_date($r['due_date']) ?></span></span>
          <span class="badge badge-OVERDUE"><?= (int) $r['days_overdue'] ?> day<?= $r['days_overdue'] == 1 ? '' : 's' ?> late</span>
          <?= icon('next', 'chev') ?>
        </a>
      </li>
    <?php endforeach; ?>
  </ul>
</section>
<?php endif; ?>

<section class="section" aria-labelledby="recent-title">
  <h2 id="recent-title" class="section-title">Recent requests</h2>
  <?php if (!$recent): ?>
    <div class="empty">
      <?= icon('inbox') ?>
      <p><strong>No borrow requests yet.</strong></p>
      <a class="btn btn-primary" href="requests.php?action=new"><?= icon('new') ?>New Request</a>
    </div>
  <?php else: ?>
    <ul class="rows">
      <?php foreach ($recent as $r): ?>
        <li>
          <a class="row-link" href="requests.php?action=view&amp;id=<?= (int) $r['id'] ?>">
            <span class="row-main"><span class="row-title"><?= e($r['equipment_name']) ?></span>
              <span class="sub"><?= e($r['code']) ?><?= $all ? ' · ' . e($r['borrower_name']) : '' ?> · <?= fmt_date($r['borrow_date']) ?></span></span>
            <?= badge($r['display_status']) ?>
            <?= icon('next', 'chev') ?>
          </a>
        </li>
      <?php endforeach; ?>
    </ul>
  <?php endif; ?>
</section>
<?php require __DIR__ . '/includes/layout/footer.php'; ?>
