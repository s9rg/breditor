import {createStandardRichInlinePresentationV1, mountRichWritingTools} from "/rich.js";

const schema = {name: "example/document-contents", version: 2};
const status = document.querySelector("#contents-ready");
const toolbarControls = new Set(["undo", "redo", "h2", "h3"]);
const guide = [
 ["start", 2, "Getting started", "A short guide to storing a document, working together, and recovering a copy."],
 ["storage", 3, "Local storage", "Keep your working copy in the browser when you need to edit without a connection. Save an exact checkpoint before moving to another device."],
 ["sharing", 3, "Shared sessions", "Open the same room as a separate writer. Each writer keeps their own editing history while both see the same document."],
 ["recovery", 2, "Recovery", "Keep recovery instructions close to the document so collaborators can find them when they need them."],
 ["checkpoints", 3, "Restore a checkpoint", "Restore into a separate session first and check the document before reconnecting collaborators."],
];

function documentJson({schema, schemaFingerprint}) {
 const text = value => [{kind: "text", text: value, formats: []}];
 return JSON.stringify({
  format: "breditor/document", formatVersion: 2, schema, schemaFingerprint,
  root: {kind: "element", type: "breditor/document", entityId: null,
   properties: {"breditor/document-id": "contents-demo"}, children: guide.flatMap(([id, level, heading, body]) => [
    {kind: "element", type: "breditor/heading", entityId: null,
     properties: {"breditor/block-id": id, "breditor/level": level}, children: text(heading)},
    {kind: "element", type: "breditor/paragraph", entityId: null,
     properties: {"breditor/block-id": `${id}-body`}, children: text(body)},
   ])},
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
 const inlinePresentation = createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
 const core = profile.createEditor(documentJson(profile.descriptor()));
 const toolbar = api.createStructuralRichToolbarV2(core, inlinePresentation).filter(item => toolbarControls.has(item.id));
 return [api.mountRichEditor(document.querySelector("#a"), {core, toolbar, inlinePresentation, onError: report})];
}

async function openShared() {
 const [wasm, api] = await Promise.all([import("/probe.js"), import("/shared.js")]);
 await wasm.default();
 const profile = api.compileStandardStructuralSharedProfileV2(wasm, {
  format: "breditor/shared-rich-profile", formatVersion: 2, schema, extensions: [],
 });
 const inlinePresentation = createStandardRichInlinePresentationV1(profile.inline_catalog_json());
 const a = new api.SharedRichEditor(profile.create(documentJson(JSON.parse(profile.descriptor_json())), "101"));
 const b = new api.SharedRichEditor(profile.join_frame("contents-demo", "202", a.updateFrame()));
 profile.free();

 let delivery = Promise.resolve();
 return [[a, b, "a"], [b, a, "b"]].map(([core, peer, id]) => {
  const toolbar = api.createStructuralSharedToolbarV2(core, inlinePresentation).filter(item => toolbarControls.has(item.id));
  return api.mountSharedEditor(document.querySelector(`#${id}`), {
   core, inlinePresentation, toolbar, label: `Writer ${id.toUpperCase()}`, onError: report,
   onChange(event) {
    if (event.source === "local") delivery = delivery.then(() => peer.receiveFrame(core.updateFrame())).catch(report);
   },
  });
 });
}

try {
 const editors = await (document.body.dataset.mode === "shared" ? openShared() : openLocal());
 const shared = document.body.dataset.mode === "shared";
 const panels = editors.map((editor, index) => {
  const host = document.createElement("div");
  editor.surface.before(host);
  return mountRichWritingTools(host, editor, {
   presentation: "contents", label: shared ? `Writer ${index === 0 ? "A" : "B"} contents` : "On this page", scrollContainer: editor.surface, onError: report,
  });
 });
 status.textContent = "Ready";
 window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  for (const panel of panels) panel.dispose();
  for (const editor of editors) editor.dispose();
 });
} catch (error) {
 report(error);
}
