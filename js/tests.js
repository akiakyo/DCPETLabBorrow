/* stable id assertions. rerun: runStableIdTests()
   uses a copy, never touches state */

function runStableIdTests() {
  const original = SEED_REQUESTS.map(r => ({ ...r }));
  const snapshot = new Map(original.map(r => [r.id, JSON.stringify(r)]));
  const results = [];

  function check(name, condition) {
    console.assert(condition, `FAILED: ${name}`);
    results.push({ test: name, result: condition ? "PASS" : "FAIL" });
  }

  // 1. sort: only order changes, same data per id
  const sorted = sortRecords(original, { key: "borrowerName", direction: "desc" });
  check(
    "A1: After sorting by borrower name (Z–A), every ID still maps to identical record data",
    sorted.length === original.length &&
    sorted.every(r => snapshot.get(r.id) === JSON.stringify(r)) &&
    sorted[0].id !== original[0].id // proves order changed
  );

  // 2. delete: other ids don't shift
  const afterDelete = deleteById(sorted, "BR-2026-0004");
  const next = findById(afterDelete, "BR-2026-0005");
  check(
    "A2: After deleting BR-2026-0004, it is gone and BR-2026-0005 is still Kristine Lim / EQ-005",
    afterDelete.length === original.length - 1 &&
    findById(afterDelete, "BR-2026-0004") === null &&
    next !== null && next.borrowerName === "Kristine Lim" && next.equipmentId === "EQ-005" &&
    afterDelete.every(r => snapshot.get(r.id) === JSON.stringify(r))
  );

  // 3. deleted id never reused, all ids unique
  const seq = nextSequenceFrom(original);
  const withoutLast = deleteById(original, "BR-2026-0017");
  const newId = formatRequestId(seq, 2026);
  const combined = [...withoutLast, { ...original[0], id: newId }];
  check(
    "A3: After deleting BR-2026-0017, the next new ID is BR-2026-0018 (no reuse) and all IDs are unique",
    newId === "BR-2026-0018" &&
    new Set(combined.map(r => r.id)).size === combined.length
  );

  console.info("Stable ID assertions (Unit 3)");
  console.table(results);
  return results.every(r => r.result === "PASS");
}

runStableIdTests();
