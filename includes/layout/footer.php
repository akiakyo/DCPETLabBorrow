    </main>

    <footer class="app-footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <?= logo_mark('logo-sm') ?>
          <div>
            <p class="footer-name"><?= e(APP_NAME) ?></p>
            <p class="footer-note">Borrow, track and return lab equipment in one place.</p>
          </div>
        </div>
        <?php if (current_user()): ?>
          <nav class="footer-links" aria-label="Footer">
            <a href="dashboard.php">Dashboard</a>
            <a href="equipment.php">Equipment</a>
            <a href="account.php">My Account</a>
          </nav>
        <?php endif; ?>
      </div>
      <p class="footer-meta">
        <span>© <?= date('Y') ?> DCPET Laboratories</span>
        <span>PHP + MySQL</span>
        <span>Icons: <a href="https://icon-sets.iconify.design/solar/" rel="noopener">Solar</a> by 480 Design, CC BY 4.0</span>
      </p>
    </footer>
    </div>
  </div>

  <!-- in-app confirm, replaces window.confirm -->
  <dialog class="dialog" id="confirm-dialog" aria-labelledby="confirm-title">
    <form method="dialog">
      <?= icon('danger', 'dialog-icon') ?>
      <h2 id="confirm-title">Are you sure?</h2>
      <p id="confirm-message"></p>
      <div class="button-row">
        <button type="submit" value="cancel" class="btn">Cancel</button>
        <button type="submit" value="ok" class="btn" id="confirm-ok">Delete</button>
      </div>
    </form>
  </dialog>

  <script src="js/site.js"></script>
</body>
</html>
