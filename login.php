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

$page_title = 'Sign In';
require __DIR__ . '/includes/layout/header.php';
?>
<section class="auth-card" aria-labelledby="login-title">
  <h1 id="login-title" class="view-title">Sign in</h1>
  <p class="view-lead">Use your school email or ID number.</p>

  <form method="post" class="form-stack" novalidate>
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
    <button type="submit" class="btn btn-primary btn-block">Sign In</button>
  </form>

  <p class="auth-switch">New student or faculty? <a href="register.php">Create an account</a></p>

  <details class="demo-accounts">
    <summary>Demo accounts</summary>
    <table class="mini-table">
      <thead><tr><th scope="col">Role</th><th scope="col">Email</th></tr></thead>
      <tbody>
        <tr><td>Super Admin</td><td>superadmin@school.edu.ph</td></tr>
        <tr><td>Admin (Lab Staff)</td><td>admin@school.edu.ph</td></tr>
        <tr><td>User (Student)</td><td>asantos@school.edu.ph</td></tr>
        <tr><td>User (Faculty)</td><td>lramos@school.edu.ph</td></tr>
      </tbody>
    </table>
    <p class="hint">Password for all demo accounts: <code>password123</code></p>
  </details>
</section>
<?php require __DIR__ . '/includes/layout/footer.php'; ?>
