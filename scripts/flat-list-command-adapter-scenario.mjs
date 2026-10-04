// Real queue -> production adapter -> Wasm -> DOM, not keyboard/IME/clipboard.
import { bootstrapFlatListWasmEngine } from "../packages/breditor-browser/src/wasm_engine_bootstrap.ts";
import { BreditorFlatListWasmCommandAdapter, contentReadPortsForAdapter } from "../packages/breditor-browser/src/wasm_command_adapter.ts";
import { BreditorFlatListCommandQueue } from "../packages/breditor-browser/src/command_queue.ts";
import { BreditorDomRenderer } from "../packages/breditor-browser/src/dom_renderer.ts";
import { BreditorFlatListDomSelectionBridge } from "../packages/breditor-browser/src/dom_selection.ts";
import { compileBrowserPresentation } from "../packages/breditor-browser/src/compiled_browser_presentation.ts";
import { createInlineFormatRenderManifest } from "../packages/breditor-browser/src/inline_format_render_manifest.ts";
import { FlatListRangeSelection } from "../packages/breditor-browser/src/flat_list_selection.ts";
import { flatListCommandRequest, flatListRangeSelectionSync, preserveSelectionSync, flatListEditorDeliveryAuthorityAccepts,
  editorDeliveryAuthorityAccepts } from "../packages/breditor-browser/src/editor_command.ts";

const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`list command adapter mismatch: ${JSON.stringify(actual)}`);
};
const value = result => { if (!result.ok) throw new Error(result.error.code); return result.value; };
const mustThrow = operation => {
  let threw = false; try { operation(); } catch { threw = true; }
  if (!threw) throw new Error("invalid list delivery was accepted");
};
const endpoints = range => range === null ? null : {anchor: range.anchor, focus: range.focus, order: range.order};

