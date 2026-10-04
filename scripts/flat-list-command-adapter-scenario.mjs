// Real toolbar/controller -> queue -> adapter -> Wasm -> DOM; synthetic input only.
import { bootstrapFlatListWasmEngine } from "../packages/breditor-browser/src/wasm_engine_bootstrap.ts";
import { BreditorFlatListWasmCommandAdapter, contentReadPortsForAdapter } from "../packages/breditor-browser/src/wasm_command_adapter.ts";
import { BreditorFlatListCommandQueue, openFlatListCommandQueueLeasePort } from "../packages/breditor-browser/src/command_queue.ts";
import { reconcileFlatListCompositionDom } from "../packages/breditor-browser/src/dom_composition_reconcile.ts";
import { verifyFlatListCompositionController } from "./flat-list-composition-controller-scenario.mjs";
import { verifyFlatListClipboard } from "./flat-list-clipboard-scenario.mjs";
import { verifyFlatListRouter } from "./flat-list-router-scenario.mjs";
import { BreditorActionStateStore } from "../packages/breditor-browser/src/action_state_store.ts";
import { BreditorToolbar } from "../packages/breditor-browser/src/toolbar.ts";
import { FLAT_LIST_TOOLBAR_MANIFEST } from "../packages/breditor-browser/src/flat_list_toolbar_manifest.ts";
import { createFlatListToolbarDispatcher } from "../packages/breditor-browser/src/flat_list_toolbar_dispatcher.ts";
import { toolbarManifestMatchesProfileDescriptor } from "../packages/breditor-browser/src/toolbar_profile_contract.ts";
import { BreditorFlatListBrowserEventController } from "../packages/breditor-browser/src/browser_event_controller.ts";
import { BreditorDomRenderer } from "../packages/breditor-browser/src/dom_renderer.ts";
import { BreditorFlatListDomSelectionBridge } from "../packages/breditor-browser/src/dom_selection.ts";
import { compileBrowserPresentation } from "../packages/breditor-browser/src/compiled_browser_presentation.ts";
import { createInlineFormatRenderManifest } from "../packages/breditor-browser/src/inline_format_render_manifest.ts";
import { FlatListRangeSelection } from "../packages/breditor-browser/src/flat_list_selection.ts";
import { consumeFlatListSemanticSelection } from "../packages/breditor-browser/src/wasm_selection_adapter.ts";
import { mapDomPointToFlatListSelectionPoint } from "../packages/breditor-browser/src/flat_list_dom_point_mapping.ts";
import { flatListCommandRequest, flatListRangeSelectionSync, preserveSelectionSync, flatListEditorDeliveryAuthorityAccepts,
  editorDeliveryAuthorityAccepts } from "../packages/breditor-browser/src/editor_command.ts";

