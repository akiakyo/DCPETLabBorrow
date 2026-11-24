<?php
require __DIR__ . '/includes/auth.php';
require __DIR__ . '/includes/accounts.php';

if (current_user()) {
    redirect('dashboard.php');
}

$d = ['school_id' => '', 'full_name' => '', 'email' => '', 'borrower_type' => 'Student'];
$errors = [];
if (is_post()) {
    check_csrf();
    $d = read_user_form();
    // self sign-up is always a regular user
    $d['role'] = 'user';
    if (!in_array($d['borrower_type'], ['Student', 'Faculty'], true)) {
        $d['borrower_type'] = 'Student';
    }
    $errors = validate_user_form($d, null, true);
    if (!$errors) {
        db_run(
            'INSERT INTO users (school_id, full_name, email, password_hash, role, borrower_type) VALUES (?, ?, ?, ?, ?, ?)',
            [$d['school_id'], $d['full_name'], $d['email'], password_hash($d['password'], PASSWORD_DEFAULT), 'user', $d['borrower_type']]
        );
        $id = (int) db()->lastInsertId();
        log_activity('create', 'user', $id, $d['full_name'] . ' registered as a user', $id);
        flash('success', 'Your account is ready. Sign in to borrow equipment.');
        redirect('login.php');
    }
}

$page_title = 'Create Account';
require __DIR__ . '/includes/layout/header.php';
?>
<section class="auth" aria-labelledby="register-title">
  <div class="auth-head">
    <?= logo_mark() ?>
    <h1 id="register-title" class="page-title">Create an account</h1>
    <p class="page-lead">For students and faculty who borrow lab equipment. Lab staff accounts are made by the Super Admin.</p>
  </div>

  <form method="post" class="stack" novalidate>
    <?= csrf_field() ?>
    <div class="field">
      <label for="school_id">ID number</label>
      <input id="school_id" name="school_id" value="<?= e($d['school_id']) ?>" placeholder="2024-00123"<?= invalid_attr($errors, 'school_id') ?>>
      <?= field_error($errors, 'school_id') ?>
    </div>
    <div class="field">
      <label for="full_name">Full name</label>
      <input id="full_name" name="full_name" autocomplete="name" value="<?= e($d['full_name']) ?>"<?= invalid_attr($errors, 'full_name') ?>>
      <?= field_error($errors, 'full_name') ?>
    </div>
    <div class="field">
      <label for="email">School email</label>
      <input id="email" name="email" type="email" autocomplete="email" value="<?= e($d['email']) ?>"<?= invalid_attr($errors, 'email') ?>>
      <?= field_error($errors, 'email') ?>
    </div>
    <div class="field">
      <label for="borrower_type">I am a</label>
      <select id="borrower_type" name="borrower_type">
        <option value="Student"<?= selected($d['borrower_type'], 'Student') ?>>Student</option>
        <option value="Faculty"<?= selected($d['borrower_type'], 'Faculty') ?>>Faculty</option>
      </select>
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="new-password"<?= invalid_attr($errors, 'password') ?>>
      <p class="hint">At least 8 characters.</p>
      <?= field_error($errors, 'password') ?>
    </div>
    <div class="field">
      <label for="password_confirm">Confirm password</label>
      <input id="password_confirm" name="password_confirm" type="password" autocomplete="new-password"<?= invalid_attr($errors, 'password_confirm') ?>>
      <?= field_error($errors, 'password_confirm') ?>
    </div>
    <button type="submit" class="btn btn-primary btn-block"><?= icon('user-plus') ?>Create Account</button>
  </form>
  <p class="auth-switch">Already have an account? <a href="login.php">Sign in</a></p>
</section>
<?php require __DIR__ . '/includes/layout/footer.php'; ?>
