import { test, expect } from "@playwright/test";

const pageErrors = new WeakMap();
test.beforeEach(({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function ready(page) {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Ready for contract tests");
}

test("native and Wasm whole table/image move merge split header and caption actions match exactly", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { exercise_rich_features } = await import("/probe.js");
    const vector = await (await fetch("/native-vector.json")).json();
    return { actual: JSON.parse(exercise_rich_features(vector.rich_ast_input)), expected: vector.rich_features_expected };
  });
  expect(result.actual).toEqual(result.expected);
  expect(result.actual.cases.map(value => value.name)).toEqual([
    "move_row", "move_column", "merge", "split", "header", "insert_table", "delete_table",
    "insert_image", "delete_image", "replace_image", "caption",
  ]);
  for (const value of result.actual.cases) {
    expect(value.undone).toBe(result.actual.initial);
    expect(value.redone).toBe(value.changed);
  }
  const byName = Object.fromEntries(result.actual.cases.map(value => [value.name, value]));
  expect(byName.move_row.view.tables[0].rows).toEqual(["r1", "r0"]);
  expect(byName.move_column.view.tables[0].columns.map(column => column.id)).toEqual(["c1", "c0"]);
  expect(byName.move_row.view.tables[0].active).toEqual([]);
  expect(byName.merge.view.tables[0].active).toEqual(["merge-new"]);
  expect(byName.merge.view.tables[0].cells[0].sources).toHaveLength(4);
  expect(byName.split.view.tables[0].cells.every(cell => cell.row_span === 1 && cell.column_span === 1)).toBe(true);
  expect(byName.insert_table.view.tables).toHaveLength(2);
  expect(byName.delete_table.view.tables).toEqual([]);
  expect(byName.delete_table.view.images).toEqual([]);
  expect(byName.insert_image.view.images).toHaveLength(2);
  expect(byName.delete_image.view.images).toEqual([]);
  expect(byName.replace_image.view.images[0]).toMatchObject({ id: "covered-image", asset: "asset-new", generation: "generation-new", size: [640, 480] });
  const caption = JSON.parse(byName.caption.changed).root.children[1].children[1].children[1].children[1].children[0];
  expect(caption.properties["breditor/block-id"]).toBe("caption-new");
  expect(caption.children[0].text).toBe("New caption 🙂");
  const header = JSON.parse(byName.header.changed).root.children[1];
  expect(header.children.flatMap(row => row.children).every(cell => cell.properties["breditor/header"] === true)).toBe(true);
});

test("native and Wasm rich local action groups undo and redo exact document bytes", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { exercise_rich_actions } = await import("/probe.js");
    const vector = await (await fetch("/native-vector.json")).json();
    return { actual: JSON.parse(exercise_rich_actions(vector.rich_ast_input)), expected: vector.rich_actions_expected };
  });
  expect(result.actual).toEqual(result.expected);
  expect(result.actual.inverse_count).toBe(3);
  expect(result.actual.undone).toBe(result.actual.initial);
  expect(result.actual.redone).toBe(result.actual.changed);
  const changed = JSON.parse(result.actual.changed);
  expect(changed.root.children[1].properties["breditor/columns"][0].width).toBe(320);
  const image = changed.root.children[1].children[1].children[1].children[1];
  expect(image.properties).toMatchObject({ "breditor/width": 320, "breditor/height": 240, "breditor/alt-text": "", "breditor/decorative": true });
  expect(image.children[0].children[0].text).toBe("Caption survives merge");
});

test("native rich AST fixture has exact Wasm bytes, identities and retained cell bodies", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { admit_rich_ast, rich_ast_binding } = await import("/probe.js");
    const vector = await (await fetch("/native-vector.json")).json();
    const actual = JSON.parse(admit_rich_ast(vector.rich_ast_input));
    const input = JSON.parse(vector.rich_ast_input);
    return { actual, expected: vector.rich_ast_expected, binding: JSON.parse(rich_ast_binding()), input };
  });
  expect(result.actual).toEqual(result.expected);
  expect(result.binding.schemaFingerprint).toBe(result.input.schemaFingerprint);
  expect(result.actual.document_id).toBe("rich-golden-room");
  expect(result.actual.cells).toHaveLength(4);
  expect(result.actual.tables[0].cells[0].sources).toHaveLength(4);
  expect(result.actual.tables[0].cells.filter(cell => cell.sources.length === 0)).toHaveLength(3);
  expect(result.actual.images[0]).toMatchObject({ id: "covered-image", asset: "immutable-asset", generation: "generation-one", size: [640, 480] });
  expect(JSON.parse(result.actual.canonical)).toEqual(result.input);
});

