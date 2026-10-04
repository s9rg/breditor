// Native IndexedDB + SHA-256 + real V6 Wasm + production adapter/autosave.
// Runs only in the isolated browser qualification context, never the user's DB.
import { bootstrapFlatListWasmEngine, preflightFlatListWasmSemanticProfile } from "../packages/breditor-browser/src/wasm_engine_bootstrap.ts";
import { BreditorFlatListWasmCommandAdapter, contentReadPortsForAdapter } from "../packages/breditor-browser/src/wasm_command_adapter.ts";
import { BreditorFlatListCommandQueue } from "../packages/breditor-browser/src/command_queue.ts";
import { BreditorDomRenderer } from "../packages/breditor-browser/src/dom_renderer.ts";
import { BreditorFlatListDomSelectionBridge } from "../packages/breditor-browser/src/dom_selection.ts";
import { compileBrowserPresentation } from "../packages/breditor-browser/src/compiled_browser_presentation.ts";
import { createInlineFormatRenderManifest } from "../packages/breditor-browser/src/inline_format_render_manifest.ts";
import { FlatListRangeSelection } from "../packages/breditor-browser/src/flat_list_selection.ts";
import { consumeFlatListSemanticSelection } from "../packages/breditor-browser/src/wasm_selection_adapter.ts";
import { flatListCommandRequest, flatListRangeSelectionSync, preserveSelectionSync } from "../packages/breditor-browser/src/editor_command.ts";
import { IndexedDbSessionCheckpointStore } from "../packages/breditor-browser/src/indexeddb_session_checkpoint.ts";
import { BreditorSessionCheckpointAutosave } from "../packages/breditor-browser/src/session_checkpoint_autosave.ts";
import { verifyFlatListEditorOwner } from "./flat-list-editor-owner-scenario.mjs";

