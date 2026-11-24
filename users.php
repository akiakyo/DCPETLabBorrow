<?php
require __DIR__ . '/includes/auth.php';
require __DIR__ . '/includes/accounts.php';

$me = require_permission('users.manage');
$action = input('action', 'list');

function find_user(int $id): ?array
{
    return db_one('SELECT u.*, (SELECT COUNT(*) FROM borrow_requests r WHERE r.user_id = u.id) AS request_count FROM users u WHERE u.id = ?', [$id]);
}

/* post: create or update */
if (is_post() && $action === 'save') {
    check_csrf();
    $id = (int) input('id', 0);
    $existing = $id ? find_user($id) : null;
    if ($id && !$existing) {
        flash('error', 'That account no longer exists.');
        redirect('users.php');
    }
    $d = read_user_form();
    // no locking yourself out
    if ($existing && (int) $existing['id'] === (int) $me['id']) {
        $d['role'] = $existing['role'];
        $d['is_active'] = 1;
    }
    $errors = validate_user_form($d, $id ?: null, !$id);
    if ($errors) {
        $form = $d + ['id' => $id];
        $action = $id ? 'edit' : 'new';
    } else {
        if ($existing) {
            db_run('UPDATE users SET school_id = ?, full_name = ?, email = ?, role = ?, borrower_type = ?, is_active = ? WHERE id = ?',
                [$d['school_id'], $d['full_name'], $d['email'], $d['role'], $d['borrower_type'], $d['is_active'], $id]);
            if ($d['password'] !== '') {
                db_run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($d['password'], PASSWORD_DEFAULT), $id]);
            }
            $changes = [];
            if ($existing['role'] !== $d['role']) $changes[] = 'role ' . ROLE_LABELS[$existing['role']] . ' → ' . ROLE_LABELS[$d['role']];
            if ((int) $existing['is_active'] !== $d['is_active']) $changes[] = $d['is_active'] ? 'reactivated' : 'deactivated';
            if ($d['password'] !== '') $changes[] = 'password reset';
            log_activity('update', 'user', $id, 'Edited account of ' . $d['full_name'] . ($changes ? ' (' . implode(', ', $changes) . ')' : ''));
            flash('success', $d['full_name'] . '’s account was saved.');
        } else {
            db_run('INSERT INTO users (school_id, full_name, email, password_hash, role, borrower_type, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$d['school_id'], $d['full_name'], $d['email'], password_hash($d['password'], PASSWORD_DEFAULT), $d['role'], $d['borrower_type'], $d['is_active']]);
            $id = (int) db()->lastInsertId();
            log_activity('create', 'user', $id, 'Created ' . ROLE_LABELS[$d['role']] . ' account for ' . $d['full_name']);
            flash('success', 'Account created for ' . $d['full_name'] . '.');
        }
        redirect('users.php');
    }
}

/* post: delete */
if (is_post() && $action === 'delete') {
    check_csrf();
    $user = find_user((int) input('id', 0));
    if (!$user) {
        flash('error', 'That account no longer exists.');
        redirect('users.php');
    }
    if ((int) $user['id'] === (int) $me['id']) {
        flash('error', 'You can’t delete your own account while signed in.');
        redirect('users.php');
    }
    if ($user['request_count'] > 0) {
        flash('error', $user['full_name'] . ' has ' . $user['request_count'] . ' borrow request(s) on record, so the account can’t be deleted. Deactivate it instead.');
        redirect('users.php');
    }
    db_run('DELETE FROM users WHERE id = ?', [$user['id']]);
    log_activity('delete', 'user', (int) $user['id'], 'Deleted account of ' . $user['full_name'] . ' (' . $user['school_id'] . ')');
    flash('success', $user['full_name'] . '’s account was deleted.');
    redirect('users.php');
}

$active_nav = 'users';