test("rich AST Wasm admission rejects malformed metadata without changing a valid fixture", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { admit_rich_ast } = await import("/probe.js");
    const vector = await (await fetch("/native-vector.json")).json();
    const source = JSON.parse(vector.rich_ast_input);
    const canonical = value => Array.isArray(value) ? value.map(canonical)
      : value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    const changes = [
      doc => { doc.root.children[1].properties["breditor/table-id"] = ""; },
      doc => { doc.root.children[1].children[0].children.pop(); },
      doc => { doc.root.children[1].children[0].children.reverse(); },
      doc => { doc.root.children[1].children[1].properties["breditor/row-id"] = "r0"; },
      doc => { doc.root.children[1].properties["breditor/columns"][0].width = 31; },
      doc => { doc.root.children[1].properties["breditor/columns"][0].url = "https://example.test"; },
      doc => { doc.root.children[1].properties["breditor/merges"][0].writer = 9007199254740992; },
      doc => { doc.root.children[1].properties["breditor/merges"][0].writer = "01"; },
      doc => { doc.root.children[1].properties["breditor/merges"][0].counter = "18446744073709551616"; },
      doc => { doc.root.children[1].properties["breditor/merges"].push(structuredClone(doc.root.children[1].properties["breditor/merges"][0])); },
      doc => { doc.root.children[1].properties["breditor/retracted-merges"] = ["merge-one", "merge-one"]; },
      doc => { doc.root.children[0].properties["breditor/level"] = 7; },
      doc => { doc.root.children[0].properties["breditor/block-id"] = "body-00"; },
      doc => { doc.root.children[1].children[1].children[1].children[1].properties["breditor/asset-id"] = "https://example.test/signed?token=secret"; },
      doc => { doc.root.children[1].children[1].children[1].children[1].properties["breditor/decorative"] = true; },
      doc => { delete doc.root.children[1].children[1].children[1].children[1].properties["breditor/height"]; },
      doc => { doc.root.children[1].children[1].children[1].children[1].properties["breditor/upload-status"] = "done"; },
      doc => { doc.schemaFingerprint = `sha256:${"0".repeat(64)}`; },
    ];
    const rejected = changes.map(change => {
      const candidate = structuredClone(source); change(candidate);
      try { admit_rich_ast(JSON.stringify(canonical(candidate))); return false; }
      catch (error) {
        if (String(error).includes("secret")) throw new Error("caller payload leaked in diagnostic");
        return true;
      }
    });
    return { rejected, valid: JSON.parse(admit_rich_ast(vector.rich_ast_input)), expected: vector.rich_ast_expected };
  });
  expect(result.rejected).toHaveLength(18);
  expect(result.rejected.every(Boolean)).toBe(true);
  expect(result.valid).toEqual(result.expected);
});

test("rich table reorder updates snapshot paths and retracts spans without losing content", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { admit_rich_ast } = await import("/probe.js");
    const vector = await (await fetch("/native-vector.json")).json();
    const doc = JSON.parse(vector.rich_ast_input), table = doc.root.children[1];
    table.children.reverse(); table.properties["breditor/columns"].reverse();
    for (const row of table.children) row.children.reverse();
    table.properties["breditor/retracted-merges"] = ["merge-one"];
    return JSON.parse(admit_rich_ast(JSON.stringify(doc)));
  });
  expect(result.tables[0].rows).toEqual(["r1", "r0"]);
  expect(result.tables[0].columns.map(column => column.id)).toEqual(["c1", "c0"]);
  expect(result.tables[0].active).toEqual([]);
  expect(result.tables[0].cells.every(cell => cell.row_span === 1 && cell.column_span === 1 && cell.sources.length === 1)).toBe(true);
  expect(result.cells.find(cell => cell.id.row === "r0" && cell.id.column === "c0").path).toEqual([1, 1, 1]);
  expect(result.images[0].path).toEqual([1, 0, 0, 1]);
  expect(JSON.parse(result.canonical).root.children[1].children.flatMap(row => row.children).flatMap(cell => cell.children).filter(node => node.type === "breditor/paragraph")).toHaveLength(4);
});

