import {expect, test} from "@playwright/test";

test("contents follows a local document and navigates without adding an Undo group", async ({page}) => {
 await page.goto("/");
 await expect(page.locator("#status")).toHaveText("Ready");
 const original = await page.evaluate(async () => {
  const api = await import("/rich.js");
  const profile = api.compileRichProfileV4(window.rich.wasm, JSON.stringify({
   format: "breditor/profile-bootstrap", formatVersion: 9,
   schema: {name: "example/contents-outline", version: 4}, extensions: [],
  }));
  const binding = profile.descriptor();
  const element = (type, id, props, children) => ({
   kind: "element", type: `breditor/${type}`, entityId: null,
   properties: {"breditor/block-id": id, ...props}, children,
  });
  const run = text => ({kind: "text", text, formats: []});
  const heading = (id, level, text) => element("heading", id, {"breditor/level": level}, [run(text)]);
  const section = element("details", "fold", {}, [
   element("details-summary", "summary", {}, [run("More")]), heading("hidden", 3, "Hidden section"),
  ]);
  const core = profile.createEditor(JSON.stringify({
   format: "breditor/document", formatVersion: 2, schema: binding.schema, schemaFingerprint: binding.schemaFingerprint,
   root: {kind: "element", type: "breditor/document", entityId: null, properties: {"breditor/document-id": "contents"},
    children: [heading("start", 2, "Getting started"), heading("step", 4, "First step"), section, heading("end", 2, "Recovery")]},
  }));
  const mount = document.createElement("main"), navigation = document.createElement("div");
  document.body.append(navigation, mount);
  const errors = [];
  const editor = api.mountRichEditor(mount, {core, onError: error => errors.push(String(error))});
  const contents = api.mountRichWritingTools(navigation, editor, {
   presentation: "contents", label: "Table of contents", onError: error => errors.push(String(error)),
  });
  window.contentsTest = {editor, contents, errors};
  return {document:editor.view().documentJson, depth:editor.view().undoDepth, html:editor.surface.innerHTML};
 });
 const nav = page.getByRole("navigation", {name: "Table of contents"});
 await expect(nav.locator("ol > li > ol")).toContainText("First step");
 await expect(nav.getByRole("button", {name: "Hidden section"})).toHaveCount(0);
 await expect(nav.locator("[data-writing-counts]")).toHaveCount(0);
 await expect(nav.getByRole("button", {name: "Recovery"})).toBeEnabled();
 await nav.getByRole("button", {name: "Recovery"}).focus();
 await page.keyboard.press("Home");
 await expect(nav.getByRole("button", {name: "Getting started"})).toBeFocused();
 await page.keyboard.press("End");
 await page.keyboard.press("Enter");
 await expect.poll(() => page.evaluate(() => window.contentsTest.editor.view().selection?.focus.block)).toBe("end");
 expect(await page.evaluate(() => {
  const {editor} = window.contentsTest;
  return {document:editor.view().documentJson, depth:editor.view().undoDepth, html:editor.surface.innerHTML};
 })).toEqual(original);
 await page.keyboard.insertText("Offline ");
 await expect(nav.getByRole("button", {name: "Offline Recovery"})).toBeEnabled();
 await page.evaluate(() => window.contentsTest.editor.execute({kind: "setDetailsOpen", data: {block: "fold", open: true}}));
 await expect(nav.getByRole("button", {name: "Hidden section"})).toBeEnabled();
 expect(await page.evaluate(() => window.contentsTest.errors)).toEqual([]);
});
