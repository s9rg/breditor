// Uses real browser Selection endpoints; does not simulate keyboard/IME/clipboard.
import { BreditorDomRenderer } from "../packages/breditor-browser/src/dom_renderer.ts";
import { compileBrowserPresentation } from "../packages/breditor-browser/src/compiled_browser_presentation.ts";
import { createInlineFormatRenderManifest } from "../packages/breditor-browser/src/inline_format_render_manifest.ts";
import { FlatListRangeSelection } from "../packages/breditor-browser/src/flat_list_selection.ts";
import { mapDomPointToFlatListSelectionPoint, mapFlatListSelectionPointToDomPoint } from "../packages/breditor-browser/src/flat_list_dom_point_mapping.ts";

const value = result => { if (!result.ok) throw new Error(result.error.code); return result.value; };
const equal = (actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`list DOM mismatch: ${JSON.stringify(actual)}`);
};

export function verifyFlatListDom(before, after, owner) {
  const presentation = compileBrowserPresentation(owner.generation, owner.descriptor,
    createInlineFormatRenderManifest({recipes: [{formatKind: "breditor/strong", element: "strong"}]}));
  const renderer = new BreditorDomRenderer(presentation);
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
    equal(mapDomPointToFlatListSelectionPoint(rendered, heading, 2).ok, false); // Inside 🙂.
    const empty = value(mapFlatListSelectionPointToDomPoint(rendered, {kind: "children", parentPath: [2, 0, 0], childIndex: 0, affinity: "after"}));
    selection.setBaseAndExtent(empty.node, empty.offset, empty.node, empty.offset);
    equal(value(mapDomPointToFlatListSelectionPoint(rendered, selection.anchorNode, selection.anchorOffset)).parentPath, [2, 0, 0]);
    // Clear an owned native range before replacing the tree to avoid retaining
    // detached native editing nodes (the same disposal discipline as the demo).
    selection.removeAllRanges();
    const old = rendered;
    rendered = value(renderer.renderFlatList(host, after)).rendered;
    equal(old.current, false); equal(rendered.validateCanonicalDom(), true);
    equal(host.querySelectorAll("li").length, 4);
    const changed = value(mapFlatListSelectionPointToDomPoint(rendered,
      {kind: "text", textPath: [1, 1, 0, 0], utf16Offset: 1, affinity: "after"}));
    selection.setBaseAndExtent(changed.node, changed.offset, changed.node, changed.offset);
    equal(value(mapDomPointToFlatListSelectionPoint(rendered, selection.focusNode, selection.focusOffset)).textPath, [1, 1, 0, 0]);
    host.querySelector("ol").setAttribute("start", "9");
    equal(mapDomPointToFlatListSelectionPoint(rendered, changed.node, changed.offset).ok, false);
    equal(rendered.current, false);
  } finally {
    if (selection.anchorNode && host.contains(selection.anchorNode)) selection.removeAllRanges();
    if (rendered) renderer.releaseFlatList(rendered);
    host.remove();
  }
}
