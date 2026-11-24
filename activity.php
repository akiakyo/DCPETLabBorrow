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
<div class="page-head">
  <div>
    <h1 class="page-title">Activity log</h1>
    <p class="page-lead">Every sign-in, change and blocked attempt is saved in the <code>activity_log</code> table.</p>
  </div>
</div>

<form class="search" method="get" role="search" aria-label="Search activity">
  <div class="search-row">
    <div class="search-input">
      <?= icon('search') ?>
      <label for="q" class="visually-hidden">Search</label>
      <input id="q" name="q" type="search" value="<?= e($q) ?>" placeholder="Search name, request ID, item…">
    </div>
    <button type="submit" class="btn btn-primary">Search</button>
  </div>
  <div class="filters">
    <div class="field">
      <label for="type">Record type</label>
      <select id="type" name="type" data-autosubmit>
        <option value="ALL">Everything</option>
        <?php foreach ($types as $k => $label): ?><option value="<?= $k ?>"<?= selected($type, $k) ?>><?= $label ?></option><?php endforeach; ?>
      </select>
    </div>
  </div>
</form>

<p class="result-count" role="status"><?= $total ?> entr<?= $total === 1 ? 'y' : 'ies' ?><?php if ($q !== '' || $type !== 'ALL'): ?> · <a href="activity.php">Clear filters</a><?php endif; ?></p>

<?php if (!$rows): ?>
  <div class="empty"><?= icon('activity') ?><p><strong>No activity matches your search.</strong></p></div>
<?php else: ?>
  <ol class="timeline">
    <?php foreach ($rows as $a): ?>
      <li>
        <time datetime="<?= e($a['created_at']) ?>"><?= fmt_datetime($a['created_at']) ?></time>
        <span><?= e($a['summary']) ?>
          <span class="sub"><?= e($a['full_name'] ?? 'Guest') ?><?= $a['role'] ? ' · ' . e(ROLE_LABELS[$a['role']]) : '' ?></span></span>
      </li>
    <?php endforeach; ?>
  </ol>
  <?php if ($pages > 1): ?>
    <nav class="pagination" aria-label="Pages">
      <?php if ($page > 1): ?><a class="btn btn-tertiary" href="<?= e(query_with(['page' => $page - 1])) ?>"><?= icon('back') ?>Newer</a><?php endif; ?>
      <span>Page <?= $page ?> of <?= $pages ?></span>
      <?php if ($page < $pages): ?><a class="btn btn-tertiary" href="<?= e(query_with(['page' => $page + 1])) ?>">Older<?= icon('next') ?></a><?php endif; ?>
    </nav>
  <?php endif; ?>
<?php endif; ?>
<?php require __DIR__ . '/includes/layout/footer.php'; ?>
