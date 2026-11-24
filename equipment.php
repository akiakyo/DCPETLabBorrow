<?php
require __DIR__ . '/includes/auth.php';
require __DIR__ . '/includes/inventory.php';

$me = require_permission('equipment.view');
$action = input('action', 'list');

function read_equipment_form(): array
{
    return [
        'name' => input('name'),
        'category' => input('category'),
        'laboratory' => input('laboratory'),
        'total_units' => input('total_units'),
        'item_condition' => input('item_condition', 'Good'),
        'description' => input('description'),
    ];
}

function validate_equipment(array $d, int $id): array
{
    $errors = [];
    if (mb_strlen($d['name']) < 2 || mb_strlen($d['name']) > 120) $errors['name'] = 'Enter a name (2–120 characters).';
    if (mb_strlen($d['category']) < 2 || mb_strlen($d['category']) > 60) $errors['category'] = 'Enter a category.';
    if (mb_strlen($d['laboratory']) < 2 || mb_strlen($d['laboratory']) > 80) $errors['laboratory'] = 'Enter the laboratory.';
    if (!in_array($d['item_condition'], CONDITIONS, true)) $errors['item_condition'] = 'Choose a condition.';
    if (!ctype_digit((string) $d['total_units']) || (int) $d['total_units'] < 1 || (int) $d['total_units'] > 999) {
        $errors['total_units'] = 'Enter a whole number from 1 to 999.';
    } elseif ($id) {
        // can't shrink below what is already out or approved
        $committed = (int) db_value('SELECT COALESCE(SUM(quantity),0) FROM borrow_requests WHERE equipment_id = ? AND ' . COMMITTED_SQL, [$id]);
        if ((int) $d['total_units'] < $committed) {
            $errors['total_units'] = $committed . ' units are approved or borrowed, so the total can’t go below that.';
        }
    }
    if (mb_strlen($d['description']) > 1000) $errors['description'] = 'Keep the description under 1000 characters.';
    return $errors;
}

/* post: create or update */
if (is_post() && $action === 'save') {
    check_csrf();
    $id = (int) input('id', 0);
    require_permission($id ? 'equipment.update' : 'equipment.create');
    $existing = $id ? find_equipment($id) : null;
    if ($id && !$existing) {
        flash('error', 'That item no longer exists.');
        redirect('equipment.php');
    }
    $d = read_equipment_form();
    $errors = validate_equipment($d, $id);
    if ($errors) {
        $form = $d + ['id' => $id, 'code' => $existing['code'] ?? ''];
        $action = $id ? 'edit' : 'new';
    } else {
        $params = [$d['name'], $d['category'], $d['laboratory'], (int) $d['total_units'], $d['item_condition'], $d['description'] ?: null];
        if ($existing) {
            db_run('UPDATE equipment SET name = ?, category = ?, laboratory = ?, total_units = ?, item_condition = ?, description = ? WHERE id = ?', array_merge($params, [$id]));
            log_activity('update', 'equipment', $id, 'Edited ' . $existing['code'] . ' ' . $d['name']);
            flash('success', $d['name'] . ' was saved.');
        } else {
            $pdo = db();
            $pdo->beginTransaction();
            db_run('INSERT INTO equipment (code, name, category, laboratory, total_units, item_condition, description) VALUES (LEFT(REPLACE(UUID(), \'-\', \'\'), 20), ?, ?, ?, ?, ?, ?)', $params);
            $id = (int) $pdo->lastInsertId();
            $code = sprintf('EQ-%03d', $id);
            db_run('UPDATE equipment SET code = ? WHERE id = ?', [$code, $id]);
            $pdo->commit();
            log_activity('create', 'equipment', $id, 'Added ' . $code . ' ' . $d['name'] . ' (' . (int) $d['total_units'] . ' units)');
            flash('success', $d['name'] . ' was added as ' . $code . '.');
        }
        redirect('equipment.php');
    }
}

/* post: delete */
if (is_post() && $action === 'delete') {
    check_csrf();
    require_permission('equipment.delete');
    $item = find_equipment((int) input('id', 0));
    if (!$item) {
        flash('error', 'That item no longer exists.');
        redirect('equipment.php');
    }
    $history = (int) db_value('SELECT COUNT(*) FROM borrow_requests WHERE equipment_id = ?', [$item['id']]);
    if ($history > 0) {
        // fk keeps request history intact
        flash('error', $item['name'] . ' has ' . $history . ' borrow request' . ($history > 1 ? 's' : '') . ' on record, so it can’t be deleted. Set its condition to Retired instead.');
        redirect('equipment.php');
    }
    db_run('DELETE FROM equipment WHERE id = ?', [$item['id']]);
    log_activity('delete', 'equipment', (int) $item['id'], 'Deleted ' . $item['code'] . ' ' . $item['name']);
    flash('success', $item['name'] . ' was deleted.');
    redirect('equipment.php');
}

$active_nav = 'equipment';