const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`list persistence: ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
};
const value = result => { if (!result.ok) throw new Error(result.error?.code ?? "invalid result"); return result.value; };

export async function verifyFlatListPersistence(api, iteration) {
  const owners = [], stores = [], autosaves = [], releases = [];
  const schema = {name: "example/list-persistence", version: 1};
  const semanticProfile = {formatVersion: 4,
    bootstrapJson: JSON.stringify({format: "breditor/profile-bootstrap", formatVersion: 4, schema, extensions: []})};
  const checked = preflightFlatListWasmSemanticProfile(api, semanticProfile);
  if (!checked.ok) throw new Error(checked.error.code);
  const fingerprint = checked.profileDescriptor.schema.fingerprint;
  const element = (type, children, properties = {}) => ({kind: "element", type: `breditor/${type}`, entityId: null, properties, children});
  const block = (text, rank) => element(rank ? "heading" : "paragraph", [{kind: "text", text, formats: []}], rank ? {"breditor/level": rank} : {});
  const item = block => element("list-item", [block]);
  const documentJson = JSON.stringify({format: "breditor/document", formatVersion: 2, schema, schemaFingerprint: fingerprint,
    root: element("document", [element("ordered-list", [item(block("A🙂", 2)), item(block("B"))], {"breditor/start": 8})])});
  const binding = {slot: `qualification.list-persistence.${iteration}`, schemaFingerprint: fingerprint, checkpointFormatVersion: 6};
  const store = (selectedBinding = binding) => {
    const instance = new IndexedDbSessionCheckpointStore({indexedDB, crypto: crypto.subtle, binding: selectedBinding});
    stores.push(instance); return instance;
  };
  const start = source => {
    const boot = bootstrapFlatListWasmEngine(api, {...source, semanticProfile});
    if (!boot.ok) throw new Error(boot.error.code);
    const host = document.createElement("div"); document.body.append(host);
    const bridge = new BreditorFlatListDomSelectionBridge();
    let adapter, queue;
    owners.push(() => { queue?.dispose(); if (adapter) adapter.dispose(); else { boot.observation.free(); boot.profileGeneration.free(); }
      bridge.dispose(); host.remove(); boot.engine.free(); });
    const presentation = compileBrowserPresentation(boot.profileGeneration, boot.profileDescriptor,
      createInlineFormatRenderManifest({recipes: [{formatKind: "breditor/strong", element: "strong"}]}));
    const renderer = new BreditorDomRenderer(presentation);
    const rendered = value(renderer.renderFlatList(host, boot.projection)).rendered;
    adapter = new BreditorFlatListWasmCommandAdapter(boot.engine, boot.observation, {
      durableMode: "v6", profileGeneration: boot.profileGeneration, profileDescriptor: boot.profileDescriptor,
      renderer, rendered, selectionBridge: bridge});
    queue = new BreditorFlatListCommandQueue(adapter.commandExecutor);
    const ports = contentReadPortsForAdapter(adapter);
    const send = (command, selection = preserveSelectionSync()) => {
      const outcome = queue.submit(flatListCommandRequest(adapter.deliveryToken(), selection,
        {kind: "api", detail: "persistence qualification"}, command));
      equal(outcome.status, "completed"); equal(adapter.state, "live"); return outcome.result;
    };
    const documentRoot = () => { const result = ports.documentJson.read(); if (!result?.ok) throw new Error("document read failed");
      return JSON.parse(result.document.documentJson).root; };
    const selection = () => {
      const observation = boot.engine.observation(); let result;
      try {
        result = boot.engine.selection(observation);
        const selected = value(consumeFlatListSemanticSelection(adapter.rendered.projection, result.takeSelection(), boot.profileGeneration));
        return selected === null ? null : {anchor: selected.anchor, focus: selected.focus, order: selected.order};
      } finally { result?.free(); observation.free(); }
    };
    return {adapter, queue, ports, send, documentRoot, selection};
  };
  try {
    const firstStore = store(), staleStore = store();
    const initial = await firstStore.load(), stale = await staleStore.load();
    equal(initial.status, "empty"); equal(stale.status, "empty");
    const first = start({kind: "document", lineageId: `persist-list-${iteration}`, documentJson, historyCapacity: 20});
    const autosave = new BreditorSessionCheckpointAutosave(first.ports.sessionCheckpointJson, firstStore, initial.token);
    autosaves.push(autosave); releases.push(first.adapter.observeCoreCommits(autosave.commitObserver));
    const selected = value(FlatListRangeSelection.create(first.adapter.rendered.projection, {kind: "range",
      anchor: {kind: "text", textPath: [0, 0, 0, 0], utf16Offset: 3, affinity: "before"},
      focus: {kind: "text", textPath: [0, 0, 0, 0], utf16Offset: 1, affinity: "after"}}));
    first.send({kind: "selection", operation: "synchronize"}, flatListRangeSelectionSync(selected));
    const original = first.documentRoot(), originalSelection = first.selection();
    first.send({kind: "action", actionId: "breditor/insert-flat-list-plain-text", input: {kind: "string", value: "漢\n字"}});
    const edited = first.documentRoot(), editedSelection = first.selection();
    first.send({kind: "history", operation: "undo"});
    equal(first.documentRoot(), original); equal(first.selection(), originalSelection);
    equal(await autosave.flush(), {status: "committed"}); equal(autosave.getStatus(), {phase: "idle", dirty: false});
    const saved = await firstStore.load(); equal(saved.status, "loaded"); equal(JSON.parse(saved.checkpointJson).formatVersion, 6);
    equal((await staleStore.save(stale.token, saved.checkpointJson)).error?.code, "session_checkpoint.conflict");
    equal((await staleStore.save(saved.token, saved.checkpointJson)).error?.code, "session_checkpoint.invalid_token");
    const wrongVersion = store({...binding, checkpointFormatVersion: 5});
    equal((await wrongVersion.load()).error?.code, "session_checkpoint.binding_mismatch");
    const wrongSchema = store({...binding, schemaFingerprint: `sha256:${"0".repeat(64)}`});
    equal((await wrongSchema.load()).error?.code, "session_checkpoint.binding_mismatch");

    const staleEditor = start({kind: "sessionCheckpoint", checkpointJson: saved.checkpointJson});
    const conflictingAutosave = new BreditorSessionCheckpointAutosave(staleEditor.ports.sessionCheckpointJson, staleStore, stale.token);
    autosaves.push(conflictingAutosave); releases.push(staleEditor.adapter.observeCoreCommits(conflictingAutosave.commitObserver));
    staleEditor.send({kind: "history", operation: "redo"});
    const conflict = {status: "failed", failure: {code: "session_checkpoint_autosave.save_failed", causeCode: "session_checkpoint.conflict"}};
    equal(await conflictingAutosave.flush(), conflict);
    equal(conflictingAutosave.getStatus(), {phase: "paused", dirty: true, failure: conflict.failure});
    equal(await conflictingAutosave.retry(), conflict);
    equal((await firstStore.load()).checkpointJson, saved.checkpointJson);
    autosave.dispose(); firstStore.close();

    const reopenedStore = store(), loaded = await reopenedStore.load(); equal(loaded.status, "loaded");
    equal(loaded.checkpointJson, saved.checkpointJson);
    const resumed = start({kind: "sessionCheckpoint", checkpointJson: loaded.checkpointJson});
    equal(resumed.documentRoot(), original); equal(resumed.selection(), originalSelection);
    const resumedAutosave = new BreditorSessionCheckpointAutosave(resumed.ports.sessionCheckpointJson, reopenedStore, loaded.token);
    autosaves.push(resumedAutosave); releases.push(resumed.adapter.observeCoreCommits(resumedAutosave.commitObserver));
    resumed.send({kind: "history", operation: "redo"});
    equal(resumed.documentRoot(), edited); equal(resumed.selection(), editedSelection);
    equal(await resumedAutosave.flush(), {status: "committed"});
    const afterRedo = await reopenedStore.load(); equal(afterRedo.status, "loaded");
    const third = start({kind: "sessionCheckpoint", checkpointJson: afterRedo.checkpointJson});
    equal(third.documentRoot(), edited); equal(third.selection(), editedSelection);
    third.send({kind: "history", operation: "undo"});
    equal(third.documentRoot(), original); equal(third.selection(), originalSelection);
    await verifyFlatListEditorOwner(api, semanticProfile, documentJson, iteration);
  } finally {
    for (const release of releases.reverse()) release();
    for (const autosave of autosaves.reverse()) autosave.dispose();
    for (const instance of stores.reverse()) instance.close();
    for (const dispose of owners.reverse()) dispose();
  }
}
