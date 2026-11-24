<?php
require __DIR__ . '/includes/auth.php';
require __DIR__ . '/includes/accounts.php';

$me = require_login();
$errors = [];
$form = $me;

if (is_post()) {
    check_csrf();
    $d = read_user_form();
    // id, role, type and status stay as they are; only staff change those
    $d['school_id'] = $me['school_id'];
    $d['role'] = $me['role'];
    $d['borrower_type'] = $me['borrower_type'];
    $errors = validate_user_form($d, (int) $me['id'], false);
    if ($d['password'] !== '' && !password_verify((string) ($_POST['current_password'] ?? ''), $me['password_hash'])) {
        $errors['current_password'] = 'Your current password is not correct.';
    }
    if ($errors) {
        $form = array_merge($me, $d);
    } else {
        db_run('UPDATE users SET full_name = ?, email = ? WHERE id = ?', [$d['full_name'], $d['email'], $me['id']]);
        if ($d['password'] !== '') {
            db_run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($d['password'], PASSWORD_DEFAULT), $me['id']]);
        }
        log_activity('update', 'user', (int) $me['id'], $d['full_name'] . ' updated their own account' . ($d['password'] !== '' ? ' (password changed)' : ''));
        flash('success', 'Your account was saved.');
        redirect('account.php');
    }
}

$page_title = 'My Account';
$active_nav = 'account';
require __DIR__ . '/includes/layout/header.php';
?>
<div class="page-head">
  <div>
    <h1 class="page-title">My account</h1>
    <p class="page-lead">Your ID number and role are set by the lab office.</p>
  </div>
</div>

<form method="post" class="form" novalidate>
  <?= csrf_field() ?>
  <fieldset class="form-section">
    <legend>Profile</legend>
        <div class="form-fields">
    <div class="field">
      <span class="field-label">ID number</span>
      <p class="static-value mono"><?= e($me['school_id']) ?></p>
    </div>
    <div class="field">
      <span class="field-label">Role</span>
      <p class="static-value"><?= e(ROLE_LABELS[$me['role']]) ?> · <?= e($me['borrower_type']) ?></p>
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
  </div>
  </fieldset>
  <fieldset class="form-section">
    <legend>Change password <span class="optional">(optional)</span></legend>
        <div class="form-fields">
    <div class="field">
      <label for="current_password">Current password</label>
      <input id="current_password" name="current_password" type="password" autocomplete="current-password"<?= invalid_attr($errors, 'current_password') ?>>
      <?= field_error($errors, 'current_password') ?>
    </div>
    <div class="field">
      <label for="password">New password</label>
      <input id="password" name="password" type="password" autocomplete="new-password"<?= invalid_attr($errors, 'password') ?>>
      <?= field_error($errors, 'password') ?>
    </div>
    <div class="field">
      <label for="password_confirm">Confirm new password</label>
      <input id="password_confirm" name="password_confirm" type="password" autocomplete="new-password"<?= invalid_attr($errors, 'password_confirm') ?>>
      <?= field_error($errors, 'password_confirm') ?>
    </div>
  </div>
  </fieldset>
  <div class="form-actions">
    <button type="submit" class="btn btn-primary"><?= icon('check') ?>Save Changes</button>
  </div>
</form>
<?php require __DIR__ . '/includes/layout/footer.php'; ?>
