// Installed native listeners through the complete production list router.
// Inputs/transfers/provisional composition DOM are fixtures, not physical input.
import { BreditorFlatListBrowserEventRouter } from "../packages/breditor-browser/src/browser_event_router.ts";
import { FlatListRangeSelection } from "../packages/breditor-browser/src/flat_list_selection.ts";
import { flatListRangeSelectionSync } from "../packages/breditor-browser/src/editor_command.ts";
import { withSyntheticTargetRanges } from "./synthetic-target-range-fixture.mjs";

const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`list router: ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
  }
};
const value = result => { if (!result.ok) throw new Error(result.error.code); return result.value; };

export function verifyFlatListRouter(boot, documentJson) {
  const routers = [];
  const setup = name => {
    const f = boot({kind: "document", lineageId: `list-router-${name}`, documentJson, historyCapacity: 20});
    const tasks = [], statuses = [];
    const router = new BreditorFlatListBrowserEventRouter(f.queue, f.adapter, {
      keyboard: {editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled"},
      scheduleTask: task => { tasks.push(task); },
    });
    routers.push(router); router.subscribe(status => statuses.push(status));
    const selected = value(FlatListRangeSelection.create(f.adapter.rendered.projection, {kind: "range",
      anchor: {kind: "text", textPath: [1, 0, 0, 0], utf16Offset: 3, affinity: "before"},
      focus: {kind: "text", textPath: [1, 0, 0, 0], utf16Offset: 1, affinity: "after"}}));
    f.send({kind: "selection", operation: "synchronize"}, flatListRangeSelectionSync(selected));
    const original = f.documentRoot(), originalSelection = f.selection();
    const dispatch = (type, init = {}) => {
      const event = type.startsWith("composition") ? new CompositionEvent(type, {bubbles: true, ...init})
        : type === "keydown" ? new KeyboardEvent(type, {bubbles: true, cancelable: true, ...init})
        : new InputEvent(type, {bubbles: true, cancelable: type === "beforeinput", ...init});
      withSyntheticTargetRanges(event, init.targetRanges, () => f.host.dispatchEvent(event));
      equal(router.status, {kind: "live"});
      return event;
    };
    const clipboard = (type, entries = []) => {
      const event = new ClipboardEvent(type, {bubbles: true, cancelable: true, clipboardData: new DataTransfer()});
      // Seed the actual event capability, including Firefox's event-local transfer.
      for (const [mime, text] of entries) event.clipboardData.setData(mime, text);
      f.host.dispatchEvent(event); equal(event.defaultPrevented, true); equal(router.status, {kind: "live"});
      return event.clipboardData;
    };
    const runTasks = () => { let limit = 20; while (tasks.length) { if (--limit < 0) throw new Error("router task loop"); tasks.shift()(); } };
    const roundTripHistory = () => {
      const committed = f.documentRoot(), committedSelection = f.selection();
      equal(dispatch("keydown", {key: "z", code: "KeyZ", ctrlKey: true}).defaultPrevented, true);
      equal(f.documentRoot(), original); equal(f.selection(), originalSelection);
      equal(dispatch("beforeinput", {inputType: "historyUndo"}).defaultPrevented, true);
      dispatch("input", {inputType: "historyUndo"});
      const checkpoint = f.ports.sessionCheckpointJson.read();
      if (!checkpoint?.ok) throw new Error("router checkpoint failed");
      const resumed = boot({kind: "sessionCheckpoint", checkpointJson: checkpoint.checkpoint.checkpointJson});
      resumed.send({kind: "history", operation: "redo"});
      equal(resumed.documentRoot(), committed); equal(resumed.selection(), committedSelection);
      runTasks(); equal(router.status, {kind: "live"});
    };
    return {...f, router, tasks, statuses, original, originalSelection, dispatch, clipboard, runTasks, roundTripHistory};
  };
  try {
    const typing = setup("typing");
    equal(typing.dispatch("beforeinput", {inputType: "insertText", data: "X\nY"}).defaultPrevented, true);
    typing.dispatch("input", {inputType: "insertText", data: "X\nY"});
    equal(typing.ports.plainText.read()?.content.text, "Intro\nAX\nY\nB\n");
    typing.roundTripHistory(); typing.router.dispose();

    const cut = setup("cut");
    equal(cut.clipboard("cut").getData("text/plain"), "🙂");
    equal(cut.ports.plainText.read()?.content.text, "Intro\nA\nB\n");
    equal(cut.dispatch("beforeinput", {inputType: "deleteByCut"}).defaultPrevented, true);
    cut.dispatch("input", {inputType: "deleteByCut"});
    cut.roundTripHistory(); cut.router.dispose();

    const paste = setup("paste"); paste.clipboard("paste", [["text/plain", "P\nQ"]]);
    equal(paste.ports.plainText.read()?.content.text, "Intro\nAP\nQ\nB\n");
    equal(paste.dispatch("beforeinput", {inputType: "insertFromPaste"}).defaultPrevented, true);
    paste.dispatch("input", {inputType: "insertFromPaste"});
    paste.roundTripHistory(); paste.router.dispose();

    const ime = setup("composition");
    const text = ime.adapter.rendered.nodeForAstPath([1, 0, 0, 0]);
    const range = new StaticRange({startContainer: text, startOffset: 1, endContainer: text, endOffset: 3});
    ime.dispatch("compositionstart");
    equal(ime.dispatch("beforeinput", {inputType: "insertCompositionText", data: "漢字", isComposing: true, targetRanges: [range]}).defaultPrevented, false);
    ime.host.querySelector("h2").textContent = "A漢字";
    // Selection observations while the composition lease owns the DOM must not
    // try to issue an ordinary token or fault the router.
    document.dispatchEvent(new Event("selectionchange")); equal(ime.router.status, {kind: "live"});
    ime.dispatch("input", {inputType: "insertCompositionText", data: "漢字", isComposing: true});
    ime.dispatch("compositionend", {data: "漢字"});
    const settle = ime.tasks.shift(); if (!settle) throw new Error("missing router composition settlement");
    settle(); equal(ime.adapter.state, "live");
    equal(ime.ports.plainText.read()?.content.text, "Intro\nA漢字\nB\n");
    const settledRender = ime.adapter.rendered;
    ime.dispatch("input", {inputType: "insertCompositionText", data: "漢字", isComposing: false});
    if (ime.adapter.rendered !== settledRender) throw new Error("late composition echo triggered an unnecessary repair");
    ime.roundTripHistory(); ime.router.dispose();

    const repair = setup("deferred-repair");
    equal(repair.dispatch("beforeinput", {inputType: "insertText", data: "unsafe", cancelable: false}).defaultPrevented, false);
    equal(repair.tasks.length, 1); repair.host.querySelector("h2").textContent = "native drift";
    repair.dispatch("input", {inputType: "insertText", data: "unsafe"});
    equal(repair.host.querySelector("h2").textContent, "A🙂");
    equal(repair.documentRoot(), repair.original); equal(repair.selection(), repair.originalSelection);
    repair.runTasks(); equal(repair.router.status, {kind: "live"});
    repair.router.dispose(); equal(repair.statuses, [{kind: "disposed"}]);
    const late = new InputEvent("beforeinput", {inputType: "insertText", data: "late", cancelable: true});
    repair.host.dispatchEvent(late); equal(late.defaultPrevented, false); equal(repair.documentRoot(), repair.original);
  } finally { for (const router of routers.reverse()) router.dispose(); }
}
