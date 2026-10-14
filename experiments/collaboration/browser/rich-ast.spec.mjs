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
