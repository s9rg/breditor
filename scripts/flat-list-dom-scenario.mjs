// Uses real browser Selection endpoints; does not simulate keyboard/IME/clipboard.
import { BreditorDomRenderer } from "../packages/breditor-browser/src/dom_renderer.ts";
import { compileBrowserPresentation } from "../packages/breditor-browser/src/compiled_browser_presentation.ts";
import { createInlineFormatRenderManifest } from "../packages/breditor-browser/src/inline_format_render_manifest.ts";
import { FlatListRangeSelection } from "../packages/breditor-browser/src/flat_list_selection.ts";
import { BreditorFlatListDomSelectionBridge } from "../packages/breditor-browser/src/dom_selection.ts";
import { mapDomPointToFlatListSelectionPoint, mapFlatListSelectionPointToDomPoint } from "../packages/breditor-browser/src/flat_list_dom_point_mapping.ts";
import { issueFlatListEditorDeliveryToken, issueEditorDeliveryAuthority, flatListEditorDeliveryTokenMatches,
  flatListEditorDeliveryAuthorityAccepts, flatListCommandRequest, flatListRangeSelectionSync,
  canonicalFlatListEditorCommandRequest, canonicalEditorCommandRequest, flatListBrowserInputActionIds } from "../packages/breditor-browser/src/editor_command.ts";
import { BreditorFlatListCommandQueue, openFlatListCommandQueueLeasePort, openCommandQueueLeasePort } from "../packages/breditor-browser/src/command_queue.ts";

const value = result => { if (!result.ok) throw new Error(result.error.code); return result.value; };
const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`list DOM mismatch: ${JSON.stringify(actual)}`);
};

