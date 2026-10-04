// Shared generated-Wasm/DOM scenario for jsdom and real browser engines.
import { consumeWasmCompiledProfileDescriptor } from "../packages/breditor-browser/dist/wasm_profile_descriptor.js";
import { consumeTextBlockSemanticProjection, consumeSemanticProjectionUpdate } from "../packages/breditor-browser/dist/wasm_projection_adapter.js";
import { compileBrowserPresentation } from "../packages/breditor-browser/dist/compiled_browser_presentation.js";
import { createInlineFormatRenderManifest } from "../packages/breditor-browser/dist/inline_format_render_manifest.js";
import { BreditorDomRenderer } from "../packages/breditor-browser/dist/dom_renderer.js";
import { mapDomPointToBaseSelectionPoint } from "../packages/breditor-browser/dist/dom_point_mapping.js";
import { consumeWasmDocumentJson, documentJsonMatchesProjection, documentJsonUtf8Bytes } from "../packages/breditor-browser/dist/wasm_document_json.js";
import { consumeWasmSessionCheckpoint, sessionCheckpointJsonMatchesDurableContract } from "../packages/breditor-browser/dist/wasm_session_checkpoint.js";
import { BreditorWasmCommandAdapter } from "../packages/breditor-browser/dist/wasm_command_adapter.js";
import { BreditorDomSelectionBridge } from "../packages/breditor-browser/dist/dom_selection.js";
import { historyRequest, noInputIntentRequest, preserveSelectionSync, stringActionRequest } from "../packages/breditor-browser/dist/editor_command.js";

const assert = {
  ok(value) { if (!value) throw new Error("missing owned handle"); },
  equal(actual, expected, message) { if (!Object.is(actual, expected)) throw new Error(message ?? `expected ${String(expected)}, got ${String(actual)}`); },
  notEqual(actual, expected) { if (Object.is(actual, expected)) throw new Error("expected a changed DOM identity"); },
};

