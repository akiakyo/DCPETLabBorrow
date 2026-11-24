<?php
require __DIR__ . '/includes/auth.php';
require __DIR__ . '/includes/inventory.php';

$me = require_login();
$action = input('action', 'list');

/* who may do what with one request */
function owns(array $r): bool
{
    return (int) $r['user_id'] === (int) current_user()['id'];
}

function can_view_request(array $r): bool
{
    return can('requests.view_all') || owns($r);
}

function can_edit_request(array $r): bool
{
    if (can('requests.update_any')) return in_array($r['status'], ['PENDING', 'APPROVED', 'BORROWED'], true);
    return owns($r) && $r['status'] === 'PENDING';
}

function can_delete_request(array $r): bool
{
    return can('requests.delete_any') || (owns($r) && $r['status'] === 'PENDING');
}

function load_request_or_404(): array
{
    $r = find_request((int) input('id', 0));
    if (!$r) {
        flash('error', 'That borrow request no longer exists.');
        redirect('requests.php');
    }
    if (!can_view_request($r)) {
        forbid();
    }
    return $r;
}

/* post: create or update */
if (is_post() && $action === 'save') {
    check_csrf();
    $id = (int) input('id', 0);
    $existing = $id ? load_request_or_404() : null;
    if ($existing && !can_edit_request($existing)) {
        forbid();
    }

    $d = [
        'user_id' => can('requests.create_for_others') ? (int) input('user_id', 0) : (int) $me['id'],
        'equipment_id' => (int) input('equipment_id', 0),
        'quantity' => input('quantity'),
        'purpose' => input('purpose'),
        'purpose_details' => input('purpose_details'),
        'borrow_date' => input('borrow_date'),
        'due_date' => input('due_date'),
        'remarks' => can('requests.update_any') ? input('remarks') : ($existing['remarks'] ?? ''),
    ];
    // a user editing keeps the original borrower
    if ($existing && !can('requests.create_for_others')) {
        $d['user_id'] = (int) $existing['user_id'];
    }

    $errors = [];
    $borrower = db_one('SELECT id, full_name FROM users WHERE id = ? AND is_active = 1', [$d['user_id']]);
    if (!$borrower) $errors['user_id'] = 'Choose an active borrower.';

    $equipment = find_equipment($d['equipment_id']);
    $sameItem = $existing && (int) $existing['equipment_id'] === $d['equipment_id'];
    if (!$equipment) {
        $errors['equipment_id'] = 'Choose an item.';
    } elseif ($equipment['item_condition'] === 'Retired' && !$sameItem) {
        $errors['equipment_id'] = 'This item is retired and can’t be borrowed.';
    }

    if (!ctype_digit((string) $d['quantity']) || (int) $d['quantity'] < 1) {
        $errors['quantity'] = 'Enter a whole number of at least 1.';
    } elseif ($equipment) {
        $free = available_units($equipment['id'], $id);
        if ((int) $d['quantity'] > $free) {
            $errors['quantity'] = 'Only ' . $free . ' of ' . $equipment['total_units'] . ' units are free right now.';
        }
    }

    if (!in_array($d['purpose'], PURPOSES, true)) {
        $errors['purpose'] = 'Choose a purpose.';
    } elseif ($d['purpose'] === 'Other' && mb_strlen($d['purpose_details']) < 3) {
        $errors['purpose_details'] = 'Tell us what the item is for.';
    }
    if ($d['purpose'] !== 'Other') $d['purpose_details'] = '';
    if (mb_strlen($d['purpose_details']) > 255) $errors['purpose_details'] = 'Keep it under 255 characters.';

    $dateChanged = !$existing || $existing['borrow_date'] !== $d['borrow_date'];
    if (!is_valid_date($d['borrow_date'])) {
        $errors['borrow_date'] = 'Pick a borrow date.';
    } elseif ($dateChanged && $d['borrow_date'] < today()) {
        $errors['borrow_date'] = 'The borrow date can’t be in the past.';
    }
    if (!is_valid_date($d['due_date'])) {
        $errors['due_date'] = 'Pick a due date.';
    } elseif (!isset($errors['borrow_date']) && $d['due_date'] < $d['borrow_date']) {
        $errors['due_date'] = 'The due date must be on or after the borrow date.';
    } elseif (!isset($errors['borrow_date']) && days_between($d['borrow_date'], $d['due_date']) + 1 > MAX_LOAN_DAYS) {
        $errors['due_date'] = 'Loans can be at most ' . MAX_LOAN_DAYS . ' days.';
    }
    if (mb_strlen((string) $d['remarks']) > 255) $errors['remarks'] = 'Keep remarks under 255 characters.';

    if ($errors) {
        $form = $d + ['id' => $id, 'code' => $existing['code'] ?? ''];
        $action = $id ? 'edit' : 'new';
    } else {
        $params = [$d['user_id'], $d['equipment_id'], (int) $d['quantity'], $d['purpose'], $d['purpose_details'] ?: null,
                   $d['borrow_date'], $d['due_date'], $d['remarks'] ?: null];
        if ($existing) {
            db_run('UPDATE borrow_requests SET user_id = ?, equipment_id = ?, quantity = ?, purpose = ?, purpose_details = ?,
                    borrow_date = ?, due_date = ?, remarks = ? WHERE id = ?', array_merge($params, [$id]));
            log_activity('update', 'request', $id, 'Edited ' . $existing['code']);
            flash('success', $existing['code'] . ' was saved.');
        } else {
            $pdo = db();
            $pdo->beginTransaction();
            db_run('INSERT INTO borrow_requests (user_id, equipment_id, quantity, purpose, purpose_details, borrow_date, due_date, remarks, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', array_merge($params, [$me['id']]));
            $id = (int) $pdo->lastInsertId();
            // stable id from the auto increment, never reused
            $code = sprintf('BR-%s-%04d', date('Y'), $id);
            db_run('UPDATE borrow_requests SET code = ? WHERE id = ?', [$code, $id]);
            $pdo->commit();
            log_activity('create', 'request', $id, 'Created ' . $code . ' for ' . $borrower['full_name'] . ' (' . $equipment['name'] . ' × ' . (int) $d['quantity'] . ')');
            flash('success', $code . ' was submitted. Lab staff will review it.');
        }
        redirect('requests.php?action=view&id=' . $id);
    }
}

/* post: status changes, staff only */
if (is_post() && $action === 'process') {
    check_csrf();
    require_permission('requests.process');
    $r = load_request_or_404();
    $to = input('to');
    $note = mb_substr(input('note'), 0, 255);
    $allowed = [
        'approve' => ['PENDING'],
        'reject' => ['PENDING', 'APPROVED'],
        'release' => ['APPROVED'],
        'return' => ['BORROWED'],
    ];
    if (!isset($allowed[$to]) || !in_array($r['status'], $allowed[$to], true)) {
        flash('error', 'That step isn’t possible for a ' . strtolower(STATUS_LABELS[$r['status']]) . ' request.');
        redirect('requests.php?action=view&id=' . $r['id']);
    }
    if ($to === 'approve' && available_units((int) $r['equipment_id'], (int) $r['id']) < (int) $r['quantity']) {
        flash('error', 'Not enough free units of ' . $r['equipment_name'] . ' to approve this request.');
        redirect('requests.php?action=view&id=' . $r['id']);
    }
    if ($to === 'reject' && $note === '') {
        flash('error', 'Add a reason so the borrower knows why it was rejected.');
        redirect('requests.php?action=view&id=' . $r['id']);
    }
    $status = ['approve' => 'APPROVED', 'reject' => 'REJECTED', 'release' => 'BORROWED', 'return' => 'RETURNED'][$to];
    db_run(
        'UPDATE borrow_requests SET status = ?, processed_by = ?, remarks = COALESCE(NULLIF(?, \'\'), remarks),
                returned_date = IF(? = \'RETURNED\', CURDATE(), returned_date) WHERE id = ?',
        [$status, $me['id'], $note, $status, $r['id']]
    );
    log_activity('status', 'request', (int) $r['id'], $r['code'] . ': ' . STATUS_LABELS[$r['status']] . ' → ' . STATUS_LABELS[$status]);
    flash('success', $r['code'] . ' is now ' . strtolower(STATUS_LABELS[$status]) . '.');
    redirect('requests.php?action=view&id=' . $r['id']);
}

/* post: delete */
if (is_post() && $action === 'delete') {
    check_csrf();
    $r = load_request_or_404();
    if (!can_delete_request($r)) {
        forbid();
    }
    db_run('DELETE FROM borrow_requests WHERE id = ?', [$r['id']]);
    log_activity('delete', 'request', (int) $r['id'], 'Deleted ' . $r['code'] . ' (' . $r['borrower_name'] . ', ' . $r['equipment_name'] . ')');
    flash('success', $r['code'] . ' was deleted.');
    redirect('requests.php');
}

/* ---------- pages ---------- */
$active_nav = 'requests';

if ($action === 'new' || $action === 'edit') {
    if ($action === 'edit' && !isset($form)) {
        $r = load_request_or_404();
        if (!can_edit_request($r)) forbid();
        $form = $r;
    }
    $form = $form ?? [
        'id' => 0, 'user_id' => $me['id'], 'equipment_id' => (int) input('equipment_id', 0), 'quantity' => 1,
        'purpose' => '', 'purpose_details' => '', 'borrow_date' => today(), 'due_date' => date('Y-m-d', strtotime('+3 days')), 'remarks' => '',
    ];
    $errors = $errors ?? [];
    $isEdit = (int) $form['id'] > 0;
    $items = equipment_options();
    $borrowers = can('requests.create_for_others')
        ? db_all("SELECT id, full_name, school_id, borrower_type FROM users WHERE is_active = 1 ORDER BY role = 'user' DESC, full_name")
        : [];

    $page_title = $isEdit ? 'Edit Request' : 'New Request';
    $active_nav = $isEdit ? 'requests' : 'new-request';
    require __DIR__ . '/includes/layout/header.php';
    $err = fn($k) => '<p class="error" id="' . $k . '-error">' . e($errors[$k] ?? '') . '</p>';
    $inv = fn($k) => isset($errors[$k]) ? ' aria-invalid="true" aria-describedby="' . $k . '-error"' : '';
    ?>
    <h1 class="view-title"><?= $isEdit ? 'Edit ' . e($form['code'] ?? 'request') : 'New borrow request' ?></h1>
    <p class="view-lead">
      <?= can('requests.create_for_others') ? 'Lab staff can file a request for any borrower.' : 'Your request goes to the lab staff for approval.' ?>
      Loans run up to <?= MAX_LOAN_DAYS ?> days.
    </p>

    <?php if ($errors): ?>
      <div class="alert alert-error" role="alert"><p style="margin:0">Please fix the <?= count($errors) ?> highlighted field<?= count($errors) > 1 ? 's' : '' ?> below.</p></div>
    <?php endif; ?>

    <form method="post" action="requests.php" class="form-grid" novalidate>
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="save">
      <input type="hidden" name="id" value="<?= (int) $form['id'] ?>">

      <fieldset>
        <legend>Borrower</legend>
        <?php if (can('requests.create_for_others')): ?>
          <div class="field field-wide">
            <label for="user_id">Borrower</label>
            <select id="user_id" name="user_id"<?= $inv('user_id') ?>>
              <?php foreach ($borrowers as $b): ?>
                <option value="<?= (int) $b['id'] ?>"<?= selected($form['user_id'], $b['id']) ?>><?= e($b['full_name'] . ' · ' . $b['school_id'] . ' (' . $b['borrower_type'] . ')') ?></option>
              <?php endforeach; ?>
            </select>
            <?= $err('user_id') ?>
          </div>
        <?php else: ?>
          <p class="field-wide" style="margin:0"><strong><?= e($me['full_name']) ?></strong> <span class="cell-sub"><?= e($me['school_id'] . ' · ' . $me['borrower_type']) ?></span></p>
        <?php endif; ?>
      </fieldset>

      <fieldset>
        <legend>Equipment</legend>
        <div class="field field-wide">
          <label for="equipment_id">Item</label>
          <select id="equipment_id" name="equipment_id"<?= $inv('equipment_id') ?>>
            <option value="">Choose an item…</option>
            <?php foreach ($items as $it): ?>
              <option value="<?= (int) $it['id'] ?>"<?= selected($form['equipment_id'], $it['id']) ?>>
                <?= e($it['name'] . ' (' . $it['code'] . ') — ' . max(0, $it['available']) . ' of ' . $it['total_units'] . ' free') ?>
              </option>
            <?php endforeach; ?>
          </select>
          <?= $err('equipment_id') ?>
        </div>
        <div class="field">
          <label for="quantity">Quantity</label>
          <input id="quantity" name="quantity" type="number" min="1" inputmode="numeric" value="<?= e($form['quantity']) ?>"<?= $inv('quantity') ?>>
          <?= $err('quantity') ?>
        </div>
      </fieldset>

      <fieldset>
        <legend>Purpose and dates</legend>
        <div class="field">
          <label for="purpose">Purpose</label>
          <select id="purpose" name="purpose"<?= $inv('purpose') ?>>
            <option value="">Choose…</option>
            <?php foreach (PURPOSES as $p): ?>
              <option<?= selected($form['purpose'], $p) ?>><?= e($p) ?></option>
            <?php endforeach; ?>
          </select>
          <?= $err('purpose') ?>
        </div>
        <div class="field" id="purpose-details-field"<?= $form['purpose'] === 'Other' ? '' : ' hidden' ?>>
          <label for="purpose_details">What is it for?</label>
          <input id="purpose_details" name="purpose_details" maxlength="255" value="<?= e($form['purpose_details']) ?>"<?= $inv('purpose_details') ?>>
          <?= $err('purpose_details') ?>
        </div>
        <div class="field">
          <label for="borrow_date">Borrow date</label>
          <input id="borrow_date" name="borrow_date" type="date" value="<?= e($form['borrow_date']) ?>"<?= $inv('borrow_date') ?>>
          <?= $err('borrow_date') ?>
        </div>
        <div class="field">
          <label for="due_date">Due date</label>
          <input id="due_date" name="due_date" type="date" value="<?= e($form['due_date']) ?>"<?= $inv('due_date') ?>>
          <?= $err('due_date') ?>
        </div>
        <?php if (can('requests.update_any')): ?>
          <div class="field field-wide">
            <label for="remarks">Staff remarks (optional)</label>
            <textarea id="remarks" name="remarks" rows="2" maxlength="255"<?= $inv('remarks') ?>><?= e($form['remarks']) ?></textarea>
            <?= $err('remarks') ?>
          </div>
        <?php endif; ?>
      </fieldset>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary"><?= $isEdit ? 'Save Changes' : 'Submit Request' ?></button>
        <a class="btn" href="<?= $isEdit ? 'requests.php?action=view&amp;id=' . (int) $form['id'] : 'requests.php' ?>">Cancel</a>
      </div>
    </form>
    <?php
    require __DIR__ . '/includes/layout/footer.php';
    exit;
}

if ($action === 'view') {
    $r = load_request_or_404();
    $staff = can('requests.process');
    $page_title = $r['code'];
    require __DIR__ . '/includes/layout/header.php';
    ?>
    <p class="back-link"><a href="requests.php">← All requests</a></p>
    <h1 class="view-title"><?= e($r['code']) ?> <?= badge($r['display_status']) ?></h1>

    <section class="panel" aria-label="Request details">
      <dl class="details-list">
        <dt>Borrower</dt><dd><?= e($r['borrower_name']) ?> <span class="cell-sub"><?= e($r['borrower_school_id'] . ' · ' . $r['borrower_type'] . ' · ' . $r['borrower_email']) ?></span></dd>
        <dt>Item</dt><dd><?= e($r['equipment_name']) ?> <span class="cell-sub"><?= e($r['equipment_code'] . ' · ' . $r['category'] . ' · ' . $r['laboratory']) ?></span></dd>
        <dt>Quantity</dt><dd><?= (int) $r['quantity'] ?></dd>
        <dt>Purpose</dt><dd><?= e($r['purpose']) ?><?= $r['purpose_details'] ? ' — ' . e($r['purpose_details']) : '' ?></dd>
        <dt>Borrow date</dt><dd><?= fmt_date($r['borrow_date']) ?></dd>
        <dt>Due date</dt><dd><?= fmt_date($r['due_date']) ?> <span class="cell-sub"><?= (int) $r['loan_days'] ?>-day loan<?= $r['days_overdue'] ? ' · <strong class="text-danger">' . (int) $r['days_overdue'] . ' days overdue</strong>' : '' ?></span></dd>
        <dt>Returned</dt><dd><?= fmt_date($r['returned_date']) ?><?= $r['returned_date'] && $r['returned_date'] > $r['due_date'] ? ' <span class="cell-sub">Returned late</span>' : '' ?></dd>
        <dt>Remarks</dt><dd><?= e($r['remarks'] ?: '—') ?></dd>
        <dt>Filed by</dt><dd><?= e($r['created_by_name'] ?? '—') ?> <span class="cell-sub"><?= fmt_datetime($r['created_at']) ?></span></dd>
        <dt>Handled by</dt><dd><?= e($r['processed_by_name'] ?? '—') ?></dd>
        <dt>Last change</dt><dd><?= fmt_datetime($r['updated_at']) ?></dd>
      </dl>

      <div class="button-row">
        <?php if (can_edit_request($r)): ?>
          <a class="btn" href="requests.php?action=edit&amp;id=<?= (int) $r['id'] ?>">Edit</a>
        <?php endif; ?>
        <?php if (can_delete_request($r)): ?>
          <form method="post" action="requests.php" data-confirm="Delete <?= e($r['code']) ?>? This removes it from the database and can’t be undone." data-confirm-label="Delete">
            <?= csrf_field() ?>
            <input type="hidden" name="action" value="delete">
            <input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
            <button type="submit" class="btn btn-danger"><?= owns($r) && !can('requests.delete_any') ? 'Cancel Request' : 'Delete' ?></button>
          </form>
        <?php endif; ?>
      </div>
    </section>

    <?php if ($staff && in_array($r['status'], ['PENDING', 'APPROVED', 'BORROWED'], true)): ?>
      <section class="panel process-panel" aria-labelledby="process-title">
        <h2 id="process-title">Process this request</h2>
        <?php $free = available_units((int) $r['equipment_id'], (int) $r['id']); ?>
        <p class="hint"><?= $free ?> of the item’s units are free for this request.</p>
        <form method="post" action="requests.php" class="form-stack">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="process">
          <input type="hidden" name="id" value="<?= (int) $r['id'] ?>">
          <div class="field">
            <label for="note">Note to borrower <?= $r['status'] === 'BORROWED' ? '(optional, e.g. condition on return)' : '(required when rejecting)' ?></label>
            <input id="note" name="note" maxlength="255">
          </div>
          <div class="button-row">
            <?php if ($r['status'] === 'PENDING'): ?>
              <button class="btn btn-primary" name="to" value="approve">Approve</button>
            <?php elseif ($r['status'] === 'APPROVED'): ?>
              <button class="btn btn-primary" name="to" value="release">Mark as Released</button>
            <?php else: ?>
              <button class="btn btn-primary" name="to" value="return">Mark as Returned</button>
            <?php endif; ?>
            <?php if (in_array($r['status'], ['PENDING', 'APPROVED'], true)): ?>
              <button class="btn btn-danger" name="to" value="reject">Reject</button>
            <?php endif; ?>
          </div>
        </form>
      </section>
    <?php endif; ?>
    <?php
    require __DIR__ . '/includes/layout/footer.php';
    exit;
}

/* list with search, filter, sort and pages, all done in sql */
$q = input('q');
$status = input('status', 'ALL');
$category = input('category', 'ALL');
$type = input('type', 'ALL');
$sortKeys = [
    'created_at' => 'r.created_at', 'code' => 'r.id', 'borrower' => 'u.full_name',
    'equipment' => 'e.name', 'borrow_date' => 'r.borrow_date', 'due_date' => 'r.due_date',
];
$sort = array_key_exists(input('sort'), $sortKeys) ? input('sort') : 'created_at';
$dir = input('dir') === 'asc' ? 'ASC' : 'DESC';
$page = max(1, (int) input('page', 1));

$where = [];
$args = [];
if (!can('requests.view_all')) {
    $where[] = 'r.user_id = ?';
    $args[] = $me['id'];
}
if ($q !== '') {
    $like = '%' . addcslashes($q, '%_\\') . '%';
    $where[] = '(r.code LIKE ? OR u.full_name LIKE ? OR u.school_id LIKE ? OR e.name LIKE ? OR e.code LIKE ? OR r.purpose LIKE ? OR r.purpose_details LIKE ? OR r.remarks LIKE ?)';
    array_push($args, $like, $like, $like, $like, $like, $like, $like, $like);
}
if ($status === 'OVERDUE') {
    $where[] = "r.status = 'BORROWED' AND r.due_date < CURDATE()";
} elseif ($status === 'BORROWED') {
    $where[] = "r.status = 'BORROWED' AND r.due_date >= CURDATE()";
} elseif (isset(STATUS_LABELS[$status])) {
    $where[] = 'r.status = ?';
    $args[] = $status;
}
if ($category !== 'ALL') {
    $where[] = 'e.category = ?';
    $args[] = $category;
}
if ($type !== 'ALL' && in_array($type, BORROWER_TYPES, true)) {
    $where[] = 'u.borrower_type = ?';
    $args[] = $type;
}
$whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

$total = (int) db_value('SELECT COUNT(*) FROM borrow_requests r JOIN users u ON u.id = r.user_id JOIN equipment e ON e.id = r.equipment_id' . $whereSql, $args);
$pages = max(1, (int) ceil($total / PAGE_SIZE));
$page = min($page, $pages);
$offset = ($page - 1) * PAGE_SIZE;
$rows = db_all(REQUEST_SELECT . $whereSql . " ORDER BY {$sortKeys[$sort]} $dir, r.id $dir LIMIT " . PAGE_SIZE . " OFFSET $offset", $args);
$categories = distinct_values('category');
$filtered = $q !== '' || $status !== 'ALL' || $category !== 'ALL' || $type !== 'ALL';

$page_title = can('requests.view_all') ? 'Borrow Requests' : 'My Requests';
require __DIR__ . '/includes/layout/header.php';
?>
<div class="title-row">
  <h1 class="view-title"><?= e($page_title) ?></h1>
  <a class="btn btn-primary" href="requests.php?action=new">New Request</a>
</div>

<form class="toolbar" method="get" role="search" aria-label="Search and filter requests">
  <div class="field">
    <label for="q">Search</label>
    <input id="q" name="q" type="search" value="<?= e($q) ?>" placeholder="ID, borrower, item, purpose…">
  </div>
  <div class="field">
    <label for="status">Status</label>
    <select id="status" name="status">
      <option value="ALL">All statuses</option>
      <?php foreach (STATUS_LABELS as $k => $label): ?>
        <option value="<?= $k ?>"<?= selected($status, $k) ?>><?= $label ?></option>
      <?php endforeach; ?>
    </select>
  </div>
  <div class="field">
    <label for="category">Category</label>
    <select id="category" name="category">
      <option value="ALL">All categories</option>
      <?php foreach ($categories as $c): ?>
        <option<?= selected($category, $c['v']) ?>><?= e($c['v']) ?></option>
      <?php endforeach; ?>
    </select>
  </div>
  <?php if (can('requests.view_all')): ?>
  <div class="field">
    <label for="type">Borrower type</label>
    <select id="type" name="type">
      <option value="ALL">All types</option>
      <?php foreach (BORROWER_TYPES as $t): ?>
        <option<?= selected($type, $t) ?>><?= $t ?></option>
      <?php endforeach; ?>
    </select>
  </div>
  <?php endif; ?>
  <div class="field">
    <label for="sort">Sort by</label>
    <select id="sort" name="sort">
      <?php foreach (['created_at' => 'Date filed', 'code' => 'Request ID', 'borrower' => 'Borrower', 'equipment' => 'Item', 'borrow_date' => 'Borrow date', 'due_date' => 'Due date'] as $k => $label): ?>
        <option value="<?= $k ?>"<?= selected($sort, $k) ?>><?= $label ?></option>
      <?php endforeach; ?>
    </select>
  </div>
  <div class="field">
    <label for="dir">Order</label>
    <select id="dir" name="dir">
      <option value="desc"<?= selected($dir, 'DESC') ?>>Newest / Z–A first</option>
      <option value="asc"<?= selected($dir, 'ASC') ?>>Oldest / A–Z first</option>
    </select>
  </div>
  <div class="toolbar-actions">
    <button type="submit" class="btn btn-primary">Search</button>
    <?php if ($filtered): ?><a class="btn" href="requests.php">Clear</a><?php endif; ?>
  </div>
</form>

<p class="result-count" role="status">
  <?= $total ? 'Showing ' . ($offset + 1) . '–' . ($offset + count($rows)) . ' of ' . $total . ' request' . ($total > 1 ? 's' : '') : 'No requests found' ?>
  <?= $q !== '' ? ' for “' . e($q) . '”' : '' ?>
</p>

<?php if (!$rows): ?>
  <div class="empty-state">
    <p><strong><?= $filtered ? 'Nothing matches your search.' : 'No borrow requests yet.' ?></strong></p>
    <p class="empty-note"><?= $filtered ? 'Try fewer words or clear the filters.' : 'Requests you file will show up here.' ?></p>
    <?php if ($filtered): ?><a class="btn" href="requests.php">Clear Filters</a><?php else: ?><a class="btn btn-primary" href="requests.php?action=new">New Request</a><?php endif; ?>
  </div>
<?php else: ?>
  <div class="table-wrap">
    <table class="data-table">
      <caption class="visually-hidden">Borrow requests</caption>
      <thead>
        <tr>
          <th scope="col">Request</th>
          <?php if (can('requests.view_all')): ?><th scope="col">Borrower</th><?php endif; ?>
          <th scope="col">Item</th>
          <th scope="col" class="col-optional">Qty</th>
          <th scope="col">Dates</th>
          <th scope="col">Status</th>
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <?php foreach ($rows as $r): ?>
          <tr>
            <td data-label="Request" class="cell-id"><?= e($r['code']) ?></td>
            <?php if (can('requests.view_all')): ?>
              <td data-label="Borrower"><?= e($r['borrower_name']) ?><span class="cell-sub"><?= e($r['borrower_school_id'] . ' · ' . $r['borrower_type']) ?></span></td>
            <?php endif; ?>
            <td data-label="Item"><?= e($r['equipment_name']) ?><span class="cell-sub"><?= e($r['category']) ?></span></td>
            <td data-label="Qty" class="col-optional"><?= (int) $r['quantity'] ?></td>
            <td data-label="Dates"><?= fmt_date($r['borrow_date']) ?><span class="cell-sub">due <?= fmt_date($r['due_date']) ?></span></td>
            <td data-label="Status"><?= badge($r['display_status']) ?></td>
            <td class="cell-actions">
              <a class="btn btn-sm" href="requests.php?action=view&amp;id=<?= (int) $r['id'] ?>">View</a>
              <?php if (can_edit_request($r)): ?>
                <a class="btn btn-sm" href="requests.php?action=edit&amp;id=<?= (int) $r['id'] ?>">Edit</a>
              <?php endif; ?>
            </td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>

  <?php if ($pages > 1): ?>
    <nav class="pagination" aria-label="Pages">
      <?php if ($page > 1): ?><a class="btn btn-sm" href="<?= e(query_with(['page' => $page - 1])) ?>">Previous</a><?php else: ?><span></span><?php endif; ?>
      <span>Page <?= $page ?> of <?= $pages ?></span>
      <?php if ($page < $pages): ?><a class="btn btn-sm" href="<?= e(query_with(['page' => $page + 1])) ?>">Next</a><?php else: ?><span></span><?php endif; ?>
    </nav>
  <?php endif; ?>
<?php endif; ?>
<?php require __DIR__ . '/includes/layout/footer.php'; ?>
