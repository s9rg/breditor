// Actual clipboard controller/queue/adapter/Wasm with native-branded synthetic
// events and in-memory DataTransfer. No OS clipboard permissions or physical-key
// qualification is claimed by this harness.
import { BreditorFlatListClipboardController } from "../packages/breditor-browser/src/clipboard_controller.ts";
import { FlatListRangeSelection } from "../packages/breditor-browser/src/flat_list_selection.ts";
import { flatListRangeSelectionSync } from "../packages/breditor-browser/src/editor_command.ts";

const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`list clipboard: ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
  }
};
const value = result => { if (!result.ok) throw new Error(result.error.code); return result.value; };
const point = (path, offset, affinity) => ({kind: "text", textPath: path, utf16Offset: offset, affinity});

export function verifyFlatListClipboard(boot, documentJson) {
  const controllers = [];
  const setup = (name, range = {kind: "range",
    anchor: point([1, 0, 0, 0], 3, "before"), focus: point([1, 0, 0, 0], 1, "after")}) => {
    const f = boot({kind: "document", lineageId: `list-clipboard-${name}`, documentJson, historyCapacity: 20});
    const controller = new BreditorFlatListClipboardController(f.queue, f.adapter);
    controllers.push(controller);
    const selection = value(FlatListRangeSelection.create(f.adapter.rendered.projection, range));
    f.send({kind: "selection", operation: "synchronize"}, flatListRangeSelectionSync(selection));
    const original = f.documentRoot(), originalSelection = f.selection();
    const dispatch = (type, transfer = new DataTransfer(), inputType) => {
      const event = type === "beforeinput" || type === "input"
        ? new InputEvent(type, {bubbles: true, cancelable: type === "beforeinput", inputType})
        : new ClipboardEvent(type, {bubbles: true, cancelable: true, clipboardData: transfer});
      if (event instanceof ClipboardEvent && event.clipboardData !== transfer) {
        // Firefox creates an empty event-local transfer instead of adopting the
        // supplied constructor member. Seed that actual synthetic capability;
        // do not shadow native getters or alter the production admission path.
        for (const mime of transfer.types) event.clipboardData.setData(mime, transfer.getData(mime));
      }
      let result;
      f.host.addEventListener(type, incoming => {
        result = type === "copy" ? controller.handleCopy(incoming) : type === "cut" ? controller.handleCut(incoming)
          : type === "paste" ? controller.handlePaste(incoming) : type === "beforeinput"
            ? controller.handleBeforeInput(incoming) : controller.handleInput(incoming);
      }, {once: true});
      f.host.dispatchEvent(event);
      // Firefox's synthetic ClipboardEvent does not adopt the supplied transfer;
      // inspect the event's actual capability, which is what product code uses.
      return {event, result, transfer: event instanceof ClipboardEvent ? event.clipboardData : transfer};
    };
    const roundTripHistory = () => {
      const committed = f.documentRoot(), committedSelection = f.selection();
      f.send({kind: "history", operation: "undo"});
      equal(f.documentRoot(), original); equal(f.selection(), originalSelection);
      const checkpoint = f.ports.sessionCheckpointJson.read();
      if (!checkpoint?.ok) throw new Error("clipboard checkpoint failed");
      const resumed = boot({kind: "sessionCheckpoint", checkpointJson: checkpoint.checkpoint.checkpointJson});
      resumed.send({kind: "history", operation: "redo"});
      equal(resumed.documentRoot(), committed); equal(resumed.selection(), committedSelection);
    };
    return {...f, controller, dispatch, original, originalSelection, roundTripHistory};
  };
  try {
    const copy = setup("copy-mixed", {kind: "range",
      anchor: {kind: "children", parentPath: [2, 0, 0], childIndex: 0, affinity: "before"},
      focus: point([0, 0], 2, "after")});
    const copied = copy.dispatch("copy"); equal(copied.result.kind, "handled");
    equal(copied.event.defaultPrevented, true);
    equal(copied.transfer.getData("text/plain"), "tro\nA🙂\nB\n");
    equal(copied.transfer.getData("text/html"), "<p>tro</p><p>A🙂</p><p>B</p><p><br></p>");
    equal(copy.documentRoot(), copy.original); equal(copy.selection(), copy.originalSelection);
    equal(copy.send({kind: "history", operation: "undo"}).command.status, "unchanged");

    for (const crossItem of [false, true]) {
      const cut = setup(`cut-${crossItem}`, {kind: "range",
        anchor: point(crossItem ? [1, 1, 0, 0] : [1, 0, 0, 0], crossItem ? 1 : 3, "before"),
        focus: point([1, 0, 0, 0], 1, "after")});
      const result = cut.dispatch("cut"); equal(result.result.kind, "handled"); equal(result.event.defaultPrevented, true);
      equal(result.transfer.getData("text/plain"), crossItem ? "🙂\nB" : "🙂");
      equal(cut.ports.plainText.read()?.content.text, crossItem ? "Intro\nA\n" : "Intro\nA\nB\n");
      equal(cut.host.querySelector("ol").start, 8);
      equal(cut.dispatch("beforeinput", undefined, "deleteByCut").result.kind, "beforeinputEcho");
      equal(cut.dispatch("input", undefined, "deleteByCut").result.kind, "inputPostcondition");
      equal(cut.dispatch("input", undefined, "deleteByCut").result.reason, "unexpectedInput");
      cut.roundTripHistory();
    }

    for (const htmlOnly of [false, true]) {
      const paste = setup(`paste-${htmlOnly}`), transfer = new DataTransfer();
      if (!htmlOnly) transfer.setData("text/plain", "X\r\nY");
      transfer.setData("text/html", htmlOnly ? "<p><strong>X</strong></p><p>Y</p>" : "<p>ignored</p>");
      const result = paste.dispatch("paste", transfer);
      equal(result.result.kind, "handled"); equal(result.event.defaultPrevented, true);
      equal(paste.ports.plainText.read()?.content.text, "Intro\nAX\nY\nB\n");
      equal(paste.host.querySelectorAll("ol li").length, 3); equal(paste.host.querySelector("ol").start, 8);
      equal(paste.host.querySelectorAll("strong").length, 0); // Paste is plain, not formatting import.
      equal(paste.dispatch("beforeinput", undefined, "insertFromPaste").result.kind, "beforeinputEcho");
      equal(paste.dispatch("input", undefined, "insertFromPaste").result.kind, "inputPostcondition");
      paste.roundTripHistory();
    }

    const empty = setup("empty-item", {kind: "range",
      anchor: {kind: "children", parentPath: [2, 0, 0], childIndex: 0, affinity: "before"},
      focus: {kind: "children", parentPath: [2, 0, 0], childIndex: 0, affinity: "after"}});
    const transfer = new DataTransfer(); transfer.setData("text/plain", "日本語\nnext");
    equal(empty.dispatch("paste", transfer).result.kind, "handled");
    equal(empty.ports.plainText.read()?.content.text, "Intro\nA🙂\nB\n日本語\nnext");
    equal(empty.host.querySelectorAll("ul li").length, 2); empty.roundTripHistory();

    const invalid = setup("unsupported-html"), unsupported = new DataTransfer();
    unsupported.setData("text/html", "<ul><li>outside beta</li></ul>");
    equal(invalid.dispatch("paste", unsupported).result.reason, "invalidHtml");
    equal(invalid.documentRoot(), invalid.original);
    equal(invalid.send({kind: "history", operation: "undo"}).command.status, "unchanged");
  } finally { for (const controller of controllers.reverse()) controller.dispose(); }
}
