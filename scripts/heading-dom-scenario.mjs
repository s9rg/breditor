// Shared generated-Wasm/DOM scenario for jsdom and real browser engines.
import { consumeWasmCompiledProfileDescriptor } from "../packages/breditor-browser/dist/wasm_profile_descriptor.js";
import { consumeTextBlockSemanticProjection, consumeSemanticProjectionUpdate } from "../packages/breditor-browser/dist/wasm_projection_adapter.js";
import { compileBrowserPresentation } from "../packages/breditor-browser/dist/compiled_browser_presentation.js";
import { createInlineFormatRenderManifest } from "../packages/breditor-browser/dist/inline_format_render_manifest.js";
import { BreditorDomRenderer } from "../packages/breditor-browser/dist/dom_renderer.js";
import { mapDomPointToBaseSelectionPoint } from "../packages/breditor-browser/dist/dom_point_mapping.js";

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
    const update = (command) => {
      own(command);
      assert.equal(command.status, "committed");
      const change = value(consumeSemanticProjectionUpdate(projection, command.projectionUpdate(), generation, descriptor));
      rendered = value(renderer.update(rendered, change)).rendered;
      projection = change.result;
      assert.equal(rendered.validateCanonicalDom(), true);
      operations += 1;
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
    const checkpoint = own(engine.sessionCheckpointJson());
    const restoredResult = own(profile.createEngineFromSessionCheckpointJsonV5(checkpoint.takeValue()));
    const restored = own(restoredResult.takeEngine());
    const restoredRead = own(restored.projection(observe(restored)));
    projection = value(consumeTextBlockSemanticProjection(restoredRead.takeProjection(), generation, descriptor));
    rendered = value(renderer.render(host, projection)).rendered;
    assert.equal(host.innerHTML, "<h4>aX🙂b</h4><p>tail</p>");
    assert.equal(own(restored.undo(observe(engine), false)).status, "error");
    update(restored.undo(observe(restored), false));
    assert.equal(host.firstChild.localName, "h2");
    update(restored.redo(observe(restored), false));
    assert.equal(host.firstChild.localName, "h4");
    renderer.release(rendered);
    return { html: host.innerHTML, operations, restoredHistory: true };
  } finally {
    for (const handle of handles.reverse()) handle.free();
  }

}