/* form page */
if ($action === 'new' || $action === 'edit') {
    if (!isset($form)) {
        if ($action === 'edit') {
            require_permission('equipment.update');
            $item = find_equipment((int) input('id', 0));
            if (!$item) {
                flash('error', 'That item no longer exists.');
                redirect('equipment.php');
            }
            $form = $item;
        } else {
            require_permission('equipment.create');
            $form = ['id' => 0, 'name' => '', 'category' => '', 'laboratory' => '', 'total_units' => 1, 'item_condition' => 'Good', 'description' => ''];
        }
    }
    $errors = $errors ?? [];
    $isEdit = (int) $form['id'] > 0;
    $categories = distinct_values('category');
    $labs = distinct_values('laboratory');
    $page_title = $isEdit ? 'Edit Equipment' : 'Add Equipment';
    require __DIR__ . '/includes/layout/header.php';
    $err = fn($k) => '<p class="error" id="' . $k . '-error">' . e($errors[$k] ?? '') . '</p>';
    $inv = fn($k) => isset($errors[$k]) ? ' aria-invalid="true" aria-describedby="' . $k . '-error"' : '';
    ?>
    <a class="back-link" href="equipment.php"><?= icon('back') ?>Equipment</a>
    <div class="page-head">
      <div>
        <h1 class="page-title"><?= $isEdit ? 'Edit ' . e($form['name']) : 'Add equipment' ?></h1>
        <p class="page-lead"><?= $isEdit ? e($form['code']) . ' · changes apply to every request right away.' : 'The item code is given automatically.' ?></p>
      </div>
    </div>

    <form method="post" action="equipment.php" class="form" novalidate>
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="save">
      <input type="hidden" name="id" value="<?= (int) $form['id'] ?>">
      <fieldset class="form-section">
        <legend>Item</legend>
        <div class="form-fields">
        <div class="field field-wide">
          <label for="name">Name</label>
          <input id="name" name="name" maxlength="120" value="<?= e($form['name']) ?>"<?= $inv('name') ?>>
          <?= $err('name') ?>
        </div>
        <div class="field">
          <label for="category">Category</label>
          <input id="category" name="category" list="category-list" maxlength="60" value="<?= e($form['category']) ?>"<?= $inv('category') ?>>
          <datalist id="category-list"><?php foreach ($categories as $c): ?><option value="<?= e($c['v']) ?>"><?php endforeach; ?></datalist>
          <?= $err('category') ?>
        </div>
        <div class="field">
          <label for="laboratory">Laboratory</label>
          <input id="laboratory" name="laboratory" list="lab-list" maxlength="80" value="<?= e($form['laboratory']) ?>"<?= $inv('laboratory') ?>>
          <datalist id="lab-list"><?php foreach ($labs as $l): ?><option value="<?= e($l['v']) ?>"><?php endforeach; ?></datalist>
          <?= $err('laboratory') ?>
        </div>
      </div>
      </fieldset>
      <fieldset class="form-section">
        <legend>Stock</legend>
        <div class="form-fields">
        <div class="field">
          <label for="total_units">Total units</label>
          <input id="total_units" name="total_units" type="number" min="1" max="999" inputmode="numeric" value="<?= e($form['total_units']) ?>"<?= $inv('total_units') ?>>
          <?= $err('total_units') ?>
        </div>
        <div class="field">
          <label for="item_condition">Condition</label>
          <select id="item_condition" name="item_condition"<?= $inv('item_condition') ?>>
            <?php foreach (CONDITIONS as $c): ?><option<?= selected($form['item_condition'], $c) ?>><?= e($c) ?></option><?php endforeach; ?>
          </select>
          <p class="hint">Retired items stay on record but can’t be borrowed.</p>
          <?= $err('item_condition') ?>
        </div>
        <div class="field field-wide">
          <label for="description">Description <span class="optional">(optional)</span></label>
          <textarea id="description" name="description" rows="3" maxlength="1000"<?= $inv('description') ?>><?= e($form['description']) ?></textarea>
          <?= $err('description') ?>
        </div>
      </div>
      </fieldset>
      <div class="form-actions">
        <a class="btn btn-tertiary" href="equipment.php">Cancel</a>
        <button type="submit" class="btn btn-primary"><?= icon('check') ?><?= $isEdit ? 'Save Changes' : 'Add Equipment' ?></button>
      </div>
    </form>
    <?php
    require __DIR__ . '/includes/layout/footer.php';
    exit;
}

/* list with search */
$q = input('q');
$category = input('category', 'ALL');
$stock = input('stock', 'ALL');

$where = [];
$args = [];
if ($q !== '') {
    $like = '%' . addcslashes($q, '%_\\') . '%';
    $where[] = '(e.code LIKE ? OR e.name LIKE ? OR e.category LIKE ? OR e.laboratory LIKE ? OR e.description LIKE ?)';
    array_push($args, $like, $like, $like, $like, $like);
}
if ($category !== 'ALL') {
    $where[] = 'e.category = ?';
    $args[] = $category;
}
$having = [
    'available' => 'HAVING available > 0',
    'low' => 'HAVING available > 0 AND available <= e.total_units * 0.25',
    'out' => 'HAVING available <= 0',
][$stock] ?? '';
$items = db_all(EQUIPMENT_SELECT . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " GROUP BY e.id $having ORDER BY e.code", $args);
$categories = distinct_values('category');
$filtered = $q !== '' || $category !== 'ALL' || $stock !== 'ALL';