if ($action === 'new' || $action === 'edit') {
    if (!isset($form)) {
        if ($action === 'edit') {
            $form = find_user((int) input('id', 0));
            if (!$form) {
                flash('error', 'That account no longer exists.');
                redirect('users.php');
            }
        } else {
            $form = ['id' => 0, 'school_id' => '', 'full_name' => '', 'email' => '', 'role' => 'user', 'borrower_type' => 'Student', 'is_active' => 1];
        }
    }
    $errors = $errors ?? [];
    $isEdit = (int) $form['id'] > 0;
    $isSelf = $isEdit && (int) $form['id'] === (int) $me['id'];
    $page_title = $isEdit ? 'Edit Account' : 'New Account';
    require __DIR__ . '/includes/layout/header.php';
    ?>
    <a class="back-link" href="users.php"><?= icon('back') ?>Users</a>
    <div class="page-head">
      <div>
        <h1 class="page-title"><?= $isEdit ? 'Edit ' . e($form['full_name']) : 'New account' ?></h1>
        <p class="page-lead">The role decides what this person can see and do.</p>
      </div>
    </div>

    <form method="post" action="users.php" class="form" novalidate>
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="save">
      <input type="hidden" name="id" value="<?= (int) $form['id'] ?>">
      <fieldset class="form-section">
        <legend>Profile</legend>
        <div class="form-fields">
        <div class="field">
          <label for="school_id">ID number</label>
          <input id="school_id" name="school_id" value="<?= e($form['school_id']) ?>"<?= invalid_attr($errors, 'school_id') ?>>
          <?= field_error($errors, 'school_id') ?>
        </div>
        <div class="field">
          <label for="full_name">Full name</label>
          <input id="full_name" name="full_name" value="<?= e($form['full_name']) ?>"<?= invalid_attr($errors, 'full_name') ?>>
          <?= field_error($errors, 'full_name') ?>
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" value="<?= e($form['email']) ?>"<?= invalid_attr($errors, 'email') ?>>
          <?= field_error($errors, 'email') ?>
        </div>
        <div class="field">
          <label for="borrower_type">Type</label>
          <select id="borrower_type" name="borrower_type">
            <?php foreach (BORROWER_TYPES as $t): ?><option<?= selected($form['borrower_type'], $t) ?>><?= $t ?></option><?php endforeach; ?>
          </select>
        </div>
      </div>
      </fieldset>

      <fieldset class="form-section">
        <legend>Access</legend>
        <div class="form-fields">
        <?php if ($isSelf): ?>
          <div class="field field-wide">
            <span class="field-label">Role and status</span>
            <p class="static-value"><?= e(ROLE_LABELS[$form['role']]) ?> · Active</p>
            <p class="hint">You can’t change your own role or deactivate yourself, so the system always keeps a Super Admin.</p>
          </div>
        <?php else: ?>
          <div class="field">
            <label for="role">Role</label>
            <select id="role" name="role"<?= invalid_attr($errors, 'role') ?>>
              <?php foreach (ROLE_LABELS as $k => $label): ?><option value="<?= $k ?>"<?= selected($form['role'], $k) ?>><?= e($label) ?></option><?php endforeach; ?>
            </select>
            <?= field_error($errors, 'role') ?>
          </div>
          <div class="field">
            <span class="field-label">Status</span>
            <label class="check"><input type="checkbox" name="is_active" value="1"<?= $form['is_active'] ? ' checked' : '' ?>> Active, can sign in</label>
          </div>
        <?php endif; ?>
        <div class="field">
          <label for="password"><?= $isEdit ? 'New password' : 'Password' ?><?= $isEdit ? ' <span class="optional">(optional)</span>' : '' ?></label>
          <input id="password" name="password" type="password" autocomplete="new-password"<?= invalid_attr($errors, 'password') ?>>
          <p class="hint"><?= $isEdit ? 'Leave blank to keep the current password.' : 'At least 8 characters.' ?></p>
          <?= field_error($errors, 'password') ?>
        </div>
        <div class="field">
          <label for="password_confirm">Confirm password</label>
          <input id="password_confirm" name="password_confirm" type="password" autocomplete="new-password"<?= invalid_attr($errors, 'password_confirm') ?>>
          <?= field_error($errors, 'password_confirm') ?>
        </div>
      </div>
      </fieldset>
      <div class="form-actions">
        <a class="btn btn-tertiary" href="users.php">Cancel</a>
        <button type="submit" class="btn btn-primary"><?= icon($isEdit ? 'check' : 'user-plus') ?><?= $isEdit ? 'Save Changes' : 'Create Account' ?></button>
      </div>
    </form>
    <?php
    require __DIR__ . '/includes/layout/footer.php';
    exit;
}

/* list with search */
$q = input('q');
$role = input('role', 'ALL');
$status = input('status', 'ALL');
$where = [];
$args = [];
if ($q !== '') {
    $like = '%' . addcslashes($q, '%_\\') . '%';
    $where[] = '(u.full_name LIKE ? OR u.email LIKE ? OR u.school_id LIKE ?)';
    array_push($args, $like, $like, $like);
}
if (isset(ROLE_LABELS[$role])) {
    $where[] = 'u.role = ?';
    $args[] = $role;
}
if ($status === 'active' || $status === 'inactive') {
    $where[] = 'u.is_active = ?';
    $args[] = $status === 'active' ? 1 : 0;
}
$users = db_all('SELECT u.*, (SELECT COUNT(*) FROM borrow_requests r WHERE r.user_id = u.id) AS request_count FROM users u'
    . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
    . " ORDER BY FIELD(u.role, 'super_admin', 'admin', 'user'), u.full_name", $args);
