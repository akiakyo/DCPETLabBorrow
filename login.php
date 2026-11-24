<?php
require __DIR__ . '/includes/auth.php';

if (current_user()) {
    redirect('dashboard.php');
}

$login = '';
$error = null;
if (is_post()) {
    check_csrf();
    $login = input('login');
    $password = (string) ($_POST['password'] ?? '');
    if ($login === '' || $password === '') {
        $error = 'Enter your email or ID and your password.';
    } else {
        $error = attempt_login($login, $password);
        if ($error === null) {
            redirect('dashboard.php');
        }
        log_activity('login_failed', 'user', null, 'Failed sign-in for "' . mb_substr($login, 0, 80) . '"');
    }
}

$demo = [
    ['Super Admin', 'superadmin@school.edu.ph'],
    ['Admin (Lab Staff)', 'admin@school.edu.ph'],
    ['User · Student', 'asantos@school.edu.ph'],
    ['User · Faculty', 'lramos@school.edu.ph'],
];

$page_title = 'Sign In';
require __DIR__ . '/includes/layout/header.php';
?>
<section class="auth" aria-labelledby="login-title">
  <div class="auth-head">
    <?= logo_mark() ?>
    <h1 id="login-title" class="page-title">Sign in to LabBorrow</h1>
    <p class="page-lead">Borrow lab equipment and track what you have out.</p>
  </div>

  <form method="post" class="stack" novalidate>
    <?= csrf_field() ?>
    <div class="field">
      <label for="login">Email or ID number</label>
      <input id="login" name="login" type="text" autocomplete="username" value="<?= e($login) ?>"
             <?= $error ? 'aria-invalid="true" aria-describedby="login-error"' : '' ?> autofocus>
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password"
             <?= $error ? 'aria-invalid="true" aria-describedby="login-error"' : '' ?>>
      <p class="error" id="login-error"><?= e($error ?? '') ?></p>
    </div>
    <button type="submit" class="btn btn-primary btn-block"><?= icon('login') ?>Sign In</button>
  </form>

  <p class="auth-switch">New student or faculty? <a href="register.php">Create an account</a></p>

  <details class="demo">
    <summary><?= icon('info') ?>Demo accounts</summary>
    <ul class="demo-list">
      <?php foreach ($demo as [$role, $email]): ?>
        <li><span class="muted"><?= e($role) ?></span><button type="button" data-fill="<?= e($email) ?>"><?= e($email) ?></button></li>
      <?php endforeach; ?>
    </ul>
    <p class="hint">Tap an email to fill it in. Password for all: <code>password123</code></p>
  </details>
</section>
<?php require __DIR__ . '/includes/layout/footer.php'; ?>
