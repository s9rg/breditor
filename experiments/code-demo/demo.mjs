import {createStandardRichInlinePresentationV1, mountRichCodeHighlighting} from "/rich.js";

const status = document.querySelector("#code-ready");
const colors = document.querySelector("#syntax-colors");
const schema = {name: "example/code-highlighting", version: 2};
const controls = new Set(["undo", "redo", "code-language"]);
const retry = [
 "// Back off after each failed request.",
 "const maxAttempts = 3;",
 "function retryDelay(attempt: number) {",
 '  if (attempt >= maxAttempts) return null;',
 '  return { delay: 250 * 2 ** attempt, unit: "ms" };',
 "}",
].join("\n");
const options = [
 "{",
 '  "maxAttempts": 3,',
 '  "strategy": "exponential",',
 '  "enabled": true',
 "}",
].join("\n");

function block(type, id, properties, text) {
 return {
  kind: "element", type: `breditor/${type}`, entityId: null,
  properties: {"breditor/block-id": id, ...properties},
  children: [{kind: "text", text, formats: []}],
 };
}

function sample(binding, shared) {
 const children = [
  block("heading", "retry-title", {"breditor/level": 3}, "Retry policy"),
  block("code-block", "retry", {"breditor/language": "typescript"}, retry),
 ];
 if (!shared) children.push(
  block("heading", "options-title", {"breditor/level": 3}, "Configuration"),
  block("code-block", "options", {"breditor/language": "json"}, options),
 );
 return JSON.stringify({
  format: "breditor/document", formatVersion: 2, schema: binding.schema,
  schemaFingerprint: binding.schemaFingerprint,
  root: {kind: "element", type: "breditor/document", entityId: null,
   properties: {"breditor/document-id": "code-demo"}, children},
 });
}

function report(error) {
 status.textContent = error instanceof Error ? error.message : String(error);
}

async function openLocal() {
 const [wasm, api] = await Promise.all([import("/wasm.js"), import("/rich.js")]);
 await wasm.default();
 const profile = api.compileStandardStructuralRichProfileV2(wasm, JSON.stringify({
  format: "breditor/profile-bootstrap", formatVersion: 7, schema, extensions: [],
 }));
 const core = profile.createEditor(sample(profile.descriptor(), false));
 const inlinePresentation = createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
 const toolbar = api.createStructuralRichToolbarV2(core, inlinePresentation).filter(control => controls.has(control.id));
 return [api.mountRichEditor(document.querySelector("#a"), {core, toolbar, inlinePresentation, onError: report})];
}

async function openShared() {
 const [wasm, api] = await Promise.all([import("/probe.js"), import("/shared.js")]);
 await wasm.default();
 const profile = api.compileStandardStructuralSharedProfileV2(wasm, {
  format: "breditor/shared-rich-profile", formatVersion: 2, schema, extensions: [],
 });
 const binding = JSON.parse(profile.descriptor_json());
 const inlinePresentation = createStandardRichInlinePresentationV1(profile.inline_catalog_json());
 const a = new api.SharedRichEditor(profile.create(sample(binding, true), "101"));
 const b = new api.SharedRichEditor(profile.join_frame("code-demo", "202", a.updateFrame()));
 profile.free();
 let pending = Promise.resolve();
 return [[a, b, "a"], [b, a, "b"]].map(([core, peer, id]) => {
  const toolbar = api.createStructuralSharedToolbarV2(core, inlinePresentation).filter(control => controls.has(control.id));
  return api.mountSharedEditor(document.querySelector(`#${id}`), {
   core, toolbar, inlinePresentation, label: `Writer ${id.toUpperCase()}`, onError: report,
   onChange(event) {
    if (event.source === "local") pending = pending.then(() => peer.receiveFrame(core.updateFrame())).catch(report);
   },
  });
 });
}

try {
 const editors = await (document.body.dataset.codeDemo === "shared" ? openShared() : openLocal());
 let highlighting = editors.map(editor => mountRichCodeHighlighting(editor));
 const supported = highlighting.every(mount => mount.supported);
 colors.checked = supported;
 colors.disabled = !supported;
 colors.addEventListener("change", () => {
  for (const mount of highlighting) mount.dispose();
  highlighting = colors.checked ? editors.map(editor => mountRichCodeHighlighting(editor)) : [];
 });
 status.textContent = supported ? "Ready" : "Ready · plain code";
 window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  for (const mount of highlighting) mount.dispose();
  for (const editor of editors) editor.dispose();
 });
} catch (error) {
 report(error);
}