test("native and Wasm table axis edits preserve exact inverses and map node grid and caption selections", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { exercise_table_axes } = await import("/probe.js");
    const vector = await (await fetch("/native-vector.json")).json();
    return { actual: JSON.parse(exercise_table_axes(vector.rich_ast_input)), expected: vector.table_axes_expected };
  });
  expect(result.actual).toEqual(result.expected);
  expect(result.actual.cases.map(value => value.name)).toEqual(["insert_row", "insert_column", "delete_row", "delete_column"]);
  for (const value of result.actual.cases) {
    expect(value.undone).toBe(result.actual.initial);
    expect(value.redone).toBe(value.changed);
    const node = value.mapping.find(mapping => mapping.name === "node");
    const grid = value.mapping.find(mapping => mapping.name === "grid");
    const text = value.mapping.find(mapping => mapping.name === "text");
    if (value.name.startsWith("insert")) {
      expect(node.outcome).toBe("preserved");
      expect(grid.outcome).toBe("preserved");
      expect(grid.selection.resolved.cells).toHaveLength(6);
      expect(grid.selection.resolved.masters).toHaveLength(1);
      expect(text.selection.kind.anchor.block).toBe("caption-one");
      expect(text.outcome).toBe("preserved");
    } else {
      expect(node).toMatchObject({ outcome: "cleared", reason: "target_deleted", selection: null });
      expect(grid.outcome).toBe("relocated");
      expect(grid.selection.resolved.cells).toHaveLength(2);
      expect(grid.selection.kind.anchor).toEqual(grid.selection.kind.focus);
      expect(text.outcome).toBe("relocated");
      expect(text.selection.kind.anchor.offset).toBe(0);
    }
  }
  const insertedRow = result.actual.cases[0].mapping.find(mapping => mapping.name === "node");
  expect(insertedRow.selection.resolved.path).toEqual([1, 2, 1, 1]);
});

test("Wasm rich selection admission preserves scalar boundaries direction and merged closure", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { resolve_rich_selection } = await import("/probe.js");
    const vector = await (await fetch("/native-vector.json")).json();
    const resolve = selection => JSON.parse(resolve_rich_selection(vector.rich_ast_input, JSON.stringify(selection)));
    const text = offset => ({ block: "body-01", offset, affinity: "after" });
    const cell = (row, column, table = "table-one") => ({ table, row, column });
    const valid = resolve({ kind: "text", anchor: text(9), focus: text(7) });
    const merged = resolve({ kind: "grid", anchor: cell("r1", "c1"), focus: cell("r1", "c1") });
    const node = resolve({ kind: "node", block: "covered-image-block" });
    const invalid = [
      ...[-1, 8, 10, 0.5, 2 ** 32, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY, "0", false, null].map(offset => ({ kind: "text", anchor: text(offset), focus: text(0) })),
      { kind: "text", anchor: { ...text(0), affinity: "sideways" }, focus: text(0) },
      { kind: "text", anchor: { ...text(0), extra: true }, focus: text(0) },
      { kind: "node", block: "row-block-0" },
      { kind: "node", block: "missing" },
      { kind: "node", block: "covered-image-block", extra: true },
      { kind: "grid", anchor: cell("r0", "c0"), focus: cell("r1", "c1", "other-table") },
      { kind: "grid", anchor: cell("missing", "c0"), focus: cell("r1", "c1") },
    ];
    const rejected = invalid.map(value => { try { resolve(value); return false; } catch { return true; } });
    let duplicateRejected = false;
    const duplicate = JSON.stringify({ kind: "text", anchor: text(7), focus: text(9) }).replace('"offset":7', '"offset":7,"offset":7');
    try { resolve_rich_selection(vector.rich_ast_input, duplicate); } catch { duplicateRejected = true; }
    return { valid, merged, node, rejected, duplicateRejected };
  });
  expect(result.valid.kind.anchor.offset).toBe(9);
  expect(result.valid.kind.focus.offset).toBe(7);
  expect(result.valid.resolved.anchor.offset).toBe(9);
  expect(result.merged.resolved.cells).toHaveLength(4);
  expect(result.merged.resolved.masters).toHaveLength(1);
  expect(result.merged.kind.anchor).toEqual(result.merged.kind.focus);
  expect(result.node.resolved.path).toEqual([1, 1, 1, 1]);
  expect(result.rejected).toHaveLength(18);
  expect(result.rejected.every(Boolean)).toBe(true);
  expect(result.duplicateRejected).toBe(true);
});
