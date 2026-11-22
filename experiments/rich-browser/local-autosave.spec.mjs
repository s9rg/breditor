import {expect, test} from "@playwright/test";

async function open(page) {
 await page.goto("/");
 await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async () => {
  const api = await import("/rich.js");
  const {mountRichLocalAutosave} = await import("/dist/browser/persistence/local_autosave.js");
  const profile = api.compileRichProfile(window.rich.wasm, JSON.stringify({
   format: "breditor/profile-bootstrap", formatVersion: 6, schema: {name: "example/autosave", version: 1}, extensions: [],
  }));
  const store = await api.RichLocalSessionStore.open("breditor-autosave-contract");
  const saved = await store.load(), binding = profile.descriptor();
  const core = saved ? profile.restoreEditor(saved) : profile.createEditor(JSON.stringify({
   format: "breditor/document", formatVersion: 2, schema: binding.schema, schemaFingerprint: binding.schemaFingerprint,
   root: {kind: "element", type: "breditor/document", entityId: null, properties: {"breditor/document-id": "autosave"},
    children: [{kind: "element", type: "breditor/paragraph", entityId: null, properties: {"breditor/block-id": "p"},
     children: [{kind: "text", text: "Original", formats: []}]}]},
  }));
  const host = document.createElement("main");
  document.body.append(host);
  const editor = api.mountRichEditor(host, {core});
  const records = [];
  let blocked = false;
  const destination = {save(checkpoint) {
   if (blocked) return Promise.reject(Error("The host write failed"));
   records.push(checkpoint);
   return store.save(checkpoint);
  }};
  const autosave = mountRichLocalAutosave(editor, destination, {delayMs: 120, maxLatencyMs: 400});
  window.autosaveTest = {editor, autosave, store, records, block(value) { blocked = value; }};
 });
}

test("autosave coalesces native publications and restores exact history after reload", async ({page}) => {
 await open(page);
 await expect.poll(() => page.evaluate(() => window.autosaveTest.autosave.getStatus().phase)).toBe("idle");
 const expected = await page.evaluate(async () => {
  const {editor, autosave, store, records} = window.autosaveTest;
  const before = records.length;
  const point = {block: "p", offset: "0", affinity: "after"};
  editor.execute({kind: "setSelection", selection: {kind: "text", anchor: point, focus: point}}, false);
  editor.execute({kind: "insertPlainText", text: "Saved "}, false);
  editor.execute({kind: "insertPlainText", text: "exact "}, false);
  const checkpoint = editor.checkpointJson(), result = await autosave.flush();
  return {checkpoint, saved: await store.load(), status: result.status, writes: records.length - before, depth: editor.view().undoDepth};
 });
 expect(expected).toMatchObject({saved: expected.checkpoint, status: "committed", writes: 1});
 await open(page);
 expect(await page.evaluate(() => window.autosaveTest.editor.checkpointJson())).toBe(expected.checkpoint);
 expect(await page.evaluate(() => window.autosaveTest.editor.view().undoDepth)).toBe(expected.depth);
 await expect(page.locator("[data-rich-text='p']")).toHaveText("Saved exact Original");
});

test("a failed rich checkpoint stays dirty until retry and disposal releases its binding", async ({page}) => {
 await open(page);
 expect(await page.evaluate(async () => {
  const {editor, autosave, store, block} = window.autosaveTest;
  await autosave.flush();
  const original = await store.load();
  block(true);
  const point = {block: "p", offset: "0", affinity: "after"};
  editor.execute({kind: "setSelection", selection: {kind: "text", anchor: point, focus: point}}, false);
  editor.execute({kind: "insertPlainText", text: "Retried "}, false);
  const failed = await autosave.flush(), paused = autosave.getStatus();
  const retained = await store.load() === original;
  block(false);
  const retry = await autosave.retry();
  const saved = await store.load() === editor.checkpointJson();
  autosave.dispose();
  const {mountRichLocalAutosave} = await import("/dist/browser/persistence/local_autosave.js");
  const remount = mountRichLocalAutosave(editor, store);
  remount.dispose();
  return {failure: failed.status, paused: paused.phase, dirty: paused.dirty, retained, retry: retry.status, saved};
 })).toEqual({failure: "failed", paused: "paused", dirty: true, retained: true, retry: "committed", saved: true});
});
