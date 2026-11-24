<?php
require __DIR__ . '/includes/auth.php';

require_permission('activity.view');

$q = input('q');
$type = input('type', 'ALL');
$page = max(1, (int) input('page', 1));
$types = ['request' => 'Borrow requests', 'equipment' => 'Equipment', 'user' => 'Accounts', 'page' => 'Blocked access'];

$where = [];
$args = [];
if ($q !== '') {
    $like = '%' . addcslashes($q, '%_\\') . '%';
    $where[] = '(a.summary LIKE ? OR u.full_name LIKE ?)';
    array_push($args, $like, $like);
}
if (isset($types[$type])) {
    $where[] = 'a.entity_type = ?';
    $args[] = $type;
}
$whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
$total = (int) db_value('SELECT COUNT(*) FROM activity_log a LEFT JOIN users u ON u.id = a.user_id' . $whereSql, $args);
$pages = max(1, (int) ceil($total / 20));
$page = min($page, $pages);
$rows = db_all('SELECT a.*, u.full_name, u.role FROM activity_log a LEFT JOIN users u ON u.id = a.user_id'
    . $whereSql . ' ORDER BY a.id DESC LIMIT 20 OFFSET ' . (($page - 1) * 20), $args);

$page_title = 'Activity Log';
$active_nav = 'activity';
require __DIR__ . '/includes/layout/header.php';
?>
<h1 class="view-title">Activity log</h1>
<p class="view-lead">Every sign-in, change and blocked attempt is written to the <code>activity_log</code> table.</p>

<form class="toolbar" method="get" role="search" aria-label="Search activity">
  <div class="field">
    <label for="q">Search</label>
    <input id="q" name="q" type="search" value="<?= e($q) ?>" placeholder="Name, request ID, item…">
  </div>
  <div class="field">
    <label for="type">Record type</label>
    <select id="type" name="type">
      <option value="ALL">Everything</option>
      <?php foreach ($types as $k => $label): ?><option value="<?= $k ?>"<?= selected($type, $k) ?>><?= $label ?></option><?php endforeach; ?>
    </select>
  </div>
  <div class="toolbar-actions">
    <button type="submit" class="btn btn-primary">Search</button>
    <?php if ($q !== '' || $type !== 'ALL'): ?><a class="btn" href="activity.php">Clear</a><?php endif; ?>
  </div>
</form>

<p class="result-count" role="status"><?= $total ?> entr<?= $total === 1 ? 'y' : 'ies' ?></p>

<?php if (!$rows): ?>
  <div class="empty-state"><p><strong>No activity matches your search.</strong></p></div>
<?php else: ?>
  <ol class="activity-list">
    <?php foreach ($rows as $a): ?>
      <li>
        <span class="activity-when"><?= fmt_datetime($a['created_at']) ?></span>
        <span><?= e($a['summary']) ?>
          <span class="cell-sub"><?= e($a['full_name'] ?? 'Guest') ?><?= $a['role'] ? ' · ' . e(ROLE_LABELS[$a['role']]) : '' ?> · <?= e($a['action']) ?></span></span>
      </li>
    <?php endforeach; ?>
  </ol>
  <?php if ($pages > 1): ?>
    <nav class="pagination" aria-label="Pages">
      <?php if ($page > 1): ?><a class="btn btn-sm" href="<?= e(query_with(['page' => $page - 1])) ?>">Newer</a><?php else: ?><span></span><?php endif; ?>
      <span>Page <?= $page ?> of <?= $pages ?></span>
      <?php if ($page < $pages): ?><a class="btn btn-sm" href="<?= e(query_with(['page' => $page + 1])) ?>">Older</a><?php else: ?><span></span><?php endif; ?>
    </nav>
  <?php endif; ?>
<?php endif; ?>
<?php require __DIR__ . '/includes/layout/footer.php'; ?>
