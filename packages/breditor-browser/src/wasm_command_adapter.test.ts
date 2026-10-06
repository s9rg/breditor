import { beforeEach, describe, expect, it, vi } from "vitest";
import { BreditorNestedListWasmCommandAdapter } from "./wasm_command_adapter.js";
import { createNestedListTabController } from "./nested_list_tab_controller.js";
import { createNestedListToolbarDispatcher, type NestedListToolbarDispatcher } from "./nested_list_toolbar_dispatcher.js";
import { nestedListToolbarCommandRequest } from "./toolbar.js";
import { NESTED_LIST_TOOLBAR_MANIFEST } from "./nested_list_toolbar_manifest.js";
import { BreditorNestedListBrowserEventRouter } from "./browser_event_router.js";
import { BreditorNestedListBrowserEventController } from "./browser_event_controller.js";
import { BreditorNestedListCompositionController } from "./composition_controller.js";
import { openNestedListCommandQueueLeasePort } from "./command_queue.js";
import { BreditorNestedListClipboardController } from "./clipboard_controller.js";
import { BreditorNestedListCommandQueue } from "./command_queue.js";
import { BreditorNestedListDomSelectionBridge } from "./dom_selection.js";
import { NestedListDocumentProjection } from "./nested_list_projection.js";
import { NestedListRangeSelection } from "./nested_list_selection.js";
import { nestedListCommandRequest, nestedListEditorDeliveryAuthorityAccepts, nestedListRangeSelectionSync } from "./editor_command.js";
import { reconcileNestedListCompositionDom } from "./dom_composition_reconcile.js";

import { BreditorDomRenderer, type RenderedProjection } from "./dom_renderer.js";
import { BreditorDomSelectionBridge, BreditorFlatListDomSelectionBridge } from "./dom_selection.js";
import { FlatListDocumentProjection } from "./flat_list_projection.js";
import { FlatListRangeSelection } from "./flat_list_selection.js";
import { flatListProjectionPresentation } from "./flat_list_projection.js";
import { serializeClipboardSelection, serializeFlatListClipboardSelection } from "./clipboard_fragment.js";
import { parseClipboardHtmlToPlainText } from "./clipboard_html.js";
import { flatListCutDeleteRequest, flatListPasteInsertRequest } from "./flat_list_clipboard_command.js";
import { BreditorClipboardController, BreditorFlatListClipboardController } from "./clipboard_controller.js";
import { BreditorBrowserEventRouter, BreditorFlatListBrowserEventRouter, type BrowserEventRouterOptions } from "./browser_event_router.js";
import { BreditorFlatListBrowserEventController } from "./browser_event_controller.js";
import { reconcileFlatListCompositionDom } from "./dom_composition_reconcile.js";
import { BreditorCompositionController, BreditorFlatListCompositionController,
  type CompositionControllerNotification, type CompositionControllerOptions } from "./composition_controller.js";
import { compileBrowserPresentation } from "./compiled_browser_presentation.js";
import { createInlineFormatRenderManifest } from "./inline_format_render_manifest.js";
import { issueCompositionDeliveryToken } from "./composition_delivery_token.js";
import {
  closeHistoryGroupRequest,
  flatListCommandRequest,
  flatListRangeSelectionSync,
  MAX_BROWSER_COMMAND_TEXT_UTF16,
  flatListEditorDeliveryAuthorityAccepts,
  editorDeliveryAuthorityAccepts,
  historyRequest,
  jsonActionRequest,
  jsonIntentRequest,
  noInputActionRequest,
  noInputIntentRequest,
  noSelectionSync,
  preserveSelectionSync,
  rangeSelectionSync,
  selectionSynchronizationRequest,
  stringActionRequest,
  type EditorCommandRequest,
  type EditorDeliveryToken,
  type EngineCommandRequest,
} from "./editor_command.js";
import { BaseDocumentProjection } from "./projection.js";
import { BaseRangeSelection, type BaseEditorSelection } from "./selection.js";
import { BreditorCommandQueue, BreditorFlatListCommandQueue, openFlatListCommandQueueLeasePort } from "./command_queue.js";
import { createFlatListToolbarDispatcher, type FlatListToolbarDispatcher } from "./flat_list_toolbar_dispatcher.js";
import { flatListToolbarCommandRequest, type ToolbarCommandInvocation } from "./toolbar.js";
import type { BrowserSelectionResult } from "./selection_result.js";
import type {
  SemanticProjectionUpdateView,
  SemanticProjectionView,
  FlatListSemanticProjectionView,
} from "./wasm_projection_adapter.js";
import { associateProjectionWithProfileGeneration } from "./wasm_projection_adapter.js";
import type { SemanticSelectionView } from "./wasm_selection_adapter.js";
import {
  isOwnedBrowserSessionCheckpointReadResult,
  type WasmSessionCheckpointStringResultView,
} from "./wasm_session_checkpoint.js";
import {
  isOwnedBrowserDocumentJsonReadResult,
  type WasmDocumentJsonStringResultView,
} from "./wasm_document_json.js";
import {
  isOwnedBrowserActionStateReadResult,
  type WasmActionStateSnapshotView,
  type WasmActionStateStringResultView,
  type WasmActionStatesResultView,
} from "./wasm_action_state_adapter.js";
import {
  BreditorWasmCommandAdapter as RawBreditorWasmCommandAdapter,
  BreditorFlatListWasmCommandAdapter,
  MAX_WASM_CORE_COMMIT_OBSERVERS,
  type BreditorWasmCommandAdapterOptions,
  type WasmCommandEngineView,
  type WasmCommandErrorView,
  type WasmCommandObservationView,
  type WasmCommandResultView,
  type WasmCommandSequenceOutcome,
  type WasmIntentResultView,
  type WasmSelectionResultView,
} from "./wasm_command_adapter.js";
import type {
  BrowserCompiledProfileDescriptor,
  WasmCompiledProfileDescriptorView,
  WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";
import { consumeWasmCompiledProfileDescriptor } from "./wasm_profile_descriptor.js";

const TEST_SCHEMA_FINGERPRINT =
  "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const TEST_INTENT_ID = "breditor/format-strong";
const TEST_PROFILE_GENERATION: WasmProfileGenerationView = {
  matches(other) {
    return other === TEST_PROFILE_GENERATION;
  },
  free: vi.fn(),
};
const matchesTestProfile = (generation: WasmProfileGenerationView): boolean =>
  generation === TEST_PROFILE_GENERATION;
const PROPERTY_FREE_FORMAT_METHODS = Object.freeze({
  formatPropertyCount: (formatIndex: number) =>
    formatIndex === 0 ? 0 : undefined,
  formatPropertyName: () => undefined,
  formatPropertyPresence: () => undefined,
  formatPropertyValueType: () => undefined,
  formatPropertyIntegerMinimum: () => undefined,
  formatPropertyIntegerMaximum: () => undefined,
  formatPropertyStringMinimumUtf8Bytes: () => undefined,
  formatPropertyStringMaximumUtf8Bytes: () => undefined,
});
const TEST_PROFILE_DESCRIPTOR: BrowserCompiledProfileDescriptor = (() => {
  const noEntry = (): undefined => undefined;
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "breditor/base",
    schemaVersion: 1,
    schemaFingerprint: TEST_SCHEMA_FINGERPRINT,
    formatCount: 1,
    intentCount: 1,
    actionStateCount: 0,
    inlineFormatSetCount: 0,
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    formatKind: (index) => index === 0 ? "breditor/strong" : undefined,
    formatRevision: (index) => index === 0 ? 1 : undefined,
    ...PROPERTY_FREE_FORMAT_METHODS,
    intentId: (index) => index === 0 ? TEST_INTENT_ID : undefined,
    intentInputKind: (index) => index === 0 ? "none" : undefined,
    intentInputContractName: noEntry,
    intentInputContractVersion: noEntry,
    intentActivationContract: (index) => index === 0 ? "tracked" : undefined,
    intentValueContractName: noEntry,
    intentValueContractVersion: noEntry,
    actionStateId: noEntry,
    actionStateSourceKind: noEntry,
    actionStateSourceActionId: noEntry,
    actionStateSourceIntentId: noEntry,
    actionStateHistoryDirection: noEntry,
    actionStateActivationContract: noEntry,
    actionStateValueContractName: noEntry,
    actionStateValueContractVersion: noEntry,
    inlineFormatSetFormatKind: noEntry,
    inlineFormatSetIntentId: noEntry,
    inlineFormatSetActionStateId: noEntry,
    free: () => undefined,
  };
  const result = consumeWasmCompiledProfileDescriptor(
    TEST_PROFILE_GENERATION,
    view,
  );
  if (!result.ok) throw new Error("test profile descriptor was rejected");
  return result.descriptor;
})();

class BreditorWasmCommandAdapter extends RawBreditorWasmCommandAdapter {
  constructor(
    engine: WasmCommandEngineView,
    observation: WasmCommandObservationView,
    options: Omit<
      BreditorWasmCommandAdapterOptions,
      "profileGeneration" | "profileDescriptor"
    >,
  ) {
    super(engine, observation, {
      ...options,
      profileGeneration: TEST_PROFILE_GENERATION,
      profileDescriptor: TEST_PROFILE_DESCRIPTOR,
    });
  }
}

interface ProjectionFixture {
  readonly projection: BaseDocumentProjection;
  readonly renderer: BreditorDomRenderer;
  readonly rendered: RenderedProjection;
  readonly host: HTMLElement;
}

interface TrackedObservation extends WasmCommandObservationView {
  readonly free: () => void;
}

interface TrackedResult {
  readonly view: WasmCommandResultView;
  readonly free: () => void;
}