const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`list command adapter mismatch: ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
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
    const states = new BreditorActionStateStore(adapter.actionStateReadPort);
    if (states.refresh().status !== "published") throw new Error("list action states unavailable");
    owners.push(() => states.dispose());
    const queue = new BreditorFlatListCommandQueue(adapter.commandExecutor, {observer: states.queueObserver});
    owners.push(() => queue.dispose());
    const toolbarHost = document.createElement("div"); document.body.append(toolbarHost);
    if (!toolbarManifestMatchesProfileDescriptor(FLAT_LIST_TOOLBAR_MANIFEST, started.profileDescriptor)) {
      throw new Error("list toolbar and compiled profile disagree");
    }
    const dispatcher = createFlatListToolbarDispatcher(queue, adapter);
    let dispatchedSelection;
    const toolbar = new BreditorToolbar(toolbarHost, FLAT_LIST_TOOLBAR_MANIFEST, states, {dispatch(invocation) {
      const result = dispatcher.dispatch(invocation);
      // Prove the native range before the toolbar restores keyboard focus.
      dispatchedSelection = selection(true);
      return result;
    }});
    owners.push(() => { dispatcher.dispose(); toolbar.dispose(); toolbarHost.remove(); });
    const button = id => {
      const button = toolbarHost.querySelector(`[data-breditor-state-id="breditor/control-${id}"]`);
      if (!button) throw new Error(`missing toolbar button ${id}`);
      return button;
    };
    const click = id => {
      if (states.getStatus().status !== "fresh") throw new Error("toolbar action states stale");
      const target = button(id); equal(target.getAttribute("aria-disabled"), "false");
      target.focus();
      if (document.activeElement !== target) throw new Error(`toolbar button ${id} did not receive focus`);
      // A focused toolbar must use Rust's captured selection even after the
      // native range is no longer visible in the editing host.
      document.getSelection()?.removeAllRanges(); target.click();
      equal(toolbar.state, "live"); equal(adapter.state, "live");
      equal(toolbar.validateCanonicalDom(), true);
      if (document.activeElement !== target) throw new Error(`toolbar button ${id} lost keyboard focus`);
    };
    const controller = new BreditorFlatListBrowserEventController(queue, {
      selectionBridge: bridge, deliveryAuthority: adapter.deliveryAuthority,
      keyboard: {editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled"},
    });
    // Platform-branded synthetic events exercise controller cancellation and
    // native Selection reads, but do not qualify physical input or IME.
    const dispatch = (kind, init) => {
      const event = kind === "keydown" ? new KeyboardEvent(kind, {bubbles: true, cancelable: true, ...init})
        : new InputEvent(kind, {bubbles: true, cancelable: kind === "beforeinput", ...init});
      let disposition;
      host.addEventListener(kind, incoming => {
        disposition = kind === "keydown" ? controller.handleKeyDown(incoming, adapter.rendered, adapter.deliveryToken())
          : kind === "beforeinput" ? controller.handleBeforeInput(incoming, adapter.rendered, adapter.deliveryToken())
          : controller.handleInput(incoming, adapter.rendered);
      }, {once: true});
      host.dispatchEvent(event);
      return {event, disposition};
    };
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
    const selection = (requireNative = false) => {
      const observation = started.engine.observation();
      let result;
      try {
        result = started.engine.selection(observation);
        const exact = value(consumeFlatListSemanticSelection(adapter.rendered.projection, result.takeSelection(), started.profileGeneration));
        const native = document.getSelection();
        if (!native) throw new Error("native selection unavailable");
        const dom = native.rangeCount === 0 ? null : value(FlatListRangeSelection.create(adapter.rendered.projection, {
          kind: "range",
          anchor: value(mapDomPointToFlatListSelectionPoint(adapter.rendered, native.anchorNode, native.anchorOffset)),
          focus: value(mapDomPointToFlatListSelectionPoint(adapter.rendered, native.focusNode, native.focusOffset)),
        }));
        // DOM has no affinity bit. Prove observable endpoints independently;
        // compare Rust's exact affinities in the returned semantic snapshot.
        // Do not consume the controller's one-use programmatic echo receipt
        // merely to inspect a postcondition before its next keyboard event.
        const observable = range => range === null ? null : {
          anchor: {...range.anchor, affinity: undefined}, focus: {...range.focus, affinity: undefined}, order: range.order,
        };
        // WebKit clears the visible range when toolbar keyboard focus is
        // restored. That must not erase Rust's selection. Permit absence only
        // there, after proving this exact range at synchronous dispatch return.
        if (!requireNative && dom === null && toolbarHost.contains(document.activeElement)) {
          equal(endpoints(exact), dispatchedSelection);
        } else {
          equal(observable(dom), observable(exact));
        }
        return endpoints(exact);
      } finally { result?.free(); observation.free(); }
    };
    return {adapter, host, bridge, queue, send, ports, documentRoot, selection, dispatch, click, button, failNextUpdate: () => { failUpdate = true; }};
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
    const unusedComposition = adapter.beginCompositionLease(openingToken, selection, 1n);
    equal(adapter.restoreCompositionLease(unusedComposition).ok, true);
    equal(adapter.state, "live"); equal(adapter.acceptsDeliveryToken(openingToken), false);
    const inserted = first.dispatch("beforeinput", {inputType: "insertText", data: "x\ny"});
    equal(inserted.event.defaultPrevented, true); equal(inserted.disposition.kind, "handled");
    equal(inserted.disposition.submission.result.command.status, "committed");
    equal(host.querySelectorAll("li").length, 4); equal(host.querySelector("ol").start, 8);
    equal(ports.plainText.read()?.content.text, "Intro\nAx\ny🙂\nB\n");
    const editedRoot = first.documentRoot(); const editedSelection = first.selection();
    const undone = first.dispatch("keydown", {key: "z", code: "KeyZ", ctrlKey: true});
    equal(undone.event.defaultPrevented, true); equal(undone.disposition.kind, "handled");
    equal(undone.disposition.submission.result.command.status, "committed");
    equal(first.dispatch("beforeinput", {inputType: "historyUndo"}).disposition.kind, "keyboardEcho");
    equal(first.dispatch("input", {inputType: "historyUndo"}).disposition.kind, "inputPostcondition");
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

    // Adapter/renderer composition protocol with scripted provisional DOM, not
    // OS IME or composition-controller scheduling qualification.
    const composing = boot({kind: "document", lineageId: "list-composition", documentJson, historyCapacity: 20});
    let replacement = value(FlatListRangeSelection.create(composing.adapter.rendered.projection, {kind: "range",
      anchor: {kind: "text", textPath: [1, 0, 0, 0], utf16Offset: 3, affinity: "before"},
      focus: {kind: "text", textPath: [1, 0, 0, 0], utf16Offset: 1, affinity: "after"},
    }));
    composing.send({kind: "selection", operation: "synchronize"}, flatListRangeSelectionSync(replacement));
    // Synchronization publishes a new snapshot. Equal-looking endpoints from
    // its predecessor are not a current composition selection capability.
    const currentDelivery = composing.adapter.deliveryToken();
    mustThrow(() => composing.adapter.beginCompositionLease(currentDelivery, replacement, 1n));
    equal(composing.adapter.acceptsDeliveryToken(currentDelivery), true);
    replacement = value(FlatListRangeSelection.create(composing.adapter.rendered.projection,
      {kind: "range", anchor: replacement.anchor, focus: replacement.focus}));
    const beforeComposition = composing.documentRoot();
    const leasePort = openFlatListCommandQueueLeasePort(composing.queue, composing.adapter.commandExecutor);
    if (!leasePort) throw new Error("composition queue owner mismatch");
    const reservation = leasePort.acquireLease();
    if (!reservation) throw new Error("composition queue busy");
    try {
      const normal = composing.adapter.deliveryToken();
      const composition = composing.adapter.beginCompositionLease(normal, replacement, 1n);
      equal(composing.adapter.openCompositionDomLease(composition), true);
      equal(composing.adapter.acceptsDeliveryToken(normal), false);
      equal(composing.queue.submit(flatListCommandRequest(normal, preserveSelectionSync(), {kind: "api", detail: "busy"},
        {kind: "history", operation: "undo"})).status, "rejected");
      composing.host.querySelector("h2").textContent = "A漢字";
      const candidate = value(reconcileFlatListCompositionDom(composing.host, composition.projection, replacement));
      equal(candidate, {textBlockPath: [1, 0, 0], replacementStartUtf16: 1, replacementEndUtf16: 3, originalText: "🙂", text: "漢字"});
      const restoredBase = composing.adapter.restoreCompositionLease(composition);
      if (!restoredBase.ok) throw new Error(restoredBase.reason);
      equal(composing.documentRoot(), beforeComposition); equal(composing.selection(), endpoints(replacement));
      const delivered = leasePort.submitLeased(reservation, flatListCommandRequest(restoredBase.delivery,
        flatListRangeSelectionSync(restoredBase.selection), {kind: "beforeinput", detail: "composition"},
        {kind: "action", actionId: "breditor/insert-flat-list-text", input: {kind: "string", value: candidate.text}}, "closeBefore"));
      equal(delivered.status, "completed"); equal(delivered.result.command.status, "committed");
      mustThrow(() => composing.adapter.restoreCompositionLease(composition));
    } finally { equal(leasePort.releaseLease(reservation), true); }
    const composedRoot = composing.documentRoot(); const composedSelection = composing.selection();
    equal(composing.host.querySelector("h2").textContent, "A漢字");
    equal(composing.host.querySelector("ol").start, 8);
    composing.send({kind: "history", operation: "undo"});
    equal(composing.documentRoot(), beforeComposition); equal(composing.selection(), endpoints(replacement));

    // Invalid native structural mutation is rejected and discarded, not
    // imported into Rust or turned into an extra undo entry.
    const cancellationRange = value(FlatListRangeSelection.create(composing.adapter.rendered.projection,
      {kind: "range", anchor: replacement.anchor, focus: replacement.focus}));
    const cancellationReservation = leasePort.acquireLease();
    if (!cancellationReservation) throw new Error("cancellation queue busy");
    try {
      const cancellation = composing.adapter.beginCompositionLease(composing.adapter.deliveryToken(), cancellationRange, 2n);
      equal(composing.adapter.openCompositionDomLease(cancellation), true);
      composing.host.querySelector("ol").start = 99;
      equal(reconcileFlatListCompositionDom(composing.host, cancellation.projection, cancellationRange).error.code,
        "composition.dom.invalid_structure");
      equal(composing.adapter.restoreCompositionLease(cancellation).ok, true);
      equal(composing.documentRoot(), beforeComposition); equal(composing.selection(), endpoints(replacement));
      equal(composing.host.querySelector("ol").start, 8);
    } finally { equal(leasePort.releaseLease(cancellationReservation), true); }
    const compositionCheckpoint = composing.ports.sessionCheckpointJson.read();
    if (!compositionCheckpoint?.ok) throw new Error("composition checkpoint unavailable");
    const resumedComposition = boot({kind: "sessionCheckpoint", checkpointJson: compositionCheckpoint.checkpoint.checkpointJson});
    resumedComposition.send({kind: "history", operation: "redo"});
    equal(resumedComposition.documentRoot(), composedRoot); equal(resumedComposition.selection(), composedSelection);

    verifyFlatListCompositionController(boot, documentJson);
    verifyFlatListClipboard(boot, documentJson);
    verifyFlatListRouter(boot, documentJson);

    const controls = boot({kind: "document", lineageId: "list-toolbar", documentJson, historyCapacity: 20});
    const selected = value(FlatListRangeSelection.create(controls.adapter.rendered.projection, {kind: "range",
      anchor: {kind: "text", textPath: [1, 0, 0, 0], utf16Offset: 3, affinity: "before"},
      focus: {kind: "text", textPath: [1, 0, 0, 0], utf16Offset: 0, affinity: "after"},
    }));
    controls.send({kind: "selection", operation: "synchronize"}, flatListRangeSelectionSync(selected));
    equal(controls.button("ordered-list").getAttribute("aria-pressed"), "true");
    equal(controls.button("heading-2").getAttribute("aria-pressed"), "true");
    const beforeToolbar = controls.documentRoot();
    controls.click("heading-3"); equal(controls.host.querySelector("ol h3").textContent, "A🙂");
    equal(controls.button("heading-3").getAttribute("aria-pressed"), "true");
    equal(controls.selection(), endpoints(selected));
    const headingRoot = controls.documentRoot();
    controls.click("undo"); equal(controls.documentRoot(), beforeToolbar); equal(controls.selection(), endpoints(selected));
    controls.click("redo"); equal(controls.documentRoot(), headingRoot); equal(controls.selection(), endpoints(selected));
    controls.click("remove-list");
    equal(controls.host.children[1].localName, "h3"); equal(controls.host.querySelector("ol").start, 9);
    const unwrappedRoot = controls.documentRoot();
    const unwrappedSelection = controls.selection(); equal(unwrappedSelection.order, "backward");
    equal(unwrappedSelection.anchor.textPath, [1, 0]);
    controls.click("bullet-list"); equal(controls.host.children[1].localName, "ul");
    equal(controls.button("bullet-list").getAttribute("aria-pressed"), "true");
    const bulletRoot = controls.documentRoot();
    controls.click("ordered-list"); equal(controls.host.children[1].localName, "ol");
    equal(controls.host.children[1].start, 1);
    controls.click("undo"); equal(controls.documentRoot(), bulletRoot);
    controls.click("undo"); equal(controls.documentRoot(), unwrappedRoot); equal(controls.selection(), unwrappedSelection);
    controls.click("undo"); equal(controls.documentRoot(), headingRoot); equal(controls.selection(), endpoints(selected));
    controls.host.focus();
    equal(controls.adapter.restoreCanonicalRender().ok, true);
    equal(controls.selection(true), endpoints(selected));
    adapter.dispose(); adapter.dispose();
    equal(ports.plainText.read()?.ok, false); mustThrow(() => adapter.deliveryToken());
  } finally {
    for (const dispose of owners.reverse()) dispose();
  }
}