$filtered = $q !== '' || $role !== 'ALL' || $status !== 'ALL';

$page_title = 'Users';
require __DIR__ . '/includes/layout/header.php';
?>
<div class="page-head">
  <div>
    <h1 class="page-title">Users</h1>
    <p class="page-lead">Only the Super Admin can see this page, create accounts and change roles.</p>
  </div>
  <a class="btn btn-primary" href="users.php?action=new"><?= icon('user-plus') ?>New Account</a>
</div>

<form class="search" method="get" role="search" aria-label="Search users">
  <div class="search-row">
    <div class="search-input">
      <?= icon('search') ?>
      <label for="q" class="visually-hidden">Search</label>
      <input id="q" name="q" type="search" value="<?= e($q) ?>" placeholder="Search name, email or ID…">
    </div>
    <button type="submit" class="btn btn-primary">Search</button>
  </div>
  <div class="filters">
    <div class="field">
      <label for="role">Role</label>
      <select id="role" name="role" data-autosubmit>
        <option value="ALL">All roles</option>
        <?php foreach (ROLE_LABELS as $k => $label): ?><option value="<?= $k ?>"<?= selected($role, $k) ?>><?= e($label) ?></option><?php endforeach; ?>
      </select>
    </div>
    <div class="field">
      <label for="status-filter">Status</label>
      <select id="status-filter" name="status" data-autosubmit>
        <option value="ALL">Any</option>
        <option value="active"<?= selected($status, 'active') ?>>Active</option>
        <option value="inactive"<?= selected($status, 'inactive') ?>>Deactivated</option>
      </select>
    </div>
  </div>
</form>

<p class="result-count" role="status"><?= count($users) ?> account<?= count($users) === 1 ? '' : 's' ?><?= $q !== '' ? ' for “' . e($q) . '”' : '' ?><?php if ($filtered): ?> · <a href="users.php">Clear filters</a><?php endif; ?></p>

<?php if (!$users): ?>
  <div class="empty"><?= icon('search') ?><p><strong>No accounts match your search.</strong></p><a class="btn" href="users.php">Clear Filters</a></div>
<?php else: ?>
  <table class="table">
    <caption class="visually-hidden">User accounts</caption>
    <thead>
      <tr>
        <th scope="col">Name</th>
        <th scope="col">Role</th>
        <th scope="col" class="col-optional">Requests</th>
        <th scope="col" class="col-optional">Last sign-in</th>
        <th scope="col"><span class="visually-hidden">Actions</span></th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($users as $u): ?>
        <tr>
          <td data-label="Name"><?= e($u['full_name']) ?><span class="sub"><?= e($u['school_id'] . ' · ' . $u['email']) ?></span></td>
          <td data-label="Role"><?= e(ROLE_LABELS[$u['role']]) ?><?php if (!$u['is_active']): ?><span class="sub text-danger">Deactivated</span><?php endif; ?></td>
          <td data-label="Requests" class="col-optional"><?= (int) $u['request_count'] ?></td>
          <td data-label="Last sign-in" class="col-optional"><?= fmt_datetime($u['last_login_at']) ?></td>
          <td class="cell-actions">
            <a class="btn btn-sm" href="users.php?action=edit&amp;id=<?= (int) $u['id'] ?>"><?= icon('edit') ?>Edit</a>
            <?php if ((int) $u['id'] !== (int) $me['id']): ?>
              <form method="post" action="users.php" class="inline-form" data-confirm="The account of <?= e($u['full_name']) ?> will be removed from the database. This can’t be undone." data-confirm-title="Delete this account?" data-confirm-label="Delete">
                <?= csrf_field() ?>
                <input type="hidden" name="action" value="delete">
                <input type="hidden" name="id" value="<?= (int) $u['id'] ?>">
                <button type="submit" class="btn btn-sm btn-danger" aria-label="Delete <?= e($u['full_name']) ?>"><?= icon('delete') ?>Delete</button>
              </form>
            <?php endif; ?>
          </td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
<?php endif; ?>
<?php require __DIR__ . '/includes/layout/footer.php'; ?>