export function runHeadingDomScenario(api, host) {
  const handles = [];
  const own = (handle) => { assert.ok(handle); handles.push(handle); return handle; };
  const value = (result) => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.value; };
  const observe = (engine) => own(engine.observation());
  try {
    const schema = { name: "example/heading-dom", version: 1 };
    const bootstrap = own(api.BreditorCompiledProfile.fromBootstrapJsonV3(JSON.stringify({
      format: "breditor/profile-bootstrap", formatVersion: 3, schema, extensions: [],
    })));
    const profile = own(bootstrap.takeProfile());
    const generation = own(profile.generation());
    const descriptorResult = consumeWasmCompiledProfileDescriptor(generation, profile.descriptor());
    assert.equal(descriptorResult.ok, true);
    const descriptor = descriptorResult.descriptor;
    const durable = { mode: "v5", schema: descriptor.schema, formats: descriptor.formats };
    const presentation = compileBrowserPresentation(generation, descriptor,
      createInlineFormatRenderManifest({ recipes: [{ formatKind: "breditor/strong", element: "strong" }] }));
    const document = { format: "breditor/document", formatVersion: 2, schema,
      schemaFingerprint: descriptor.schema.fingerprint,
      root: { kind: "element", type: "breditor/document", entityId: null, properties: {}, children: [
        { kind: "element", type: "breditor/heading", entityId: null, properties: { "breditor/level": 2 }, children: [{kind: "text", text: "a🙂b", formats: []}] },
        { kind: "element", type: "breditor/paragraph", entityId: null, properties: {}, children: [{kind: "text", text: "tail", formats: []}] },
      ] },
    };
    const created = own(profile.createEngineFromDocumentJsonV5("heading-dom", JSON.stringify(document), 20));
    const engine = own(created.takeEngine());
    const read = own(engine.projection(observe(engine)));
    let projection = value(consumeTextBlockSemanticProjection(read.takeProjection(), generation, descriptor));
    const renderer = new BreditorDomRenderer(presentation);
    let rendered = value(renderer.render(host, projection)).rendered;
    assert.equal(host.innerHTML, "<h2>a🙂b</h2><p>tail</p>");
    const tail = host.lastChild;
    let operations = 0;
    const capture = (activeEngine) => {
      const savedDocument = consumeWasmDocumentJson(projection.snapshot, activeEngine.documentJson(observe(activeEngine)), [activeEngine, profile, generation], durable);
      assert.equal(savedDocument.ok, true);
      assert.equal(documentJsonMatchesProjection(savedDocument.document.documentJson, projection, durable), true);
      const savedSession = consumeWasmSessionCheckpoint(projection.snapshot, activeEngine.sessionCheckpointJson(), [activeEngine, profile, generation], durable);
      assert.equal(savedSession.ok, true);
      assert.equal(sessionCheckpointJsonMatchesDurableContract(savedSession.checkpoint.checkpointJson, { ...durable, mode: "v3" }), null);
      return savedSession.checkpoint.checkpointJson;
    };
    assert.equal(documentJsonUtf8Bytes(JSON.stringify(document), { ...durable, mode: "v3" }), null);
    capture(engine);
    const update = (command, activeEngine = engine) => {
      own(command);
      assert.equal(command.status, "committed");
      const change = value(consumeSemanticProjectionUpdate(projection, command.projectionUpdate(), generation, descriptor));
      rendered = value(renderer.update(rendered, change)).rendered;
      projection = change.result;
      assert.equal(rendered.validateCanonicalDom(), true);
      operations += 1;
      capture(activeEngine);
    };
    update(engine.setRangeSelection(observe(engine), "text", 2, 1, "before", "text", 2, 1, "before"));
    const originalHeading = host.firstChild;
    update(engine.executeStringAction(observe(engine), "breditor/insert-text-block-text", "X", false));
    assert.equal(host.firstChild, originalHeading);
    assert.equal(host.firstChild.textContent, "aX🙂b");
    update(engine.executeNoInputAction(observe(engine), "breditor/set-heading-4", true));
    assert.equal(host.firstChild.localName, "h4");
    assert.notEqual(host.firstChild, originalHeading);
    assert.equal(host.lastChild, tail);
    const mapped = value(mapDomPointToBaseSelectionPoint(rendered, rendered.nodeForAstPath([0, 0]), 4));
    assert.equal(mapped.utf16Offset, 4);
    update(engine.undo(observe(engine), false));
    assert.equal(host.firstChild.localName, "h2");
    update(engine.redo(observe(engine), false));
    assert.equal(host.firstChild.localName, "h4");
    assert.equal(host.lastChild, tail);
    const restoredResult = own(profile.createEngineFromSessionCheckpointJsonV5(capture(engine)));
    const restored = own(restoredResult.takeEngine());
    const restoredRead = own(restored.projection(observe(restored)));
    projection = value(consumeTextBlockSemanticProjection(restoredRead.takeProjection(), generation, descriptor));
    rendered = value(renderer.render(host, projection)).rendered;
    assert.equal(host.innerHTML, "<h4>aX🙂b</h4><p>tail</p>");
    assert.equal(own(restored.undo(observe(engine), false)).status, "error");
    update(restored.undo(observe(restored), false), restored);
    assert.equal(host.firstChild.localName, "h2");
    update(restored.redo(observe(restored), false), restored);
    update(restored.executeNoInputAction(observe(restored), "breditor/insert-text-block-break", true), restored);
    assert.equal(projection.paragraphs.length, 3);
    update(restored.undo(observe(restored), false), restored);
    assert.equal(host.firstChild.localName, "h4");
    // Transfer the exact projection-bound generation and a fresh observation.
    // Exercise browser command delivery and its guarded save read ports, not
    // just direct calls to the generated Rust methods.
    host.contentEditable = "true";
    host.tabIndex = 0;
    host.focus();
    let lastSelectionWrite;
    const selectionBridge = new BreditorDomSelectionBridge();
    const writeSelection = selectionBridge.write.bind(selectionBridge);
    selectionBridge.write = (...args) => (lastSelectionWrite = writeSelection(...args));
    const adapterObservation = own(restored.observation());
    const adapter = new BreditorWasmCommandAdapter(restored, adapterObservation, {
      durableMode: "v5", profileGeneration: generation, profileDescriptor: descriptor,
      renderer, rendered, selectionBridge,
    });
    handles.splice(handles.indexOf(generation), 1);
    handles.splice(handles.indexOf(adapterObservation), 1);
    try {
      const source = { kind: "api", detail: "heading-command-check" };
      const deliver = (request) => {
        let outcome;
        try { outcome = adapter.execute(request); }
        catch (error) { throw new Error(`${error}; selection=${JSON.stringify(lastSelectionWrite)}`, { cause: error }); }
        assert.equal(outcome.command.status, "committed", `command outcome: ${outcome.command.status}`);
        assert.equal(adapter.state, "live");
        assert.equal(adapter.documentJsonReadPort.read().ok, true);
        assert.equal(adapter.sessionCheckpointReadPort.read().ok, true);
        operations += 1;
      };
      deliver(stringActionRequest(adapter.deliveryToken(), preserveSelectionSync(), source,
        "breditor/insert-text-block-text", "Y", "closeBefore"));
      assert.equal(host.firstChild.textContent, "aXY🙂b");
      const typedState = JSON.parse(own(restored.stateJson()).takeValue());
      deliver(noInputIntentRequest(adapter.deliveryToken(), preserveSelectionSync(), source,
        "breditor/format-paragraph", "closeBefore"));
      assert.equal(host.firstChild.localName, "p");
      deliver(historyRequest(adapter.deliveryToken(), preserveSelectionSync(), source, "undo"));
      deliver(historyRequest(adapter.deliveryToken(), preserveSelectionSync(), source, "undo"));
      assert.equal(host.innerHTML, "<h4>aX🙂b</h4><p>tail</p>");
      const saved = adapter.sessionCheckpointReadPort.read();
      assert.equal(saved.ok, true);
      const reloaded = own(own(profile.createEngineFromSessionCheckpointJsonV5(saved.checkpoint.checkpointJson)).takeEngine());
      const redone = own(reloaded.redo(observe(reloaded), false));
      assert.equal(redone.status, "committed");
      const redoneState = JSON.parse(own(reloaded.stateJson()).takeValue());
      for (const field of ["document", "selection", "pendingFormats"])
        assert.equal(JSON.stringify(redoneState[field]), JSON.stringify(typedState[field]));
    } finally { adapter.dispose(); }
    return { html: host.innerHTML, operations, restoredHistory: true, durablePreflight: true, commandAdapter: true };
  } finally {
    for (const handle of handles.reverse()) handle.free();
  }

}
