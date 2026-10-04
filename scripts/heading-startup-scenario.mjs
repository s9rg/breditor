// Explicit browser bootstrap + adapter integration; no private Rust factory calls.
import { bootstrapWasmEngine, preflightWasmSemanticProfile } from "../packages/breditor-browser/dist/wasm_engine_bootstrap.js";
import { BreditorWasmCommandAdapter } from "../packages/breditor-browser/dist/wasm_command_adapter.js";
import { BreditorDomRenderer } from "../packages/breditor-browser/dist/dom_renderer.js";
import { BreditorDomSelectionBridge } from "../packages/breditor-browser/dist/dom_selection.js";
import { BaseRangeSelection } from "../packages/breditor-browser/dist/selection.js";
import { compileBrowserPresentation } from "../packages/breditor-browser/dist/compiled_browser_presentation.js";
import { createInlineFormatRenderManifest } from "../packages/breditor-browser/dist/inline_format_render_manifest.js";
import { historyRequest, noInputIntentRequest, preserveSelectionSync, selectionSynchronizationRequest, stringActionRequest } from "../packages/breditor-browser/dist/editor_command.js";

const equal = (actual, expected) => {
  if (!Object.is(actual, expected)) throw new Error(`startup expected ${String(expected)}, got ${String(actual)}`);
};
const success = (result) => {
  if (!result?.ok) throw new Error(`startup rejected: ${JSON.stringify(result?.error)}`);
  return result;
};

export function runHeadingStartupScenario(api, host) {
  const schema = { name: "example/heading-startup", version: 1 };
  const semanticProfile = { bootstrapJson: JSON.stringify({ format: "breditor/profile-bootstrap", formatVersion: 3, schema, extensions: [] }), formatVersion: 3 };
  const metadata = success(preflightWasmSemanticProfile(api, semanticProfile)).profileDescriptor;
  const document = { format: "breditor/document", formatVersion: 2, schema,
    schemaFingerprint: metadata.schema.fingerprint,
    root: { kind: "element", type: "breditor/document", entityId: null, properties: {}, children: [
      { kind: "element", type: "breditor/heading", entityId: null, properties: { "breditor/level": 2 }, children: [{ kind: "text", text: "a🙂b", formats: [] }] },
    ] },
  };
  const source = { kind: "api", detail: "heading-startup-check" };
  const mount = (source) => {
    const boot = success(bootstrapWasmEngine(api, { ...source, semanticProfile }));
    equal(boot.durableMode, "v5");
    const presentation = compileBrowserPresentation(boot.profileGeneration, boot.profileDescriptor,
      createInlineFormatRenderManifest({ recipes: [{ formatKind: "breditor/strong", element: "strong" }] }));
    const renderer = new BreditorDomRenderer(presentation);
    let adapter;
    let rendered;
    try {
      rendered = success(renderer.render(host, boot.projection)).value.rendered;
      adapter = new BreditorWasmCommandAdapter(boot.engine, boot.observation, {
        durableMode: boot.durableMode, profileGeneration: boot.profileGeneration,
        profileDescriptor: boot.profileDescriptor, renderer, rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      });
    } catch (error) {
      if (rendered !== undefined) renderer.release(rendered);
      boot.observation.free(); boot.profileGeneration.free(); boot.engine.free();
      throw error;
    }
    return { adapter, dispose() { try { adapter.dispose(); } finally { boot.engine.free(); } } };
  };
  const deliver = (adapter, request) => equal(adapter.execute(request).command.status, "committed");
  const headingState = (adapter, rank) => {
    const snapshot = success(adapter.actionStateReadPort.read()).snapshot;
    equal(snapshot.entries.find((entry) => entry.id === `breditor/control-heading-${rank}`)?.activation, "active");
  };
  host.contentEditable = "true";
  host.tabIndex = 0;
  host.focus();
  let live = mount({ kind: "document", lineageId: "heading-startup", documentJson: JSON.stringify(document), historyCapacity: 20 });
  try {
    const { adapter } = live;
    equal(host.innerHTML, "<h2>a🙂b</h2>");
    const point = { kind: "text", textPath: [0, 0], utf16Offset: 1, affinity: "after" };
    const selection = success(BaseRangeSelection.create(adapter.rendered.projection, { kind: "range", anchor: point, focus: point })).value;
    deliver(adapter, selectionSynchronizationRequest(adapter.deliveryToken(), selection, source));
    headingState(adapter, 2);
    deliver(adapter, stringActionRequest(adapter.deliveryToken(), preserveSelectionSync(), source,
      "breditor/insert-text-block-text", "X", "closeBefore"));
    deliver(adapter, noInputIntentRequest(adapter.deliveryToken(), preserveSelectionSync(), source,
      "breditor/format-heading-5", "closeBefore"));
    equal(host.innerHTML, "<h5>aX🙂b</h5>");
    headingState(adapter, 5);
    deliver(adapter, historyRequest(adapter.deliveryToken(), preserveSelectionSync(), source, "undo"));
    const staleToken = adapter.deliveryToken();
    const checkpointJson = success(adapter.sessionCheckpointReadPort.read()).checkpoint.checkpointJson;
    live.dispose();
    live = undefined;
    live = mount({ kind: "sessionCheckpoint", checkpointJson });
    equal(host.innerHTML, "<h2>aX🙂b</h2>");
    equal(live.adapter.acceptsDeliveryToken(staleToken), false);
    equal(success(live.adapter.sessionCheckpointReadPort.read()).checkpoint.checkpointJson, checkpointJson);
    headingState(live.adapter, 2);
    deliver(live.adapter, historyRequest(live.adapter.deliveryToken(), preserveSelectionSync(), source, "redo"));
    equal(host.innerHTML, "<h5>aX🙂b</h5>");
    headingState(live.adapter, 5);
    success(live.adapter.documentJsonReadPort.read());
    return { startup: true, restore: true, staleTokenRejected: true, actionStates: true, html: host.innerHTML };
  } finally { live?.dispose(); }
}
