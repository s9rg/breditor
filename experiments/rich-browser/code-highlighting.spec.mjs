import {expect, test} from "@playwright/test";

const sample = 'const leaf = "🌱";\n// note';
const tokens = page => page.evaluate(() => Object.fromEntries(
 [...CSS.highlights].filter(([name]) => name.startsWith("breditor-syntax-")).map(([name, ranges]) =>
  [name.split("-").at(-1), [...ranges].map(range => range.toString())])
));

test("local syntax colors preserve DOM, editing offsets, history, and undo", async ({page}) => {
 await page.goto("/");
 await expect(page.locator("#status")).toHaveText("Ready");
 const baseline = await page.evaluate(async sample => {
  const api = await import("/rich.js");
  const profile = api.compileStructuralRichProfileV2(window.rich.wasm, JSON.stringify({
   format: "breditor/profile-bootstrap", formatVersion: 7, schema: {name: "example/syntax", version: 2}, extensions: [],
  }));
  const binding = profile.descriptor();
  const block = (id, language, text) => ({
   kind: "element", type: "breditor/code-block", entityId: null,
   properties: {"breditor/block-id": id, "breditor/language": language},
   children: [{kind: "text", text, formats: []}],
  });
  const core = profile.createEditor(JSON.stringify({
   format: "breditor/document", formatVersion: 2, schema: binding.schema, schemaFingerprint: binding.schemaFingerprint,
   root: {kind: "element", type: "breditor/document", entityId: null, properties: {"breditor/document-id": "syntax"},
    children: [block("code", "ts", sample), block("plain", "unknown", 'const inert = "<img>";'),
     block("long", "js", "const " + "x".repeat(16_384))]},
  }));
  const host = document.createElement("main");
  document.body.append(host);
  const errors = [];
  const editor = api.mountRichEditor(host, {core, onError: error => errors.push(String(error))});
  const before = {html: editor.surface.innerHTML, checkpoint: editor.checkpointJson()};
  const highlighting = api.mountRichCodeHighlighting(editor);
  window.syntax = {editor, highlighting, errors};
  return {supported: highlighting.supported, stable: before.html === editor.surface.innerHTML &&
   before.checkpoint === editor.checkpointJson(), depth: editor.view().undoDepth};
 }, sample);
 expect(baseline).toMatchObject({supported: true, stable: true});
 await expect.poll(() => tokens(page)).toEqual({
  keyword: ["const"], operator: ["="], string: ['"🌱"'], comment: ["// note"],
 });
 const code = page.locator('pre[data-rich-text="code"] code');
 await code.evaluate(element => {
  const editor = window.syntax.editor;
  editor.focus();
  const point = {block: "code", offset: String(element.textContent.length), affinity: "after"};
  editor.execute({kind: "setSelection", selection: {kind: "text", anchor: point, focus: point}});
 });
 await page.keyboard.type("!");
 await expect.poll(() => code.textContent()).toBe(sample + "!");
 await expect.poll(() => tokens(page)).toMatchObject({comment: ["// note!"]});
 expect(await page.evaluate(() => window.syntax.editor.view().undoDepth)).toBe(baseline.depth + 1);
 await page.evaluate(() => window.syntax.editor.execute({kind: "undo"}));
 await expect.poll(() => tokens(page)).toMatchObject({comment: ["// note"]});
 await page.evaluate(async () => {
  const {editor, highlighting} = window.syntax;
  highlighting.dispose();
  const {mountRichCodeHighlighting} = await import("/rich.js");
  const remount = mountRichCodeHighlighting(editor);
  highlighting.dispose();
  try {
   const duplicate = mountRichCodeHighlighting(editor);
   duplicate.dispose();
   throw Error("Expected the remounted surface to reject a second decorator");
  } catch (error) {
   if (error.message !== "Code highlighting is already mounted on this surface") throw error;
  } finally {
   remount.dispose();
  }
 });
 expect(await tokens(page)).toEqual({});
 expect(await code.textContent()).toBe(sample);
 expect(await page.evaluate(() => window.syntax.errors)).toEqual([]);
});
