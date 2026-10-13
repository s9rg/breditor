import { test, expect } from "@playwright/test";
import { caseNames } from "./scenarios.mjs";

for (const name of caseNames) {
  test(`matching Rust/Wasm: ${name}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator("#status")).toHaveText("Ready for contract tests");
    const result = await page.evaluate(name => window.probe.runCase(name), name);
    expect(result.passed).toBe(true);
    expect(result.assertions).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test("native journal restores with exact future Wasm undo operation identities", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Ready for contract tests");
  const result = await page.evaluate(async () => {
    const { ProbeSession } = await import("/probe.js");
    const vector = await (await fetch("/native-vector.json")).json();
    const session = ProbeSession.restore(vector.checkpoint);
    try {
      const initial = JSON.parse(session.view());
      const initialVersion = JSON.parse(session.version());
      const position = session.resolve_anchor(JSON.stringify(vector.anchor));
      if (!session.redo()) throw new Error("native recovered redo missing");
      const afterRedo = JSON.parse(session.checkpoint());
      for (let index = 0; index < 3; index += 1) if (!session.undo()) throw new Error("native recovered undo missing");
      return { vector, initial, initialVersion, position, afterRedo, afterUndoAll: JSON.parse(session.checkpoint()), remaining: JSON.parse(session.view()) };
    } finally { session.free(); }
  });
  expect(result.initial).toEqual(result.vector.initial);
  expect(result.initialVersion).toEqual(result.vector.initial_version);
  expect(result.position).toEqual(result.vector.anchor_position);
  expect(result.afterRedo).toEqual(JSON.parse(result.vector.after_redo));
  expect(result.afterUndoAll).toEqual(JSON.parse(result.vector.after_undo_all));
  expect(result.remaining).toEqual(result.vector.remaining);
});

test("real rich core geometry retains cell partitions across merges, split and axis changes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Ready for contract tests");
  const result = await page.evaluate(async () => {
    const { resolve_geometry } = await import("/probe.js");
    const rows = ["r0", "r1", "r2"], columns = ["c0", "c1", "c2"];
    const merge = (id, writer, firstRow, lastRow, firstColumn, lastColumn) => ({ id, writer, lamport: "9007199254740993", counter: "18446744073709551615", rows, columns, first_row: firstRow, last_row: lastRow, first_column: firstColumn, last_column: lastColumn });
    const low = merge("low", "9", "r0", "r1", "c0", "c1");
    const high = merge("high", "10", "r1", "r2", "c1", "c2");
    const fixture = { version: 1, table: "t", rows, columns, merges: [low, high], retracted: [] };
    const resolve = value => JSON.parse(resolve_geometry(JSON.stringify(value)));
    const normal = resolve(fixture);
    const reverse = resolve({ ...fixture, merges: [high, low] });
    const split = resolve({ ...fixture, retracted: ["low", "high"] });
    const expanded = resolve({ ...fixture, rows: ["r0", "r1", "inserted", "r2"], merges: [high] });
    const deletedMaster = resolve({ ...fixture, rows: ["r0", "r2"], columns: ["c0", "c2"], merges: [high] });
    const hidden = resolve({ ...fixture, rows: [], merges: [high] });
    const reordered = resolve({ ...fixture, rows: ["r2", "r1", "r0"], merges: [high] });
    return { normal, reverse, split, expanded, deletedMaster, hidden, reordered };
  });
  expect(result.normal).toEqual(result.reverse);
  expect(result.normal.active).toEqual(["high"]);
  expect(result.normal.conflicts).toEqual([{ id: "low", reason: "overlap" }]);
  expect(result.normal.cells.flatMap(cell => cell.sources)).toHaveLength(9);
  expect(new Set(result.normal.cells.flatMap(cell => cell.sources.map(source => `${source.row}:${source.column}`))).size).toBe(9);
  expect(result.split.cells.every(cell => cell.row_span === 1 && cell.column_span === 1 && cell.sources.length === 1)).toBe(true);
  expect(result.expanded.cells.find(cell => cell.base.row === "r1" && cell.base.column === "c1").row_span).toBe(3);
  expect(result.deletedMaster.conflicts).toEqual([{ id: "high", reason: "singleton" }]);
  expect(result.hidden.hidden).toBe(true);
  expect(result.hidden.cells).toEqual([]);
  expect(result.reordered.conflicts).toEqual([{ id: "high", reason: "axes_reordered" }]);
});

test("real image binding contract cannot apply stale completions to deleted or replaced nodes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Ready for contract tests");
  const result = await page.evaluate(async () => {
    const { classify_upload } = await import("/probe.js");
    const original = { image: "image-1", asset: "asset-1", generation: "generation-1", alt: "A coastline", decorative: false, size: [640, 480] };
    const classify = current => classify_upload(JSON.stringify({ original, current }));
    let invalidSizeRejected = false;
    try { classify({ ...original, size: [640, 0] }); } catch { invalidSizeRejected = true; }
    return { same: classify(original), duplicate: classify(original), deleted: classify(null), replaced: classify({ ...original, asset: "asset-2", generation: "generation-2" }), otherNode: classify({ ...original, image: "image-2" }), metadataOnly: classify({ ...original, alt: "Updated description", size: [320, 240] }), invalidSizeRejected };
  });
  expect(result).toEqual({ same: "current_binding", duplicate: "current_binding", deleted: "stale_or_deleted", replaced: "stale_or_deleted", otherNode: "stale_or_deleted", metadataOnly: "current_binding", invalidSizeRejected: true });
});