export function verifyFlatListCommandAdapter(api, semanticProfile, documentJson) {
  const owners = [];
  const boot = source => {
    const started = bootstrapFlatListWasmEngine(api, {...source, semanticProfile});
    if (!started.ok) throw new Error(`adapter bootstrap failed: ${started.error.code}`);
    const host = document.createElement("div"); host.contentEditable = "true"; document.body.append(host);
    const bridge = new BreditorFlatListDomSelectionBridge();
    const presentation = compileBrowserPresentation(started.profileGeneration, started.profileDescriptor,
      createInlineFormatRenderManifest({recipes: [{formatKind: "breditor/strong", element: "strong"}]}));
    let failUpdate = false;
    class TestRenderer extends BreditorDomRenderer {
      updateFlatList(rendered, update) {
        if (failUpdate) { failUpdate = false; throw new Error("injected post-commit DOM failure"); }
        return super.updateFlatList(rendered, update);
      }
    }
    const renderer = new TestRenderer(presentation);
    let adapter;
    owners.push(() => {
      document.getSelection()?.removeAllRanges();
      try {
        if (adapter) adapter.dispose();
        else { started.observation.free(); started.profileGeneration.free(); }
      } finally { bridge.dispose(); host.remove(); started.engine.free(); }
    });
    const rendered = value(renderer.renderFlatList(host, started.projection)).rendered;
    adapter = new BreditorFlatListWasmCommandAdapter(started.engine, started.observation, {
      durableMode: "v6", profileGeneration: started.profileGeneration, profileDescriptor: started.profileDescriptor,
      renderer, rendered, selectionBridge: bridge,
    });
    const queue = new BreditorFlatListCommandQueue(adapter.commandExecutor);
    owners.push(() => queue.dispose());
    const send = (command, selection = preserveSelectionSync(), history) => {
      const token = adapter.deliveryToken();
      const request = flatListCommandRequest(token, selection, {kind: "api", detail: "list adapter qualification"}, command, history);
      equal(flatListEditorDeliveryAuthorityAccepts(adapter.deliveryAuthority, token), true);
      equal(editorDeliveryAuthorityAccepts(adapter.deliveryAuthority, token), false);
      const delivered = queue.submit(request);
      equal(delivered.status, "completed");
      equal(adapter.acceptsDeliveryToken(token), false);
      equal(adapter.state, "live"); equal(adapter.rendered.validateCanonicalDom(), true);
      mustThrow(() => adapter.execute(request));
      return delivered.result;
    };
    const ports = contentReadPortsForAdapter(adapter);
    if (!ports) throw new Error("list content capability unavailable");
    const documentRoot = () => {
      const result = ports.documentJson.read();
      if (!result?.ok) throw new Error("list document reader failed");
      return JSON.parse(result.document.documentJson).root;
    };
    const selection = () => endpoints(value(bridge.read(adapter.rendered)).selection);
    return {adapter, host, bridge, send, ports, documentRoot, selection, failNextUpdate: () => { failUpdate = true; }};
  };
  try {
    const first = boot({kind: "document", lineageId: "list-command-adapter", documentJson, historyCapacity: 20});
    const {adapter, host, bridge, send, ports} = first;
    const commits = []; const release = adapter.observeCoreCommits(commit => commits.push(commit.eventKind));
    const point = {kind: "text", textPath: [1, 0, 0, 0], utf16Offset: 1, affinity: "before"};
    const selection = value(FlatListRangeSelection.create(adapter.rendered.projection, {kind: "range", anchor: point, focus: point}));
    value(bridge.write(adapter.rendered, selection));
    const originalRoot = first.documentRoot();
    const openingToken = adapter.deliveryToken();
    mustThrow(() => adapter.beginCompositionLease(openingToken, selection, 1n));
    equal(adapter.state, "live"); equal(adapter.acceptsDeliveryToken(openingToken), true);
    const inserted = send({kind: "action", actionId: "breditor/insert-flat-list-plain-text", input: {kind: "string", value: "x\ny"}},
      flatListRangeSelectionSync(selection), "closeBefore");
    equal(inserted.command.status, "committed");
    equal(host.querySelectorAll("li").length, 4); equal(host.querySelector("ol").start, 8);
    equal(ports.plainText.read()?.content.text, "Intro\nAx\ny🙂\nB\n");
    const editedRoot = first.documentRoot(); const editedSelection = first.selection();
    equal(send({kind: "history", operation: "undo"}).command.status, "committed");
    equal(first.documentRoot(), originalRoot); equal(first.selection(), endpoints(selection));
    const checkpoint = ports.sessionCheckpointJson.read();
    if (!checkpoint?.ok) throw new Error("adapter checkpoint reader failed");
    equal(send({kind: "history", operation: "redo"}).command.status, "committed");
    equal(first.documentRoot(), editedRoot); equal(first.selection(), editedSelection);
    equal(commits, ["selection", "action", "undo", "redo"]); release();
    const stale = adapter.deliveryToken(); host.querySelector("ol").start = 99;
    equal(adapter.acceptsDeliveryToken(stale), false);
    equal(adapter.restoreCanonicalRender().ok, true);
    equal(adapter.acceptsDeliveryToken(stale), false);
    equal(first.documentRoot(), editedRoot); equal(first.selection(), editedSelection);
    equal(host.querySelector("ol").start, 8);
    const restored = boot({kind: "sessionCheckpoint", checkpointJson: checkpoint.checkpoint.checkpointJson});
    equal(restored.documentRoot(), originalRoot);
    equal(restored.adapter.restoreCanonicalRender().ok, true);
    equal(restored.selection(), endpoints(selection));
    equal(restored.send({kind: "history", operation: "redo"}).command.status, "committed");
    equal(restored.documentRoot(), editedRoot); equal(restored.selection(), editedSelection);

    // A committed Rust edit stays authoritative even when DOM installation
    // fails. Recovery renders that commit, and undo reverses it exactly once.
    const postFailureCommits = [];
    const stop = restored.adapter.observeCoreCommits(commit => postFailureCommits.push(commit.eventKind));
    const failedRequest = flatListCommandRequest(restored.adapter.deliveryToken(), preserveSelectionSync(),
      {kind: "api", detail: "render failure qualification"},
      {kind: "action", actionId: "breditor/insert-flat-list-text", input: {kind: "string", value: "!"}}, "closeBefore");
    restored.failNextUpdate();
    mustThrow(() => restored.adapter.execute(failedRequest));
    equal(restored.adapter.state, "reconcile"); equal(postFailureCommits, ["action"]);
    equal(restored.ports.plainText.read()?.content.text, "Intro\nAx\ny!🙂\nB\n");
    equal(restored.ports.sessionCheckpointJson.read()?.ok, true);
    mustThrow(() => restored.adapter.execute(failedRequest));
    equal(restored.adapter.restoreCanonicalRender().ok, true);
    equal(restored.send({kind: "history", operation: "undo"}).command.status, "committed");
    equal(restored.documentRoot(), editedRoot); equal(restored.selection(), editedSelection); stop();
    adapter.dispose(); adapter.dispose();
    equal(ports.plainText.read()?.ok, false); mustThrow(() => adapter.deliveryToken());
  } finally {
    for (const dispose of owners.reverse()) dispose();
  }
}