$page_title = 'Equipment';
require __DIR__ . '/includes/layout/header.php';
?>
<div class="page-head">
  <div>
    <h1 class="page-title">Equipment</h1>
    <p class="page-lead">Free units = total units − units that are approved or borrowed.</p>
  </div>
  <?php if (can('equipment.create')): ?><a class="btn btn-primary" href="equipment.php?action=new"><?= icon('new') ?>Add Equipment</a><?php endif; ?>
</div>

<form class="search" method="get" role="search" aria-label="Search equipment">
  <div class="search-row">
    <div class="search-input">
      <?= icon('search') ?>
      <label for="q" class="visually-hidden">Search</label>
      <input id="q" name="q" type="search" value="<?= e($q) ?>" placeholder="Search code, name, category, lab…">
    </div>
    <button type="submit" class="btn btn-primary">Search</button>
  </div>
  <div class="filters">
    <div class="field">
      <label for="category">Category</label>
      <select id="category" name="category" data-autosubmit>
        <option value="ALL">All categories</option>
        <?php foreach ($categories as $c): ?><option<?= selected($category, $c['v']) ?>><?= e($c['v']) ?></option><?php endforeach; ?>
      </select>
    </div>
    <div class="field">
      <label for="stock">Availability</label>
      <select id="stock" name="stock" data-autosubmit>
        <option value="ALL">Any</option>
        <option value="available"<?= selected($stock, 'available') ?>>Has free units</option>
        <option value="low"<?= selected($stock, 'low') ?>>Running low</option>
        <option value="out"<?= selected($stock, 'out') ?>>None free</option>
      </select>
    </div>
  </div>
</form>

<p class="result-count" role="status"><?= count($items) ?> item<?= count($items) === 1 ? '' : 's' ?><?= $q !== '' ? ' for “' . e($q) . '”' : '' ?><?php if ($filtered): ?> · <a href="equipment.php">Clear filters</a><?php endif; ?></p>

<?php if (!$items): ?>
  <div class="empty">
    <?= icon('search') ?>
    <p><strong>No equipment matches your search.</strong></p>
    <a class="btn" href="equipment.php">Clear Filters</a>
  </div>
<?php else: ?>
  <table class="table">
    <caption class="visually-hidden">Equipment inventory</caption>
    <thead>
      <tr>
        <th scope="col">Code</th>
        <th scope="col">Item</th>
        <th scope="col" class="col-optional">Laboratory</th>
        <th scope="col">Free units</th>
        <th scope="col" class="col-optional">Condition</th>
        <th scope="col"><span class="visually-hidden">Actions</span></th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($items as $it):
          $available = max(0, (int) $it['available']);
          $level = stock_level($available, (int) $it['total_units']);
          $retired = $it['item_condition'] === 'Retired'; ?>
        <tr>
          <td data-label="Code" class="mono"><?= e($it['code']) ?></td>
          <td data-label="Item"><?= e($it['name']) ?><span class="sub"><?= e($it['category']) ?></span></td>
          <td data-label="Laboratory" class="col-optional"><?= e($it['laboratory']) ?></td>
          <td data-label="Free units"><div>
            <strong><?= $available ?></strong> <span class="muted">of <?= (int) $it['total_units'] ?></span>
            <div class="meter" data-level="<?= $level ?>" aria-hidden="true"><span style="width: <?= round($available / max(1, $it['total_units']) * 100) ?>%"></span></div>
            <span class="badge badge-<?= $level ?>"><?= ['OK' => 'In stock', 'LOW' => 'Low', 'OUT' => 'None free'][$level] ?></span>
          </div></td>
          <td data-label="Condition" class="col-optional"><?= e($it['item_condition']) ?></td>
          <td class="cell-actions">
            <?php if (!$retired && $available > 0): ?>
              <a class="btn btn-sm" href="requests.php?action=new&amp;equipment_id=<?= (int) $it['id'] ?>"><?= icon('borrow') ?>Borrow</a>
            <?php endif; ?>
            <?php if (can('equipment.update')): ?>
              <a class="btn btn-sm btn-tertiary" href="equipment.php?action=edit&amp;id=<?= (int) $it['id'] ?>"><?= icon('edit') ?>Edit</a>
            <?php endif; ?>
            <?php if (can('equipment.delete')): ?>
              <form method="post" action="equipment.php" class="inline-form" data-confirm="<?= e($it['name']) ?> (<?= e($it['code']) ?>) will be removed from the database. This can’t be undone." data-confirm-title="Delete this item?" data-confirm-label="Delete">
                <?= csrf_field() ?>
                <input type="hidden" name="action" value="delete">
                <input type="hidden" name="id" value="<?= (int) $it['id'] ?>">
                <button type="submit" class="btn btn-sm btn-danger" aria-label="Delete <?= e($it['name']) ?>"><?= icon('delete') ?>Delete</button>
              </form>
            <?php endif; ?>
          </td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
<?php endif; ?>
<?php require __DIR__ . '/includes/layout/footer.php'; ?>
