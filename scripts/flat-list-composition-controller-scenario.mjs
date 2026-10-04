// Real list composition controller/queue/adapter/Wasm with synthetic native
// events and scripted provisional DOM. This does not qualify an OS input method.
import { BreditorFlatListCompositionController } from "../packages/breditor-browser/src/composition_controller.ts";
import { FlatListRangeSelection } from "../packages/breditor-browser/src/flat_list_selection.ts";
import { flatListRangeSelectionSync, flatListCommandRequest, preserveSelectionSync } from "../packages/breditor-browser/src/editor_command.ts";

const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`list composition controller: ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
  }
};
const value = result => { if (!result.ok) throw new Error(result.error.code); return result.value; };

export function verifyFlatListCompositionController(boot, documentJson) {
  const controllers = [];
  const setup = (name, emptyItem = false) => {
    const f = boot({kind: "document", lineageId: `list-ime-${name}`, documentJson, historyCapacity: 20});
    const tasks = [], notifications = [];
    const controller = new BreditorFlatListCompositionController(f.queue, f.adapter, {
      scheduleTask: task => { tasks.push(task); }, onSettlement: notice => { notifications.push(notice); },
    });
    controllers.push(controller);
    const selected = value(FlatListRangeSelection.create(f.adapter.rendered.projection, emptyItem ? {kind: "range",
      anchor: {kind: "children", parentPath: [2, 0, 0], childIndex: 0, affinity: "before"},
      focus: {kind: "children", parentPath: [2, 0, 0], childIndex: 0, affinity: "after"},
    } : {kind: "range",
      anchor: {kind: "text", textPath: [1, 0, 0, 0], utf16Offset: 3, affinity: "before"},
      focus: {kind: "text", textPath: [1, 0, 0, 0], utf16Offset: 1, affinity: "after"},
    }));
    f.send({kind: "selection", operation: "synchronize"}, flatListRangeSelectionSync(selected));
    const original = f.documentRoot(), originalSelection = f.selection();
    const selector = emptyItem ? "ul p" : "h2";
    const nativeText = f.adapter.rendered.nodeForAstPath(emptyItem ? [2, 0, 0] : [1, 0, 0, 0]);
    const range = new StaticRange({startContainer: nativeText, startOffset: emptyItem ? 0 : 1,
      endContainer: nativeText, endOffset: emptyItem ? 0 : 3});
    const dispatch = (type, init = {}) => {
      const event = type.startsWith("composition")
        ? new CompositionEvent(type, {bubbles: true, data: "", ...init})
        : new InputEvent(type, {bubbles: true, cancelable: type === "beforeinput", ...init});
      let restoreTargetRanges = () => {};
      if (init.targetRanges && event.getTargetRanges().length !== init.targetRanges.length) {
        // WebKit's synthetic InputEvent constructor omits targetRanges. Model
        // that platform method only for this event, like the existing browser
        // harness. Product code still ignores event-local method shadows.
        const descriptor = Object.getOwnPropertyDescriptor(InputEvent.prototype, "getTargetRanges");
        if (!descriptor?.configurable || typeof descriptor.value !== "function") throw new Error("target-range fixture unavailable");
        Object.defineProperty(InputEvent.prototype, "getTargetRanges", {...descriptor, value() {
          return this === event ? init.targetRanges : Reflect.apply(descriptor.value, this, []);
        }});
        restoreTargetRanges = () => Object.defineProperty(InputEvent.prototype, "getTargetRanges", descriptor);
      }
      let result;
      f.host.addEventListener(type, incoming => {
        result = type.startsWith("composition") ? controller.handleCompositionEvent(incoming)
          : type === "beforeinput" ? controller.handleBeforeInput(incoming) : controller.handleInput(incoming);
      }, {once: true});
      try { f.host.dispatchEvent(event); } finally { restoreTargetRanges(); }
      return {event, result};
    };
    const runNext = () => { const task = tasks.shift(); if (!task) throw new Error("missing composition task"); task(); };
    const open = (data, implicit = false) => {
      if (!implicit) equal(dispatch("compositionstart").result.kind, "native");
      const result = dispatch("beforeinput", {inputType: "insertCompositionText", data, isComposing: true, targetRanges: [range]});
      equal(result.result, {kind: "native", phase: "mutating"}); equal(result.event.defaultPrevented, false);
      equal(controller.phase, "mutating"); equal(f.adapter.state, "composition");
      return result;
    };
    return {...f, controller, tasks, notifications, original, originalSelection, range, dispatch, runNext, open, selector};
  };
  try {
    for (const {name, implicit = false, text = "漢字", emptyItem = false} of [
      {name: "explicit"}, {name: "implicit", implicit: true}, {name: "delete", text: ""},
      {name: "multiline", text: "漢\n字"}, {name: "empty-item", text: "日本語", emptyItem: true},
    ]) {
      const f = setup(name, emptyItem);
      const queued = flatListCommandRequest(f.adapter.deliveryToken(), preserveSelectionSync(),
        {kind: "api", detail: "during composition"}, {kind: "history", operation: "undo"});
      f.open(text, implicit);
      equal(f.queue.submit(queued), {status: "rejected", reason: "leased"});
      if (implicit) equal(f.dispatch("compositionstart").result.kind, "native");
      f.host.querySelector(f.selector).textContent = (emptyItem ? "" : "A") + text;
      equal(f.dispatch("compositionupdate", {data: text}).result.kind, "native");
      equal(f.dispatch("input", {inputType: "insertCompositionText", data: text, isComposing: true}).result.kind, "native");
      equal(f.dispatch("compositionend", {data: text}).result.kind, "scheduled");
      equal(f.notifications.length, 0); f.runNext();
      equal(f.notifications[0]?.kind, "settled"); equal(f.notifications[0]?.settlement.kind, "committed");
      equal(f.controller.phase, "idle");
      equal(f.ports.plainText.read()?.content.text, emptyItem ? `Intro\nA🙂\nB\n${text}` : `Intro\nA${text}\nB\n`);
      const committed = f.documentRoot(), committedSelection = f.selection();
      equal(f.dispatch("input", {inputType: "insertCompositionText", data: text, isComposing: false}).result.kind, "lateInputEcho");
      equal(f.documentRoot(), committed);
      equal(f.dispatch("input", {inputType: "insertCompositionText", data: text, isComposing: false}).result,
        {kind: "recoveryRequired", reason: "orphanInput"});
      f.send({kind: "history", operation: "undo"});
      equal(f.documentRoot(), f.original); equal(f.selection(), f.originalSelection);
      const checkpoint = f.ports.sessionCheckpointJson.read();
      if (!checkpoint?.ok) throw new Error("controller checkpoint failed");
      const resumed = boot({kind: "sessionCheckpoint", checkpointJson: checkpoint.checkpoint.checkpointJson});
      resumed.send({kind: "history", operation: "redo"});
      equal(resumed.documentRoot(), committed); equal(resumed.selection(), committedSelection);
      while (f.tasks.length) f.runNext();
    }

    const invalid = setup("structural-recovery"); invalid.open("漢");
    invalid.host.querySelector("h2").textContent = "A漢";
    invalid.host.querySelector("ol").start = 99;
    equal(invalid.dispatch("compositionend", {data: "漢"}).result.kind, "scheduled");
    invalid.runNext(); equal(invalid.controller.phase, "quarantined");
    equal(invalid.notifications[0], {kind: "recoveryRequired", reason: "domReconcileFailed"});
    invalid.runNext(); equal(invalid.controller.phase, "idle");
    equal(invalid.notifications[1]?.kind, "recovered");
    equal(invalid.documentRoot(), invalid.original); equal(invalid.selection(), invalid.originalSelection);
    equal(invalid.host.querySelector("ol").start, 8);
    equal(invalid.send({kind: "history", operation: "undo"}).command.status, "unchanged");

    const cancelled = setup("cancelled"); cancelled.open("🙂");
    equal(cancelled.dispatch("compositionend", {data: ""}).result.kind, "scheduled");
    cancelled.runNext();
    equal(cancelled.notifications[0]?.settlement.kind, "cancelled");
    equal(cancelled.documentRoot(), cancelled.original); equal(cancelled.selection(), cancelled.originalSelection);
    equal(cancelled.send({kind: "history", operation: "undo"}).command.status, "unchanged");
  } finally {
    for (const controller of controllers.reverse()) controller.dispose();
  }
}