export function verifyFlatListDom(before, after, owner, transitions) {
  const presentation = compileBrowserPresentation(owner.generation, owner.descriptor,
    createInlineFormatRenderManifest({recipes: [{formatKind: "breditor/strong", element: "strong"}]}));
  const renderer = new BreditorDomRenderer(presentation);
  const bridge = new BreditorFlatListDomSelectionBridge();
  const host = document.createElement("div");
  host.contentEditable = "true";
  document.body.append(host);
  let rendered;
  const selection = document.getSelection();
  if (!selection) throw new Error("native selection unavailable");
  try {
    rendered = value(renderer.renderFlatList(host, before)).rendered;
    equal(Array.from(host.children, node => node.localName), ["p", "ol", "ul"]);
    equal(host.querySelector("ol").getAttribute("start"), "8");
    equal(host.querySelectorAll("li").length, 3);
    const heading = rendered.nodeForAstPath([1, 0, 0, 0]);
    const last = rendered.nodeForAstPath([1, 1, 0, 0]);
    host.focus();
    selection.setBaseAndExtent(last, 1, heading, 1);
    const anchor = value(mapDomPointToFlatListSelectionPoint(rendered, selection.anchorNode, selection.anchorOffset));
    const focus = value(mapDomPointToFlatListSelectionPoint(rendered, selection.focusNode, selection.focusOffset));
    const range = value(FlatListRangeSelection.create(before, {kind: "range", anchor, focus}));
    equal(range.order, "backward");
    equal(range.anchor.textPath, [1, 1, 0, 0]); equal(range.focus.textPath, [1, 0, 0, 0]);
    equal(value(bridge.read(rendered)).selection.order, "backward");
    const exact = value(FlatListRangeSelection.create(before, {kind: "range",
      anchor: {...anchor, affinity: "after"}, focus: {...focus, affinity: "before"}}));
    value(bridge.write(rendered, exact));
    const echoed = value(bridge.read(rendered));
    equal(echoed.origin, "programmaticEcho");
    if (echoed.selection !== exact) throw new Error("exact affinity receipt lost");
    const authority = Symbol("list DOM commands");
    let epoch = 0n;
    const capability = issueEditorDeliveryAuthority(token => flatListEditorDeliveryTokenMatches(token, rendered, epoch, authority));
    const token = issueFlatListEditorDeliveryToken(before, rendered, epoch, authority);
    const request = flatListCommandRequest(token, flatListRangeSelectionSync(echoed.selection), {kind: "api", detail: "browser qualification"},
      {kind: "action", actionId: flatListBrowserInputActionIds(token).insertText, input: {kind: "string", value: "🙂"}});
    const canonical = canonicalFlatListEditorCommandRequest(request);
    if (!canonical || canonical.selection.selection !== exact || canonical.delivery !== token) throw new Error("list command capture lost identity");
    equal(canonicalEditorCommandRequest(request), null);
    equal(flatListEditorDeliveryAuthorityAccepts(capability, token), true);
    const deliveries = [];
    let admitted = 0;
    // Queue-state qualification only; the normal Wasm adapter is not substituted
    // by this harness executor. It proves stale reentrant requests are delivered
    // serially to an owner that can reject them before mutation.
    const executor = queued => {
      if (!flatListEditorDeliveryAuthorityAccepts(capability, queued.delivery)) return "stale";
      equal(queue.submit(queued).status, "queued");
      admitted += 1; epoch += 1n; return "admitted";
    };
    const queue = new BreditorFlatListCommandQueue(executor, {observer: delivery => { deliveries.push(delivery.result); }});
    equal(queue.submit(request).status, "completed");
    equal(deliveries, ["admitted", "stale"]); equal(admitted, 1); equal(queue.pendingCount, 0);
    equal(openCommandQueueLeasePort(queue, executor), undefined);
    const leasePort = openFlatListCommandQueueLeasePort(queue, executor);
    if (!leasePort) throw new Error("list queue owner port rejected");
    const lease = leasePort.acquireLease();
    if (!lease) throw new Error("list queue reservation rejected");
    equal(queue.submit(request), {status: "rejected", reason: "leased"});
    equal(leasePort.submitLeased(lease, request).result, "stale");
    equal(leasePort.submitLeased(lease, request), {status: "rejected", reason: "leased"});
    equal(leasePort.releaseLease(lease), true); queue.dispose();
    equal(flatListEditorDeliveryAuthorityAccepts(capability, token), false);
    equal(value(bridge.read(rendered)).origin, "dom");
    equal(mapDomPointToFlatListSelectionPoint(rendered, heading, 2).ok, false); // Inside 🙂.
    const empty = value(mapFlatListSelectionPointToDomPoint(rendered, {kind: "children", parentPath: [2, 0, 0], childIndex: 0, affinity: "after"}));
    selection.setBaseAndExtent(empty.node, empty.offset, empty.node, empty.offset);
    equal(value(mapDomPointToFlatListSelectionPoint(rendered, selection.anchorNode, selection.anchorOffset)).parentPath, [2, 0, 0]);
    const emptyPoint = {kind: "children", parentPath: [2, 0, 0], childIndex: 0, affinity: "before"};
    value(bridge.write(rendered, value(FlatListRangeSelection.create(before, {kind: "range", anchor: emptyPoint, focus: emptyPoint}))));
    equal(value(bridge.read(rendered)).selection.anchor.affinity, "before");
    // Clear an owned native range before replacing the tree to avoid retaining
    // detached native editing nodes (the same disposal discipline as the demo).
    selection.removeAllRanges();
    const old = rendered;
    rendered = value(renderer.renderFlatList(host, after)).rendered;
    equal(flatListEditorDeliveryTokenMatches(token, rendered, 0n, authority), false);
    equal(old.current, false); equal(rendered.validateCanonicalDom(), true);
    equal(host.querySelectorAll("li").length, 4);
    const changed = value(mapFlatListSelectionPointToDomPoint(rendered,
      {kind: "text", textPath: [1, 1, 0, 0], utf16Offset: 1, affinity: "after"}));
    selection.setBaseAndExtent(changed.node, changed.offset, changed.node, changed.offset);
    equal(value(mapDomPointToFlatListSelectionPoint(rendered, selection.focusNode, selection.focusOffset)).textPath, [1, 1, 0, 0]);
    host.querySelector("ol").setAttribute("start", "9");
    equal(mapDomPointToFlatListSelectionPoint(rendered, changed.node, changed.offset).ok, false);
    equal(rendered.current, false);
    selection.removeAllRanges();
    rendered = value(renderer.renderFlatList(host, before)).rendered;
    for (const {update, selection: semantic} of transitions) {
      const previous = rendered;
      const oldRoots = [...host.children];
      const outcome = value(renderer.updateFlatList(rendered, update));
      rendered = outcome.rendered;
      equal(previous.current, false); equal(rendered.validateCanonicalDom(), true);
      if (update.impact.kind === "none") {
        equal(outcome.mode, "incremental");
        if (oldRoots.some((root, index) => root !== host.children[index])) throw new Error("unchanged root identity lost");
      }
      value(bridge.write(rendered, semantic));
      const echo = value(bridge.read(rendered));
      equal(echo.origin, "programmaticEcho");
      if (semantic !== null && echo.selection !== semantic) throw new Error("update selection echo lost");
    }
    equal(host.querySelector("ol").getAttribute("start"), "8");
    equal(host.querySelectorAll("li").length, 3);
  } finally {
    if (selection.anchorNode && host.contains(selection.anchorNode)) selection.removeAllRanges();
    if (rendered) renderer.releaseFlatList(rendered);
    bridge.dispose();
    host.remove();
  }
}