interface TrackedIntentResult {
  readonly view: WasmIntentResultView;
  readonly free: ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe("explicit nested-list command adapter", () => {
  it("exposes nesting toolbar intents with tracked state and preserved selection", () => {
    const f = toolbarFixture();
    try {
      for (const operation of ["indent", "outdent"]) {
        const control = NESTED_LIST_TOOLBAR_MANIFEST.controls.find(control => control.stateId === `breditor/control-${operation}-list-items`)!;
        expect(control).toMatchObject({kind: "button", activation: "tracked", group: "nesting",
          command: {kind: "intent", intentId: `breditor/${operation}-list-items`}});
        if (control.kind !== "button") throw new Error("nesting button missing");
        expect(nestedListToolbarCommandRequest(f.adapter.deliveryToken(), {stateId: control.stateId, selection: "preserve", command: control.command}))
          .toMatchObject({selection: {kind: "preserve"}, requirements: {history: "closeBefore"},
            command: {kind: "intent", intentId: `breditor/${operation}-list-items`, input: {kind: "none"}}});
      }
    } finally { f.dispose(); }
  });

  function toolbarFixture(observer?: () => void, malformed = false) {
    const f = fixture();
    const result = commandResult(malformed
      ? {status: "committed", successor: observation(1), eventKind: "action"}
      : {status: "disabled", successor: observation(0), disabledActionId: "breditor/toggle-nested-list-strong",
          disabledReasonCode: "breditor/no-selection", activation: "inactive"});
    const engine = engineQueues({noInputAction: [result.view]});
    const action = vi.spyOn(engine, "executeNoInputAction");
    const adapter = new BreditorNestedListWasmCommandAdapter(engine, observation(0), f.options);
    const queue = new BreditorNestedListCommandQueue(adapter.commandExecutor, observer === undefined ? {} : {observer});
    const dispatcher = createNestedListToolbarDispatcher(queue, adapter);
    const invocation: ToolbarCommandInvocation = {stateId: "breditor/control-bold", selection: "preserve",
      command: {kind: "action", actionId: "breditor/toggle-nested-list-strong", input: {kind: "none"}, history: "preserve"}};
    return {...f, adapter, queue, dispatcher, invocation, action, result,
      dispose() { dispatcher.dispose(); queue.dispose(); adapter.dispose(); f.bridge.dispose(); f.host.remove(); }};
  }

  it("nested toolbar rejects a busy lease without queueing or spending its token", () => {
    const f = toolbarFixture();
    try {
      const port = openNestedListCommandQueueLeasePort(f.queue, f.adapter.commandExecutor)!;
      const token = f.adapter.deliveryToken(); const lease = port.acquireLease()!;
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("rejected");
      expect(f.action).not.toHaveBeenCalled(); expect(f.adapter.acceptsDeliveryToken(token)).toBe(true);
      expect(port.releaseLease(lease)).toBe(true);
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("completed");
      expect(f.action).toHaveBeenCalledOnce(); expect(f.result.free).toHaveBeenCalledOnce();
    } finally { f.dispose(); }
  });

  it("nested toolbar keeps its lease through observers and correlates a captured invocation", () => {
    let f: ReturnType<typeof toolbarFixture>;
    f = toolbarFixture(() => {
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("rejected");
      // Mutation during notification cannot change the admitted target.
      Object.assign(f.invocation.command, {actionId: "breditor/other-action"});
    });
    try {
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("completed");
      expect(f.action).toHaveBeenCalledOnce();
    } finally { f.dispose(); }
  });

  it("nested toolbar uses private queue and adapter capabilities despite public overrides", () => {
    const f = toolbarFixture(); const override = vi.fn(() => { throw new Error("public override"); });
    try {
      Object.defineProperty(f.adapter, "deliveryToken", {value: override});
      Object.defineProperty(f.adapter, "commandExecutor", {get: override});
      Object.defineProperty(f.queue, "submit", {value: override});
      const dispatcher = createNestedListToolbarDispatcher(f.queue, f.adapter);
      expect(dispatcher.dispatch(f.invocation).status).toBe("completed");
      expect(override).not.toHaveBeenCalled(); dispatcher.dispose();
    } finally { f.dispose(); }
  });

  it("nested toolbar rejects a queue from a different adapter", () => {
    const f = toolbarFixture(); const foreign = toolbarFixture();
    try { expect(() => createNestedListToolbarDispatcher(f.queue, foreign.adapter)).toThrow("different owners"); }
    finally { f.dispose(); foreign.dispose(); }
  });

  it("nested toolbar rejects accessor invocations without reading them or poisoning the lease", () => {
    const f = toolbarFixture(); const getter = vi.fn(() => f.invocation.command);
    try {
      const invalid = {...f.invocation}; Object.defineProperty(invalid, "command", {get: getter});
      expect(f.dispatcher.dispatch(invalid).status).toBe("rejected"); expect(getter).not.toHaveBeenCalled();
      expect(f.action).not.toHaveBeenCalled();
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("completed");
    } finally { f.dispose(); }
  });

  it("nested toolbar rechecks disposal after invocation capture before delivering", () => {
    const f = toolbarFixture();
    try {
      const invocation = new Proxy(f.invocation, {ownKeys(target) {
        f.dispatcher.dispose(); return Reflect.ownKeys(target);
      }});
      expect(f.dispatcher.dispatch(invocation).status).toBe("rejected");
      expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each(["generated result", "observer"])("nested toolbar fails closed after an uncertain %s and never retries", fault => {
    const f = toolbarFixture(fault === "observer" ? () => { throw new Error("observer failed"); } : undefined,
      fault === "generated result");
    try {
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("failed");
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("failed"); expect(f.action).toHaveBeenCalledOnce();
      f.dispatcher.dispose(); expect(f.dispatcher.dispatch(f.invocation).status).toBe("rejected");
    } finally { f.dispose(); }
  });

  it("nested toolbar preserves known completion when its owner is disposed by an observer", () => {
    let dispatcher: NestedListToolbarDispatcher;
    const f = toolbarFixture(() => { dispatcher.dispose(); f.queue.dispose(); }); dispatcher = f.dispatcher;
    try {
      expect(dispatcher.dispatch(f.invocation).status).toBe("completed");
      expect(dispatcher.dispatch(f.invocation).status).toBe("rejected"); expect(f.action).toHaveBeenCalledOnce();
    } finally { f.dispose(); }
  });

  it("list toolbar construction preserves selection and explicit command boundaries", () => {
    const f = toolbarFixture();
    try {
      const token = f.adapter.deliveryToken();
      const intent = nestedListToolbarCommandRequest(token, {...f.invocation,
        command: {kind: "intent", intentId: "breditor/format-bullet-list"}});
      expect(intent).toMatchObject({selection: {kind: "preserve"}, requirements: {history: "closeBefore"},
        command: {kind: "intent", intentId: "breditor/format-bullet-list", input: {kind: "none"}}});
      const typed = nestedListToolbarCommandRequest(token, {...f.invocation,
        command: {kind: "intentJson", intentId: "breditor/format-example", inputJson: "{}"}});
      expect(typed).toMatchObject({requirements: {history: "closeBefore"}, command: {input: {kind: "json", value: "{}"}}});
      expect(nestedListToolbarCommandRequest(token, {...f.invocation, command: {kind: "history", operation: "undo"}}))
        .toMatchObject({requirements: {history: "closeBefore"}, selection: {kind: "preserve"}});
      expect(nestedListToolbarCommandRequest(token, f.invocation)).toMatchObject({requirements: {history: "preserve"}});
    } finally { f.dispose(); }
  });

  it("routes a DOM text event through nested selection synchronization and one content action", () => {
    const synchronized = transition(1, "A🙂", "selection"), edited = transition(2, "Ax", "action");
    const repairSelection = selectionResult({...selectionView(2, 2), anchorNodeIndex: 8, focusNodeIndex: 8});
    const f = clipboardFixture(false, {setSelection: [synchronized.result.view], stringAction: [edited.result.view],
      selection: [synchronized.selected.view, edited.selected.view, repairSelection.view]});
    const router = new BreditorNestedListBrowserEventRouter(f.queue, f.adapter, {
      keyboard: {editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled"}, scheduleTask: () => {},
    });
    const previous = Object.getOwnPropertyDescriptor(InputEvent.prototype, "getTargetRanges");
    const text = f.adapter.rendered.nodeForAstPath([0, 0, 1, 0, 0, 0])!;
    const range = document.createRange(); range.setStart(text, 1); range.setEnd(text, 3);
    Object.defineProperty(InputEvent.prototype, "getTargetRanges", {configurable: true, value: () => [range]});
    try {
      const event = new InputEvent("beforeinput", {inputType: "insertText", data: "x", cancelable: true, bubbles: true});
      f.host.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(f.selectionSync).toHaveBeenCalledWith(f.initial, "text", 8, 3, "before", "text", 8, 1, "after");
      expect(f.action).toHaveBeenCalledWith(synchronized.successor, "breditor/insert-nested-list-text", "x", false);
      expect(f.action).toHaveBeenCalledOnce();
      expect(f.host.textContent).toBe("PAx");
      expect(router.status).toEqual({kind: "live"});
      // An unexpected native mutation after cancellation is repaired, never
      // replayed as another semantic command.
      f.host.querySelector("h2")!.textContent = "unexpected";
      f.host.dispatchEvent(new InputEvent("input", {inputType: "insertText", data: "x", bubbles: true}));
      expect(f.action).toHaveBeenCalledOnce();
      expect(f.host.textContent).toBe("PAx");
      expect(router.status).toEqual({kind: "live"});
    } finally {
      if (previous) Object.defineProperty(InputEvent.prototype, "getTargetRanges", previous);
      else Reflect.deleteProperty(InputEvent.prototype, "getTargetRanges");
      router.dispose(); f.dispose();
    }
  });

  function routerFixture() {
    const f = clipboardFixture();
    const tasks: Array<() => void> = [];
    const options: BrowserEventRouterOptions = {keyboard: {editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled"},
      scheduleTask: task => { tasks.push(task); }};
    const router = new BreditorNestedListBrowserEventRouter(f.queue, f.adapter, options);
    return {...f, tasks, options, router,
      dispose() { router.dispose(); f.dispose(); }};
  }

  function dispatchTab(host: HTMLElement, controller: ReturnType<typeof createNestedListTabController>) {
    let result: ReturnType<typeof controller.handle> | undefined;
    const event = new KeyboardEvent("keydown", {key: "Tab", code: "Tab", bubbles: true, cancelable: true});
    host.addEventListener("keydown", incoming => { result = controller.handle(incoming); }, {once: true});
    host.dispatchEvent(event);
    return {result, event};
  }

  it("nested Tab rejects foreign queues and leaves leased queues untouched", () => {
    const f = clipboardFixture();
    const foreign = new BreditorNestedListCommandQueue<WasmCommandSequenceOutcome<NestedListDocumentProjection>>(() => { throw new Error("unused"); });
    try {
      expect(() => createNestedListTabController(foreign, f.adapter, true, () => true)).toThrow("same owner");
      const controller = createNestedListTabController(f.queue, f.adapter, true, () => true);
      const port = openNestedListCommandQueueLeasePort(f.queue, f.adapter.commandExecutor)!;
      const lease = port.acquireLease()!;
      try {
        const run = dispatchTab(f.host, controller);
        expect(run.result).toBe("native"); expect(run.event.defaultPrevented).toBe(false);
        expect(f.selectionSync).not.toHaveBeenCalled(); expect(f.action).not.toHaveBeenCalled();
      } finally { expect(port.releaseLease(lease)).toBe(true); }
    } finally { foreign.dispose(); f.dispose(); }
  });

  it("nested Tab leaves core selection errors uncanceled and does not query action states", () => {
    const rejected = commandError("breditor/selection-rejected");
    const f = clipboardFixture(false, {setSelection: [rejected.view]});
    const states = vi.spyOn(f.engine, "actionStates");
    try {
      const controller = createNestedListTabController(f.queue, f.adapter, true, () => true);
      const run = dispatchTab(f.host, controller);
      expect(run.result).toBe("failed"); expect(run.event.defaultPrevented).toBe(false);
      expect(f.selectionSync).toHaveBeenCalledOnce(); expect(states).not.toHaveBeenCalled();
      expect(f.action).not.toHaveBeenCalled(); expect(f.adapter.state).toBe("live");
      expect(f.queue.failure).toBeDefined();
      expect(rejected.free).toHaveBeenCalledOnce(); expect(rejected.errorFree).toHaveBeenCalledOnce();
    } finally { f.dispose(); }
  });

  it("nested Tab reports an uncertain selection once without retrying", () => {
    const f = clipboardFixture();
    try {
      const controller = createNestedListTabController(f.queue, f.adapter, true, () => true);
      expect(dispatchTab(f.host, controller).result).toBe("failed");
      expect(dispatchTab(f.host, controller).result).toBe("failed");
      expect(f.selectionSync).toHaveBeenCalledOnce(); expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("nested Tab holds admission during selection observers and stops on disposal", () => {
    const synchronized = transition(1, "A🙂", "selection");
    const f = clipboardFixture(false, {setSelection: [synchronized.result.view], selection: [synchronized.selected.view]});
    let controller: ReturnType<typeof createNestedListTabController>;
    const queue = new BreditorNestedListCommandQueue(f.adapter.commandExecutor, {observer: () => {
      expect(dispatchTab(f.host, controller).result).toBe("native");
      queue.dispose();
    }});
    try {
      controller = createNestedListTabController(queue, f.adapter, true, () => true);
      const run = dispatchTab(f.host, controller);
      expect(run.result).toBe("failed"); expect(run.event.defaultPrevented).toBe(false);
      expect(f.selectionSync).toHaveBeenCalledOnce(); expect(f.action).not.toHaveBeenCalled();
    } finally { queue.dispose(); f.dispose(); }
  });

  it("nested list router keeps base mode closed and reserves one owner across both facades", () => {
    const f = routerFixture();
    try {
      // @ts-expect-error Legacy constructor cannot accept a list queue/adapter.
      expect(() => new BreditorBrowserEventRouter(f.queue, f.adapter, f.options)).toThrow("queue");
      expect(() => new BreditorNestedListBrowserEventRouter(f.queue, f.adapter, f.options)).toThrow("already has an owner");
      const baseQueue = new BreditorCommandQueue<WasmCommandSequenceOutcome>(() => { throw new Error("unused"); });
      try {
        // @ts-expect-error Deliberately invalid cross-mode adapter, on the same host.
        expect(() => new BreditorBrowserEventRouter(baseQueue, f.adapter, f.options)).toThrow("already has an owner");
      } finally { baseQueue.dispose(); }
      f.router.dispose();
      const successor = new BreditorNestedListBrowserEventRouter(f.queue, f.adapter, f.options);
      expect(successor.status).toEqual({kind: "live"}); successor.dispose();
    } finally { f.dispose(); }
  });

  it("nested list router rolls back failed construction and reserves before option callbacks", () => {
    const f = clipboardFixture();
    const foreign = new BreditorNestedListCommandQueue<WasmCommandSequenceOutcome<NestedListDocumentProjection>>(() => { throw new Error("unused"); });
    const keyboard = {editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled"} as const;
    try {
      expect(() => new BreditorNestedListBrowserEventRouter(foreign, f.adapter, {keyboard})).toThrow("executor");
      let reads = 0;
      const router = new BreditorNestedListBrowserEventRouter(f.queue, f.adapter, {get keyboard() {
        reads++;
        expect(() => new BreditorNestedListBrowserEventRouter(f.queue, f.adapter, {keyboard})).toThrow("already has an owner");
        return keyboard;
      }});
      expect(reads).toBe(1); router.dispose();
    } finally { foreign.dispose(); f.dispose(); }
  });

  it("nested list router gives composition then clipboard exclusive input ownership", () => {
    const f = routerFixture();
    const composition = vi.spyOn(BreditorNestedListCompositionController.prototype, "handleBeforeInput");
    const clipboard = vi.spyOn(BreditorNestedListClipboardController.prototype, "handleBeforeInput");
    const ordinary = vi.spyOn(BreditorNestedListBrowserEventController.prototype, "handleBeforeInput");
    try {
      // A cancelled composition event must never enter clipboard or ordinary translation.
      composition.mockReturnValue({kind: "ignored", reason: "alreadyDefaultPrevented"});
      f.host.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "x", cancelable: true}));
      expect(composition).toHaveBeenCalledTimes(1); expect(clipboard).not.toHaveBeenCalled(); expect(ordinary).not.toHaveBeenCalled();
      composition.mockReturnValue({kind: "ignored", reason: "notComposition"});
      clipboard.mockReturnValue({kind: "beforeinputEcho", operation: "paste", defaultPrevented: true});
      f.host.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertFromPaste", cancelable: true}));
      expect(clipboard).toHaveBeenCalledTimes(1); expect(ordinary).not.toHaveBeenCalled();
      expect(f.router.status).toEqual({kind: "live"});
    } finally { f.dispose(); }
  });

  it("nested list router routes clipboard and document selection events to their sole owners", () => {
    const f = routerFixture();
    const copy = vi.spyOn(BreditorNestedListClipboardController.prototype, "handleCopy")
      .mockReturnValue({kind: "ignored", operation: "copy", defaultPrevented: false, reason: "outsideHost"});
    const selection = vi.spyOn(BreditorNestedListBrowserEventController.prototype, "handleSelectionChange")
      .mockReturnValue({kind: "ignored", reason: "programmaticEcho"});
    try {
      f.host.dispatchEvent(new Event("copy")); document.dispatchEvent(new Event("selectionchange"));
      expect(copy).toHaveBeenCalledTimes(1); expect(selection).toHaveBeenCalledTimes(1);
      expect(f.selectionSync).not.toHaveBeenCalled();
      f.router.dispose(); f.host.dispatchEvent(new Event("copy")); document.dispatchEvent(new Event("selectionchange"));
      expect(copy).toHaveBeenCalledTimes(1); expect(selection).toHaveBeenCalledTimes(1);
    } finally { f.dispose(); }
  });

  it("nested list router defers uncancelled native repair, consumes its input, and ignores the stale task", () => {
    const f = routerFixture();
    vi.spyOn(BreditorNestedListBrowserEventController.prototype, "handleBeforeInput")
      .mockReturnValue({kind: "reconcileRequired", defaultPrevented: false, reason: "noncancelableMutation"});
    const restore = vi.spyOn(f.adapter, "restoreCanonicalRender").mockReturnValue({ok: true, rendered: f.adapter.rendered});
    const input = vi.spyOn(BreditorNestedListBrowserEventController.prototype, "handleInput");
    try {
      f.host.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "x", cancelable: false}));
      expect(restore).not.toHaveBeenCalled(); expect(f.tasks).toHaveLength(1);
      f.host.dispatchEvent(new InputEvent("input", {inputType: "insertText", data: "x"}));
      expect(restore).toHaveBeenCalledTimes(1); expect(input).not.toHaveBeenCalled();
      f.tasks.shift()!(); expect(restore).toHaveBeenCalledTimes(1);
      expect(f.router.status).toEqual({kind: "live"});
    } finally { f.dispose(); }
  });

  it("nested list router faults once on uncertain delivery and leaves late events inert", () => {
    const f = routerFixture(); const statuses = vi.fn(); f.router.subscribe(statuses);
    try {
      f.host.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", code: "Backspace", cancelable: true}));
      expect(f.selectionSync).toHaveBeenCalledTimes(1);
      expect(f.router.status).toEqual({kind: "faulted", reason: "queueUncertain"});
      f.host.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", code: "Backspace", cancelable: true}));
      document.dispatchEvent(new Event("selectionchange")); f.router.dispose();
      expect(f.selectionSync).toHaveBeenCalledTimes(1); expect(statuses).toHaveBeenCalledTimes(1);
    } finally { f.dispose(); }
  });

  it("commits one reconciled Japanese replacement in a nested item and releases the queue", () => {
    const synchronized = transition(1, "A🙂", "selection"), edited = transition(2, "A日本", "action");
    const f = compositionControllerFixture({}, {setSelection: [synchronized.result.view], stringAction: [edited.result.view],
      selection: [synchronized.selected.view, edited.selected.view]});
    try {
      expect(f.composition("compositionstart")).toMatchObject({kind: "native"});
      expect(f.before().result).toMatchObject({kind: "native", phase: "mutating"});
      f.host.querySelector("h2")!.textContent = "A日本";
      expect(f.composition("compositionend", "日本")).toMatchObject({kind: "scheduled"});
      expect(f.action).not.toHaveBeenCalled();
      f.runNext();
      expect(f.notices[0]).toMatchObject({kind: "settled", settlement: {kind: "committed"}});
      expect(f.selectionSync).toHaveBeenCalledWith(f.initial, "text", 8, 3, "before", "text", 8, 1, "after");
      expect(f.action).toHaveBeenCalledWith(synchronized.successor, "breditor/insert-nested-list-plain-text", "日本", true);
      expect(f.action).toHaveBeenCalledOnce();
      expect(f.host.textContent).toBe("PA日本");
      expect(f.host.querySelector("ol")!.start).toBe(8);
      expect(f.controller.phase).toBe("idle");
      const late = {type: "input", inputType: "insertFromComposition", data: "日本", isComposing: false,
        target: f.host, cancelable: false, defaultPrevented: false};
      expect(f.controller.handleInput(late)).toEqual({kind: "lateInputEcho"});
      expect(f.action).toHaveBeenCalledOnce();
      const port = openNestedListCommandQueueLeasePort(f.queue, f.adapter.commandExecutor)!;
      const lease = port.acquireLease(); expect(lease).toBeDefined(); if (lease) port.releaseLease(lease);
      expect(f.queue.failure).toBeUndefined();
    } finally { f.dispose(); }
    for (const step of [synchronized, edited]) expect(step.result.free).toHaveBeenCalledOnce();
  });

  function compositionControllerFixture(options: CompositionControllerOptions<NestedListDocumentProjection> = {},
    input: Parameters<typeof engineQueues>[0] = {}, extraItem = false) {
    const f = compositionAdapterFixture(input, extraItem);
    if (!f.bridge.write(f.adapter.rendered, f.selected).ok) throw new Error("initial selection write failed");
    const queue = new BreditorNestedListCommandQueue(f.adapter.commandExecutor);
    const tasks: Array<() => void> = [];
    const notices: CompositionControllerNotification<NestedListDocumentProjection>[] = [];
    const controller = new BreditorNestedListCompositionController(queue, f.adapter, {
      scheduleTask: task => { tasks.push(task); }, onSettlement: notice => { notices.push(notice); }, ...options,
    });
    const text = f.adapter.rendered.nodeForAstPath([0, 0, 1, 0, 0, 0])!;
    const range = document.createRange(); range.setStart(text, 1); range.setEnd(text, 3);
    const composition = (type: string, data = "") => controller.handleCompositionEvent({type, data, target: f.host,
      cancelable: false, defaultPrevented: false});
    const before = (ranges: AbstractRange[] = [range]) => {
      const event = {type: "beforeinput", inputType: "insertCompositionText", data: "漢", isComposing: true,
        target: f.host, cancelable: true, defaultPrevented: false, getTargetRanges: () => ranges,
        preventDefault() { this.defaultPrevented = true; }};
      return {result: controller.handleBeforeInput(event), event};
    };
    const runNext = () => { const task = tasks.shift(); if (!task) throw new Error("missing task"); task(); };
    return {...f, queue, controller, tasks, notices, range, text, composition, before, runNext,
      dispose() { controller.dispose(); queue.dispose(); f.dispose(); }};
  }

  it("nested list composition controller rejects base mode and foreign executor wiring", () => {
    const f = compositionControllerFixture();
    try {
      // @ts-expect-error The base facade cannot receive list dependencies.
      expect(() => new BreditorCompositionController(f.queue, f.adapter)).toThrow("queue");
      const foreign = new BreditorNestedListCommandQueue<WasmCommandSequenceOutcome<NestedListDocumentProjection>>(() => { throw new Error("unused"); });
      expect(() => new BreditorNestedListCompositionController(foreign, f.adapter)).toThrow("executor");
      foreign.dispose();
    } finally { f.dispose(); }
  });

  it.each([false, true])("nested list composition opens with implicit=%s and preserves exact backward refinement", implicit => {
    const f = compositionControllerFixture(); const refine = vi.spyOn(f.adapter, "refineCompositionLease");
    try {
      Object.defineProperty(f.controller, "nestedLists", {value: false});
      if (!implicit) expect(f.composition("compositionstart")).toMatchObject({kind: "native"});
      expect(f.before().result).toEqual({kind: "native", phase: "mutating"});
      expect(f.adapter.restoreCanonicalSelection()).toBe(false);
      expect(f.adapter.state).toBe("composition");
      if (implicit) expect(f.composition("compositionstart").kind).toBe("native");
      expect(refine).toHaveBeenCalledOnce(); expect(refine.mock.calls[0]![1]).toBe(f.selected);
      const port = openNestedListCommandQueueLeasePort(f.queue, f.adapter.commandExecutor)!;
      expect(port.acquireLease()).toBeUndefined();
      expect(f.controller.dispose().kind).toBe("disposed");
      const lease = port.acquireLease(); expect(lease).toBeDefined(); if (lease) port.releaseLease(lease);
      expect(f.bridge.read(f.adapter.rendered)).toMatchObject({ok: true, value: {selection: f.selected}});
    } finally { refine.mockRestore(); f.dispose(); }
  });

  it.each(["missing", "scalar", "cross-item"])("nested list composition refuses %s targets and recovers without a command", fault => {
    const f = compositionControllerFixture({}, {}, true);
    try {
      f.composition("compositionstart");
      const range = document.createRange(); range.setStart(f.text, fault === "scalar" ? 2 : 1);
      const end = fault === "cross-item" ? f.adapter.rendered.nodeForAstPath([0, 0, 1, 1, 0, 0])! : f.text;
      range.setEnd(end, fault === "cross-item" ? 1 : 3);
      const result = f.before(fault === "missing" ? [] : [range]);
      expect(result.result).toMatchObject({kind: "recoveryRequired", reason: fault === "missing" ? "targetUnavailable" : "targetInvalid"});
      expect(result.event.defaultPrevented).toBe(true); expect(f.controller.phase).toBe("quarantined");
      f.runNext(); expect(f.notices[0]?.kind).toBe("recovered");
      expect(f.controller.phase).toBe("idle"); expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("nested list composition still refines a genuinely different native target", () => {
    const f = compositionControllerFixture(); const refine = vi.spyOn(f.adapter, "refineCompositionLease");
    try {
      f.composition("compositionstart");
      const range = document.createRange(); range.setStart(f.text, 0); range.setEnd(f.text, 1);
      expect(f.before([range]).result).toEqual({kind: "native", phase: "mutating"});
      const selected = refine.mock.calls[0]![1];
      expect(selected).not.toBe(f.selected); expect(selected.order).toBe("forward");
      expect(selected.anchor).toMatchObject({textPath: [0, 0, 1, 0, 0, 0], utf16Offset: 0});
      expect(selected.focus).toMatchObject({textPath: [0, 0, 1, 0, 0, 0], utf16Offset: 1});
    } finally { refine.mockRestore(); f.dispose(); }
  });

  it("nested list composition quarantines structural drift and schedules exact cancellation recovery", () => {
    const f = compositionControllerFixture();
    try {
      f.composition("compositionstart"); f.before();
      f.host.querySelector("h2")!.textContent = "A漢"; f.host.querySelector("ol")!.start = 99;
      expect(f.composition("compositionend", "漢").kind).toBe("scheduled");
      f.runNext(); expect(f.notices[0]).toEqual({kind: "recoveryRequired", reason: "domReconcileFailed"});
      f.runNext(); expect(f.notices[1]?.kind).toBe("recovered");
      expect(f.host.querySelector("h2")!.textContent).toBe("A🙂"); expect(f.host.querySelector("ol")!.start).toBe(8);
      expect(f.bridge.read(f.adapter.rendered)).toMatchObject({ok: true, value: {selection: f.selected}});
      expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("nested list composition cancellation retains selection and emits only the explicit history boundary", () => {
    const f = compositionControllerFixture({}, {
      setSelection: [commandResult({status: "unchanged", successor: observation(0)}).view],
      closeHistory: [commandResult({status: "unchanged", successor: observation(0)}).view],
    });
    try {
      f.composition("compositionstart"); f.before(); f.composition("compositionend");
      f.runNext(); expect(f.notices[0]).toMatchObject({kind: "settled", settlement: {kind: "cancelled"}});
      expect(f.controller.phase).toBe("idle"); expect(f.closeHistory).toHaveBeenCalledOnce(); expect(f.action).not.toHaveBeenCalled();
      expect(f.bridge.read(f.adapter.rendered)).toMatchObject({ok: true, value: {selection: f.selected}});
    } finally { f.dispose(); }
  });

  it("nested list composition never retries a generated command after uncertainty", () => {
    const f = compositionControllerFixture();
    try {
      f.composition("compositionstart"); f.before(); f.host.querySelector("h2")!.textContent = "A漢";
      f.composition("compositionend", "漢"); f.runNext();
      expect(f.notices[0]).toEqual({kind: "recoveryRequired", reason: "uncertain"});
      expect(f.controller.phase).toBe("quarantined"); f.runNext();
      expect(f.notices[1]).toEqual({kind: "recoveryRequired", reason: "uncertain"});
      expect(f.queue.failure).toBeDefined(); expect(f.action).not.toHaveBeenCalled();
      expect(f.selectionSync).toHaveBeenCalledOnce();
      // Selection synchronization is the first generated step; it throws in
      // this empty engine fixture, so no content action is ever attempted.
      expect(f.adapter.state).toBe("faulted");
    } finally { f.dispose(); }
  });

  it("copies across a parent/child list boundary in reading order", () => {
    const f = clipboardFixture();
    try {
      const selected = NestedListRangeSelection.create(f.adapter.rendered.projection, {kind: "range",
        anchor: {kind: "text", textPath: [0, 0, 1, 0, 0, 0], utf16Offset: 3, affinity: "before"},
        focus: {kind: "text", textPath: [0, 0, 0, 0], utf16Offset: 0, affinity: "after"}});
      if (!selected.ok) throw new Error(selected.error.code);
      expect(f.bridge.write(f.adapter.rendered, selected.value).ok).toBe(true);
      expect(f.controller.handleCopy(f.event("copy"))).toMatchObject({kind: "handled", operation: "copy"});
      expect([...f.values]).toEqual([["text/plain", "P\nA🙂"], ["text/html", "<p>P</p><p>A🙂</p>"]]);
      expect(f.selectionSync).not.toHaveBeenCalled();
      expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each(["cut", "paste"] as const)("delivers nested %s once after cancellation with the captured deep selection", operation => {
    const synchronized = transition(1, "A🙂", "selection");
    const edited = transition(2, operation === "cut" ? "A" : "A日本", "action");
    const f = clipboardFixture(false, {setSelection: [synchronized.result.view],
      selection: [synchronized.selected.view, edited.selected.view],
      ...(operation === "cut" ? {noInputAction: [edited.result.view]} : {stringAction: [edited.result.view]})});
    // The adapter captured this ABI method at construction; use its existing
    // string-action spy to observe calls rather than replacing that capability.
    try {
      const event = f.event(operation);
      if (operation === "paste") f.values.set("text/plain", "日本");
      const result = operation === "cut" ? f.controller.handleCut(event) : f.controller.handlePaste(event);
      expect(result).toMatchObject({kind: "handled", operation});
      expect(event.defaultPrevented).toBe(true);
      expect(f.selectionSync).toHaveBeenCalledWith(f.initial, "text", 8, 3, "before", "text", 8, 1, "after");
      expect(f.selectionSync).toHaveBeenCalledOnce();
      if (operation === "cut") {
        expect([...f.values]).toEqual([["text/plain", "🙂"], ["text/html", "<p>🙂</p>"]]);
        expect(f.action).not.toHaveBeenCalled();
      } else {
        expect(f.action).toHaveBeenCalledWith(synchronized.successor, "breditor/insert-nested-list-plain-text", "日本", true);
        expect(f.action).toHaveBeenCalledOnce();
      }
      expect(f.host.querySelector("h2")!.textContent).toBe(operation === "cut" ? "A" : "A日本");
      expect(f.host.querySelector("ol")!.start).toBe(8);
      expect(f.adapter.state).toBe("live");
      const echo = new InputEvent("beforeinput", {bubbles: true, cancelable: true,
        inputType: operation === "cut" ? "deleteByCut" : "insertFromPaste"});
      f.host.dispatchEvent(echo);
      expect(f.controller.handleBeforeInput(echo)).toMatchObject({kind: "beforeinputEcho", operation});
      expect(echo.defaultPrevented).toBe(true);
      expect(f.selectionSync).toHaveBeenCalledOnce();
      expect(f.queue.failure).toBeUndefined();
    } finally { f.dispose(); }
    for (const step of [synchronized, edited]) expect(step.result.free).toHaveBeenCalledOnce();
  });

  function clipboardFixture(extraItem = false, input: Parameters<typeof engineQueues>[0] = {}) {
    const f = compositionAdapterFixture(input, extraItem);
    if (!f.bridge.write(f.adapter.rendered, f.selected).ok) throw new Error("initial selection write failed");
    const queue = new BreditorNestedListCommandQueue(f.adapter.commandExecutor);
    const controller = new BreditorNestedListClipboardController(queue, f.adapter);
    const values = new Map<string, string>();
    const transfer = {get types() { return [...values.keys()]; },
      clearData: vi.fn(() => { values.clear(); }),
      setData: vi.fn((type: string, value: string) => { values.set(type, value); }),
      getData: vi.fn((type: string) => values.get(type) ?? "")};
    const event = (type: string) => ({type, target: f.host, cancelable: true, defaultPrevented: false,
      clipboardData: transfer, preventDefault() { this.defaultPrevented = true; }});
    return {...f, queue, controller, values, transfer, event,
      dispose() { controller.dispose(); queue.dispose(); f.dispose(); }};
  }

  it("nested list clipboard rejects base queues and mismatched captured executors", () => {
    const f = clipboardFixture();
    const foreign = new BreditorNestedListCommandQueue<WasmCommandSequenceOutcome<NestedListDocumentProjection>>(() => { throw new Error("unused"); });
    try {
      // @ts-expect-error The legacy facade cannot accept list dependencies.
      expect(() => new BreditorClipboardController(f.queue, f.adapter)).toThrow("queue");
      expect(() => new BreditorNestedListClipboardController(foreign, f.adapter)).toThrow("executor");
    } finally { foreign.dispose(); f.dispose(); }
  });

  it("nested list copy writes exact paired representations without executing any Rust selection/action", () => {
    const f = clipboardFixture();
    try {
      Object.defineProperty(f.controller, "nestedLists", {value: false});
      const event = f.event("copy");
      expect(f.controller.handleCopy(event)).toMatchObject({kind: "handled", operation: "copy",
        partial: {clipboard: "representationsWritten", command: "notApplicable"}});
      expect(event.defaultPrevented).toBe(true);
      expect([...f.values]).toEqual([["text/plain", "🙂"], ["text/html", "<p>🙂</p>"]]);
      expect(f.selectionSync).not.toHaveBeenCalled(); expect(f.action).not.toHaveBeenCalled();
      expect(f.adapter.state).toBe("live");
    } finally { f.dispose(); }
  });

  it.each(["write", "cancel"])("nested list cut never deletes after %s failure", failure => {
    const f = clipboardFixture();
    try {
      const event = f.event("cut");
      if (failure === "write") f.transfer.setData.mockImplementation(type => { if (type === "text/html") throw new Error("write failed"); });
      else event.preventDefault = () => {};
      expect(f.controller.handleCut(event)).toMatchObject(failure === "write"
        ? {kind: "blocked", reason: "clipboardWriteFailed"} : {kind: "reconcileRequired", reason: "cancellationFailed"});
      expect(f.selectionSync).not.toHaveBeenCalled(); expect(f.action).not.toHaveBeenCalled();
      expect(f.adapter.state).toBe("live");
    } finally { f.dispose(); }
  });

  it("nested list clipboard holds the queue through transfer callbacks and blocks stale DOM cut", () => {
    const f = clipboardFixture();
    try {
      const queued = request(f.adapter);
      f.transfer.clearData.mockImplementation(() => {
        expect(f.queue.submit(queued)).toEqual({status: "rejected", reason: "leased"});
        f.host.querySelector("ol")!.start = 9;
      });
      expect(f.controller.handleCut(f.event("cut"))).toMatchObject({kind: "reconcileRequired", reason: "staleBase"});
      expect(f.transfer.setData).not.toHaveBeenCalled(); expect(f.selectionSync).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("nested list paste prefers authoritative plain text and never falls back after invalid input", () => {
    const f = clipboardFixture();
    try {
      f.values.set("text/plain", "\ud800"); f.values.set("text/html", "<p>valid</p>");
      expect(f.controller.handlePaste(f.event("paste"))).toMatchObject({kind: "blocked", reason: "invalidPlainText"});
      expect(f.transfer.getData.mock.calls).toEqual([["text/plain"]]);
      expect(f.selectionSync).not.toHaveBeenCalled();
      f.values.delete("text/plain"); f.values.set("text/html", "<ul><li>unsupported</li></ul>");
      expect(f.controller.handlePaste(f.event("paste"))).toMatchObject({kind: "blocked", reason: "invalidHtml"});
      expect(f.selectionSync).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("nested list clipboard reports uncertain selection synchronization once without retrying", () => {
    const f = clipboardFixture();
    try {
      f.values.set("text/plain", "pasted");
      expect(f.controller.handlePaste(f.event("paste"))).toMatchObject({kind: "reconcileRequired"});
      expect(f.selectionSync).toHaveBeenCalledTimes(1); expect(f.action).not.toHaveBeenCalled();
      expect(f.adapter.state).toBe("faulted");
      expect(f.controller.handlePaste(f.event("paste"))).toMatchObject({kind: "reconcileRequired", reason: "queueUnavailable"});
      expect(f.selectionSync).toHaveBeenCalledTimes(1);
    } finally { f.dispose(); }
  });

  it.each([false, true])("correlates durable document export with exact nested topology (reparented=%s)", reparented => {
    const element = (type: string, children: unknown[], properties = {}) => ({kind: "element", type: `breditor/${type}`, entityId: null, properties, children});
    const parent = element("paragraph", [{kind: "text", text: "P", formats: []}]);
    const child = element("ordered-list", [element("list-item", [element("heading", [{kind: "text", text: "A🙂", formats: []}], {"breditor/level": 2})])], {"breditor/start": 8});
    const root = element("document", reparented
      ? [element("bullet-list", [element("list-item", [parent])]), child]
      : [element("bullet-list", [element("list-item", [parent, child])])]);
    const json = JSON.stringify({format: "breditor/document", formatVersion: 2,
      schema: {name: TEST_PROFILE_DESCRIPTOR.schema.name, version: TEST_PROFILE_DESCRIPTOR.schema.version},
      schemaFingerprint: TEST_PROFILE_DESCRIPTOR.schema.fingerprint, root});
    const free = vi.fn(), f = fixture();
    const adapter = new BreditorNestedListWasmCommandAdapter(engineQueues({documents: [{status: "value", error: undefined, takeValue: () => json, free}]}), observation(0), f.options);
    try {
      expect(adapter.documentJsonReadPort.read()?.ok).toBe(!reparented);
      expect(adapter.state).toBe("live");
      expect(free).toHaveBeenCalledOnce();
    } finally { adapter.dispose(); f.bridge.dispose(); f.host.remove(); }
  });

  function transition(revision: number, text: string, eventKind: "selection" | "action" | "undo" | "redo") {
    const children: Record<number, number[]> = {0: [1], 1: [2], 2: [3, 5], 3: [4], 5: [6], 6: [7], 7: [8]};
    const types: Record<number, string> = {0: "document", 1: "bullet-list", 2: "list-item", 3: "paragraph", 5: "ordered-list", 6: "list-item", 7: "heading"};
    const child: FlatListSemanticProjectionView = {
      ...projectionView(projection(revision, text)), nodeCount: 9,
      nodeKind: index => index === 4 || index === 8 ? "text" : types[index] === undefined ? undefined : "element",
      elementType: index => types[index] === undefined ? undefined : `breditor/${types[index]}`,
      childCount: index => children[index]?.length,
      childAt: (index, ordinal) => children[index]?.[ordinal],
      text: index => index === 4 ? "P" : index === 8 ? text : undefined,
      formatCount: index => index === 4 || index === 8 ? 0 : undefined,
      headingLevel: index => index === 7 ? 2 : undefined,
      listKind: index => index === 1 ? "bullet" : index === 5 ? "ordered" : undefined,
      orderedListStart: index => index === 5 ? 8 : undefined,
    };
    let taken = false;
    const update: SemanticProjectionUpdateView = {
      baseLineage: "adapter-tests", baseRevision: String(revision - 1), resultLineage: "adapter-tests", resultRevision: String(revision),
      impact: eventKind === "selection" ? "none" : "root", affectedParagraphCount: 0,
      oldChildStart: undefined, oldChildEnd: undefined, newChildStart: undefined, newChildEnd: undefined,
      affectedParagraphIndex: () => undefined, matchesProfileGeneration: matchesTestProfile,
      takeProjection: () => { if (taken) return undefined; taken = true; return child; }, free: vi.fn(),
    };
    const successor = observation(revision);
    const result = commandResult({status: "committed", eventKind, successor, update});
    const selected = selectionResult({...selectionView(revision, text.length), anchorNodeIndex: 8, focusNodeIndex: 8});
    return {child, update, successor, result, selected};
  }

  it("publishes recursive updates and deep selections through selection, edit, undo and redo", () => {
    const f = fixture(), initial = observation(0);
    const steps = [transition(1, "A🙂", "selection"), transition(2, "A🙂x", "action"), transition(3, "A🙂", "undo"), transition(4, "A🙂x", "redo")];
    const engine = engineQueues({setSelection: [steps[0]!.result.view], stringAction: [steps[1]!.result.view],
      undo: [steps[2]!.result.view], redo: [steps[3]!.result.view], selection: steps.map(step => step.selected.view)});
    const sync = vi.spyOn(engine, "setRangeSelection");
    const adapter = new BreditorNestedListWasmCommandAdapter(engine, initial, f.options);
    try {
      const point = {kind: "text" as const, textPath: [0, 0, 1, 0, 0, 0], utf16Offset: 3, affinity: "before" as const};
      const selection = NestedListRangeSelection.create(adapter.rendered.projection, {kind: "range", anchor: point, focus: point});
      if (!selection.ok) throw new Error(selection.error.code);
      const first = nestedListCommandRequest(adapter.deliveryToken(), nestedListRangeSelectionSync(selection.value), {kind: "api", detail: "select"}, {kind: "selection", operation: "synchronize"});
      expect(adapter.execute(first).command.status).toBe("committed");
      expect(sync).toHaveBeenCalledWith(initial, "text", 8, 3, "before", "text", 8, 3, "before");
      expect(() => adapter.execute(first)).toThrow();
      const command = nestedListCommandRequest(adapter.deliveryToken(), preserveSelectionSync(), {kind: "api", detail: "type"},
        {kind: "action", actionId: "breditor/insert-nested-list-text", input: {kind: "string", value: "x"}});
      expect(adapter.execute(command).command.status).toBe("committed");
      expect(f.host.textContent).toBe("PA🙂x");
      for (const operation of ["undo", "redo"] as const) {
        expect(adapter.execute(nestedListCommandRequest(adapter.deliveryToken(), preserveSelectionSync(), {kind: "api", detail: operation}, {kind: "history", operation})).command.status).toBe("committed");
        expect(f.host.querySelector("h2")!.textContent).toBe(operation === "undo" ? "A🙂" : "A🙂x");
        expect(f.host.querySelector("ol")!.start).toBe(8);
      }
      expect(f.bridge.read(adapter.rendered)).toMatchObject({ok: true, value: {selection: {anchor: {textPath: point.textPath, utf16Offset: 4}}}});
      expect(adapter.state).toBe("live");
    } finally { adapter.dispose(); f.bridge.dispose(); f.host.remove(); }
    expect(initial.free).toHaveBeenCalledOnce();
    for (const step of steps) for (const free of [step.child.free, step.update.free, step.successor.free, step.result.free, step.selected.free, step.selected.selectionFree]) expect(free).toHaveBeenCalledOnce();
  });

  function fixture(extraItem = false) {
    const projection = NestedListDocumentProjection.create({schema: TEST_PROFILE_DESCRIPTOR.schema,
      snapshot: {lineage: "adapter-tests", revision: "0"}, blocks: [
        {kind: "bulletList", items: [{block: {headingLevel: null, runs: [{text: "P", formatDetails: []}]}, lists: [
          {kind: "orderedList", start: 8, items: [{block: {headingLevel: 2, runs: [{text: "A🙂", formatDetails: []}]}, lists: []},
            ...(extraItem ? [{block: {headingLevel: null, runs: [{text: "B", formatDetails: []}]}, lists: []}] : [])]}
        ]}]},
      ]}, TEST_PROFILE_GENERATION, TEST_PROFILE_DESCRIPTOR);
    if (!projection.ok) throw new Error(projection.error.code);
    const renderer = new BreditorDomRenderer(compileBrowserPresentation(TEST_PROFILE_GENERATION, TEST_PROFILE_DESCRIPTOR,
      createInlineFormatRenderManifest({recipes: [{formatKind: "breditor/strong", element: "strong"}]})));
    const host = document.createElement("div"); document.body.append(host);
    const rendered = renderer.renderNestedList(host, projection.value);
    if (!rendered.ok) throw new Error(rendered.error.code);
    const bridge = new BreditorNestedListDomSelectionBridge();
    return {host, renderer, bridge, options: {durableMode: "v7" as const,
      profileGeneration: TEST_PROFILE_GENERATION, profileDescriptor: TEST_PROFILE_DESCRIPTOR,
      renderer, rendered: rendered.value.rendered, selectionBridge: bridge}};
  }
  const request = (adapter: BreditorNestedListWasmCommandAdapter) => nestedListCommandRequest(adapter.deliveryToken(),
    preserveSelectionSync(), {kind: "api", detail: "lists"},
    {kind: "action", actionId: "breditor/toggle-nested-list-strong", input: {kind: "none"}});

  function compositionAdapterFixture(input: Parameters<typeof engineQueues>[0] = {}, extraItem = false) {
    const f = fixture(extraItem); const initial = observation(0); const engine = engineQueues(input);
    const action = vi.spyOn(engine, "executeStringAction");
    const selectionSync = vi.spyOn(engine, "setRangeSelection");
    const closeHistory = vi.spyOn(engine, "closeHistoryGroup");
    const adapter = new BreditorNestedListWasmCommandAdapter(engine, initial, f.options);
    const selected = NestedListRangeSelection.create(adapter.rendered.projection, {kind: "range",
      anchor: {kind: "text", textPath: [0, 0, 1, 0, 0, 0], utf16Offset: 3, affinity: "before"},
      focus: {kind: "text", textPath: [0, 0, 1, 0, 0, 0], utf16Offset: 1, affinity: "after"}});
    if (!selected.ok) throw new Error(selected.error.code);
    return {...f, initial, engine, action, selectionSync, closeHistory, adapter, selected: selected.value,
      dispose() { adapter.dispose(); f.bridge.dispose(); f.host.remove(); }};
  }

  it("owns a one-use list composition lease and restores exact selection without a Rust edit", () => {
    const f = compositionAdapterFixture();
    try {
      const delivery = f.adapter.deliveryToken(); const before = f.adapter.rendered;
      const lease = f.adapter.beginCompositionLease(delivery, f.selected, 1n);
      expect(f.adapter.state).toBe("composition"); expect(f.adapter.acceptsDeliveryToken(delivery)).toBe(false);
      expect(() => f.adapter.deliveryToken()).toThrow();
      expect(f.adapter.openCompositionDomLease(lease)).toBe(true);
      f.host.querySelector("h2")!.textContent = "A漢";
      expect(reconcileNestedListCompositionDom(f.host, before.projection, f.selected)).toMatchObject({ok: true,
        value: {textBlockPath: [0, 0, 1, 0, 0], originalText: "🙂", text: "漢"}});
      const restored = f.adapter.restoreCompositionLease(lease);
      expect(restored.ok).toBe(true);
      if (!restored.ok) throw new Error(restored.reason);
      expect(restored.selection).toBe(f.selected); expect(f.adapter.acceptsDeliveryToken(restored.delivery)).toBe(true);
      expect(f.host.querySelector("h2")!.textContent).toBe("A🙂"); expect(f.host.querySelector("ol")!.start).toBe(8);
      expect(f.bridge.read(restored.rendered)).toMatchObject({ok: true, value: {origin: "programmaticEcho", selection: f.selected}});
      expect(() => f.adapter.restoreCompositionLease(lease)).toThrow(); expect(f.action).not.toHaveBeenCalled();
      expect(f.initial.free).not.toHaveBeenCalled();
    } finally { f.dispose(); }
    expect(f.initial.free).toHaveBeenCalledOnce();
  });

  it("refines a list composition range once, invalidating the previous exact token", () => {
    const f = compositionAdapterFixture();
    try {
      const lease = f.adapter.beginCompositionLease(f.adapter.deliveryToken(), f.selected, 1n);
      const refined = f.adapter.refineCompositionLease(lease, f.selected);
      expect(() => f.adapter.openCompositionDomLease(lease)).toThrow("stale");
      expect(() => f.adapter.refineCompositionLease(refined, f.selected)).toThrow();
      expect(f.adapter.openCompositionDomLease(refined)).toBe(true);
      expect(() => f.adapter.openCompositionDomLease(refined)).toThrow();
      expect(f.adapter.restoreCompositionLease(refined).ok).toBe(true);
    } finally { f.dispose(); }
  });

  it("rejects foreign list composition selections and tokens before changing state", () => {
    const f = compositionAdapterFixture(); const other = compositionAdapterFixture();
    try {
      const delivery = f.adapter.deliveryToken();
      expect(() => f.adapter.beginCompositionLease(delivery, other.selected, 1n)).toThrow();
      expect(f.adapter.acceptsDeliveryToken(delivery)).toBe(true);
      const lease = f.adapter.beginCompositionLease(delivery, f.selected, 1n);
      expect(() => other.adapter.openCompositionDomLease(lease)).toThrow();
      expect(() => f.adapter.restoreCompositionLease({...lease})).toThrow("stale");
      expect(f.adapter.restoreCompositionLease(lease).ok).toBe(true);
    } finally { f.dispose(); other.dispose(); }
  });

  it("recovers a list composition after its DOM lease is superseded", () => {
    const f = compositionAdapterFixture();
    try {
      const lease = f.adapter.beginCompositionLease(f.adapter.deliveryToken(), f.selected, 1n);
      expect(f.adapter.openCompositionDomLease(lease)).toBe(true);
      f.host.querySelector("h2")!.textContent = "native";
      expect(f.renderer.renderNestedList(f.host, lease.projection).ok).toBe(true);
      expect(() => f.adapter.restoreCompositionLease(lease)).toThrow("stale");
      expect(f.adapter.recoverCompositionLease(lease)).toMatchObject({ok: true, selection: f.selected});
      expect(f.adapter.state).toBe("live"); expect(f.host.textContent).toBe("PA🙂");
      expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each(["render", "selection"])("spends the list lease after a %s restoration failure", failure => {
    const f = compositionAdapterFixture();
    const lease = f.adapter.beginCompositionLease(f.adapter.deliveryToken(), f.selected, 1n);
    expect(f.adapter.openCompositionDomLease(lease)).toBe(true);
    const override = failure === "render"
      ? vi.spyOn(f.renderer, "restoreNestedListCompositionDomLease").mockImplementation(() => { throw new Error("render failure"); })
      : vi.spyOn(f.bridge, "write").mockImplementation(() => { throw new Error("selection failure"); });
    try {
      expect(f.adapter.restoreCompositionLease(lease)).toEqual({ok: false, reason: failure === "render" ? "renderFailed" : "selectionWriteFailed"});
      expect(f.adapter.state).toBe("reconcile"); expect(() => f.adapter.restoreCompositionLease(lease)).toThrow();
      expect(f.action).not.toHaveBeenCalled();
    } finally { override.mockRestore(); f.dispose(); }
  });

  it("disposal discards provisional list composition DOM and frees observation once", () => {
    const f = compositionAdapterFixture();
    try {
      const lease = f.adapter.beginCompositionLease(f.adapter.deliveryToken(), f.selected, 1n);
      expect(f.adapter.openCompositionDomLease(lease)).toBe(true); f.host.querySelector("h2")!.textContent = "native";
      f.adapter.dispose(); f.adapter.dispose();
      expect(f.host.textContent).toBe("PA🙂"); expect(f.initial.free).toHaveBeenCalledOnce();
      expect(f.adapter.state).toBe("disposed"); expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each(["v7 legacy", "v6 list", "base bridge", "base render"])("rejects mismatched %s dependencies", fault => {
    const f = fixture(); const initial = observation(0); const engine = engineQueues({});
    if (fault === "v7 legacy") {
      // @ts-expect-error List dependencies are deliberately not legacy dependencies.
      expect(() => new RawBreditorWasmCommandAdapter(engine, initial, f.options)).toThrow();
    } else {
      const options = fault === "v6 list" ? {...f.options, durableMode: "v6"}
        : fault === "base bridge" ? {...f.options, selectionBridge: new BreditorDomSelectionBridge()}
          : {...f.options, rendered: projectionFixture(0, "base").rendered};
      expect(() => new BreditorNestedListWasmCommandAdapter(engine, initial, options as never)).toThrow();
    }
    f.renderer.releaseNestedList(f.options.rendered); f.bridge.dispose();
  });

  it("spends disabled deliveries, keeps exact private authority, and frees each owner once", () => {
    const f = fixture(); const initial = observation(0); const next = observation(0);
    const result = commandResult({status: "disabled", successor: next, disabledActionId: "breditor/toggle-nested-list-strong",
      disabledReasonCode: "breditor/no-selection", activation: "inactive"});
    const engine = engineQueues({noInputAction: [result.view]}); const action = vi.spyOn(engine, "executeNoInputAction");
    const adapter = new BreditorNestedListWasmCommandAdapter(engine, initial, f.options);
    const captured = request(adapter); const execute = adapter.commandExecutor;
    const override = vi.fn(() => { throw new Error("public override"); });
    Object.defineProperty(adapter, "execute", {value: override});
    Object.defineProperty(adapter, "acceptsDeliveryToken", {value: () => true});
    expect(nestedListEditorDeliveryAuthorityAccepts(adapter.deliveryAuthority, captured.delivery)).toBe(true);
    expect(editorDeliveryAuthorityAccepts(adapter.deliveryAuthority, captured.delivery)).toBe(false);
    expect(execute(captured).command.status).toBe("disabled");
    expect(nestedListEditorDeliveryAuthorityAccepts(adapter.deliveryAuthority, captured.delivery)).toBe(false);
    expect(() => execute(captured)).toThrow("stale"); expect(action).toHaveBeenCalledOnce(); expect(override).not.toHaveBeenCalled();
    expect(result.free).toHaveBeenCalledOnce(); expect(initial.free).toHaveBeenCalledOnce();
    expect(adapter.plainTextReadPort.read()).toMatchObject({ok: true, content: {text: "P\nA🙂", utf8Bytes: 7}});
    adapter.dispose(); adapter.dispose(); expect(next.free).toHaveBeenCalledOnce(); f.bridge.dispose();
    expect(adapter.plainTextReadPort.read()).toMatchObject({ok: false});
  });

  it.each(["missing update", "cleanup throw", "cleanup thenable"])("faults on %s without retrying the generated command", fault => {
    const f = fixture(); const initial = observation(0); const next = observation(fault === "missing update" ? 1 : 0);
    const result = commandResult(fault === "missing update"
      ? {status: "committed", eventKind: "action", successor: next}
      : {status: "disabled", successor: next, disabledActionId: "breditor/toggle-nested-list-strong",
          disabledReasonCode: "breditor/no-selection", activation: "inactive",
          ...(fault === "cleanup throw" ? {freeThrows: true} : {freeResult: Promise.resolve(undefined)})});
    const engine = engineQueues({noInputAction: [result.view]}); const action = vi.spyOn(engine, "executeNoInputAction");
    const adapter = new BreditorNestedListWasmCommandAdapter(engine, initial, f.options); const captured = request(adapter);
    expect(() => adapter.execute(captured)).toThrow(); expect(adapter.state).toBe("faulted");
    expect(adapter.restoreCanonicalRender()).toEqual({ok: false, reason: "adapterUnavailable"});
    expect(() => adapter.execute(captured)).toThrow(); expect(action).toHaveBeenCalledOnce();
    expect(result.free).toHaveBeenCalledOnce();
    adapter.dispose(); f.bridge.dispose(); expect(initial.free).toHaveBeenCalledOnce(); expect(next.free).toHaveBeenCalledOnce();
  });

  it("rejects foreign owners and base requests before generated mutation", () => {
    const f = fixture(); const engine = engineQueues({}); const action = vi.spyOn(engine, "executeNoInputAction");
    const adapter = new BreditorNestedListWasmCommandAdapter(engine, observation(0), f.options);
    const second = fixture(); const other = new BreditorNestedListWasmCommandAdapter(engineQueues({}), observation(0), second.options);
    expect(() => adapter.execute(request(other))).toThrow("stale");
    const base = projectionFixture(0, "base");
    const legacy = new BreditorWasmCommandAdapter(engineQueues({}), observation(0), {
      renderer: base.renderer, rendered: base.rendered, selectionBridge: new BreditorDomSelectionBridge()});
    const baseRequest = noInputActionRequest(legacy.deliveryToken(), preserveSelectionSync(), {kind: "api", detail: "base"}, "breditor/toggle-strong");
    // @ts-expect-error The explicit list adapter cannot receive base requests.
    expect(() => adapter.execute(baseRequest)).toThrow("exact executable");
    // @ts-expect-error The base adapter cannot receive list requests.
    expect(() => legacy.commandExecutor(request(adapter))).toThrow("exact executable");
    expect(action).not.toHaveBeenCalled(); expect(adapter.state).toBe("live");
    adapter.dispose(); other.dispose(); legacy.dispose(); f.bridge.dispose(); second.bridge.dispose();
  });
});

describe("explicit flat-list command adapter", () => {
  function fixture(extraItem = false) {
    const projection = FlatListDocumentProjection.create({schema: TEST_PROFILE_DESCRIPTOR.schema,
      snapshot: {lineage: "adapter-tests", revision: "0"}, blocks: [
        {kind: "orderedList", start: 8, items: [{headingLevel: 2, runs: [{text: "A🙂", formatDetails: []}]},
          ...(extraItem ? [{headingLevel: null, runs: [{text: "B", formatDetails: []}]}] : [])]},
      ]}, TEST_PROFILE_GENERATION, TEST_PROFILE_DESCRIPTOR);
    if (!projection.ok) throw new Error(projection.error.code);
    const renderer = new BreditorDomRenderer(compileBrowserPresentation(TEST_PROFILE_GENERATION, TEST_PROFILE_DESCRIPTOR,
      createInlineFormatRenderManifest({recipes: [{formatKind: "breditor/strong", element: "strong"}]})));
    const host = document.createElement("div"); document.body.append(host);
    const rendered = renderer.renderFlatList(host, projection.value);
    if (!rendered.ok) throw new Error(rendered.error.code);
    const bridge = new BreditorFlatListDomSelectionBridge();
    return {host, renderer, bridge, options: {durableMode: "v6" as const,
      profileGeneration: TEST_PROFILE_GENERATION, profileDescriptor: TEST_PROFILE_DESCRIPTOR,
      renderer, rendered: rendered.value.rendered, selectionBridge: bridge}};
  }
  const request = (adapter: BreditorFlatListWasmCommandAdapter) => flatListCommandRequest(adapter.deliveryToken(),
    preserveSelectionSync(), {kind: "api", detail: "lists"},
    {kind: "action", actionId: "breditor/toggle-flat-list-strong", input: {kind: "none"}});

  function compositionAdapterFixture(input: Parameters<typeof engineQueues>[0] = {}, extraItem = false) {
    const f = fixture(extraItem); const initial = observation(0); const engine = engineQueues(input);
    const action = vi.spyOn(engine, "executeStringAction");
    const selectionSync = vi.spyOn(engine, "setRangeSelection");
    const closeHistory = vi.spyOn(engine, "closeHistoryGroup");
    const adapter = new BreditorFlatListWasmCommandAdapter(engine, initial, f.options);
    const selected = FlatListRangeSelection.create(adapter.rendered.projection, {kind: "range",
      anchor: {kind: "text", textPath: [0, 0, 0, 0], utf16Offset: 3, affinity: "before"},
      focus: {kind: "text", textPath: [0, 0, 0, 0], utf16Offset: 1, affinity: "after"}});
    if (!selected.ok) throw new Error(selected.error.code);
    return {...f, initial, engine, action, selectionSync, closeHistory, adapter, selected: selected.value,
      dispose() { adapter.dispose(); f.bridge.dispose(); f.host.remove(); }};
  }

  function compositionControllerFixture(options: CompositionControllerOptions<FlatListDocumentProjection> = {},
    input: Parameters<typeof engineQueues>[0] = {}, extraItem = false) {
    const f = compositionAdapterFixture(input, extraItem);
    if (!f.bridge.write(f.adapter.rendered, f.selected).ok) throw new Error("initial selection write failed");
    const queue = new BreditorFlatListCommandQueue(f.adapter.commandExecutor);
    const tasks: Array<() => void> = [];
    const notices: CompositionControllerNotification<FlatListDocumentProjection>[] = [];
    const controller = new BreditorFlatListCompositionController(queue, f.adapter, {
      scheduleTask: task => { tasks.push(task); }, onSettlement: notice => { notices.push(notice); }, ...options,
    });
    const text = f.adapter.rendered.nodeForAstPath([0, 0, 0, 0])!;
    const range = document.createRange(); range.setStart(text, 1); range.setEnd(text, 3);
    const composition = (type: string, data = "") => controller.handleCompositionEvent({type, data, target: f.host,
      cancelable: false, defaultPrevented: false});
    const before = (ranges: AbstractRange[] = [range]) => {
      const event = {type: "beforeinput", inputType: "insertCompositionText", data: "漢", isComposing: true,
        target: f.host, cancelable: true, defaultPrevented: false, getTargetRanges: () => ranges,
        preventDefault() { this.defaultPrevented = true; }};
      return {result: controller.handleBeforeInput(event), event};
    };
    const runNext = () => { const task = tasks.shift(); if (!task) throw new Error("missing task"); task(); };
    return {...f, queue, controller, tasks, notices, range, text, composition, before, runNext,
      dispose() { controller.dispose(); queue.dispose(); f.dispose(); }};
  }

  function clipboardFixture(extraItem = false) {
    const f = compositionAdapterFixture({}, extraItem);
    if (!f.bridge.write(f.adapter.rendered, f.selected).ok) throw new Error("initial selection write failed");
    const queue = new BreditorFlatListCommandQueue(f.adapter.commandExecutor);
    const controller = new BreditorFlatListClipboardController(queue, f.adapter);
    const values = new Map<string, string>();
    const transfer = {get types() { return [...values.keys()]; },
      clearData: vi.fn(() => { values.clear(); }),
      setData: vi.fn((type: string, value: string) => { values.set(type, value); }),
      getData: vi.fn((type: string) => values.get(type) ?? "")};
    const event = (type: string) => ({type, target: f.host, cancelable: true, defaultPrevented: false,
      clipboardData: transfer, preventDefault() { this.defaultPrevented = true; }});
    return {...f, queue, controller, values, transfer, event,
      dispose() { controller.dispose(); queue.dispose(); f.dispose(); }};
  }

  function routerFixture() {
    const f = clipboardFixture();
    const tasks: Array<() => void> = [];
    const options: BrowserEventRouterOptions = {keyboard: {editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled"},
      scheduleTask: task => { tasks.push(task); }};
    const router = new BreditorFlatListBrowserEventRouter(f.queue, f.adapter, options);
    return {...f, tasks, options, router,
      dispose() { router.dispose(); f.dispose(); }};
  }

  it("list router keeps base mode closed and reserves one owner across both facades", () => {
    const f = routerFixture();
    try {
      // @ts-expect-error Legacy constructor cannot accept a list queue/adapter.
      expect(() => new BreditorBrowserEventRouter(f.queue, f.adapter, f.options)).toThrow("queue");
      expect(() => new BreditorFlatListBrowserEventRouter(f.queue, f.adapter, f.options)).toThrow("already has an owner");
      const baseQueue = new BreditorCommandQueue<WasmCommandSequenceOutcome>(() => { throw new Error("unused"); });
      try {
        // @ts-expect-error Deliberately invalid cross-mode adapter, on the same host.
        expect(() => new BreditorBrowserEventRouter(baseQueue, f.adapter, f.options)).toThrow("already has an owner");
      } finally { baseQueue.dispose(); }
      f.router.dispose();
      const successor = new BreditorFlatListBrowserEventRouter(f.queue, f.adapter, f.options);
      expect(successor.status).toEqual({kind: "live"}); successor.dispose();
    } finally { f.dispose(); }
  });

  it("list router rolls back failed construction and reserves before option callbacks", () => {
    const f = clipboardFixture();
    const foreign = new BreditorFlatListCommandQueue<WasmCommandSequenceOutcome<FlatListDocumentProjection>>(() => { throw new Error("unused"); });
    const keyboard = {editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled"} as const;
    try {
      expect(() => new BreditorFlatListBrowserEventRouter(foreign, f.adapter, {keyboard})).toThrow("executor");
      let reads = 0;
      const router = new BreditorFlatListBrowserEventRouter(f.queue, f.adapter, {get keyboard() {
        reads++;
        expect(() => new BreditorFlatListBrowserEventRouter(f.queue, f.adapter, {keyboard})).toThrow("already has an owner");
        return keyboard;
      }});
      expect(reads).toBe(1); router.dispose();
    } finally { foreign.dispose(); f.dispose(); }
  });

  it("list router gives composition then clipboard exclusive input ownership", () => {
    const f = routerFixture();
    const composition = vi.spyOn(BreditorFlatListCompositionController.prototype, "handleBeforeInput");
    const clipboard = vi.spyOn(BreditorFlatListClipboardController.prototype, "handleBeforeInput");
    const ordinary = vi.spyOn(BreditorFlatListBrowserEventController.prototype, "handleBeforeInput");
    try {
      // A cancelled composition event must never enter clipboard or ordinary translation.
      composition.mockReturnValue({kind: "ignored", reason: "alreadyDefaultPrevented"});
      f.host.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "x", cancelable: true}));
      expect(composition).toHaveBeenCalledTimes(1); expect(clipboard).not.toHaveBeenCalled(); expect(ordinary).not.toHaveBeenCalled();
      composition.mockReturnValue({kind: "ignored", reason: "notComposition"});
      clipboard.mockReturnValue({kind: "beforeinputEcho", operation: "paste", defaultPrevented: true});
      f.host.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertFromPaste", cancelable: true}));
      expect(clipboard).toHaveBeenCalledTimes(1); expect(ordinary).not.toHaveBeenCalled();
      expect(f.router.status).toEqual({kind: "live"});
    } finally { f.dispose(); }
  });

  it("list router routes clipboard and document selection events to their sole owners", () => {
    const f = routerFixture();
    const copy = vi.spyOn(BreditorFlatListClipboardController.prototype, "handleCopy")
      .mockReturnValue({kind: "ignored", operation: "copy", defaultPrevented: false, reason: "outsideHost"});
    const selection = vi.spyOn(BreditorFlatListBrowserEventController.prototype, "handleSelectionChange")
      .mockReturnValue({kind: "ignored", reason: "programmaticEcho"});
    try {
      f.host.dispatchEvent(new Event("copy")); document.dispatchEvent(new Event("selectionchange"));
      expect(copy).toHaveBeenCalledTimes(1); expect(selection).toHaveBeenCalledTimes(1);
      expect(f.selectionSync).not.toHaveBeenCalled();
      f.router.dispose(); f.host.dispatchEvent(new Event("copy")); document.dispatchEvent(new Event("selectionchange"));
      expect(copy).toHaveBeenCalledTimes(1); expect(selection).toHaveBeenCalledTimes(1);
    } finally { f.dispose(); }
  });

  it("list router defers uncancelled native repair, consumes its input, and ignores the stale task", () => {
    const f = routerFixture();
    vi.spyOn(BreditorFlatListBrowserEventController.prototype, "handleBeforeInput")
      .mockReturnValue({kind: "reconcileRequired", defaultPrevented: false, reason: "noncancelableMutation"});
    const restore = vi.spyOn(f.adapter, "restoreCanonicalRender").mockReturnValue({ok: true, rendered: f.adapter.rendered});
    const input = vi.spyOn(BreditorFlatListBrowserEventController.prototype, "handleInput");
    try {
      f.host.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "x", cancelable: false}));
      expect(restore).not.toHaveBeenCalled(); expect(f.tasks).toHaveLength(1);
      f.host.dispatchEvent(new InputEvent("input", {inputType: "insertText", data: "x"}));
      expect(restore).toHaveBeenCalledTimes(1); expect(input).not.toHaveBeenCalled();
      f.tasks.shift()!(); expect(restore).toHaveBeenCalledTimes(1);
      expect(f.router.status).toEqual({kind: "live"});
    } finally { f.dispose(); }
  });

  it("list router faults once on uncertain delivery and leaves late events inert", () => {
    const f = routerFixture(); const statuses = vi.fn(); f.router.subscribe(statuses);
    try {
      f.host.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", code: "Backspace", cancelable: true}));
      expect(f.selectionSync).toHaveBeenCalledTimes(1);
      expect(f.router.status).toEqual({kind: "faulted", reason: "queueUncertain"});
      f.host.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", code: "Backspace", cancelable: true}));
      document.dispatchEvent(new Event("selectionchange")); f.router.dispose();
      expect(f.selectionSync).toHaveBeenCalledTimes(1); expect(statuses).toHaveBeenCalledTimes(1);
    } finally { f.dispose(); }
  });

  it("list clipboard slices exact backward emoji text without changing hierarchical selection", () => {
    const f = clipboardFixture();
    try {
      const before = JSON.stringify(f.selected);
      const presentation = flatListProjectionPresentation(f.adapter.rendered.projection)!;
      const fragment = serializeFlatListClipboardSelection(f.selected, presentation);
      expect(fragment).toEqual({ok: true, value: {plainText: "🙂", html: "<p>🙂</p>"}});
      expect(JSON.stringify(f.selected)).toBe(before);
      expect(serializeClipboardSelection(f.selected, presentation).ok).toBe(false);
      expect(serializeFlatListClipboardSelection({...f.selected}, presentation).ok).toBe(false);
      expect(serializeFlatListClipboardSelection(f.selected).ok).toBe(false);
      expect(serializeFlatListClipboardSelection(f.selected, {...presentation}).ok).toBe(false);
      if (!fragment.ok) throw new Error(fragment.error.code);
      expect(parseClipboardHtmlToPlainText(fragment.value.html, presentation)).toEqual({ok: true, value: "🙂"});
    } finally { f.dispose(); }
  });

  it("list clipboard retains item-boundary-only slices as two empty paragraphs", () => {
    const f = clipboardFixture(true);
    try {
      const selected = FlatListRangeSelection.create(f.adapter.rendered.projection, {kind: "range",
        anchor: {kind: "children", parentPath: [0, 1, 0], childIndex: 0, affinity: "before"},
        focus: {kind: "children", parentPath: [0, 0, 0], childIndex: 1, affinity: "after"}});
      if (!selected.ok) throw new Error(selected.error.code);
      expect(serializeFlatListClipboardSelection(selected.value, flatListProjectionPresentation(f.adapter.rendered.projection)))
        .toEqual({ok: true, value: {plainText: "\n", html: "<p><br></p><p><br></p>"}});
      const collapsed = FlatListRangeSelection.create(f.adapter.rendered.projection,
        {kind: "range", anchor: selected.value.anchor, focus: selected.value.anchor});
      if (!collapsed.ok) throw new Error(collapsed.error.code);
      expect(serializeFlatListClipboardSelection(collapsed.value).ok).toBe(false);
    } finally { f.dispose(); }
  });

  it("list clipboard factories preserve exact paths, mode and paste limits", () => {
    const f = clipboardFixture();
    try {
      const token = f.adapter.deliveryToken(), sync = flatListRangeSelectionSync(f.selected);
      const cut = flatListCutDeleteRequest(token, sync);
      expect(cut.selection).toEqual(sync);
      expect(cut.command).toEqual({kind: "action", actionId: "breditor/delete-flat-list-selection", input: {kind: "none"}});
      expect(cut.requirements).toEqual({selection: "synchronize", history: "closeBefore"});
      for (const separator of ["\r", "\n", "\r\n"]) {
        const text = separator.repeat(9_999);
        expect(flatListPasteInsertRequest(token, sync, text).command).toMatchObject({
          actionId: "breditor/insert-flat-list-plain-text", input: {kind: "string", value: text}});
        expect(() => flatListPasteInsertRequest(token, sync, separator.repeat(10_000))).toThrow("source paragraph limit");
      }
      for (const text of ["", "\ud800", "a".repeat(MAX_BROWSER_COMMAND_TEXT_UTF16 + 1)]) {
        expect(() => flatListPasteInsertRequest(token, sync, text)).toThrow();
      }
      const read = vi.fn(); const foreign = {get length() { read(); return 0; }};
      expect(() => flatListPasteInsertRequest(token, sync, foreign as unknown as string)).toThrow();
      expect(read).not.toHaveBeenCalled();
      expect(() => flatListCutDeleteRequest({...token}, sync)).toThrow();
    } finally { f.dispose(); }
  });

  it("list clipboard rejects base queues and mismatched captured executors", () => {
    const f = clipboardFixture();
    const foreign = new BreditorFlatListCommandQueue<WasmCommandSequenceOutcome<FlatListDocumentProjection>>(() => { throw new Error("unused"); });
    try {
      // @ts-expect-error The legacy facade cannot accept list dependencies.
      expect(() => new BreditorClipboardController(f.queue, f.adapter)).toThrow("queue");
      expect(() => new BreditorFlatListClipboardController(foreign, f.adapter)).toThrow("executor");
    } finally { foreign.dispose(); f.dispose(); }
  });

  it("list copy writes exact paired representations without executing any Rust selection/action", () => {
    const f = clipboardFixture();
    try {
      Object.defineProperty(f.controller, "flatLists", {value: false});
      const event = f.event("copy");
      expect(f.controller.handleCopy(event)).toMatchObject({kind: "handled", operation: "copy",
        partial: {clipboard: "representationsWritten", command: "notApplicable"}});
      expect(event.defaultPrevented).toBe(true);
      expect([...f.values]).toEqual([["text/plain", "🙂"], ["text/html", "<p>🙂</p>"]]);
      expect(f.selectionSync).not.toHaveBeenCalled(); expect(f.action).not.toHaveBeenCalled();
      expect(f.adapter.state).toBe("live");
    } finally { f.dispose(); }
  });

  it.each(["write", "cancel"])("list cut never deletes after %s failure", failure => {
    const f = clipboardFixture();
    try {
      const event = f.event("cut");
      if (failure === "write") f.transfer.setData.mockImplementation(type => { if (type === "text/html") throw new Error("write failed"); });
      else event.preventDefault = () => {};
      expect(f.controller.handleCut(event)).toMatchObject(failure === "write"
        ? {kind: "blocked", reason: "clipboardWriteFailed"} : {kind: "reconcileRequired", reason: "cancellationFailed"});
      expect(f.selectionSync).not.toHaveBeenCalled(); expect(f.action).not.toHaveBeenCalled();
      expect(f.adapter.state).toBe("live");
    } finally { f.dispose(); }
  });

  it("list clipboard holds the queue through transfer callbacks and blocks stale DOM cut", () => {
    const f = clipboardFixture();
    try {
      const queued = request(f.adapter);
      f.transfer.clearData.mockImplementation(() => {
        expect(f.queue.submit(queued)).toEqual({status: "rejected", reason: "leased"});
        f.host.querySelector("ol")!.start = 9;
      });
      expect(f.controller.handleCut(f.event("cut"))).toMatchObject({kind: "reconcileRequired", reason: "staleBase"});
      expect(f.transfer.setData).not.toHaveBeenCalled(); expect(f.selectionSync).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("list paste prefers authoritative plain text and never falls back after invalid input", () => {
    const f = clipboardFixture();
    try {
      f.values.set("text/plain", "\ud800"); f.values.set("text/html", "<p>valid</p>");
      expect(f.controller.handlePaste(f.event("paste"))).toMatchObject({kind: "blocked", reason: "invalidPlainText"});
      expect(f.transfer.getData.mock.calls).toEqual([["text/plain"]]);
      expect(f.selectionSync).not.toHaveBeenCalled();
      f.values.delete("text/plain"); f.values.set("text/html", "<ul><li>unsupported</li></ul>");
      expect(f.controller.handlePaste(f.event("paste"))).toMatchObject({kind: "blocked", reason: "invalidHtml"});
      expect(f.selectionSync).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("list clipboard reports uncertain selection synchronization once without retrying", () => {
    const f = clipboardFixture();
    try {
      f.values.set("text/plain", "pasted");
      expect(f.controller.handlePaste(f.event("paste"))).toMatchObject({kind: "reconcileRequired"});
      expect(f.selectionSync).toHaveBeenCalledTimes(1); expect(f.action).not.toHaveBeenCalled();
      expect(f.adapter.state).toBe("faulted");
      expect(f.controller.handlePaste(f.event("paste"))).toMatchObject({kind: "reconcileRequired", reason: "queueUnavailable"});
      expect(f.selectionSync).toHaveBeenCalledTimes(1);
    } finally { f.dispose(); }
  });

  it("list composition controller rejects base mode and foreign executor wiring", () => {
    const f = compositionControllerFixture();
    try {
      // @ts-expect-error The base facade cannot receive list dependencies.
      expect(() => new BreditorCompositionController(f.queue, f.adapter)).toThrow("queue");
      const foreign = new BreditorFlatListCommandQueue<WasmCommandSequenceOutcome<FlatListDocumentProjection>>(() => { throw new Error("unused"); });
      expect(() => new BreditorFlatListCompositionController(foreign, f.adapter)).toThrow("executor");
      foreign.dispose();
    } finally { f.dispose(); }
  });

  it.each([false, true])("list composition opens with implicit=%s and preserves exact backward refinement", implicit => {
    const f = compositionControllerFixture(); const refine = vi.spyOn(f.adapter, "refineCompositionLease");
    try {
      Object.defineProperty(f.controller, "flatLists", {value: false});
      if (!implicit) expect(f.composition("compositionstart")).toMatchObject({kind: "native"});
      expect(f.before().result).toEqual({kind: "native", phase: "mutating"});
      expect(f.adapter.restoreCanonicalSelection()).toBe(false);
      expect(f.adapter.state).toBe("composition");
      if (implicit) expect(f.composition("compositionstart").kind).toBe("native");
      expect(refine).toHaveBeenCalledOnce(); expect(refine.mock.calls[0]![1]).toBe(f.selected);
      const port = openFlatListCommandQueueLeasePort(f.queue, f.adapter.commandExecutor)!;
      expect(port.acquireLease()).toBeUndefined();
      expect(f.controller.dispose().kind).toBe("disposed");
      const lease = port.acquireLease(); expect(lease).toBeDefined(); if (lease) port.releaseLease(lease);
      expect(f.bridge.read(f.adapter.rendered)).toMatchObject({ok: true, value: {selection: f.selected}});
    } finally { refine.mockRestore(); f.dispose(); }
  });

  it.each(["missing", "scalar", "cross-item"])("list composition refuses %s targets and recovers without a command", fault => {
    const f = compositionControllerFixture({}, {}, true);
    try {
      f.composition("compositionstart");
      const range = document.createRange(); range.setStart(f.text, fault === "scalar" ? 2 : 1);
      const end = fault === "cross-item" ? f.adapter.rendered.nodeForAstPath([0, 1, 0, 0])! : f.text;
      range.setEnd(end, fault === "cross-item" ? 1 : 3);
      const result = f.before(fault === "missing" ? [] : [range]);
      expect(result.result).toMatchObject({kind: "recoveryRequired", reason: fault === "missing" ? "targetUnavailable" : "targetInvalid"});
      expect(result.event.defaultPrevented).toBe(true); expect(f.controller.phase).toBe("quarantined");
      f.runNext(); expect(f.notices[0]?.kind).toBe("recovered");
      expect(f.controller.phase).toBe("idle"); expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("list composition still refines a genuinely different native target", () => {
    const f = compositionControllerFixture(); const refine = vi.spyOn(f.adapter, "refineCompositionLease");
    try {
      f.composition("compositionstart");
      const range = document.createRange(); range.setStart(f.text, 0); range.setEnd(f.text, 1);
      expect(f.before([range]).result).toEqual({kind: "native", phase: "mutating"});
      const selected = refine.mock.calls[0]![1];
      expect(selected).not.toBe(f.selected); expect(selected.order).toBe("forward");
      expect(selected.anchor).toMatchObject({textPath: [0, 0, 0, 0], utf16Offset: 0});
      expect(selected.focus).toMatchObject({textPath: [0, 0, 0, 0], utf16Offset: 1});
    } finally { refine.mockRestore(); f.dispose(); }
  });

  it("list composition quarantines structural drift and schedules exact cancellation recovery", () => {
    const f = compositionControllerFixture();
    try {
      f.composition("compositionstart"); f.before();
      f.host.querySelector("h2")!.textContent = "A漢"; f.host.querySelector("ol")!.start = 99;
      expect(f.composition("compositionend", "漢").kind).toBe("scheduled");
      f.runNext(); expect(f.notices[0]).toEqual({kind: "recoveryRequired", reason: "domReconcileFailed"});
      f.runNext(); expect(f.notices[1]?.kind).toBe("recovered");
      expect(f.host.querySelector("h2")!.textContent).toBe("A🙂"); expect(f.host.querySelector("ol")!.start).toBe(8);
      expect(f.bridge.read(f.adapter.rendered)).toMatchObject({ok: true, value: {selection: f.selected}});
      expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("list composition cancellation retains selection and emits only the explicit history boundary", () => {
    const f = compositionControllerFixture({}, {
      setSelection: [commandResult({status: "unchanged", successor: observation(0)}).view],
      closeHistory: [commandResult({status: "unchanged", successor: observation(0)}).view],
    });
    try {
      f.composition("compositionstart"); f.before(); f.composition("compositionend");
      f.runNext(); expect(f.notices[0]).toMatchObject({kind: "settled", settlement: {kind: "cancelled"}});
      expect(f.controller.phase).toBe("idle"); expect(f.closeHistory).toHaveBeenCalledOnce(); expect(f.action).not.toHaveBeenCalled();
      expect(f.bridge.read(f.adapter.rendered)).toMatchObject({ok: true, value: {selection: f.selected}});
    } finally { f.dispose(); }
  });

  it("list composition never retries a generated command after uncertainty", () => {
    const f = compositionControllerFixture();
    try {
      f.composition("compositionstart"); f.before(); f.host.querySelector("h2")!.textContent = "A漢";
      f.composition("compositionend", "漢"); f.runNext();
      expect(f.notices[0]).toEqual({kind: "recoveryRequired", reason: "uncertain"});
      expect(f.controller.phase).toBe("quarantined"); f.runNext();
      expect(f.notices[1]).toEqual({kind: "recoveryRequired", reason: "uncertain"});
      expect(f.queue.failure).toBeDefined(); expect(f.action).not.toHaveBeenCalled();
      expect(f.selectionSync).toHaveBeenCalledOnce();
      // Selection synchronization is the first generated step; it throws in
      // this empty engine fixture, so no content action is ever attempted.
      expect(f.adapter.state).toBe("faulted");
    } finally { f.dispose(); }
  });

  it("owns a one-use list composition lease and restores exact selection without a Rust edit", () => {
    const f = compositionAdapterFixture();
    try {
      const delivery = f.adapter.deliveryToken(); const before = f.adapter.rendered;
      const lease = f.adapter.beginCompositionLease(delivery, f.selected, 1n);
      expect(f.adapter.state).toBe("composition"); expect(f.adapter.acceptsDeliveryToken(delivery)).toBe(false);
      expect(() => f.adapter.deliveryToken()).toThrow();
      expect(f.adapter.openCompositionDomLease(lease)).toBe(true);
      f.host.querySelector("h2")!.textContent = "A漢";
      expect(reconcileFlatListCompositionDom(f.host, before.projection, f.selected)).toMatchObject({ok: true,
        value: {textBlockPath: [0, 0, 0], originalText: "🙂", text: "漢"}});
      const restored = f.adapter.restoreCompositionLease(lease);
      expect(restored.ok).toBe(true);
      if (!restored.ok) throw new Error(restored.reason);
      expect(restored.selection).toBe(f.selected); expect(f.adapter.acceptsDeliveryToken(restored.delivery)).toBe(true);
      expect(f.host.querySelector("h2")!.textContent).toBe("A🙂"); expect(f.host.querySelector("ol")!.start).toBe(8);
      expect(f.bridge.read(restored.rendered)).toMatchObject({ok: true, value: {origin: "programmaticEcho", selection: f.selected}});
      expect(() => f.adapter.restoreCompositionLease(lease)).toThrow(); expect(f.action).not.toHaveBeenCalled();
      expect(f.initial.free).not.toHaveBeenCalled();
    } finally { f.dispose(); }
    expect(f.initial.free).toHaveBeenCalledOnce();
  });

  it("refines a list composition range once, invalidating the previous exact token", () => {
    const f = compositionAdapterFixture();
    try {
      const lease = f.adapter.beginCompositionLease(f.adapter.deliveryToken(), f.selected, 1n);
      const refined = f.adapter.refineCompositionLease(lease, f.selected);
      expect(() => f.adapter.openCompositionDomLease(lease)).toThrow("stale");
      expect(() => f.adapter.refineCompositionLease(refined, f.selected)).toThrow();
      expect(f.adapter.openCompositionDomLease(refined)).toBe(true);
      expect(() => f.adapter.openCompositionDomLease(refined)).toThrow();
      expect(f.adapter.restoreCompositionLease(refined).ok).toBe(true);
    } finally { f.dispose(); }
  });

  it("rejects foreign list composition selections and tokens before changing state", () => {
    const f = compositionAdapterFixture(); const other = compositionAdapterFixture();
    try {
      const delivery = f.adapter.deliveryToken();
      expect(() => f.adapter.beginCompositionLease(delivery, other.selected, 1n)).toThrow();
      expect(f.adapter.acceptsDeliveryToken(delivery)).toBe(true);
      const lease = f.adapter.beginCompositionLease(delivery, f.selected, 1n);
      expect(() => other.adapter.openCompositionDomLease(lease)).toThrow();
      expect(() => f.adapter.restoreCompositionLease({...lease})).toThrow("stale");
      expect(f.adapter.restoreCompositionLease(lease).ok).toBe(true);
    } finally { f.dispose(); other.dispose(); }
  });

  it("recovers a list composition after its DOM lease is superseded", () => {
    const f = compositionAdapterFixture();
    try {
      const lease = f.adapter.beginCompositionLease(f.adapter.deliveryToken(), f.selected, 1n);
      expect(f.adapter.openCompositionDomLease(lease)).toBe(true);
      f.host.querySelector("h2")!.textContent = "native";
      expect(f.renderer.renderFlatList(f.host, lease.projection).ok).toBe(true);
      expect(() => f.adapter.restoreCompositionLease(lease)).toThrow("stale");
      expect(f.adapter.recoverCompositionLease(lease)).toMatchObject({ok: true, selection: f.selected});
      expect(f.adapter.state).toBe("live"); expect(f.host.textContent).toBe("A🙂");
      expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each(["render", "selection"])("spends the list lease after a %s restoration failure", failure => {
    const f = compositionAdapterFixture();
    const lease = f.adapter.beginCompositionLease(f.adapter.deliveryToken(), f.selected, 1n);
    expect(f.adapter.openCompositionDomLease(lease)).toBe(true);
    const override = failure === "render"
      ? vi.spyOn(f.renderer, "restoreFlatListCompositionDomLease").mockImplementation(() => { throw new Error("render failure"); })
      : vi.spyOn(f.bridge, "write").mockImplementation(() => { throw new Error("selection failure"); });
    try {
      expect(f.adapter.restoreCompositionLease(lease)).toEqual({ok: false, reason: failure === "render" ? "renderFailed" : "selectionWriteFailed"});
      expect(f.adapter.state).toBe("reconcile"); expect(() => f.adapter.restoreCompositionLease(lease)).toThrow();
      expect(f.action).not.toHaveBeenCalled();
    } finally { override.mockRestore(); f.dispose(); }
  });

  it("disposal discards provisional list composition DOM and frees observation once", () => {
    const f = compositionAdapterFixture();
    try {
      const lease = f.adapter.beginCompositionLease(f.adapter.deliveryToken(), f.selected, 1n);
      expect(f.adapter.openCompositionDomLease(lease)).toBe(true); f.host.querySelector("h2")!.textContent = "native";
      f.adapter.dispose(); f.adapter.dispose();
      expect(f.host.textContent).toBe("A🙂"); expect(f.initial.free).toHaveBeenCalledOnce();
      expect(f.adapter.state).toBe("disposed"); expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  function toolbarFixture(observer?: () => void, malformed = false) {
    const f = fixture();
    const result = commandResult(malformed
      ? {status: "committed", successor: observation(1), eventKind: "action"}
      : {status: "disabled", successor: observation(0), disabledActionId: "breditor/toggle-flat-list-strong",
          disabledReasonCode: "breditor/no-selection", activation: "inactive"});
    const engine = engineQueues({noInputAction: [result.view]});
    const action = vi.spyOn(engine, "executeNoInputAction");
    const adapter = new BreditorFlatListWasmCommandAdapter(engine, observation(0), f.options);
    const queue = new BreditorFlatListCommandQueue(adapter.commandExecutor, observer === undefined ? {} : {observer});
    const dispatcher = createFlatListToolbarDispatcher(queue, adapter);
    const invocation: ToolbarCommandInvocation = {stateId: "breditor/control-bold", selection: "preserve",
      command: {kind: "action", actionId: "breditor/toggle-flat-list-strong", input: {kind: "none"}, history: "preserve"}};
    return {...f, adapter, queue, dispatcher, invocation, action, result,
      dispose() { dispatcher.dispose(); queue.dispose(); adapter.dispose(); f.bridge.dispose(); f.host.remove(); }};
  }

  it("toolbar rejects a busy lease without queueing or spending its token", () => {
    const f = toolbarFixture();
    try {
      const port = openFlatListCommandQueueLeasePort(f.queue, f.adapter.commandExecutor)!;
      const token = f.adapter.deliveryToken(); const lease = port.acquireLease()!;
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("rejected");
      expect(f.action).not.toHaveBeenCalled(); expect(f.adapter.acceptsDeliveryToken(token)).toBe(true);
      expect(port.releaseLease(lease)).toBe(true);
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("completed");
      expect(f.action).toHaveBeenCalledOnce(); expect(f.result.free).toHaveBeenCalledOnce();
    } finally { f.dispose(); }
  });

  it("toolbar keeps its lease through observers and correlates a captured invocation", () => {
    let f: ReturnType<typeof toolbarFixture>;
    f = toolbarFixture(() => {
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("rejected");
      // Mutation during notification cannot change the admitted target.
      Object.assign(f.invocation.command, {actionId: "breditor/other-action"});
    });
    try {
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("completed");
      expect(f.action).toHaveBeenCalledOnce();
    } finally { f.dispose(); }
  });

  it("toolbar uses private queue and adapter capabilities despite public overrides", () => {
    const f = toolbarFixture(); const override = vi.fn(() => { throw new Error("public override"); });
    try {
      Object.defineProperty(f.adapter, "deliveryToken", {value: override});
      Object.defineProperty(f.adapter, "commandExecutor", {get: override});
      Object.defineProperty(f.queue, "submit", {value: override});
      const dispatcher = createFlatListToolbarDispatcher(f.queue, f.adapter);
      expect(dispatcher.dispatch(f.invocation).status).toBe("completed");
      expect(override).not.toHaveBeenCalled(); dispatcher.dispose();
    } finally { f.dispose(); }
  });

  it("toolbar rejects a queue from a different adapter", () => {
    const f = toolbarFixture(); const foreign = toolbarFixture();
    try { expect(() => createFlatListToolbarDispatcher(f.queue, foreign.adapter)).toThrow("different owners"); }
    finally { f.dispose(); foreign.dispose(); }
  });

  it("toolbar rejects accessor invocations without reading them or poisoning the lease", () => {
    const f = toolbarFixture(); const getter = vi.fn(() => f.invocation.command);
    try {
      const invalid = {...f.invocation}; Object.defineProperty(invalid, "command", {get: getter});
      expect(f.dispatcher.dispatch(invalid).status).toBe("rejected"); expect(getter).not.toHaveBeenCalled();
      expect(f.action).not.toHaveBeenCalled();
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("completed");
    } finally { f.dispose(); }
  });

  it("toolbar rechecks disposal after invocation capture before delivering", () => {
    const f = toolbarFixture();
    try {
      const invocation = new Proxy(f.invocation, {ownKeys(target) {
        f.dispatcher.dispose(); return Reflect.ownKeys(target);
      }});
      expect(f.dispatcher.dispatch(invocation).status).toBe("rejected");
      expect(f.action).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each(["generated result", "observer"])("toolbar fails closed after an uncertain %s and never retries", fault => {
    const f = toolbarFixture(fault === "observer" ? () => { throw new Error("observer failed"); } : undefined,
      fault === "generated result");
    try {
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("failed");
      expect(f.dispatcher.dispatch(f.invocation).status).toBe("failed"); expect(f.action).toHaveBeenCalledOnce();
      f.dispatcher.dispose(); expect(f.dispatcher.dispatch(f.invocation).status).toBe("rejected");
    } finally { f.dispose(); }
  });

  it("toolbar preserves known completion when its owner is disposed by an observer", () => {
    let dispatcher: FlatListToolbarDispatcher;
    const f = toolbarFixture(() => { dispatcher.dispose(); f.queue.dispose(); }); dispatcher = f.dispatcher;
    try {
      expect(dispatcher.dispatch(f.invocation).status).toBe("completed");
      expect(dispatcher.dispatch(f.invocation).status).toBe("rejected"); expect(f.action).toHaveBeenCalledOnce();
    } finally { f.dispose(); }
  });

  it("list toolbar construction preserves selection and explicit command boundaries", () => {
    const f = toolbarFixture();
    try {
      const token = f.adapter.deliveryToken();
      const intent = flatListToolbarCommandRequest(token, {...f.invocation,
        command: {kind: "intent", intentId: "breditor/format-bullet-list"}});
      expect(intent).toMatchObject({selection: {kind: "preserve"}, requirements: {history: "closeBefore"},
        command: {kind: "intent", intentId: "breditor/format-bullet-list", input: {kind: "none"}}});
      const typed = flatListToolbarCommandRequest(token, {...f.invocation,
        command: {kind: "intentJson", intentId: "breditor/format-example", inputJson: "{}"}});
      expect(typed).toMatchObject({requirements: {history: "closeBefore"}, command: {input: {kind: "json", value: "{}"}}});
      expect(flatListToolbarCommandRequest(token, {...f.invocation, command: {kind: "history", operation: "undo"}}))
        .toMatchObject({requirements: {history: "closeBefore"}, selection: {kind: "preserve"}});
      expect(flatListToolbarCommandRequest(token, f.invocation)).toMatchObject({requirements: {history: "preserve"}});
    } finally { f.dispose(); }
  });

  it.each(["v6 legacy", "v5 list", "base bridge", "base render"])("rejects mismatched %s dependencies", fault => {
    const f = fixture(); const initial = observation(0); const engine = engineQueues({});
    if (fault === "v6 legacy") {
      // @ts-expect-error List dependencies are deliberately not legacy dependencies.
      expect(() => new RawBreditorWasmCommandAdapter(engine, initial, f.options)).toThrow();
    } else {
      const options = fault === "v5 list" ? {...f.options, durableMode: "v5"}
        : fault === "base bridge" ? {...f.options, selectionBridge: new BreditorDomSelectionBridge()}
          : {...f.options, rendered: projectionFixture(0, "base").rendered};
      expect(() => new BreditorFlatListWasmCommandAdapter(engine, initial, options as never)).toThrow();
    }
    f.renderer.releaseFlatList(f.options.rendered); f.bridge.dispose();
  });

  it("spends disabled deliveries, keeps exact private authority, and frees each owner once", () => {
    const f = fixture(); const initial = observation(0); const next = observation(0);
    const result = commandResult({status: "disabled", successor: next, disabledActionId: "breditor/toggle-flat-list-strong",
      disabledReasonCode: "breditor/no-selection", activation: "inactive"});
    const engine = engineQueues({noInputAction: [result.view]}); const action = vi.spyOn(engine, "executeNoInputAction");
    const adapter = new BreditorFlatListWasmCommandAdapter(engine, initial, f.options);
    const captured = request(adapter); const execute = adapter.commandExecutor;
    const override = vi.fn(() => { throw new Error("public override"); });
    Object.defineProperty(adapter, "execute", {value: override});
    Object.defineProperty(adapter, "acceptsDeliveryToken", {value: () => true});
    expect(flatListEditorDeliveryAuthorityAccepts(adapter.deliveryAuthority, captured.delivery)).toBe(true);
    expect(editorDeliveryAuthorityAccepts(adapter.deliveryAuthority, captured.delivery)).toBe(false);
    expect(execute(captured).command.status).toBe("disabled");
    expect(flatListEditorDeliveryAuthorityAccepts(adapter.deliveryAuthority, captured.delivery)).toBe(false);
    expect(() => execute(captured)).toThrow("stale"); expect(action).toHaveBeenCalledOnce(); expect(override).not.toHaveBeenCalled();
    expect(result.free).toHaveBeenCalledOnce(); expect(initial.free).toHaveBeenCalledOnce();
    expect(adapter.plainTextReadPort.read()).toMatchObject({ok: true, content: {text: "A🙂", utf8Bytes: 5}});
    adapter.dispose(); adapter.dispose(); expect(next.free).toHaveBeenCalledOnce(); f.bridge.dispose();
    expect(adapter.plainTextReadPort.read()).toMatchObject({ok: false});
  });

  it.each(["missing update", "cleanup throw", "cleanup thenable"])("faults on %s without retrying the generated command", fault => {
    const f = fixture(); const initial = observation(0); const next = observation(fault === "missing update" ? 1 : 0);
    const result = commandResult(fault === "missing update"
      ? {status: "committed", eventKind: "action", successor: next}
      : {status: "disabled", successor: next, disabledActionId: "breditor/toggle-flat-list-strong",
          disabledReasonCode: "breditor/no-selection", activation: "inactive",
          ...(fault === "cleanup throw" ? {freeThrows: true} : {freeResult: Promise.resolve(undefined)})});
    const engine = engineQueues({noInputAction: [result.view]}); const action = vi.spyOn(engine, "executeNoInputAction");
    const adapter = new BreditorFlatListWasmCommandAdapter(engine, initial, f.options); const captured = request(adapter);
    expect(() => adapter.execute(captured)).toThrow(); expect(adapter.state).toBe("faulted");
    expect(adapter.restoreCanonicalRender()).toEqual({ok: false, reason: "adapterUnavailable"});
    expect(() => adapter.execute(captured)).toThrow(); expect(action).toHaveBeenCalledOnce();
    expect(result.free).toHaveBeenCalledOnce();
    adapter.dispose(); f.bridge.dispose(); expect(initial.free).toHaveBeenCalledOnce(); expect(next.free).toHaveBeenCalledOnce();
  });

  it("rejects foreign owners and base requests before generated mutation", () => {
    const f = fixture(); const engine = engineQueues({}); const action = vi.spyOn(engine, "executeNoInputAction");
    const adapter = new BreditorFlatListWasmCommandAdapter(engine, observation(0), f.options);
    const second = fixture(); const other = new BreditorFlatListWasmCommandAdapter(engineQueues({}), observation(0), second.options);
    expect(() => adapter.execute(request(other))).toThrow("stale");
    const base = projectionFixture(0, "base");
    const legacy = new BreditorWasmCommandAdapter(engineQueues({}), observation(0), {
      renderer: base.renderer, rendered: base.rendered, selectionBridge: new BreditorDomSelectionBridge()});
    const baseRequest = noInputActionRequest(legacy.deliveryToken(), preserveSelectionSync(), {kind: "api", detail: "base"}, "breditor/toggle-strong");
    // @ts-expect-error The explicit list adapter cannot receive base requests.
    expect(() => adapter.execute(baseRequest)).toThrow("exact executable");
    // @ts-expect-error The base adapter cannot receive list requests.
    expect(() => legacy.commandExecutor(request(adapter))).toThrow("exact executable");
    expect(action).not.toHaveBeenCalled(); expect(adapter.state).toBe("live");
    adapter.dispose(); other.dispose(); legacy.dispose(); f.bridge.dispose(); second.bridge.dispose();
  });
});

describe("BreditorWasmCommandAdapter", () => {
  it("does not expose invariant-critical implementation helpers at runtime", () => {
    const surface = Object.getOwnPropertyNames(
      BreditorWasmCommandAdapter.prototype,
    );
    expect(surface).not.toContain("finishCompositionLease");
    expect(surface).not.toContain("consumeResult");
    expect(surface).not.toContain("requireCompositionLease");
    expect(surface).not.toContain("requireObservation");
  });

  it.each(["own properties", "subclass overrides"] as const)(
    "keeps captured execution and token authority behind private dispatch despite %s",
    (overrideKind) => {
      const base = projectionFixture(0, "a");
      const initial = observation(0);
      const successor = observation(0);
      const disabled = commandResult({
        status: "disabled",
        successor,
        disabledActionId: "breditor/toggle-strong",
        disabledReasonCode: "breditor/not-enabled",
        activation: "inactive",
      });
      const executeOverride = vi.fn((_request: EditorCommandRequest): never => {
        throw new Error("shadowed execute must not run");
      });
      const acceptsOverride = vi.fn((_token: unknown): boolean => true);
      class HostileAdapter extends BreditorWasmCommandAdapter {
        override execute(request: EditorCommandRequest): WasmCommandSequenceOutcome {
          return executeOverride(request);
        }

        override acceptsDeliveryToken(token: unknown): token is EditorDeliveryToken {
          return acceptsOverride(token);
        }
      }
      const Adapter =
        overrideKind === "subclass overrides"
          ? HostileAdapter
          : BreditorWasmCommandAdapter;
      const adapter = new Adapter(
        engineQueues({ noInputAction: [disabled.view] }),
        initial,
        {
          renderer: base.renderer,
          rendered: base.rendered,
          selectionBridge: new BreditorDomSelectionBridge(),
        },
      );
      const token = adapter.deliveryToken();
      const executor = adapter.commandExecutor;
      const authority = adapter.deliveryAuthority;
      if (overrideKind === "own properties") {
        Object.defineProperty(adapter, "execute", { value: executeOverride });
        Object.defineProperty(adapter, "acceptsDeliveryToken", {
          value: acceptsOverride,
        });
      }

      expect(editorDeliveryAuthorityAccepts(authority, {})).toBe(false);
      expect(editorDeliveryAuthorityAccepts(authority, token)).toBe(true);
      const outcome = executor(
        noInputActionRequest(
          token,
          preserveSelectionSync(),
          { kind: "toolbar", detail: "bold" },
          "breditor/toggle-strong",
        ),
      );

      expect(outcome.command.status).toBe("disabled");
      expect(executeOverride).not.toHaveBeenCalled();
      expect(acceptsOverride).not.toHaveBeenCalled();
      expect(disabled.free).toHaveBeenCalledOnce();
      expect(initial.free).toHaveBeenCalledOnce();
      adapter.dispose();
      expect(successor.free).toHaveBeenCalledOnce();
    },
  );

  it("captures the no-input intent ABI once before application code can replace it", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const blocked = intentResult({
      status: "blocked",
      successor,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      blockedReasonCode: "breditor/no-selection",
      blockedActivation: "inactive",
      blockedValueStatus: "unsupported",
    });
    const engine = engineQueues({ intents: [blocked.view] });
    const captured = engine.executeNoInputIntent;
    const reads = vi.fn();
    Object.defineProperty(engine, "executeNoInputIntent", {
      configurable: true,
      get() {
        reads();
        return captured;
      },
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    const replacement = vi.fn((): never => {
      throw new Error("replacement must not run");
    });
    Object.defineProperty(engine, "executeNoInputIntent", {
      value: replacement,
    });

    const outcome = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "captured-engine-method" },
        TEST_INTENT_ID,
      ),
    );

    expect(outcome.command.status).toBe("blocked");
    expect(reads).toHaveBeenCalledOnce();
    expect(replacement).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("contains core-observer failures and gives each adopted commit to active listeners", async () => {
    const base = projectionFixture(0, "a");
    const nextProjection = projection(1, "a");
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const committed = observation(1);
    const update = projectionUpdate(base.projection, nextProjection);
    const result = commandResult({
      status: "committed",
      eventKind: "selection",
      successor: committed,
      update: update.view,
    });
    const currentSelection = selectionResult(selectionView(1, 1));
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({
        setSelection: [result.view],
        selection: [currentSelection.view],
      }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );
    const removed = vi.fn();
    const releaseRemoved = adapter.observeCoreCommits(removed);
    releaseRemoved();
    releaseRemoved();
    let nestedCheckpoint: unknown;
    adapter.observeCoreCommits(() => {
      nestedCheckpoint = adapter.sessionCheckpointReadPort.read();
      throw new Error("observer failure is isolated");
    });
    adapter.observeCoreCommits(() => Promise.reject(new Error("contained")));
    const sibling = vi.fn();
    adapter.observeCoreCommits(sibling);

    const outcome = adapter.execute(
      selectionSynchronizationRequest(
        adapter.deliveryToken(),
        selected,
        { kind: "selectionchange", detail: "observer-test" },
      ),
    );

    expect(outcome.command.status).toBe("committed");
    expect(removed).not.toHaveBeenCalled();
    expect(nestedCheckpoint).toBeUndefined();
    expect(sibling).toHaveBeenCalledExactlyOnceWith({
      eventKind: "selection",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(adapter.state).toBe("live");
    await Promise.resolve();
    adapter.dispose();
  });

  it("bounds core-commit listeners and clears them on disposal", () => {
    const base = projectionFixture(0, "a");
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({}),
      observation(0),
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );
    const releases = Array.from(
      { length: MAX_WASM_CORE_COMMIT_OBSERVERS },
      () => adapter.observeCoreCommits(() => undefined),
    );

    expect(() => adapter.observeCoreCommits(() => undefined)).toThrow(RangeError);
    releases[0]?.();
    expect(() => adapter.observeCoreCommits(() => undefined)).not.toThrow();
    for (const release of releases) release();
    adapter.dispose();
    expect(() => adapter.observeCoreCommits(() => undefined)).toThrow(/disposed/u);
  });

  it("exposes a stable handle-free action-state port without recursive reads", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const actionState = emptyActionStateResult(0);
    let nested: unknown;
    let port: BreditorWasmCommandAdapter["actionStateReadPort"];
    const engine = engineQueues({});
    engine.actionStates = () => {
      nested = port.read();
      return actionState.view;
    };
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    port = adapter.actionStateReadPort;

    const result = port.read();

    expect(adapter.actionStateReadPort).toBe(port);
    expect(nested).toBeUndefined();
    expect(result?.ok).toBe(true);
    expect(isOwnedBrowserActionStateReadResult(result)).toBe(true);
    expect(actionState.free).toHaveBeenCalledOnce();
    expect(actionState.snapshotFree).toHaveBeenCalledOnce();
    expect(actionState.valueFree).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    expect(adapter.state).toBe("live");
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
    expect(port.read()).toBeUndefined();
  });

  it("reports a thrown checkpoint invocation as a terminal capture failure", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const engine = engineQueues({});
    engine.sessionCheckpointJson = () => {
      throw new Error("hostile engine invocation");
    };
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(adapter.sessionCheckpointReadPort.read()).toEqual({
      ok: false,
      error: {
        kind: "boundary",
        code: "session_checkpoint.invalid_wasm_view",
        message: "The Wasm session-checkpoint view is invalid.",
      },
    });
    expect(adapter.state).toBe("live");
    adapter.dispose();
  });

  it("rejects an otherwise valid action-state snapshot whose catalog omits a profile entry", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const actionState = emptyActionStateResult(0);
    const descriptor = profileDescriptorWithActionState();
    const adapter = new RawBreditorWasmCommandAdapter(
      engineQueues({ actionStates: [actionState.view] }),
      initial,
      {
        profileGeneration: TEST_PROFILE_GENERATION,
        profileDescriptor: descriptor,
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    const result = adapter.actionStateReadPort.read();

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "boundary",
        code: "action_state.invalid_wasm_view",
        message: "The Wasm action-state view is invalid.",
      },
    });
    expect(isOwnedBrowserActionStateReadResult(result)).toBe(true);
    expect(actionState.free).toHaveBeenCalledOnce();
    expect(actionState.snapshotFree).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("does not free its private observation when a hostile action-state result aliases it", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const resultFree = vi.fn();
    const aliased: WasmActionStatesResultView = {
      status: "full",
      error: undefined,
      matchesProfileGeneration: matchesTestProfile,
      takeSnapshot: () => initial as unknown as WasmActionStateSnapshotView,
      free: resultFree,
    };
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ actionStates: [aliased] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(adapter.actionStateReadPort.read()?.ok).toBe(false);
    expect(resultFree).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("does not free its engine receiver when a hostile action-state result aliases it", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const free = vi.fn();
    const engine = engineQueues({});
    Object.assign(engine, { free });
    engine.actionStates = () => engine as unknown as WasmActionStatesResultView;
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(adapter.actionStateReadPort.read()?.ok).toBe(false);
    expect(free).not.toHaveBeenCalled();
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
    expect(free).not.toHaveBeenCalled();
  });

  it("exposes a stable private checkpoint port and rejects recursive reads", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const checkpoint = checkpointResult(0);
    let nested: unknown;
    let port: BreditorWasmCommandAdapter["sessionCheckpointReadPort"];
    const engine = engineQueues({});
    engine.sessionCheckpointJson = () => {
      nested = port.read();
      return checkpoint.view;
    };
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    port = adapter.sessionCheckpointReadPort;

    const result = port.read();

    expect(adapter.sessionCheckpointReadPort).toBe(port);
    expect(nested).toBeUndefined();
    expect(result?.ok).toBe(true);
    expect(isOwnedBrowserSessionCheckpointReadResult(result)).toBe(true);
    expect(checkpoint.free).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    expect(adapter.state).toBe("live");
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
    const unavailable = port.read();
    expect(unavailable).toEqual({
      ok: false,
      error: {
        kind: "lifecycle",
        code: "session_checkpoint.adapter_unavailable",
        message: "The Wasm session-checkpoint reader is permanently unavailable.",
      },
    });
    expect(isOwnedBrowserSessionCheckpointReadResult(unavailable)).toBe(true);
  });

  it("serializes document/plain-text reads under one content lease and preserves observation", () => {
    const base = projectionFixture(0, "A💡");
    const initial = observation(0);
    const document = documentResult("A💡");
    let nestedDocument: unknown;
    let nestedPlainText: unknown;
    let documentPort: BreditorWasmCommandAdapter["documentJsonReadPort"];
    let plainTextPort: BreditorWasmCommandAdapter["plainTextReadPort"];
    const engine = engineQueues({});
    engine.documentJson = (expected) => {
      expect(expected).toBe(initial);
      nestedDocument = documentPort.read();
      nestedPlainText = plainTextPort.read();
      return document.view;
    };
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    documentPort = adapter.documentJsonReadPort;
    plainTextPort = adapter.plainTextReadPort;

    const result = documentPort.read();

    expect(nestedDocument).toBeUndefined();
    expect(nestedPlainText).toBeUndefined();
    expect(result).toMatchObject({
      ok: true,
      document: {
        snapshot: { lineage: "adapter-tests", revision: "0" },
      },
    });
    expect(isOwnedBrowserDocumentJsonReadResult(result)).toBe(true);
    expect(document.free).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    expect(adapter.state).toBe("live");

    expect(plainTextPort.read()).toEqual({
      ok: true,
      content: {
        text: "A💡",
        utf8Bytes: 5,
        snapshot: { lineage: "adapter-tests", revision: "0" },
      },
    });

    adapter.dispose();
    expect(documentPort.read()).toMatchObject({
      ok: false,
      error: { code: "document_json.adapter_unavailable" },
    });
    expect(plainTextPort.read()).toMatchObject({
      ok: false,
      error: { code: "plain_text.adapter_unavailable" },
    });
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("protects the raw engine and observation from aliased checkpoint results", () => {
    for (const alias of ["engine", "observation"] as const) {
      const base = projectionFixture(0, "a");
      const initial = observation(0);
      const engineFree = vi.fn();
      const engine = engineQueues({});
      Object.assign(engine, { free: engineFree });
      engine.sessionCheckpointJson = () =>
        (alias === "engine" ? engine : initial) as unknown as
          WasmSessionCheckpointStringResultView;
      const adapter = new BreditorWasmCommandAdapter(engine, initial, {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      });

      expect(adapter.sessionCheckpointReadPort.read()?.ok).toBe(false);
      expect(engineFree).not.toHaveBeenCalled();
      expect(initial.free).not.toHaveBeenCalled();
      adapter.dispose();
      expect(initial.free).toHaveBeenCalledOnce();
      expect(engineFree).not.toHaveBeenCalled();
    }
  });

  it("contains a rejected async checkpoint impostor and remains live", async () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const engine = engineQueues({});
    engine.sessionCheckpointJson = () =>
      Promise.reject(new Error("must be contained")) as unknown as
        WasmSessionCheckpointStringResultView;
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(adapter.sessionCheckpointReadPort.read()?.ok).toBe(false);
    expect(adapter.state).toBe("live");
    await Promise.resolve();
    adapter.dispose();
  });

  it("contains and rejects a thenable command-result handle before inspecting it", async () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const result = rejectedGeneratedHandle<WasmCommandResultView>({
      status: "unchanged",
      eventKind: undefined,
      disabledActionId: undefined,
      disabledReasonCode: undefined,
      activation: undefined,
      error: undefined,
      observation: vi.fn(),
      projectionUpdate: vi.fn(),
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ noInputAction: [result.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() =>
      adapter.execute(
        noInputActionRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "toolbar", detail: "async-result" },
          "breditor/toggle-strong",
        ),
      ),
    ).toThrow(/asynchronous/u);
    expect(result.free).toHaveBeenCalledOnce();
    expect(result.view.observation).not.toHaveBeenCalled();
    expect(adapter.state).toBe("faulted");
    await Promise.resolve();
    adapter.dispose();
  });

  it("contains and rejects an asynchronous command-result scalar", async () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const result = disabledActionResult(successor);
    Object.defineProperty(result.view, "historyGroupClosedBefore", {
      value: Promise.reject(
        new Error("command scalar rejection must be contained"),
      ),
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ noInputAction: [result.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() =>
      adapter.execute(
        noInputActionRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "toolbar", detail: "async-scalar" },
          "breditor/toggle-strong",
        ),
      ),
    ).toThrow(/scalars are asynchronous/u);
    expect(result.free).toHaveBeenCalledOnce();
    expect(successor.free).not.toHaveBeenCalled();
    expect(adapter.state).toBe("faulted");
    await Promise.resolve();
    adapter.dispose();
  });

  it("releases a command result through the free method captured before then inspection", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const originalFree = vi.fn();
    const replacementFree = vi.fn();
    const result: WasmCommandResultView = {
      status: "disabled",
      historyGroupClosedBefore: false,
      eventKind: undefined,
      disabledActionId: "breditor/toggle-strong",
      disabledReasonCode: "breditor/not-enabled",
      activation: "inactive",
      error: undefined,
      matchesProfileGeneration: matchesTestProfile,
      observation: () => successor,
      projectionUpdate: () => undefined,
      free: originalFree,
    };
    Object.defineProperty(result, "then", {
      get() {
        Object.assign(result, { free: replacementFree });
        return undefined;
      },
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ noInputAction: [result] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(
      adapter.execute(
        noInputActionRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "toolbar", detail: "mutating-then" },
          "breditor/toggle-strong",
        ),
      ).command.status,
    ).toBe("disabled");
    expect(originalFree).toHaveBeenCalledOnce();
    expect(replacementFree).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("faults and releases a command result from another profile generation", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const result = commandResult({
      status: "disabled",
      successor: observation(0),
      disabledActionId: "breditor/toggle-strong",
      disabledReasonCode: "breditor/not-enabled",
      activation: "inactive",
    });
    Object.assign(result.view, { matchesProfileGeneration: () => false });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ noInputAction: [result.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() =>
      adapter.execute(
        noInputActionRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "toolbar", detail: "foreign-profile" },
          "breditor/toggle-strong",
        ),
      ),
    ).toThrow(/invalid or aliased/u);
    expect(result.free).toHaveBeenCalledOnce();
    expect(adapter.state).toBe("faulted");
    adapter.dispose();
  });

  it("retains the initial observation cleanup captured before engine inspection", () => {
    const base = projectionFixture(0, "a");
    const originalFree = vi.fn();
    const replacementFree = vi.fn();
    const initial: WasmCommandObservationView = {
      snapshotLineage: "adapter-tests",
      snapshotRevision: "0",
      matchesProfileGeneration: matchesTestProfile,
      free: originalFree,
    };
    const engine = engineQueues({});
    const actionStates = engine.actionStates;
    Object.defineProperty(engine, "actionStates", {
      get() {
        Object.assign(initial, { free: replacementFree });
        return actionStates;
      },
    });

    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    adapter.dispose();

    expect(originalFree).toHaveBeenCalledOnce();
    expect(replacementFree).not.toHaveBeenCalled();
  });

  it("reports even an undefined value thrown by observation cleanup", () => {
    const base = projectionFixture(0, "a");
    const initial: WasmCommandObservationView = {
      snapshotLineage: "adapter-tests",
      snapshotRevision: "0",
      matchesProfileGeneration: matchesTestProfile,
      free: vi.fn(() => {
        throw undefined;
      }),
    };
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    let threw = false;
    let thrown: unknown = "not thrown";
    try {
      adapter.dispose();
    } catch (error) {
      threw = true;
      thrown = error;
    }

    expect(threw).toBe(true);
    expect(thrown).toBeUndefined();
    expect(adapter.state).toBe("disposed");
  });

  it("releases a nested error through the cleanup captured before later result calls", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const originalFree = vi.fn();
    const replacementFree = vi.fn();
    const error: WasmCommandErrorView = {
      code: "editor_engine.action_failed",
      message: "the command was rejected",
      free: originalFree,
    };
    const resultFree = vi.fn();
    const result: WasmCommandResultView = {
      status: "error",
      historyGroupClosedBefore: false,
      eventKind: undefined,
      disabledActionId: undefined,
      disabledReasonCode: undefined,
      activation: undefined,
      error,
      matchesProfileGeneration: matchesTestProfile,
      observation: () => {
        Object.assign(error, { free: replacementFree });
        return undefined;
      },
      projectionUpdate: () => undefined,
      free: resultFree,
    };
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ noInputAction: [result] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() =>
      adapter.execute(
        noInputActionRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "toolbar", detail: "mutating-error-owner" },
          "breditor/toggle-strong",
        ),
      ),
    ).toThrow(/command was rejected/u);
    expect(originalFree).toHaveBeenCalledOnce();
    expect(replacementFree).not.toHaveBeenCalled();
    expect(resultFree).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("keeps an adopted successor cleanup captured before a later result call", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const originalFree = vi.fn();
    const replacementFree = vi.fn();
    const successor: WasmCommandObservationView = {
      snapshotLineage: "adapter-tests",
      snapshotRevision: "0",
      matchesProfileGeneration: matchesTestProfile,
      free: originalFree,
    };
    const result = commandResult({ status: "unchanged", successor });
    Object.assign(result.view, {
      projectionUpdate: () => {
        Object.assign(successor, { free: replacementFree });
        return undefined;
      },
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ setSelection: [result.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    const delivered = adapter.execute(
      selectionSynchronizationRequest(
        adapter.deliveryToken(),
        selection(base.projection, 0),
        { kind: "api", detail: "mutating-successor-owner" },
      ),
    );
    expect(delivered.command.status).toBe("unchanged");
    adapter.dispose();

    expect(originalFree).toHaveBeenCalledOnce();
    expect(replacementFree).not.toHaveBeenCalled();
  });

  it.each(["error", "observation", "projection"] as const)(
    "contains and rejects a thenable nested %s handle",
    async (kind) => {
      const base = projectionFixture(0, "a");
      const initial = observation(0);
      const successor = kind === "observation"
        ? rejectedGeneratedHandle<WasmCommandObservationView>()
        : undefined;
      const update = kind === "projection"
        ? rejectedGeneratedHandle<SemanticProjectionUpdateView>()
        : undefined;
      const error = kind === "error"
        ? rejectedGeneratedHandle<WasmCommandErrorView>()
        : undefined;
      const resultFree = vi.fn();
      const result: WasmCommandResultView = kind === "error"
          ? {
            status: "error",
            historyGroupClosedBefore: false,
            eventKind: undefined,
            disabledActionId: undefined,
            disabledReasonCode: undefined,
            activation: undefined,
            error: error?.view,
            matchesProfileGeneration: matchesTestProfile,
            observation: () => undefined,
            projectionUpdate: () => undefined,
            free: resultFree,
          }
        : kind === "observation"
          ? {
              status: "disabled",
              historyGroupClosedBefore: false,
              eventKind: undefined,
              disabledActionId: "breditor/toggle-strong",
              disabledReasonCode: "breditor/not-enabled",
              activation: "inactive",
              error: undefined,
              matchesProfileGeneration: matchesTestProfile,
              observation: () => successor?.view,
              projectionUpdate: () => undefined,
              free: resultFree,
            }
          : {
              status: "committed",
              historyGroupClosedBefore: false,
              eventKind: "action",
              disabledActionId: undefined,
              disabledReasonCode: undefined,
              activation: undefined,
              error: undefined,
              matchesProfileGeneration: matchesTestProfile,
              observation: () => observation(1),
              projectionUpdate: () => update?.view,
              free: resultFree,
            };
      const adapter = new BreditorWasmCommandAdapter(
        engineQueues({ noInputAction: [result] }),
        initial,
        {
          renderer: base.renderer,
          rendered: base.rendered,
          selectionBridge: new BreditorDomSelectionBridge(),
        },
      );

      expect(() =>
        adapter.execute(
          noInputActionRequest(
            adapter.deliveryToken(),
            preserveSelectionSync(),
            { kind: "toolbar", detail: `async-${kind}` },
            "breditor/toggle-strong",
          ),
        ),
      ).toThrow(/asynchronous/u);
      expect(resultFree).toHaveBeenCalledOnce();
      if (successor !== undefined) expect(successor.free).toHaveBeenCalledOnce();
      if (update !== undefined) expect(update.free).toHaveBeenCalledOnce();
      if (error !== undefined) expect(error.free).toHaveBeenCalledOnce();
      expect(adapter.state).toBe("faulted");
      await Promise.resolve();
      adapter.dispose();
    },
  );

  it("contains and rejects a thenable nested semantic-selection handle", async () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const committed = observation(1);
    const update = projectionUpdate(base.projection, projection(1, "a"));
    const result = commandResult({
      status: "committed",
      eventKind: "selection",
      successor: committed,
      update: update.view,
    });
    const selected = rejectedGeneratedHandle<SemanticSelectionView>();
    const selectionResultFree = vi.fn();
    const engineSelection: WasmSelectionResultView = {
      status: "selection",
      error: undefined,
      matchesProfileGeneration: matchesTestProfile,
      takeSelection: () => selected.view,
      free: selectionResultFree,
    };
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({
        setSelection: [result.view],
        selection: [engineSelection],
      }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() =>
      adapter.execute(
        selectionSynchronizationRequest(
          adapter.deliveryToken(),
          selection(base.projection, 1),
          { kind: "selectionchange", detail: "async-selection" },
        ),
      ),
    ).toThrow(/asynchronous/u);
    expect(selected.free).toHaveBeenCalledOnce();
    expect(selectionResultFree).toHaveBeenCalledOnce();
    expect(result.free).toHaveBeenCalledOnce();
    expect(committed.free).toHaveBeenCalledOnce();
    expect(adapter.state).toBe("faulted");
    await Promise.resolve();
    adapter.dispose();
  });

  it("restores authoritative selection without replacing DOM, changing revision or publishing a commit", () => {
    const base = projectionFixture(0, "abc");
    const bridge = new BreditorDomSelectionBridge();
    const semantic = selectionResult(selectionView(0, 2));
    const initial = observation(0);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({selection: [semantic.view]}), initial, {
      renderer: base.renderer, rendered: base.rendered, selectionBridge: bridge,
    });
    const commits = vi.fn(); adapter.observeCoreCommits(commits);
    const nodes = Array.from(base.host.childNodes);
    const render = vi.spyOn(base.renderer, "render");
    document.getSelection()!.removeAllRanges();
    expect(adapter.restoreCanonicalSelection()).toBe(true);
    expect(adapter.state).toBe("live");
    expect(adapter.rendered).toBe(base.rendered);
    expect(Array.from(base.host.childNodes)).toEqual(nodes);
    expect(render).not.toHaveBeenCalled();
    expect(adapter.snapshot.revision).toBe("0");
    expect(commits).not.toHaveBeenCalled();
    expect(document.getSelection()!.anchorOffset).toBe(2);
    expect(document.getSelection()!.focusOffset).toBe(2);
    expect(semantic.free).toHaveBeenCalledOnce();
    expect(semantic.selectionFree).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(adapter.restoreCanonicalSelection()).toBe(false);
  });

  it("refuses selection-only restoration over drifted DOM without reading Wasm", () => {
    const base = projectionFixture(0, "abc");
    const engine = engineQueues({});
    const read = vi.spyOn(engine, "selection");
    const adapter = new BreditorWasmCommandAdapter(engine, observation(0), {
      renderer: base.renderer, rendered: base.rendered, selectionBridge: new BreditorDomSelectionBridge(),
    });
    base.host.textContent = "foreign";
    expect(adapter.restoreCanonicalSelection()).toBe(false);
    expect(adapter.state).toBe("reconcile");
    expect(read).not.toHaveBeenCalled();
    expect(base.host.textContent).toBe("foreign");
    adapter.dispose();
  });

  it("runs selection then command, renders the update, and returns no Wasm handles", () => {
    const base = projectionFixture(0, "a");
    const resultProjection = projection(1, "ax");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    expect(bridge.write(base.rendered, selected).ok).toBe(true);

    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const update = projectionUpdate(base.projection, resultProjection);
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: update.view,
    });
    const semanticSelection = selectionResult(selectionView(1, 2));
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [semanticSelection.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const token = adapter.deliveryToken();
    expect(editorDeliveryAuthorityAccepts(adapter.deliveryAuthority, token)).toBe(true);
    const request = stringActionRequest(
      token,
      rangeSelectionSync(selected),
      { kind: "beforeinput", detail: "insertText" },
      "breditor/insert-text",
      "x",
    );

    const executor = adapter.commandExecutor;
    expect(adapter.commandExecutor).toBe(executor);
    const outcome = executor(request);

    expect(outcome.status).toBe("delivered");
    expect(outcome.selection.status).toBe("unchanged");
    expect(outcome.command).toMatchObject({
      status: "committed",
      eventKind: "action",
      snapshot: { lineage: "adapter-tests", revision: "1" },
      render: { mode: "incremental" },
    });
    expect("projectionUpdate" in outcome.command).toBe(false);
    expect(outcome.rendered).toBe(adapter.rendered);
    expect(adapter.snapshot.revision).toBe("1");
    expect(base.host.textContent).toBe("ax");
    expect(adapter.acceptsDeliveryToken(token)).toBe(false);
    expect(editorDeliveryAuthorityAccepts(adapter.deliveryAuthority, token)).toBe(false);
    expect(initial.free).toHaveBeenCalledOnce();
    expect(synchronized.free).toHaveBeenCalledOnce();
    expect(syncResult.free).toHaveBeenCalledOnce();
    expect(actionResult.free).toHaveBeenCalledOnce();
    expect(update.free).toHaveBeenCalledOnce();
    expect(semanticSelection.free).toHaveBeenCalledOnce();
    expect(semanticSelection.selectionFree).toHaveBeenCalledOnce();

    const observed = bridge.read(adapter.rendered);
    expect(observed.ok && observed.value.kind === "range"
      ? observed.value.origin
      : "missing").toBe("programmaticEcho");
    adapter.dispose();
    expect(committed.free).toHaveBeenCalledOnce();
  });

  it("executes a toolbar action against the preserved semantic selection", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const initial = observation(0);
    const successor = observation(0);
    const disabled = commandResult({
      status: "disabled",
      successor,
      disabledActionId: "breditor/toggle-strong",
      disabledReasonCode: "breditor/not-enabled",
      activation: "inactive",
    });
    const engine = engineQueues({ noInputAction: [disabled.view] });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const write = vi.spyOn(bridge, "write");

    const outcome = adapter.execute(
      noInputActionRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "toolbar", detail: "bold" },
        "breditor/toggle-strong",
      ),
    );

    expect(outcome.selection).toEqual({
      status: "preserved",
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    expect(outcome.command.status).toBe("disabled");
    expect(write).not.toHaveBeenCalled();
    expect(disabled.free).toHaveBeenCalledOnce();
    expect(initial.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(successor.free).toHaveBeenCalledOnce();
  });

  it("delivers typed JSON actions through the captured atomic command path", () => {
    const base = projectionFixture(0, "a");
    const resultProjection = projection(1, "a");
    const initial = observation(0);
    const successor = observation(1);
    const update = projectionUpdate(base.projection, resultProjection);
    const committed = commandResult({
      status: "committed",
      eventKind: "action",
      successor,
      update: update.view,
    });
    const selected = selectionResult(selectionView(1, 1));
    const engine = engineQueues({
      typedAction: [committed.view],
      selection: [selected.view],
    });
    const execute = vi.spyOn(engine, "executeTypedActionJson");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    const inputJson = '{"operation":"remove"}';

    const outcome = adapter.execute(
      jsonActionRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "typed-action" },
        "example/set-link",
        inputJson,
      ),
    );

    expect(execute).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ snapshotRevision: "0" }),
      "example/set-link",
      inputJson,
      false,
    );
    expect(outcome.command).toMatchObject({
      status: "committed",
      eventKind: "action",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    adapter.dispose();
  });

  it.each([
    "breditor_wasm.action_value_json_limit",
    "breditor_wasm.invalid_action_value_json",
    "breditor_wasm.typed_input_rejected",
  ])("contains retryable typed rejection %s without publishing history control", (code) => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const rejected = commandError(code);
    const engine = engineQueues({ typedAction: [rejected.view] });
    const close = vi.spyOn(engine, "closeHistoryGroup");
    const execute = vi.spyOn(engine, "executeTypedActionJson");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    const outcome = adapter.execute(
      jsonActionRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "invalid-typed-action" },
        "example/set-link",
        '{"operation":"remove","operation":"set"}',
        "closeBefore",
      ),
    );

    expect(outcome.boundary).toBeUndefined();
    expect(outcome.command).toMatchObject({
      status: "rejected",
      error: { code, stale: false },
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    expect(adapter.state).toBe("live");
    expect(close).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledExactlyOnceWith(
      initial,
      "example/set-link",
      '{"operation":"remove","operation":"set"}',
      true,
    );
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it.each([
    "breditor_wasm.invalid_action_id",
    "breditor_wasm.unknown_action",
    "breditor_wasm.action_rejects_typed_input",
  ])("faults when a typed action contradicts its admitted contract with %s", (code) => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const rejected = commandError(code);
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ typedAction: [rejected.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() =>
      adapter.execute(
        jsonActionRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "api", detail: "typed-action-contradiction" },
          "example/set-link",
          '{"operation":"remove"}',
        ),
      ),
    ).toThrow(/contradicted its compiled input contract/u);
    expect(adapter.state).toBe("faulted");
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("routes a no-input semantic intent and exposes only frozen handle-free provenance", () => {
    const base = projectionFixture(0, "a");
    const next = projection(1, "a");
    const initial = observation(0);
    const successor = observation(1);
    const update = projectionUpdate(base.projection, next);
    const routed = intentResult({
      status: "committed",
      successor,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      fallthroughs: [
        {
          bindingId: "example/first-binding",
          actionId: "example/first-action",
          priority: 20,
          reasonCode: "example/first-disabled",
        },
        {
          bindingId: "example/second-binding",
          actionId: "example/second-action",
          priority: 10,
          reasonCode: "example/second-disabled",
        },
      ],
      update: update.view,
    });
    const semanticSelection = selectionResult(selectionView(1, 1));
    const engine = engineQueues({
      intents: [routed.view],
      selection: [semanticSelection.view],
    });
    const execute = vi.spyOn(engine, "executeNoInputIntent");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

    const outcome = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "format-strong" },
        TEST_INTENT_ID,
      ),
    );

    expect(execute).toHaveBeenCalledExactlyOnceWith(
      initial,
      TEST_INTENT_ID,
      false,
    );
    expect(outcome.command).toEqual({
      status: "committed",
      eventKind: "intent",
      intentId: TEST_INTENT_ID,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      fallthroughs: [
        {
          bindingId: "example/first-binding",
          actionId: "example/first-action",
          priority: 20,
          reasonCode: "example/first-disabled",
        },
        {
          bindingId: "example/second-binding",
          actionId: "example/second-action",
          priority: 10,
          reasonCode: "example/second-disabled",
        },
      ],
      snapshot: { lineage: "adapter-tests", revision: "1" },
      render: expect.objectContaining({ mode: "incremental" }),
    });
    expect(Object.isFrozen(outcome.command)).toBe(true);
    if (outcome.command.status === "committed" && outcome.command.eventKind === "intent") {
      expect(Object.isFrozen(outcome.command.fallthroughs)).toBe(true);
      expect(Object.isFrozen(outcome.command.fallthroughs[0])).toBe(true);
    }
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "intent",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(routed.free).toHaveBeenCalledOnce();
    expect(update.free).toHaveBeenCalledOnce();
    expect(initial.free).toHaveBeenCalledOnce();
    expect(semanticSelection.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(successor.free).toHaveBeenCalledOnce();
  });

  it("adopts exact blocked and unhandled intent successor observations", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const blockedObservation = observation(0);
    const unhandledObservation = observation(0);
    const blocked = intentResult({
      status: "blocked",
      successor: blockedObservation,
      historyGroupClosedBefore: true,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      blockedReasonCode: "breditor/no-selection",
      blockedActivation: "inactive",
      blockedValueStatus: "unsupported",
      fallthroughs: [{
        bindingId: "example/fallback-binding",
        actionId: "example/fallback-action",
        priority: 10,
        reasonCode: "example/disabled",
      }],
    });
    const unhandled = intentResult({
      status: "unhandled",
      successor: unhandledObservation,
      fallthroughs: [{
        bindingId: "example/last-binding",
        actionId: "example/last-action",
        priority: -5,
        reasonCode: "example/disabled",
      }],
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [blocked.view, unhandled.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

    const first = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "toolbar", detail: "bold" },
        TEST_INTENT_ID,
        "closeBefore",
      ),
    );
    expect(first.boundary).toEqual({
      status: "committed",
      eventKind: "closeHistoryGroup",
      snapshot: { lineage: "adapter-tests", revision: "0" },
      render: undefined,
    });
    expect(first.command).toEqual({
      status: "blocked",
      intentId: TEST_INTENT_ID,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      reasonCode: "breditor/no-selection",
      activation: "inactive",
      blockedValueStatus: "unsupported",
      blockedValueContract: undefined,
      fallthroughs: [{
        bindingId: "example/fallback-binding",
        actionId: "example/fallback-action",
        priority: 10,
        reasonCode: "example/disabled",
      }],
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    expect(initial.free).toHaveBeenCalledOnce();

    const second = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "unhandled" },
        TEST_INTENT_ID,
        "closeBefore",
      ),
    );
    expect(second.boundary).toEqual({
      status: "unchanged",
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    expect(second.command).toEqual({
      status: "unhandled",
      intentId: TEST_INTENT_ID,
      fallthroughs: [{
        bindingId: "example/last-binding",
        actionId: "example/last-action",
        priority: -5,
        reasonCode: "example/disabled",
      }],
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    expect(blockedObservation.free).toHaveBeenCalledOnce();
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "closeHistoryGroup",
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    adapter.dispose();
    expect(unhandledObservation.free).toHaveBeenCalledOnce();
  });

  it("correlates a blocked indicator with its declared typed value contract", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const blocked = intentResult({
      status: "blocked",
      successor,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      blockedReasonCode: "breditor/no-selection",
      blockedActivation: "mixed",
      blockedValueStatus: "uniform",
      blockedValueContractName: "example/value",
      blockedValueContractVersion: 2,
    });
    const adapter = new RawBreditorWasmCommandAdapter(
      engineQueues({ intents: [blocked.view] }),
      initial,
      {
        profileGeneration: TEST_PROFILE_GENERATION,
        profileDescriptor: profileDescriptorWithIntentContract({
          input: "none",
          value: true,
        }),
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    const outcome = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "typed-state" },
        TEST_INTENT_ID,
      ),
    );

    expect(outcome.command).toMatchObject({
      status: "blocked",
      blockedValueStatus: "uniform",
      blockedValueContract: { name: "example/value", version: 2 },
    });
    if (outcome.command.status === "blocked") {
      expect(Object.isFrozen(outcome.command.blockedValueContract)).toBe(true);
    }
    adapter.dispose();
  });

  it("admits the exact 256-entry fallthrough ceiling for an unhandled intent", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const fallthroughs = Array.from({ length: 256 }, (_, index) => ({
      bindingId: `example/binding-${String(index).padStart(3, "0")}`,
      actionId: `example/action-${String(index).padStart(3, "0")}`,
      priority: 255 - index,
      reasonCode: "example/disabled",
    }));
    const routed = intentResult({
      status: "unhandled",
      successor,
      fallthroughs,
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [routed.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    const outcome = adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "maximum-fallthroughs" },
        TEST_INTENT_ID,
      ),
    );

    expect(outcome.command.status).toBe("unhandled");
    if (outcome.command.status === "unhandled") {
      expect(outcome.command.fallthroughs).toHaveLength(256);
    }
    adapter.dispose();
  });

  it("refuses to invoke the no-input ABI for a typed-input intent declaration", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const engine = engineQueues({});
    const execute = vi.spyOn(engine, "executeNoInputIntent");
    const adapter = new RawBreditorWasmCommandAdapter(engine, initial, {
      profileGeneration: TEST_PROFILE_GENERATION,
      profileDescriptor: profileDescriptorWithIntentContract({
        input: "typed",
        value: false,
      }),
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "wrong-input-shape" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/compiled contract/u);
    expect(execute).not.toHaveBeenCalled();
    expect(adapter.state).toBe("faulted");
    adapter.dispose();
  });

  it.each([
    "breditor_wasm.invalid_intent_id",
    "breditor_wasm.unknown_intent",
    "breditor_wasm.intent_rejects_typed_input",
  ])("faults when a typed intent contradicts its admitted contract with %s", (code) => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const rejected = intentError(code);
    const adapter = new RawBreditorWasmCommandAdapter(
      engineQueues({ typedIntents: [rejected.view] }),
      initial,
      {
        profileGeneration: TEST_PROFILE_GENERATION,
        profileDescriptor: profileDescriptorWithIntentContract({
          input: "typed",
          value: false,
        }),
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() =>
      adapter.execute(
        jsonIntentRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "api", detail: "typed-intent-contradiction" },
          TEST_INTENT_ID,
          '{"operation":"remove"}',
        ),
      ),
    ).toThrow(/contradicted its compiled input contract/u);
    expect(adapter.state).toBe("faulted");
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("refuses to invoke an intent absent from the owned profile descriptor", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const engine = engineQueues({});
    const execute = vi.spyOn(engine, "executeNoInputIntent");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "undeclared" },
        "example/undeclared",
      ),
    )).toThrow(/compiled contract/u);
    expect(execute).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("contains a structured semantic-intent error and keeps a non-stale adapter live", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const rejected = intentError("editor_engine.intent_routing");
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [rejected.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "rejected" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/intent_routing/u);
    expect(adapter.state).toBe("live");
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("faults permanently on a structured stale semantic-intent error", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const rejected = intentError("editor_engine.stale_snapshot");
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [rejected.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "stale" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/stale_snapshot/u);
    expect(adapter.state).toBe("faulted");
    expect(() => adapter.deliveryToken()).toThrow(/faulted/u);
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("requires the complete generated semantic-intent method surface", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const routed = intentResult({ status: "unhandled", successor });
    Object.defineProperty(routed.view, "commitJson", { value: undefined });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [routed.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "missing-method" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/intent result/u);
    expect(routed.free).toHaveBeenCalledOnce();
    expect(successor.free).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("adopts a published intent commit before requiring DOM reconciliation", () => {
    const base = projectionFixture(0, "a");
    const next = projection(1, "a");
    const initial = observation(0);
    const successor = observation(1);
    const routed = intentResult({
      status: "committed",
      successor,
      bindingId: "breditor/format-strong-binding",
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      update: projectionUpdate(base.projection, next).view,
    });
    const afterCommit = selectionResult(selectionView(1, 1));
    const afterRestore = selectionResult(selectionView(1, 1));
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({
        intents: [routed.view],
        selection: [afterCommit.view, afterRestore.view],
      }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new FailOnWriteBridge(1),
      },
    );
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "reconcile" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/canonical DOM restoration/u);
    expect(adapter.state).toBe("reconcile");
    expect(adapter.snapshot).toEqual({
      lineage: "adapter-tests",
      revision: "1",
    });
    expect(initial.free).toHaveBeenCalledOnce();
    expect(routed.free).toHaveBeenCalledOnce();
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "intent",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(adapter.restoreCanonicalRender().ok).toBe(true);
    expect(adapter.state).toBe("live");
    expect(adapter.deliveryToken().snapshotRevision).toBe("1");
    adapter.dispose();
    expect(successor.free).toHaveBeenCalledOnce();
  });

  it.each([
    "wrong intent ID",
    "changed blocked snapshot",
    "blocked projection update",
    "missing selected binding",
    "invalid blocked activation",
    "invalid blocked value contract",
    "out-of-order fallthroughs",
    "256 fallthroughs plus selected binding",
  ] as const)("faults on an inexact semantic-intent receipt with %s", (violation) => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(violation === "changed blocked snapshot" ? 1 : 0);
    const exposedUpdate = violation === "blocked projection update"
      ? projectionUpdate(base.projection, projection(1, "a"))
      : undefined;
    const longTrace = Array.from({ length: 256 }, (_, index) => ({
      bindingId: `example/binding-${String(index).padStart(3, "0")}`,
      actionId: `example/action-${String(index).padStart(3, "0")}`,
      priority: 1_000 - index,
      reasonCode: "example/disabled",
    }));
    const routed = intentResult({
      status: "blocked",
      successor,
      intentId: violation === "wrong intent ID" ? "example/other" : TEST_INTENT_ID,
      ...(violation === "missing selected binding"
        ? {}
        : { bindingId: "breditor/format-strong-binding" }),
      actionId: "breditor/toggle-strong",
      bindingPriority: 0,
      blockedReasonCode: "breditor/no-selection",
      blockedActivation: violation === "invalid blocked activation"
        ? "stateless"
        : "inactive",
      blockedValueStatus: violation === "invalid blocked value contract"
        ? "uniform"
        : "unsupported",
      fallthroughs: violation === "out-of-order fallthroughs"
        ? [
            {
              bindingId: "example/first-binding",
              actionId: "example/first-action",
              priority: 10,
              reasonCode: "example/disabled",
            },
            {
              bindingId: "example/second-binding",
              actionId: "example/second-action",
              priority: 20,
              reasonCode: "example/disabled",
            },
          ]
        : violation === "256 fallthroughs plus selected binding"
          ? longTrace
          : [],
      ...(exposedUpdate === undefined ? {} : { update: exposedUpdate.view }),
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [routed.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: violation },
        TEST_INTENT_ID,
      ),
    )).toThrow(/intent/u);
    expect(adapter.state).toBe("faulted");
    expect(routed.free).toHaveBeenCalledOnce();
    expect(successor.free).toHaveBeenCalledOnce();
    if (exposedUpdate !== undefined) {
      expect(exposedUpdate.free).toHaveBeenCalledOnce();
    }
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it.each(["unchanged revision", "missing update", "blocked-only scalar"] as const)(
    "faults on a committed semantic-intent receipt with %s",
    (violation) => {
      const base = projectionFixture(0, "a");
      const nextRevision = violation === "unchanged revision" ? 0 : 1;
      const initial = observation(0);
      const successor = observation(nextRevision);
      const update = violation === "missing update"
        ? undefined
        : projectionUpdate(base.projection, projection(nextRevision, "a"));
      const routed = intentResult({
        status: "committed",
        successor,
        bindingId: "breditor/format-strong-binding",
        actionId: "breditor/toggle-strong",
        bindingPriority: 0,
        ...(violation === "blocked-only scalar"
          ? { blockedReasonCode: "breditor/no-selection" }
          : {}),
        ...(update === undefined ? {} : { update: update.view }),
      });
      const adapter = new BreditorWasmCommandAdapter(
        engineQueues({ intents: [routed.view] }),
        initial,
        {
          renderer: base.renderer,
          rendered: base.rendered,
          selectionBridge: new BreditorDomSelectionBridge(),
        },
      );

      expect(() => adapter.execute(
        noInputIntentRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "api", detail: violation },
          TEST_INTENT_ID,
        ),
      )).toThrow(/committed intent/u);
      expect(adapter.state).toBe("faulted");
      expect(routed.free).toHaveBeenCalledOnce();
      expect(successor.free).toHaveBeenCalledOnce();
      if (update !== undefined) expect(update.free).toHaveBeenCalledOnce();
      adapter.dispose();
    },
  );

  it("rejects intent result aliases without releasing adapter-owned handles", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const engine = engineQueues({
      intents: [initial as unknown as WasmIntentResultView],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "alias" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/aliased/u);
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it.each([
    "wrong generation",
    "aliased successor",
    "thenable result",
    "thenable scalar",
  ] as const)(
    "frees and faults a hostile semantic-intent handle with %s",
    async (violation) => {
      const base = projectionFixture(0, "a");
      const initial = observation(0);
      const successor = observation(0);
      const routed = intentResult({
        status: "unhandled",
        successor,
        matchesGeneration: violation !== "wrong generation",
      });
      if (violation === "aliased successor") {
        Object.defineProperty(routed.view, "observation", {
          value: () => routed.view,
        });
      }
      if (violation === "thenable result") {
        Object.defineProperty(routed.view, "then", {
          value: (resolve: (value: undefined) => void) => resolve(undefined),
        });
      }
      if (violation === "thenable scalar") {
        Object.defineProperty(routed.view, "intentId", {
          value: Promise.reject(
            new Error("intent scalar rejection must be contained"),
          ),
        });
      }
      const adapter = new BreditorWasmCommandAdapter(
        engineQueues({ intents: [routed.view] }),
        initial,
        {
          renderer: base.renderer,
          rendered: base.rendered,
          selectionBridge: new BreditorDomSelectionBridge(),
        },
      );

      expect(() => adapter.execute(
        noInputIntentRequest(
          adapter.deliveryToken(),
          preserveSelectionSync(),
          { kind: "api", detail: violation },
          TEST_INTENT_ID,
        ),
      )).toThrow(/intent result|generation|handles alias/u);
      await Promise.resolve();
      expect(adapter.state).toBe("faulted");
      expect(routed.free).toHaveBeenCalledOnce();
      expect(successor.free).not.toHaveBeenCalled();
      adapter.dispose();
      expect(initial.free).toHaveBeenCalledOnce();
    },
  );

  it("adopts the exact intent successor before reporting a result cleanup failure", () => {
    const base = projectionFixture(0, "a");
    const initial = observation(0);
    const successor = observation(0);
    const routed = intentResult({
      status: "unhandled",
      successor,
      freeResult: "unexpected",
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ intents: [routed.view] }),
      initial,
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );

    expect(() => adapter.execute(
      noInputIntentRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "api", detail: "cleanup" },
        TEST_INTENT_ID,
      ),
    )).toThrow(/free returned/u);
    expect(adapter.state).toBe("faulted");
    expect(initial.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(successor.free).toHaveBeenCalledOnce();
  });

  it("delivers selection-only synchronization without a second engine command", () => {
    const base = projectionFixture(0, "a");
    const resultProjection = projection(1, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const committed = observation(1);
    const update = projectionUpdate(base.projection, resultProjection);
    const synchronized = commandResult({
      status: "committed",
      eventKind: "selection",
      successor: committed,
      update: update.view,
    });
    const semanticSelection = selectionResult(selectionView(1, 1));
    const engine = engineQueues({
      setSelection: [synchronized.view],
      selection: [semanticSelection.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    const outcome = adapter.execute(
      selectionSynchronizationRequest(
        adapter.deliveryToken(),
        selected,
        { kind: "selectionchange", detail: "document-selection" },
      ),
    );

    expect(outcome.selection).toMatchObject({
      status: "committed",
      eventKind: "selection",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(outcome.command).toBe(outcome.selection);
    expect(outcome.boundary).toBeUndefined();
    expect(adapter.snapshot.revision).toBe("1");
    expect(synchronized.free).toHaveBeenCalledOnce();
    expect(update.free).toHaveBeenCalledOnce();
    expect(semanticSelection.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(committed.free).toHaveBeenCalledOnce();
  });

  it("spends a token before a structured rejection and never silently retries it", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const rejected = commandError("editor_engine.selection_update");
    const setRangeSelection = vi.fn(() => rejected.view);
    const engine = engineQueues({ setRangeSelection });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const request = actionRequest(adapter, selected);

    expect(() => adapter.execute(request)).toThrow(/selection_update/u);
    expect(adapter.state).toBe("live");
    expect(setRangeSelection).toHaveBeenCalledOnce();
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();

    expect(() => adapter.execute(request)).toThrow(/stale or foreign/u);
    expect(setRangeSelection).toHaveBeenCalledOnce();
    expect(adapter.deliveryToken()).not.toBe(request.delivery);
    adapter.dispose();
  });

  it("publishes a committed prestage even when the later command is rejected", () => {
    const base = projectionFixture(0, "a");
    const prestagedProjection = projection(1, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const prestaged = observation(1);
    const prestageUpdate = projectionUpdate(base.projection, prestagedProjection);
    const prestageResult = commandResult({
      status: "committed",
      eventKind: "selection",
      successor: prestaged,
      update: prestageUpdate.view,
    });
    const semanticSelection = selectionResult(selectionView(1, 1));
    const rejected = commandError("editor_engine.action_rejected");
    const engine = engineQueues({
      setSelection: [prestageResult.view],
      stringAction: [rejected.view],
      selection: [semanticSelection.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);
    const queueObserver = vi.fn();
    const queue = new BreditorCommandQueue(adapter.commandExecutor, {
      observer: queueObserver,
    });

    expect(queue.submit(actionRequest(adapter, selected))).toEqual({
      status: "failed",
      failure: { code: "command_queue.executor_threw", sequence: 1n },
    });

    expect(adapter.state).toBe("live");
    expect(adapter.snapshot.revision).toBe("1");
    expect(queueObserver).not.toHaveBeenCalled();
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "selection",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();
    queue.dispose();
    adapter.dispose();
  });

  it.each([
    "editor_engine.stale_engine",
    "editor_engine.stale_snapshot",
    "editor_engine.stale_history",
  ])("faults permanently on structured stale rejection %s", (code) => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const rejected = commandError(code);
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [rejected.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(code);
    expect(adapter.state).toBe("faulted");
    expect(() => adapter.deliveryToken()).toThrow(/faulted/u);
    expect(adapter.restoreCanonicalRender()).toEqual({
      ok: false,
      reason: "adapterUnavailable",
    });
    expect(rejected.free).toHaveBeenCalledOnce();
    expect(rejected.errorFree).toHaveBeenCalledOnce();
    expect(synchronized.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(synchronized.free).toHaveBeenCalledOnce();
  });

  it("accepts only an exact disabled action outcome on the unchanged snapshot", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const disabledObservation = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const disabled = commandResult({
      status: "disabled",
      successor: disabledObservation,
      disabledActionId: "breditor/insert-text",
      disabledReasonCode: "breditor/not-enabled",
      activation: "inactive",
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [disabled.view],
    });
    const executeStringAction = vi.spyOn(engine, "executeStringAction");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

    const outcome = adapter.execute(actionRequest(adapter, selected));

    expect(executeStringAction).toHaveBeenCalledWith(
      synchronized,
      "breditor/insert-text",
      "x",
      false,
    );
    expect(outcome.command).toEqual({
      status: "disabled",
      actionId: "breditor/insert-text",
      reasonCode: "breditor/not-enabled",
      activation: "inactive",
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    expect(outcome.rendered).toBe(base.rendered);
    expect(adapter.snapshot.revision).toBe("0");
    expect(base.host.textContent).toBe("a");
    expect(commits).not.toHaveBeenCalled();
    expect(disabled.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(disabledObservation.free).toHaveBeenCalledOnce();
  });

  it.each(["wrong action ID", "changed snapshot", "projection update"])(
    "rejects a disabled result with %s",
    (violation) => {
      const base = projectionFixture(0, "a");
      const bridge = new BreditorDomSelectionBridge();
      const selected = selection(base.projection, 1);
      bridge.write(base.rendered, selected);
      const initial = observation(0);
      const synchronized = observation(0);
      const successor = observation(violation === "changed snapshot" ? 1 : 0);
      const syncResult = commandResult({ status: "unchanged", successor: synchronized });
      const exposedUpdate = violation === "projection update"
        ? projectionUpdate(base.projection, projection(1, "ax"))
        : undefined;
      const disabled = commandResult({
        status: "disabled",
        successor,
        disabledActionId: violation === "wrong action ID"
          ? "breditor/delete-forward"
          : "breditor/insert-text",
        disabledReasonCode: "breditor/not-enabled",
        activation: "inactive",
        ...(exposedUpdate === undefined ? {} : { update: exposedUpdate.view }),
      });
      const engine = engineQueues({
        setSelection: [syncResult.view],
        stringAction: [disabled.view],
      });
      const adapter = new BreditorWasmCommandAdapter(engine, initial, {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: bridge,
      });

      expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
        /disabled result violated/u,
      );
      expect(adapter.state).toBe("faulted");
      expect(disabled.free).toHaveBeenCalledOnce();
      expect(successor.free).toHaveBeenCalledOnce();
      if (exposedUpdate !== undefined) {
        expect(exposedUpdate.free).toHaveBeenCalledOnce();
      }
      adapter.dispose();
    },
  );

  it("accepts a close-history commit only on the same snapshot without an update", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const finished = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const actionResult = commandResult({
      status: "disabled",
      successor: finished,
      disabledActionId: "breditor/insert-text",
      disabledReasonCode: "breditor/not-enabled",
      activation: "inactive",
      historyGroupClosedBefore: true,
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
    });
    const closeHistoryGroup = vi.spyOn(engine, "closeHistoryGroup");
    const executeStringAction = vi.spyOn(engine, "executeStringAction");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);
    const request = stringActionRequest(
      adapter.deliveryToken(),
      rangeSelectionSync(selected),
      { kind: "api", detail: "history-boundary-test" },
      "breditor/insert-text",
      "x",
      "closeBefore",
    );

    const outcome = adapter.execute(request);

    expect(closeHistoryGroup).not.toHaveBeenCalled();
    expect(executeStringAction).toHaveBeenCalledWith(
      synchronized,
      "breditor/insert-text",
      "x",
      true,
    );
    expect(outcome.boundary).toEqual({
      status: "committed",
      eventKind: "closeHistoryGroup",
      snapshot: { lineage: "adapter-tests", revision: "0" },
      render: undefined,
    });
    expect(outcome.command.status).toBe("disabled");
    expect(adapter.snapshot.revision).toBe("0");
    expect(base.host.textContent).toBe("a");
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "closeHistoryGroup",
      snapshot: { lineage: "adapter-tests", revision: "0" },
    });
    adapter.dispose();
  });

  it("routes undo through one atomic close-before command and preserves observer order", () => {
    const base = projectionFixture(2, "ab");
    const resultProjection = projection(3, "a");
    const initial = observation(2);
    const successor = observation(3);
    const update = projectionUpdate(base.projection, resultProjection);
    const undoResult = commandResult({
      status: "committed",
      eventKind: "undo",
      successor,
      update: update.view,
      historyGroupClosedBefore: true,
    });
    const semanticSelection = selectionResult(selectionView(3, 1));
    const engine = engineQueues({
      undo: [undoResult.view],
      selection: [semanticSelection.view],
    });
    const undo = vi.spyOn(engine, "undo");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

    const outcome = adapter.execute(
      historyRequest(
        adapter.deliveryToken(),
        preserveSelectionSync(),
        { kind: "keyboard", detail: "history-undo" },
        "undo",
      ),
    );

    expect(undo).toHaveBeenCalledExactlyOnceWith(initial, true);
    expect(outcome.boundary).toEqual({
      status: "committed",
      eventKind: "closeHistoryGroup",
      snapshot: { lineage: "adapter-tests", revision: "2" },
      render: undefined,
    });
    expect(outcome.command).toMatchObject({
      status: "committed",
      eventKind: "undo",
      snapshot: { lineage: "adapter-tests", revision: "3" },
    });
    expect(commits.mock.calls).toEqual([
      [{
        eventKind: "closeHistoryGroup",
        snapshot: { lineage: "adapter-tests", revision: "2" },
      }],
      [{
        eventKind: "undo",
        snapshot: { lineage: "adapter-tests", revision: "3" },
      }],
    ]);
    expect(base.host.textContent).toBe("a");
    expect(update.free).toHaveBeenCalledOnce();
    expect(semanticSelection.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(successor.free).toHaveBeenCalledOnce();
  });

  it("executes an explicit history-group control without a document action", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const bounded = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const boundaryResult = commandResult({
      status: "committed",
      eventKind: "closeHistoryGroup",
      successor: bounded,
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      closeHistory: [boundaryResult.view],
    });
    const closeHistoryGroup = vi.spyOn(engine, "closeHistoryGroup");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    const outcome = adapter.execute(
      closeHistoryGroupRequest(
        adapter.deliveryToken(),
        rangeSelectionSync(selected),
        { kind: "api", detail: "composition-cancelled" },
      ),
    );

    expect(closeHistoryGroup).toHaveBeenCalledOnce();
    expect(closeHistoryGroup).toHaveBeenCalledWith(synchronized);
    expect(outcome.boundary).toBeUndefined();
    expect(outcome.command).toEqual({
      status: "committed",
      eventKind: "closeHistoryGroup",
      snapshot: { lineage: "adapter-tests", revision: "0" },
      render: undefined,
    });
    expect(adapter.snapshot.revision).toBe("0");
    expect(base.host.textContent).toBe("a");
    adapter.dispose();
  });

  it("rejects a result claiming an atomic history boundary when none was requested", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const successor = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const forged = commandResult({
      status: "disabled",
      successor,
      disabledActionId: "breditor/insert-text",
      disabledReasonCode: "breditor/not-enabled",
      activation: "inactive",
      historyGroupClosedBefore: true,
    });
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({ setSelection: [syncResult.view], stringAction: [forged.view] }),
      initial,
      { renderer: base.renderer, rendered: base.rendered, selectionBridge: bridge },
    );

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /history-boundary result is invalid/u,
    );
    expect(adapter.state).toBe("faulted");
    expect(forged.free).toHaveBeenCalledOnce();
    expect(successor.free).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("rejects an unchanged action result which the Rust action ABI cannot produce", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const unchangedObservation = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const malformed = commandResult({
      status: "unchanged",
      successor: unchangedObservation,
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [malformed.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /unchanged result violated/u,
    );
    expect(adapter.state).toBe("faulted");
    expect(malformed.free).toHaveBeenCalledOnce();
    expect(unchangedObservation.free).toHaveBeenCalledOnce();
    expect(synchronized.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(synchronized.free).toHaveBeenCalledOnce();
  });

  it("faults a commit-bearing action which omits its projection update", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const malformed = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [malformed.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /omitted its projection update/u,
    );
    expect(adapter.state).toBe("faulted");
    expect(malformed.free).toHaveBeenCalledOnce();
    expect(committed.free).toHaveBeenCalledOnce();
    expect(adapter.snapshot.revision).toBe("0");
    adapter.dispose();
  });

  it("rejects aliased generated handles and frees the alias only once", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const free = vi.fn();
    let aliasedResult: WasmCommandResultView;
    aliasedResult = {
      status: "unchanged",
      historyGroupClosedBefore: false,
      eventKind: undefined,
      disabledActionId: undefined,
      disabledReasonCode: undefined,
      activation: undefined,
      error: undefined,
      matchesProfileGeneration: matchesTestProfile,
      observation: () => aliasedResult as unknown as WasmCommandObservationView,
      projectionUpdate: () => undefined,
      free,
    };
    const engine = engineQueues({ setSelection: [aliasedResult] });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(/alias/u);
    expect(adapter.state).toBe("faulted");
    expect(free).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("never frees a current observation smuggled out as a nested projection", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const update = projectionUpdate(base.projection, projection(1, "ax"));
    const hostileUpdate: SemanticProjectionUpdateView = {
      ...update.view,
      takeProjection: () => synchronized as unknown as SemanticProjectionView,
    };
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: hostileUpdate,
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /projection update is invalid/u,
    );
    expect(adapter.state).toBe("faulted");
    expect(synchronized.free).not.toHaveBeenCalled();
    expect(committed.free).toHaveBeenCalledOnce();
    expect(actionResult.free).toHaveBeenCalledOnce();
    expect(update.free).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(synchronized.free).toHaveBeenCalledOnce();
  });

  it("routes an explicit none selection through clearSelection", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    expect(bridge.write(base.rendered, selected).ok).toBe(true);
    const initial = observation(0);
    const cleared = observation(0);
    const finished = observation(0);
    const clearResult = commandResult({ status: "unchanged", successor: cleared });
    const actionResult = disabledActionResult(finished);
    const engine = engineQueues({
      setSelection: [clearResult.view],
      stringAction: [actionResult.view],
    });
    const clearSelection = vi.spyOn(engine, "clearSelection");
    const setRangeSelection = vi.spyOn(engine, "setRangeSelection");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const request = stringActionRequest(
      adapter.deliveryToken(),
      noSelectionSync(),
      { kind: "api", detail: "clear-selection-test" },
      "breditor/insert-text",
      "x",
    );

    expect(adapter.execute(request).status).toBe("delivered");
    expect(clearSelection).toHaveBeenCalledWith(initial);
    expect(setRangeSelection).not.toHaveBeenCalled();
    expect(window.getSelection()?.rangeCount).toBe(0);
    adapter.dispose();
  });

  it("faults on an inexact successor and frees untrusted handles without freeing authority", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const jumped = observation(1);
    const malformed = commandResult({ status: "unchanged", successor: jumped });
    const engine = engineQueues({ setSelection: [malformed.view] });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /correlation contract/u,
    );
    expect(adapter.state).toBe("faulted");
    expect(jumped.free).toHaveBeenCalledOnce();
    expect(malformed.free).toHaveBeenCalledOnce();
    expect(initial.free).not.toHaveBeenCalled();
    expect(adapter.restoreCanonicalRender()).toEqual({
      ok: false,
      reason: "adapterUnavailable",
    });
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("blocks direct adapter reentrancy while the outer delivery owns its base", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const actionObservation = observation(0);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const actionResult = disabledActionResult(actionObservation);
    let adapter: BreditorWasmCommandAdapter;
    let request: EngineCommandRequest;
    const reentrantFailure = vi.fn();
    const engine = engineQueues({
      setRangeSelection: () => {
        try {
          adapter.execute(request);
        } catch (error) {
          reentrantFailure(error);
        }
        return syncResult.view;
      },
      stringAction: [actionResult.view],
    });
    adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    request = actionRequest(adapter, selected);

    expect(adapter.execute(request).status).toBe("delivered");
    expect(reentrantFailure).toHaveBeenCalledOnce();
    expect(String(reentrantFailure.mock.calls[0]?.[0])).toContain("executing");
    expect(adapter.state).toBe("live");
    adapter.dispose();
  });

  it("retains a valid successor after DOM failure and restores a canonical render", () => {
    const base = projectionFixture(0, "a");
    const resultProjection = projection(1, "ax");
    const bridge = new FailOnWriteBridge(3);
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: projectionUpdate(base.projection, resultProjection).view,
    });
    const afterAction = selectionResult(selectionView(1, 2));
    const afterRestore = selectionResult(selectionView(1, 2));
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [afterAction.view, afterRestore.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

    expect(() =>
      adapter.execute(
        stringActionRequest(
          adapter.deliveryToken(),
          rangeSelectionSync(selected),
          { kind: "beforeinput", detail: "insertText" },
          "breditor/insert-text",
          "x",
        ),
      ),
    ).toThrow(/canonical DOM restoration/u);
    expect(adapter.state).toBe("reconcile");
    expect(adapter.snapshot.revision).toBe("1");
    expect(base.host.textContent).toBe("ax");
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "action",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(adapter.restoreCanonicalRender().ok).toBe(true);
    expect(adapter.state).toBe("live");
    expect(adapter.deliveryToken().snapshotRevision).toBe("1");
    adapter.dispose();
  });

  it.each(["returns a failure", "throws"] as const)(
    "enters reconciliation when renderer.update %s and restores the retained projection",
    (failureMode) => {
    const base = projectionFixture(0, "a");
    const resultProjection = projection(1, "ax");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const update = projectionUpdate(base.projection, resultProjection);
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: update.view,
    });
    const afterRestore = selectionResult(selectionView(1, 2));
    const checkpoint = checkpointResult(1);
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [afterRestore.view],
      sessionCheckpoints: [checkpoint.view],
    });
    const updateRender = vi.spyOn(base.renderer, "update");
    if (failureMode === "throws") {
      updateRender.mockImplementationOnce(() => {
        throw new Error("host DOM write threw");
      });
    } else {
      updateRender.mockReturnValueOnce({
        ok: false,
        error: {
          code: "renderer.dom_write_failed",
          message: "The DOM projection could not be installed.",
        },
      });
    }
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);
    const queueObserver = vi.fn();
    const queue = new BreditorCommandQueue(adapter.commandExecutor, {
      observer: queueObserver,
    });

    expect(queue.submit(actionRequest(adapter, selected))).toEqual({
      status: "failed",
      failure: { code: "command_queue.executor_threw", sequence: 1n },
    });
    expect(updateRender).toHaveBeenCalledOnce();
    expect(queueObserver).not.toHaveBeenCalled();
    expect(adapter.state).toBe("reconcile");
    expect(adapter.snapshot.revision).toBe("1");
    expect(adapter.rendered).toBe(base.rendered);
    expect(base.host.textContent).toBe("a");
    expect(update.free).toHaveBeenCalledOnce();
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "action",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    expect(adapter.sessionCheckpointReadPort.read()).toMatchObject({
      ok: true,
      checkpoint: {
        snapshot: { lineage: "adapter-tests", revision: "1" },
      },
    });
    expect(checkpoint.free).toHaveBeenCalledOnce();

    const restored = adapter.restoreCanonicalRender();
    expect(restored.ok).toBe(true);
    expect(adapter.state).toBe("live");
    expect(adapter.rendered).not.toBe(base.rendered);
    expect(base.host.textContent).toBe("ax");
    expect(adapter.deliveryToken().snapshotRevision).toBe("1");
    expect(afterRestore.free).toHaveBeenCalledOnce();
    expect(afterRestore.selectionFree).toHaveBeenCalledOnce();
      queue.dispose();
      adapter.dispose();
    },
  );

  it("faults when projection-update metadata disagrees with its taken result snapshot", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const mismatchedUpdate = projectionUpdate(base.projection, projection(1, "ax"));
    const mismatchedView: SemanticProjectionUpdateView = {
      ...mismatchedUpdate.view,
      resultRevision: "2",
    };
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: mismatchedView,
    });
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
    });
    const renderUpdate = vi.spyOn(base.renderer, "update");
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(
      /projection update is invalid/u,
    );
    expect(adapter.state).toBe("faulted");
    expect(adapter.snapshot.revision).toBe("0");
    expect(renderUpdate).not.toHaveBeenCalled();
    expect(mismatchedUpdate.free).toHaveBeenCalledOnce();
    expect(actionResult.free).toHaveBeenCalledOnce();
    expect(committed.free).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it.each(["throws", "returns a rejected thenable"] as const)(
    "attempts every cleanup and faults if a generated free %s",
    async (failureMode) => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: projectionUpdate(base.projection, projection(1, "ax")).view,
      ...(failureMode === "throws"
        ? { freeThrows: true }
        : { freeResult: Promise.reject(new Error("free rejected")) }),
    });
    const selectionRead = selectionResult(selectionView(1, 2));
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [selectionRead.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const commits = vi.fn();
    adapter.observeCoreCommits(commits);

    expect(() =>
      adapter.execute(
        stringActionRequest(
          adapter.deliveryToken(),
          rangeSelectionSync(selected),
          { kind: "beforeinput", detail: "insertText" },
          "breditor/insert-text",
          "x",
        ),
      ),
    ).toThrow(failureMode === "throws" ? /free failed/u : /returned a value/u);
    expect(actionResult.free).toHaveBeenCalledOnce();
    expect(synchronized.free).toHaveBeenCalledOnce();
    expect(adapter.state).toBe("faulted");
    expect(adapter.snapshot.revision).toBe("1");
    expect(commits).toHaveBeenCalledExactlyOnceWith({
      eventKind: "action",
      snapshot: { lineage: "adapter-tests", revision: "1" },
    });
    adapter.dispose();
    expect(committed.free).toHaveBeenCalledOnce();
    await Promise.resolve();
  },
  );

  it("releases a newly installed render when a hostile selection result throws", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: projectionUpdate(base.projection, projection(1, "ax")).view,
    });
    const selectionFree = vi.fn();
    const hostileSelection = Object.defineProperties(
      {
        error: undefined,
        matchesProfileGeneration: matchesTestProfile,
        takeSelection: () => undefined,
        free: selectionFree,
      },
      {
        status: {
          get() {
            throw new Error("hostile selection status");
          },
        },
      },
    ) as unknown as WasmSelectionResultView;
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [hostileSelection],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const release = vi.spyOn(base.renderer, "release");

    expect(() =>
      adapter.execute(
        stringActionRequest(
          adapter.deliveryToken(),
          rangeSelectionSync(selected),
          { kind: "beforeinput", detail: "insertText" },
          "breditor/insert-text",
          "x",
        ),
      ),
    ).toThrow(/hostile selection status/u);
    expect(adapter.state).toBe("faulted");
    expect(release).toHaveBeenCalledOnce();
    expect(release.mock.calls[0]?.[0]).not.toBe(base.rendered);
    expect(selectionFree).toHaveBeenCalledOnce();
    expect(committed.free).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("never frees an outer command result smuggled out as a nested selection", () => {
    const base = projectionFixture(0, "a");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    bridge.write(base.rendered, selected);
    const initial = observation(0);
    const synchronized = observation(0);
    const committed = observation(1);
    const syncResult = commandResult({ status: "unchanged", successor: synchronized });
    const update = projectionUpdate(base.projection, projection(1, "ax"));
    const actionResult = commandResult({
      status: "committed",
      eventKind: "action",
      successor: committed,
      update: update.view,
    });
    const hostileSelection = selectionResult(
      actionResult.view as unknown as SemanticSelectionView,
    );
    const engine = engineQueues({
      setSelection: [syncResult.view],
      stringAction: [actionResult.view],
      selection: [hostileSelection.view],
    });
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const release = vi.spyOn(base.renderer, "release");

    expect(() => adapter.execute(actionRequest(adapter, selected))).toThrow(/alias/u);
    expect(adapter.state).toBe("faulted");
    expect(actionResult.free).toHaveBeenCalledOnce();
    expect(hostileSelection.free).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(synchronized.free).not.toHaveBeenCalled();
    adapter.dispose();
    expect(synchronized.free).toHaveBeenCalledOnce();
    expect(committed.free).toHaveBeenCalledOnce();
  });

  it("reserves adapter authority and restores the exact leased selection without core work", () => {
    const base = projectionFixture(0, "abc");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const engine = engineQueues({});
    const adapter = new BreditorWasmCommandAdapter(engine, initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const normal = adapter.deliveryToken();
    const request = stringActionRequest(
      normal,
      rangeSelectionSync(selected),
      { kind: "api", detail: "stale-during-composition" },
      "breditor/insert-text",
      "x",
    );

    expect(() => adapter.beginCompositionLease(normal, selected, 0n)).toThrow(
      /invalid or stale/u,
    );
    expect(() =>
      adapter.beginCompositionLease(
        normal,
        selected,
        18_446_744_073_709_551_616n,
      )
    ).toThrow(/invalid or stale/u);
    expect(adapter.acceptsDeliveryToken(normal)).toBe(true);

    const lease = adapter.beginCompositionLease(normal, selected, 7n);

    expect(adapter.state).toBe("composition");
    expect(lease.selection).toBe(selected);
    expect(lease.sessionId).toBe(7n);
    expect(lease.observationEpoch).toBe(1n);
    expect(adapter.acceptsDeliveryToken(normal)).toBe(false);
    expect(() => adapter.deliveryToken()).toThrow(/composition/u);
    expect(() => adapter.execute(request)).toThrow(/composition/u);

    const restored = adapter.restoreCompositionLease(lease);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error(restored.reason);
    expect(restored.selection).toBe(selected);
    expect(restored.rendered).toBe(adapter.rendered);
    expect(restored.rendered).not.toBe(base.rendered);
    expect(restored.delivery.observationEpoch).toBe(2n);
    expect(adapter.acceptsDeliveryToken(restored.delivery)).toBe(true);
    expect(initial.free).not.toHaveBeenCalled();
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(/live/u);
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("begins composition from native host facts despite hostile own shadows", () => {
    const base = projectionFixture(0, "abc");
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    const delivery = adapter.deliveryToken();
    const ownerDocument = base.host.ownerDocument;
    const isConnectedShadow = vi.fn(() => true);
    const ownerDocumentShadow = vi.fn(() => {
      throw new Error("own ownerDocument must not be read");
    });
    const defaultViewShadow = vi.fn(() => {
      throw new Error("own defaultView must not be read");
    });
    Object.defineProperties(base.host, {
      isConnected: { configurable: true, get: isConnectedShadow },
      ownerDocument: { configurable: true, get: ownerDocumentShadow },
    });
    Object.defineProperty(ownerDocument, "defaultView", {
      configurable: true,
      get: defaultViewShadow,
    });

    const lease = adapter.beginCompositionLease(delivery, selected, 8n);

    expect(lease.host).toBe(base.host);
    expect(isConnectedShadow).not.toHaveBeenCalled();
    expect(ownerDocumentShadow).not.toHaveBeenCalled();
    expect(defaultViewShadow).not.toHaveBeenCalled();
    expect(Reflect.deleteProperty(base.host, "isConnected")).toBe(true);
    expect(Reflect.deleteProperty(base.host, "ownerDocument")).toBe(true);
    expect(Reflect.deleteProperty(ownerDocument, "defaultView")).toBe(true);
    adapter.dispose();
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it("rotates one refined lease while foreign, old, and duplicate tokens stay inert", () => {
    const base = projectionFixture(0, "abc");
    const bridge = new BreditorDomSelectionBridge();
    const initialSelection = selection(base.projection, 1);
    const refinedSelection = selection(base.projection, 2);
    const initial = observation(0);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const normal = adapter.deliveryToken();
    const foreign = issueCompositionDeliveryToken(
      base.projection,
      base.rendered,
      initialSelection,
      1n,
      11n,
      Symbol("foreign-composition-adapter"),
    );
    const lease = adapter.beginCompositionLease(normal, initialSelection, 11n);

    expect(() => adapter.refineCompositionLease(foreign, refinedSelection)).toThrow(
      /stale or foreign/u,
    );
    expect(() => adapter.openCompositionDomLease(foreign)).toThrow(
      /stale or foreign/u,
    );
    expect(adapter.state).toBe("composition");
    const refined = adapter.refineCompositionLease(lease, refinedSelection);
    expect(refined).not.toBe(lease);
    expect(refined.selection).toBe(refinedSelection);
    expect(refined.observationEpoch).toBe(lease.observationEpoch);
    expect(refined.sessionId).toBe(lease.sessionId);
    expect(() => adapter.openCompositionDomLease(lease)).toThrow(/stale or foreign/u);
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(/stale or foreign/u);
    expect(adapter.openCompositionDomLease(refined)).toBe(true);
    expect(() => adapter.openCompositionDomLease(refined)).toThrow(/cannot be opened/u);
    expect(() => adapter.refineCompositionLease(refined, initialSelection)).toThrow(
      /cannot be refined/u,
    );

    const restored = adapter.restoreCompositionLease(refined);
    expect(restored.ok && restored.selection).toBe(refinedSelection);
    expect(() => adapter.restoreCompositionLease(refined)).toThrow(/live/u);
    adapter.dispose();
  });

  it("discards native DOM drift and returns a fresh canonical generation", async () => {
    const base = projectionFixture(0, "abc");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 2);
    const initial = observation(0);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      1n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);
    expect(base.rendered.current).toBe(false);
    const paragraph = base.host.firstChild;
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("composition fixture paragraph is missing");
    }
    paragraph.replaceChildren(document.createTextNode("native IME text"));
    await Promise.resolve();
    expect(base.rendered.current).toBe(false);

    const restored = adapter.restoreCompositionLease(lease);

    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error(restored.reason);
    expect(base.host.textContent).toBe("abc");
    expect(restored.rendered.current).toBe(true);
    expect(restored.rendered.rendererGeneration).toBeGreaterThan(
      base.rendered.rendererGeneration,
    );
    const observed = bridge.read(restored.rendered);
    expect(observed.ok && observed.value.kind === "range"
      ? observed.value.selection
      : undefined).toBe(selected);
    adapter.dispose();
  });

  it("rejects native DOM drift unless the exact renderer lease was opened", () => {
    const base = projectionFixture(0, "abc");
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: new BreditorDomSelectionBridge(),
    });
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      5n,
    );
    const render = vi.spyOn(base.renderer, "render");
    base.host.firstChild?.appendChild(document.createTextNode("unleased drift"));

    expect(() => adapter.restoreCompositionLease(lease)).toThrow(/stale or foreign/u);
    expect(adapter.state).toBe("composition");
    expect(render).not.toHaveBeenCalled();
    expect(() => adapter.dispose()).not.toThrow();
    expect(adapter.state).toBe("disposed");
    expect(base.host.textContent).toBe("abc");
    expect(initial.free).toHaveBeenCalledOnce();
  });

  it.each(["superseded", "released"] as const)(
    "recovers an exact lease after renderer ownership is %s without core work",
    (loss) => {
      const base = projectionFixture(0, "abc");
      const bridge = new BreditorDomSelectionBridge();
      const selected = selection(base.projection, 2);
      const initial = observation(0);
      // Every engine method rejects when its queue is empty. A successful
      // recovery therefore also proves that recovery made no core call.
      const adapter = new BreditorWasmCommandAdapter(
        engineQueues({}),
        initial,
        {
          renderer: base.renderer,
          rendered: base.rendered,
          selectionBridge: bridge,
        },
      );
      const foreign = issueCompositionDeliveryToken(
        base.projection,
        base.rendered,
        selected,
        1n,
        6n,
        Symbol("foreign-recovery-authority"),
      );
      const lease = adapter.beginCompositionLease(
        adapter.deliveryToken(),
        selected,
        6n,
      );
      expect(adapter.openCompositionDomLease(lease)).toBe(true);
      if (loss === "superseded") {
        const external = base.renderer.render(
          base.host,
          projection(99, "external"),
        );
        expect(external.ok).toBe(true);
      } else {
        expect(base.renderer.release(base.rendered)).toBe(true);
      }

      expect(() => adapter.restoreCompositionLease(lease)).toThrow(
        /stale or foreign/u,
      );
      expect(() => adapter.recoverCompositionLease(foreign)).toThrow(
        /stale or foreign/u,
      );
      expect(adapter.state).toBe("composition");

      const recovered = adapter.recoverCompositionLease(lease);

      expect(recovered.ok).toBe(true);
      if (!recovered.ok) throw new Error(recovered.reason);
      expect(recovered.selection).toBe(selected);
      expect(recovered.rendered).toBe(adapter.rendered);
      expect(base.host.textContent).toBe("abc");
      expect(adapter.acceptsDeliveryToken(recovered.delivery)).toBe(true);
      const observed = bridge.read(recovered.rendered);
      expect(observed.ok && observed.value.kind === "range"
        ? observed.value.selection
        : undefined).toBe(selected);
      expect(() => adapter.recoverCompositionLease(lease)).toThrow(/live/u);
      adapter.dispose();
      expect(initial.free).toHaveBeenCalledOnce();
    },
  );

  it("spends disconnected recovery before a redacted selection-write failure", () => {
    const base = projectionFixture(0, "abc");
    const bridge = new FailOnWriteBridge(1);
    const selected = selection(base.projection, 1);
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({}),
      observation(0),
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: bridge,
      },
    );
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      8n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);
    base.host.remove();
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(
      /stale or foreign/u,
    );
    const render = vi.spyOn(base.renderer, "render");

    expect(adapter.recoverCompositionLease(lease)).toEqual({
      ok: false,
      reason: "selectionWriteFailed",
    });
    expect(render).toHaveBeenCalledOnce();
    expect(adapter.state).toBe("reconcile");
    expect(() => adapter.recoverCompositionLease(lease)).toThrow(/reconcile/u);
    adapter.dispose();
  });

  it("spends recovery before a redacted full-render failure", () => {
    const base = projectionFixture(0, "abc");
    const selected = selection(base.projection, 1);
    const adapter = new BreditorWasmCommandAdapter(
      engineQueues({}),
      observation(0),
      {
        renderer: base.renderer,
        rendered: base.rendered,
        selectionBridge: new BreditorDomSelectionBridge(),
      },
    );
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      9n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);
    expect(base.renderer.release(base.rendered)).toBe(true);
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(
      /stale or foreign/u,
    );
    vi.spyOn(base.renderer, "render").mockReturnValueOnce({
      ok: false,
      error: {
        code: "renderer.dom_write_failed",
        message: "private recovery detail",
      },
    });

    expect(adapter.recoverCompositionLease(lease)).toEqual({
      ok: false,
      reason: "renderFailed",
    });
    expect(adapter.state).toBe("reconcile");
    expect(() => adapter.recoverCompositionLease(lease)).toThrow(/reconcile/u);
    adapter.dispose();
  });

  it("spends a lease before a redacted renderer restoration failure", () => {
    const base = projectionFixture(0, "abc");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), observation(0), {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      2n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);
    const discard = vi.spyOn(base.renderer, "discardCompositionDomLease");
    vi.spyOn(base.renderer, "restoreCompositionDomLease").mockReturnValueOnce({
      ok: false,
      error: {
        code: "renderer.dom_write_failed",
        message: "private renderer detail",
      },
    });

    expect(adapter.restoreCompositionLease(lease)).toEqual({
      ok: false,
      reason: "renderFailed",
    });
    expect(adapter.state).toBe("reconcile");
    expect(discard).toHaveBeenCalledOnce();
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(/reconcile/u);
    adapter.dispose();
  });

  it("retains the restored render but requires reconciliation when selection write fails", () => {
    const base = projectionFixture(0, "abc");
    const bridge = new FailOnWriteBridge(1);
    const selected = selection(base.projection, 1);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), observation(0), {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      3n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);

    expect(adapter.restoreCompositionLease(lease)).toEqual({
      ok: false,
      reason: "selectionWriteFailed",
    });
    expect(adapter.state).toBe("reconcile");
    expect(adapter.rendered).not.toBe(base.rendered);
    expect(adapter.rendered.current).toBe(true);
    expect(() => adapter.restoreCompositionLease(lease)).toThrow(/reconcile/u);
    adapter.dispose();
  });

  it("disposes an active lease by restoring and discarding its native DOM", async () => {
    const base = projectionFixture(0, "abc");
    const bridge = new BreditorDomSelectionBridge();
    const selected = selection(base.projection, 1);
    const initial = observation(0);
    const adapter = new BreditorWasmCommandAdapter(engineQueues({}), initial, {
      renderer: base.renderer,
      rendered: base.rendered,
      selectionBridge: bridge,
    });
    const lease = adapter.beginCompositionLease(
      adapter.deliveryToken(),
      selected,
      4n,
    );
    expect(adapter.openCompositionDomLease(lease)).toBe(true);
    const paragraph = base.host.firstChild;
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("composition fixture paragraph is missing");
    }
    paragraph.textContent = "uncommitted private composition";
    await Promise.resolve();

    adapter.dispose();

    expect(adapter.state).toBe("disposed");
    expect(base.host.textContent).toBe("abc");
    expect(adapter.rendered.current).toBe(false);
    expect(initial.free).toHaveBeenCalledOnce();
  });
});

function projectionFixture(revision: number, text: string): ProjectionFixture {
  const documentProjection = projection(revision, text);
  const renderer = new BreditorDomRenderer();
  const host = document.createElement("div");
  document.body.append(host);
  const result = renderer.render(host, documentProjection);
  if (!result.ok) throw new Error(result.error.code);
  return { projection: documentProjection, renderer, rendered: result.value.rendered, host };
}

function projection(revision: number, text: string): BaseDocumentProjection {
  const result = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "adapter-tests", revision: String(revision) },
    paragraphs: [{ runs: [{ text, strong: false }] }],
  });
  if (!result.ok) throw new Error(result.error.code);
  associateProjectionWithProfileGeneration(
    result.value,
    TEST_PROFILE_GENERATION,
  );
  return result.value;
}

function selection(documentProjection: BaseDocumentProjection, offset: number): BaseRangeSelection {
  const result = BaseRangeSelection.create(documentProjection, {
    kind: "range",
    anchor: {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: offset,
      affinity: "before",
    },
    focus: {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: offset,
      affinity: "before",
    },
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function observation(revision: number): TrackedObservation {
  return {
    snapshotLineage: "adapter-tests",
    snapshotRevision: String(revision),
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    free: vi.fn(),
  };
}

function rejectedGeneratedHandle<T extends object>(
  properties: Readonly<Record<string, unknown>> = {},
): Readonly<{ view: T; free: ReturnType<typeof vi.fn> }> {
  const free = vi.fn();
  const rejected = Promise.reject(new Error("generated handle rejection must be contained"));
  Object.assign(rejected, properties, { free });
  return { view: rejected as unknown as T, free };
}

function actionRequest(
  adapter: BreditorWasmCommandAdapter,
  selected: BaseRangeSelection,
): EngineCommandRequest {
  return stringActionRequest(
    adapter.deliveryToken(),
    rangeSelectionSync(selected),
    { kind: "api", detail: "adapter-test" },
    "breditor/insert-text",
    "x",
  );
}

function commandResult(input: Readonly<{
  status: "committed" | "disabled" | "unchanged";
  eventKind?: WasmCommandResultView["eventKind"];
  disabledActionId?: string;
  disabledReasonCode?: string;
  activation?: WasmCommandResultView["activation"];
  successor: WasmCommandObservationView;
  update?: SemanticProjectionUpdateView;
  historyGroupClosedBefore?: boolean;
  freeThrows?: boolean;
  freeResult?: unknown;
}>): TrackedResult {
  const free = input.freeThrows
    ? vi.fn(() => {
        throw new Error("free failed");
      })
    : input.freeResult === undefined
      ? vi.fn()
      : vi.fn(() => input.freeResult);
  return {
    free,
    view: {
      status: input.status,
      historyGroupClosedBefore: input.historyGroupClosedBefore ?? false,
      eventKind: input.eventKind,
      disabledActionId: input.disabledActionId,
      disabledReasonCode: input.disabledReasonCode,
      activation: input.activation,
      error: undefined,
      matchesProfileGeneration: (generation) =>
        generation === TEST_PROFILE_GENERATION,
      observation: () => input.successor,
      projectionUpdate: () => input.update,
      free,
    },
  };
}

function disabledActionResult(successor: WasmCommandObservationView): TrackedResult {
  return commandResult({
    status: "disabled",
    successor,
    disabledActionId: "breditor/insert-text",
    disabledReasonCode: "breditor/not-enabled",
    activation: "inactive",
  });
}

function commandError(code: string) {
  const errorFree = vi.fn();
  const error: WasmCommandErrorView = {
    code,
    message: "the command was rejected",
    free: errorFree,
  };
  const free = vi.fn();
  const view: WasmCommandResultView = {
    status: "error",
    historyGroupClosedBefore: false,
    eventKind: undefined,
    disabledActionId: undefined,
    disabledReasonCode: undefined,
    activation: undefined,
    error,
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    observation: () => undefined,
    projectionUpdate: () => undefined,
    free,
  };
  return { view, free, errorFree };
}

function intentResult(input: Readonly<{
  status: "committed" | "blocked" | "unhandled";
  successor: WasmCommandObservationView;
  intentId?: string;
  bindingId?: string;
  actionId?: string;
  bindingPriority?: number;
  blockedReasonCode?: string;
  blockedActivation?: WasmIntentResultView["blockedActivation"];
  blockedValueStatus?: WasmIntentResultView["blockedValueStatus"];
  blockedValueContractName?: string;
  blockedValueContractVersion?: number;
  fallthroughs?: readonly Readonly<{
    bindingId: string;
    actionId: string;
    priority: number;
    reasonCode: string;
  }>[];
  update?: SemanticProjectionUpdateView;
  historyGroupClosedBefore?: boolean;
  error?: WasmCommandErrorView;
  matchesGeneration?: boolean;
  freeResult?: unknown;
}>): TrackedIntentResult {
  const fallthroughs = input.fallthroughs ?? [];
  const free = input.freeResult === undefined
    ? vi.fn()
    : vi.fn(() => input.freeResult);
  const view: WasmIntentResultView = {
    status: input.status,
    historyGroupClosedBefore: input.historyGroupClosedBefore ?? false,
    intentId: input.intentId ?? TEST_INTENT_ID,
    bindingId: input.bindingId,
    actionId: input.actionId,
    bindingPriority: input.bindingPriority,
    blockedReasonCode: input.blockedReasonCode,
    blockedActivation: input.blockedActivation,
    blockedValueStatus: input.blockedValueStatus,
    blockedValueContractName: input.blockedValueContractName,
    blockedValueContractVersion: input.blockedValueContractVersion,
    fallthroughCount: fallthroughs.length,
    error: input.error,
    matchesProfileGeneration: (generation) =>
      input.matchesGeneration !== false && generation === TEST_PROFILE_GENERATION,
    observation: () => input.successor,
    projectionUpdate: () => input.update,
    blockedReasonDetailJson: () => {
      throw new Error("unused intent detail helper");
    },
    blockedValueJson: () => {
      throw new Error("unused intent value helper");
    },
    commitJson: () => {
      throw new Error("unused intent commit helper");
    },
    fallthroughBindingId: (index) => fallthroughs[index]?.bindingId,
    fallthroughActionId: (index) => fallthroughs[index]?.actionId,
    fallthroughPriority: (index) => fallthroughs[index]?.priority,
    fallthroughReasonCode: (index) => fallthroughs[index]?.reasonCode,
    fallthroughReasonDetailJson: () => {
      throw new Error("unused intent fallthrough detail helper");
    },
    free,
  };
  return { view, free };
}

function intentError(code: string) {
  const errorFree = vi.fn();
  const error: WasmCommandErrorView = {
    code,
    message: "the semantic intent was rejected",
    free: errorFree,
  };
  const free = vi.fn();
  const view: WasmIntentResultView = {
    status: "error",
    historyGroupClosedBefore: false,
    intentId: undefined,
    bindingId: undefined,
    actionId: undefined,
    bindingPriority: undefined,
    blockedReasonCode: undefined,
    blockedActivation: undefined,
    blockedValueStatus: undefined,
    blockedValueContractName: undefined,
    blockedValueContractVersion: undefined,
    fallthroughCount: 0,
    error,
    matchesProfileGeneration: matchesTestProfile,
    observation: () => undefined,
    projectionUpdate: () => undefined,
    blockedReasonDetailJson: () => {
      throw new Error("unused intent detail helper");
    },
    blockedValueJson: () => {
      throw new Error("unused intent value helper");
    },
    commitJson: () => {
      throw new Error("unused intent commit helper");
    },
    fallthroughBindingId: () => undefined,
    fallthroughActionId: () => undefined,
    fallthroughPriority: () => undefined,
    fallthroughReasonCode: () => undefined,
    fallthroughReasonDetailJson: () => {
      throw new Error("unused intent fallthrough detail helper");
    },
    free,
  };
  return { view, free, errorFree };
}

function projectionUpdate(
  base: BaseDocumentProjection,
  result: BaseDocumentProjection,
) {
  let projectionTaken = false;
  const free = vi.fn();
  const view: SemanticProjectionUpdateView = {
    baseLineage: base.snapshot.lineage,
    baseRevision: base.snapshot.revision,
    resultLineage: result.snapshot.lineage,
    resultRevision: result.snapshot.revision,
    impact: "textContainers",
    affectedParagraphCount: 1,
    oldChildStart: undefined,
    oldChildEnd: undefined,
    newChildStart: undefined,
    newChildEnd: undefined,
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    affectedParagraphIndex: (index) => index === 0 ? 0 : undefined,
    takeProjection: () => {
      if (projectionTaken) return undefined;
      projectionTaken = true;
      return projectionView(result);
    },
    free,
  };
  return { view, free };
}

function projectionView(documentProjection: BaseDocumentProjection): SemanticProjectionView {
  const text = documentProjection.paragraphs[0]?.runs[0]?.text ?? "";
  return {
    schemaName: "breditor/base",
    schemaVersion: 1,
    schemaFingerprint: TEST_SCHEMA_FINGERPRINT,
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    snapshotLineage: documentProjection.snapshot.lineage,
    snapshotRevision: documentProjection.snapshot.revision,
    nodeCount: 3,
    rootIndex: 0,
    nodeKind: (index) => index === 0 || index === 1 ? "element" : index === 2 ? "text" : undefined,
    elementType: (index) => index === 0
      ? "breditor/document"
      : index === 1
        ? "breditor/paragraph"
        : undefined,
    childCount: (index) => index === 0 || index === 1 ? 1 : undefined,
    childAt: (index, ordinal) => ordinal !== 0
      ? undefined
      : index === 0
        ? 1
        : index === 1
          ? 2
          : undefined,
    text: (index) => index === 2 ? text : undefined,
    formatCount: (index) => index === 2 ? 0 : undefined,
    formatType: () => undefined,
    formatPropertyCount: () => undefined,
    formatPropertyName: () => undefined,
    formatPropertyValueKind: () => undefined,
    formatPropertyBoolean: () => undefined,
    formatPropertyInteger: () => undefined,
    formatPropertyString: () => undefined,
    free: vi.fn(),
  };
}

function selectionView(revision: number, offset: number): SemanticSelectionView {
  return {
    snapshotLineage: "adapter-tests",
    snapshotRevision: String(revision),
    kind: "range",
    anchorPointKind: "text",
    anchorNodeIndex: 2,
    anchorOffset: offset,
    anchorAffinity: "before",
    focusPointKind: "text",
    focusNodeIndex: 2,
    focusOffset: offset,
    focusAffinity: "before",
    rangeOrder: "collapsed",
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    free: vi.fn(),
  };
}

function selectionResult(view: SemanticSelectionView) {
  let taken = false;
  const free = vi.fn();
  const result: WasmSelectionResultView = {
    status: "selection",
    error: undefined,
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    takeSelection: () => {
      if (taken) return undefined;
      taken = true;
      return view;
    },
    free,
  };
  return {
    view: result,
    free,
    selectionFree: view.free,
  };
}

function emptyActionStateResult(revision: number) {
  const valueFree = vi.fn();
  const valueResult: WasmActionStateStringResultView = {
    status: "absent",
    error: undefined,
    takeValue: () => undefined,
    free: valueFree,
  };
  const snapshotFree = vi.fn();
  const snapshot: WasmActionStateSnapshotView = {
    snapshotLineage: "adapter-tests",
    snapshotRevision: String(revision),
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    entryCount: 0,
    changedCount: 0,
    entryId: () => undefined,
    entryStatus: () => undefined,
    entryActivation: () => undefined,
    entryReasonCode: () => undefined,
    entryValueStatus: () => undefined,
    entryValueContractName: () => undefined,
    entryValueContractVersion: () => undefined,
    entryUniformValueJson: () => valueResult,
    changedId: () => undefined,
    free: snapshotFree,
  };
  const free = vi.fn();
  let taken = false;
  const view: WasmActionStatesResultView = {
    status: "full",
    error: undefined,
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    takeSnapshot: () => {
      if (taken) return undefined;
      taken = true;
      return snapshot;
    },
    free,
  };
  return { view, free, snapshotFree, valueFree };
}

function profileDescriptorWithActionState(): BrowserCompiledProfileDescriptor {
  const noEntry = (): undefined => undefined;
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "breditor/base",
    schemaVersion: 1,
    schemaFingerprint: TEST_SCHEMA_FINGERPRINT,
    formatCount: 1,
    intentCount: 1,
    actionStateCount: 1,
    inlineFormatSetCount: 0,
    matchesProfileGeneration: matchesTestProfile,
    formatKind: (index) => index === 0 ? "breditor/strong" : undefined,
    formatRevision: (index) => index === 0 ? 1 : undefined,
    ...PROPERTY_FREE_FORMAT_METHODS,
    intentId: (index) => index === 0 ? TEST_INTENT_ID : undefined,
    intentInputKind: (index) => index === 0 ? "none" : undefined,
    intentInputContractName: noEntry,
    intentInputContractVersion: noEntry,
    intentActivationContract: (index) => index === 0 ? "tracked" : undefined,
    intentValueContractName: noEntry,
    intentValueContractVersion: noEntry,
    actionStateId: (index) => index === 0 ? "breditor/control-bold" : undefined,
    actionStateSourceKind: (index) => index === 0 ? "routed" : undefined,
    actionStateSourceActionId: noEntry,
    actionStateSourceIntentId: (index) => index === 0 ? TEST_INTENT_ID : undefined,
    actionStateHistoryDirection: noEntry,
    actionStateActivationContract: (index) => index === 0 ? "tracked" : undefined,
    actionStateValueContractName: noEntry,
    actionStateValueContractVersion: noEntry,
    inlineFormatSetFormatKind: noEntry,
    inlineFormatSetIntentId: noEntry,
    inlineFormatSetActionStateId: noEntry,
    free: () => undefined,
  };
  const consumed = consumeWasmCompiledProfileDescriptor(
    TEST_PROFILE_GENERATION,
    view,
  );
  if (!consumed.ok) throw new Error("action-state descriptor was rejected");
  return consumed.descriptor;
}

function profileDescriptorWithIntentContract(options: Readonly<{
  input: "none" | "typed";
  value: boolean;
}>): BrowserCompiledProfileDescriptor {
  const noEntry = (): undefined => undefined;
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "breditor/base",
    schemaVersion: 1,
    schemaFingerprint: TEST_SCHEMA_FINGERPRINT,
    formatCount: 1,
    intentCount: 1,
    actionStateCount: 0,
    inlineFormatSetCount: 0,
    matchesProfileGeneration: matchesTestProfile,
    formatKind: (index) => index === 0 ? "breditor/strong" : undefined,
    formatRevision: (index) => index === 0 ? 1 : undefined,
    ...PROPERTY_FREE_FORMAT_METHODS,
    intentId: (index) => index === 0 ? TEST_INTENT_ID : undefined,
    intentInputKind: (index) => index === 0 ? options.input : undefined,
    intentInputContractName: (index) =>
      index === 0 && options.input === "typed" ? "example/input" : undefined,
    intentInputContractVersion: (index) =>
      index === 0 && options.input === "typed" ? 1 : undefined,
    intentActivationContract: (index) => index === 0 ? "tracked" : undefined,
    intentValueContractName: (index) =>
      index === 0 && options.value ? "example/value" : undefined,
    intentValueContractVersion: (index) =>
      index === 0 && options.value ? 2 : undefined,
    actionStateId: noEntry,
    actionStateSourceKind: noEntry,
    actionStateSourceActionId: noEntry,
    actionStateSourceIntentId: noEntry,
    actionStateHistoryDirection: noEntry,
    actionStateActivationContract: noEntry,
    actionStateValueContractName: noEntry,
    actionStateValueContractVersion: noEntry,
    inlineFormatSetFormatKind: noEntry,
    inlineFormatSetIntentId: noEntry,
    inlineFormatSetActionStateId: noEntry,
    free: () => undefined,
  };
  const consumed = consumeWasmCompiledProfileDescriptor(
    TEST_PROFILE_GENERATION,
    view,
  );
  if (!consumed.ok) throw new Error("intent contract descriptor was rejected");
  return consumed.descriptor;
}

function checkpointResult(revision: number): Readonly<{
  view: WasmSessionCheckpointStringResultView;
  free: ReturnType<typeof vi.fn>;
}> {
  const free = vi.fn();
  let taken = false;
  const checkpointJson = JSON.stringify({
    format: "breditor/session-checkpoint",
    formatVersion: 1,
    historyBase: {
      format: "breditor/editor-state",
      formatVersion: 1,
      snapshot: { lineage: "adapter-tests", revision: "0" },
    },
    currentRevision: String(revision),
    historyCapacity: 0,
    cursor: 0,
    entries: [],
    openMergeGroup: null,
  });
  const view: WasmSessionCheckpointStringResultView = {
    status: "value",
    error: undefined,
    takeValue: () => {
      if (taken) return undefined;
      taken = true;
      return checkpointJson;
    },
    free,
  };
  return { view, free };
}

function engineQueues(input: Readonly<{
  setSelection?: WasmCommandResultView[];
  setRangeSelection?: () => WasmCommandResultView;
  stringAction?: WasmCommandResultView[];
  noInputAction?: WasmCommandResultView[];
  typedAction?: WasmCommandResultView[];
  intents?: WasmIntentResultView[];
  typedIntents?: WasmIntentResultView[];
  undo?: WasmCommandResultView[];
  redo?: WasmCommandResultView[];
  closeHistory?: WasmCommandResultView[];
  selection?: WasmSelectionResultView[];
  actionStates?: WasmActionStatesResultView[];
  sessionCheckpoints?: WasmSessionCheckpointStringResultView[];
  documents?: WasmDocumentJsonStringResultView[];
}>): WasmCommandEngineView {
  const take = <T>(values: T[] | undefined, name: string): T => {
    const value = values?.shift();
    if (value === undefined) throw new Error(`unexpected ${name}`);
    return value;
  };
  return {
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    actionStates: () => take(input.actionStates, "actionStates"),
    sessionCheckpointJson: () =>
      take(input.sessionCheckpoints, "sessionCheckpointJson"),
    documentJson: () => take(input.documents, "documentJson"),
    clearSelection: () => take(input.setSelection, "clearSelection"),
    setRangeSelection: () => input.setRangeSelection?.() ?? take(input.setSelection, "setRangeSelection"),
    selection: () => take(input.selection, "selection"),
    executeNoInputAction: () => take(input.noInputAction, "executeNoInputAction"),
    executeNoInputIntent: () => take(input.intents, "executeNoInputIntent"),
    executeStringAction: () => take(input.stringAction, "executeStringAction"),
    executeTypedActionJson: () =>
      take(input.typedAction, "executeTypedActionJson"),
    executeTypedIntentJson: () =>
      take(input.typedIntents, "executeTypedIntentJson"),
    undo: () => take(input.undo, "undo"),
    redo: () => take(input.redo, "redo"),
    closeHistoryGroup: () => take(input.closeHistory, "closeHistoryGroup"),
  };
}

function documentResult(text: string): Readonly<{
  view: WasmDocumentJsonStringResultView;
  free: ReturnType<typeof vi.fn>;
}> {
  const free = vi.fn();
  let taken = false;
  const documentJson = JSON.stringify({
    format: "breditor/document",
    formatVersion: 1,
    schema: { name: "breditor/base", version: 1 },
    root: {
      kind: "element",
      type: "breditor/document",
      entityId: null,
      properties: {},
      children: [
        {
          kind: "element",
          type: "breditor/paragraph",
          entityId: null,
          properties: {},
          children: text.length === 0 ? [] : [{ kind: "text", text, formats: [] }],
        },
      ],
    },
  });
  return {
    view: {
      status: "value",
      error: undefined,
      takeValue: () => {
        if (taken) return undefined;
        taken = true;
        return documentJson;
      },
      free,
    },
    free,
  };
}

class FailOnWriteBridge extends BreditorDomSelectionBridge {
  #writes = 0;

  constructor(private readonly failAt: number) {
    super();
  }

  override write(
    rendered: RenderedProjection,
    selected: BaseEditorSelection,
  ): BrowserSelectionResult<{
    readonly kind: "range" | "none";
    readonly rendererGeneration: bigint;
  }> {
    this.#writes += 1;
    if (this.#writes === this.failAt) {
      return {
        ok: false,
        error: {
          code: "selection.dom_write_failed",
          message: "The DOM selection could not be installed exactly.",
        },
      };
    }
    return super.write(rendered, selected);
  }
}
