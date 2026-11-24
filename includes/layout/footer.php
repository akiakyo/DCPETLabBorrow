    </main>

    <footer class="app-footer">
      <p>DCPET Lab Equipment Borrowing &amp; Inventory System · PHP + MySQL</p>
    </footer>
  </div>

  <!-- in-app confirm, replaces window.confirm -->
  <dialog class="confirm-dialog" id="confirm-dialog" aria-labelledby="confirm-title">
    <form method="dialog">
      <h2 id="confirm-title">Are you sure?</h2>
      <p id="confirm-message"></p>
      <div class="button-row confirm-actions">
        <button type="submit" value="cancel" class="btn">Cancel</button>
        <button type="submit" value="ok" class="btn btn-primary" id="confirm-ok">Delete</button>
      </div>
    </form>
  </dialog>

  <script src="js/site.js"></script>
</body>
</html>
