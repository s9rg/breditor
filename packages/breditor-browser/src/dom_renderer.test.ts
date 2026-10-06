import { describe, expect, it, vi } from "vitest";

import {
  BaseDocumentProjection,
  BaseRangeSelection,
  BaseProjectionUpdate,
  BreditorDomRenderer,
  type BrowserCompiledProfileDescriptor,
  type ProjectionRenderOutcome,
  compileBrowserPresentation,
  consumeWasmCompiledProfileDescriptor,
  createInlineFormatRenderManifest,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./advanced.js";
import {
  MAX_COMPOSITION_DOM_DYNAMIC_ATTRIBUTE_UTF8_BYTES,
  reconcileCompositionDom,
  reconcileFlatListCompositionDom,
} from "./dom_composition_reconcile.js";
import { MAX_COMPOSITION_TEXT_UTF16 } from "./composition_event.js";
import { issueFlatListCompositionDeliveryToken, flatListCompositionDeliveryTokenMatchesOpeningBase,
  flatListCompositionDeliveryTokenMatchesSettlement, compositionDeliveryTokenMatchesOpeningBase,
  compositionDeliveryTokenMatchesSettlement, issueCompositionDeliveryToken } from "./composition_delivery_token.js";
import { mapDomPointToBaseSelectionPoint } from "./dom_point_mapping.js";
import {
  nativeChildNodes,
  nativeNodeValue,
  nativeParentNode,
} from "./html_host.js";
import { createProfiledDocumentProjection, createTextBlockDocumentProjection } from "./projection.js";
import { browserInputActionIds, issueEditorDeliveryToken, noInputActionRequest, preserveSelectionSync } from "./editor_command.js";
import { translateBeforeInput, translateFlatListBeforeInput } from "./beforeinput.js";
import { cutDeleteRequest, pasteInsertRequest } from "./clipboard_command.js";
import { translateKeyDown, translateFlatListKeyDown } from "./keyboard.js";
import { BreditorFlatListBrowserEventController, BreditorBrowserEventController } from "./browser_event_controller.js";
import { BreditorFlatListDomSelectionBridge } from "./dom_selection.js";
import { mapDomFlatListTargetRange, mapDomTargetRange } from "./dom_target_range.js";
import { FlatListTargetRange, isOwnedFlatListTargetRange } from "./flat_list_target_range.js";
import { FlatListDocumentProjection } from "./flat_list_projection.js";
import { FlatListRangeSelection, isOwnedFlatListRangeSelection } from "./flat_list_selection.js";
import { mapDomPointToFlatListSelectionPoint, mapFlatListSelectionPointToDomPoint } from "./flat_list_dom_point_mapping.js";
import { isOwnedFlatListRenderedProjection, isOwnedRenderedProjection } from "./dom_renderer.js";
import { FlatListProjectionUpdate, flatListUpdatePlan } from "./flat_list_projection_update.js";
import { issueFlatListEditorDeliveryToken, flatListEditorDeliveryTokenMatches, flatListEditorDeliveryTokenMatchesRender,
  issueEditorDeliveryAuthority, flatListEditorDeliveryAuthorityAccepts, editorDeliveryAuthorityAccepts,
  editorDeliveryTokenMatchesRender, flatListRangeSelectionSync, flatListCommandRequest,
  canonicalFlatListEditorCommandRequest, canonicalEditorCommandRequest, flatListBrowserInputActionIds,
  noSelectionSync, type EngineCommand, type FlatListEditorCommandRequest } from "./editor_command.js";
import { BreditorCommandQueue, BreditorFlatListCommandQueue, openFlatListCommandQueueLeasePort,
  openCommandQueueLeasePort } from "./command_queue.js";

type Run = Readonly<{ text: string; strong: boolean }>;

import { NestedListDocumentProjection } from "./nested_list_projection.js";
import { isOwnedNestedListRenderedProjection } from "./dom_renderer.js";

describe("recursive nested-list DOM", () => {
  function fixture() {
    const generation = profileGeneration(), descriptor = ownedProfileDescriptor(generation, ["breditor/strong"]);
    const presentation = compileBrowserPresentation(generation, descriptor,
      createInlineFormatRenderManifest({recipes: [{formatKind: "breditor/strong", element: "strong"}]}));
    const block = (text: string) => ({headingLevel: null, runs: text ? [{text, formatDetails: propertyFreeFormats(["breditor/strong"])}] : []});
    const projection = valueOf(NestedListDocumentProjection.create({schema: descriptor.schema,
      snapshot: {lineage: "nested-dom", revision: "0"}, blocks: [{kind: "bulletList", items: [
        {block: block("parent"), lists: [{kind: "orderedList", start: 9, items: [
          {block: block("child🙂"), lists: [{kind: "bulletList", items: [{block: block(""), lists: []}]}]},
        ]}]},
      ]}]}, generation, descriptor));
    const renderer = new BreditorDomRenderer(presentation), host = document.createElement("div");
    const rendered = valueOf(renderer.renderNestedList(host, projection)).rendered;
    return {renderer, host, projection, rendered};
  }
  it("renders sections and round-trips deep block/run paths without mapping wrappers", () => {
    const {host, rendered} = fixture();
    expect(host.innerHTML).toBe('<ul><li><p><strong>parent</strong></p><ol start="9"><li><p><strong>child🙂</strong></p><ul><li><p><br></p></li></ul></li></ol></li></ul>');
    const path = [0, 0, 1, 0, 0, 0], text = rendered.nodeForAstPath(path);
    expect(text?.nodeValue).toBe("child🙂");
    expect(rendered.astPathForDomNode(text!)).toEqual(path);
    expect(rendered.astPathForDomNode(text!.parentNode!)).toBeNull();
    expect(rendered.nodeForAstPath([0, 0, 1, 0, 1, 0, 0])?.nodeName).toBe("P");
    expect(rendered.validateCanonicalDom()).toBe(true);
    expect(isOwnedNestedListRenderedProjection(rendered)).toBe(true);
    expect(isOwnedFlatListRenderedProjection(rendered)).toBe(false);
    expect(isOwnedRenderedProjection(rendered)).toBe(false);
  });
  it.each(["text", "numbering", "extraChild", "attribute"])("invalidates deep %s drift", fault => {
    const {host, rendered} = fixture();
    if (fault === "text") host.querySelector("ol strong")!.textContent = "wrong";
    if (fault === "numbering") host.querySelector("ol")!.setAttribute("start", "10");
    if (fault === "extraChild") host.querySelector("ol li")!.append(document.createElement("p"));
    if (fault === "attribute") host.querySelector("ol li")!.setAttribute("title", "unexpected");
    expect(rendered.validateCanonicalDom()).toBe(false);
    expect(rendered.nodeForAstPath([0])).toBeNull();
  });
  it("releases nested handles through their explicit API", () => {
    const {renderer, rendered} = fixture();
    expect(renderer.releaseNestedList(rendered)).toBe(true);
    expect(rendered.current).toBe(false);
    expect(renderer.releaseNestedList(rendered)).toBe(false);
  });
});

describe("hierarchical flat-list DOM and points", () => {
  function fixture(firstText = "a🙂b", secondText = "") {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, ["breditor/strong"]);
    const presentation = compileBrowserPresentation(generation, descriptor,
      createInlineFormatRenderManifest({recipes: [{formatKind: "breditor/strong", element: "strong"}]}));
    const block = (text: string, headingLevel: number | null = null, strong = false) => ({headingLevel,
      runs: text === "" ? [] : [{text, formatDetails: propertyFreeFormats(strong ? ["breditor/strong"] : [])}]});
    const inputBlocks = () => [
        {kind: "orderedList", start: 8, items: [block(firstText, 2, true), block(secondText)]},
        {kind: "textBlock", block: block("tail")},
        {kind: "bulletList", items: [block("bullet")]},
      ];
    const make = (revision = 0, blocks = inputBlocks()) => valueOf(FlatListDocumentProjection.create({schema: descriptor.schema,
      snapshot: {lineage: "flat-list-dom", revision: String(revision)}, blocks}, generation, descriptor));
    const renderer = new BreditorDomRenderer(presentation);
    const host = document.createElement("div");
    const projection = make();
    const rendered = valueOf(renderer.renderFlatList(host, projection)).rendered;
    return {renderer, host, projection, rendered, make, inputBlocks};
  }
  const textPoint = (textPath: number[], utf16Offset: number, affinity = "after") => ({kind: "text", textPath, utf16Offset, affinity});

  function compositionFixture() {
    const f = fixture(); document.body.append(f.host);
    const selection = valueOf(FlatListRangeSelection.create(f.projection, {kind: "range",
      anchor: textPoint([0, 0, 0, 0], 3, "before"), focus: textPoint([0, 0, 0, 0], 1, "after")}));
    const authority = Symbol("list composition owner");
    const token = issueFlatListCompositionDeliveryToken(f.projection, f.rendered, selection, 7n, 1n, authority);
    const matches = (candidate: unknown = token, epoch = 7n, session = 1n, owner = authority) =>
      flatListCompositionDeliveryTokenMatchesOpeningBase(candidate, f.projection, f.rendered, selection, epoch, session, owner);
    const settled = () => flatListCompositionDeliveryTokenMatchesSettlement(token, f.projection, f.rendered, selection, 7n, 1n, authority);
    const lease = f.renderer.beginFlatListCompositionDomLease(f.rendered)!;
    expect(lease).not.toBeNull();
    const reconcile = () => reconcileFlatListCompositionDom(f.host, f.projection, selection);
    const dispose = () => { f.renderer.discardFlatListCompositionDomLease(lease); f.host.remove(); };
    return {...f, selection, authority, token, matches, settled, lease, reconcile, dispose};
  }

  it("binds list composition tokens to exact mode, selection, epoch, session and authority", () => {
    const f = fixture(); document.body.append(f.host);
    const selected = valueOf(FlatListRangeSelection.create(f.projection, {kind: "range",
      anchor: textPoint([0, 0, 0, 0], 1), focus: textPoint([0, 0, 0, 0], 1)}));
    const owner = Symbol("composition");
    const token = issueFlatListCompositionDeliveryToken(f.projection, f.rendered, selected, 0n, 1n, owner);
    const args = [f.projection, f.rendered, selected, 0n, 1n, owner] as const;
    try {
      expect(flatListCompositionDeliveryTokenMatchesOpeningBase(token, ...args)).toBe(true);
      expect(compositionDeliveryTokenMatchesOpeningBase(token, ...args)).toBe(false);
      expect(compositionDeliveryTokenMatchesSettlement(token, ...args)).toBe(false);
      expect(flatListCompositionDeliveryTokenMatchesOpeningBase({...token}, ...args)).toBe(false);
      expect(flatListCompositionDeliveryTokenMatchesOpeningBase(token, f.projection, f.rendered, {...selected}, 0n, 1n, owner)).toBe(false);
      expect(flatListCompositionDeliveryTokenMatchesOpeningBase(token, f.projection, f.rendered, selected, 1n, 1n, owner)).toBe(false);
      expect(flatListCompositionDeliveryTokenMatchesOpeningBase(token, f.projection, f.rendered, selected, 0n, 2n, owner)).toBe(false);
      expect(flatListCompositionDeliveryTokenMatchesOpeningBase(token, f.projection, f.rendered, selected, 0n, 1n, Symbol())).toBe(false);
      // @ts-expect-error Explicit list projections cannot issue legacy capabilities.
      expect(() => issueCompositionDeliveryToken(...args)).toThrow();
      for (const id of [0n, -1n, 18_446_744_073_709_551_616n]) {
        expect(() => issueFlatListCompositionDeliveryToken(f.projection, f.rendered, selected, 0n, id, owner)).toThrow();
      }
      expect(() => new (token.constructor as new (...args: unknown[]) => object)(...args)).toThrow();
    } finally { f.renderer.releaseFlatList(f.rendered); f.host.remove(); }
  });

  it("leases a list heading, reconciles one backward emoji range and restores exact hierarchy once", () => {
    const f = compositionFixture();
    try {
      expect(f.rendered.current).toBe(false); expect(f.rendered.nodeForAstPath([0, 0, 0, 0])).toBeNull();
      f.host.querySelector("strong")!.textContent = "a漢b";
      expect(f.matches()).toBe(false); expect(f.settled()).toBe(true);
      expect(f.renderer.ownsFlatListCompositionDomLease(f.lease, f.rendered)).toBe(true);
      expect(f.reconcile()).toEqual({ok: true, value: {textBlockPath: [0, 0, 0],
        replacementStartUtf16: 1, replacementEndUtf16: 3, originalText: "🙂", text: "漢"}});
      expect(reconcileCompositionDom(f.host, f.projection, f.selection)).toMatchObject({ok: false});
      const restored = valueOf(f.renderer.restoreFlatListCompositionDomLease(f.lease, f.projection)).rendered;
      expect(restored.current).toBe(true); expect(restored.rendererGeneration > f.rendered.rendererGeneration).toBe(true);
      expect(f.host.querySelector("ol")!.start).toBe(8); expect(f.host.querySelector("h2")!.textContent).toBe("a🙂b");
      expect(restored.nodeForAstPath([0, 0, 0, 0])!.textContent).toBe("a🙂b");
      expect(f.renderer.restoreFlatListCompositionDomLease(f.lease, f.projection).ok).toBe(false);
      f.renderer.releaseFlatList(restored);
    } finally { f.dispose(); }
  });

  it("keeps list leases recoverable after cross-mode, foreign-owner and detached-build refusals", () => {
    const f = compositionFixture();
    try {
      // @ts-expect-error List leases do not enter legacy restore.
      expect(f.renderer.restoreCompositionDomLease(f.lease, f.projection).ok).toBe(false);
      // @ts-expect-error List leases do not enter legacy discard.
      expect(f.renderer.discardCompositionDomLease(f.lease)).toBe(false);
      // @ts-expect-error The base ownership API cannot accept a list render.
      expect(f.renderer.ownsCompositionDomLease(f.lease, f.rendered)).toBe(false);
      expect(new BreditorDomRenderer().ownsFlatListCompositionDomLease(f.lease, f.rendered)).toBe(false);
      expect(f.renderer.restoreFlatListCompositionDomLease({} as never, f.projection).ok).toBe(false);
      expect(f.renderer.restoreFlatListCompositionDomLease(f.lease, {} as never).ok).toBe(false);
      const constructor = vi.spyOn(document, "createElementNS").mockImplementation(() => { throw new Error("constructor failed"); });
      try { expect(f.renderer.restoreFlatListCompositionDomLease(f.lease, f.projection).ok).toBe(false); }
      finally { constructor.mockRestore(); }
      expect(f.renderer.ownsFlatListCompositionDomLease(f.lease, f.rendered)).toBe(true);
      expect(f.renderer.discardFlatListCompositionDomLease(f.lease)).toBe(true);
      expect(f.renderer.discardFlatListCompositionDomLease(f.lease)).toBe(false);
    } finally { f.dispose(); }
  });

  it("rejects detached settlement and superseded renderer ownership", () => {
    const f = compositionFixture();
    try {
      f.host.remove(); expect(f.settled()).toBe(false);
      expect(f.reconcile()).toMatchObject({ok: false, error: {code: "composition.dom.invalid_input"}});
      document.body.append(f.host);
      const replacement = valueOf(f.renderer.renderFlatList(f.host, f.projection)).rendered;
      expect(f.renderer.ownsFlatListCompositionDomLease(f.lease, f.rendered)).toBe(false);
      expect(f.renderer.restoreFlatListCompositionDomLease(f.lease, f.projection).ok).toBe(false);
      f.renderer.releaseFlatList(replacement);
    } finally { f.dispose(); }
  });

  it.each([
    ["ordered start", (h: HTMLElement) => h.querySelector("ol")!.setAttribute("start", "9")],
    ["noncanonical start", (h: HTMLElement) => h.querySelector("ol")!.setAttribute("start", "08")],
    ["missing start", (h: HTMLElement) => h.querySelector("ol")!.removeAttribute("start")],
    ["reversed list", (h: HTMLElement) => h.querySelector("ol")!.setAttribute("reversed", "")],
    ["item attribute", (h: HTMLElement) => h.querySelector("li")!.setAttribute("value", "1")],
    ["extra item block", (h: HTMLElement) => h.querySelector("li")!.append(document.createElement("p"))],
    ["nested list", (h: HTMLElement) => h.querySelector("li")!.append(document.createElement("ul"))],
    ["heading rank", (h: HTMLElement) => h.querySelector("h2")!.replaceWith(document.createElement("h3"))],
    ["untouched item", (h: HTMLElement) => h.querySelectorAll("li")[1]!.replaceChildren()],
    ["untouched root", (h: HTMLElement) => { h.children[1]!.textContent = "changed"; }],
    ["bullet attribute", (h: HTMLElement) => h.querySelector("ul")!.setAttribute("style", "color: red")],
    ["extra root", (h: HTMLElement) => h.append(document.createElement("p"))],
    ["unadmitted wrapper", (h: HTMLElement) => h.querySelector("h2")!.replaceChildren(document.createElement("span"))],
  ] as const)("rejects composition drift in %s without consuming the recoverable lease", (_name, mutate) => {
    const f = compositionFixture();
    try {
      mutate(f.host);
      expect(f.reconcile()).toMatchObject({ok: false, error: {code: "composition.dom.invalid_structure"}});
      expect(f.renderer.ownsFlatListCompositionDomLease(f.lease, f.rendered)).toBe(true);
      const restored = valueOf(f.renderer.restoreFlatListCompositionDomLease(f.lease, f.projection)).rendered;
      expect(restored.validateCanonicalDom()).toBe(true); f.renderer.releaseFlatList(restored);
    } finally { f.dispose(); }
  });

  it.each([
    ["prefix", "x漢b", "composition.dom.unchanged_region_mismatch"],
    ["suffix", "a漢x", "composition.dom.unchanged_region_mismatch"],
    ["surrogate", "a\ud800b", "composition.dom.invalid_unicode"],
    ["oversized", `a${"x".repeat(MAX_COMPOSITION_TEXT_UTF16 + 1)}b`, "composition.dom.resource_limit"],
  ])("rejects %s composition text", (_name, text, code) => {
    const f = compositionFixture();
    try { f.host.querySelector("strong")!.textContent = text!; expect(f.reconcile()).toMatchObject({ok: false, error: {code}}); }
    finally { f.dispose(); }
  });

  it("does not treat equal item-local indexes as the same composition block", () => {
    const f = compositionFixture();
    try {
      const selection = valueOf(FlatListRangeSelection.create(f.projection, {kind: "range",
        anchor: textPoint([0, 0, 0, 0], 1), focus: textPoint([2, 0, 0, 0], 1)}));
      expect(reconcileFlatListCompositionDom(f.host, f.projection, selection))
        .toMatchObject({ok: false, error: {code: "composition.dom.cross_paragraph"}});
    } finally { f.dispose(); }
  });

  it("recovers native text in an empty item without changing its child-point contract", () => {
    const f = fixture(); document.body.append(f.host);
    const point = {kind: "children", parentPath: [0, 1, 0], childIndex: 0, affinity: "after"};
    const selection = valueOf(FlatListRangeSelection.create(f.projection, {kind: "range", anchor: point, focus: point}));
    const lease = f.renderer.beginFlatListCompositionDomLease(f.rendered)!;
    try {
      f.host.querySelectorAll("li p")[0]!.textContent = "日本語";
      expect(reconcileFlatListCompositionDom(f.host, f.projection, selection)).toEqual({ok: true, value: {
        textBlockPath: [0, 1, 0], replacementStartUtf16: 0, replacementEndUtf16: 0, originalText: "", text: "日本語"}});
    } finally { f.renderer.discardFlatListCompositionDomLease(lease); f.host.remove(); }
  });

  function eventFixture(firstText = "a🙂b", secondText = "") {
    const f = fixture(firstText, secondText); f.host.contentEditable = "true"; document.body.append(f.host);
    const bridge = new BreditorFlatListDomSelectionBridge(); const authority = Symbol("list event owner"); let epoch = 0n;
    const delivery = () => issueFlatListEditorDeliveryToken(f.projection, f.rendered, epoch, authority);
    const capability = issueEditorDeliveryAuthority(token => flatListEditorDeliveryTokenMatches(token, f.rendered, epoch, authority));
    const delivered: FlatListEditorCommandRequest[] = []; const tasks: Array<() => void> = [];
    const queue = new BreditorFlatListCommandQueue(request => { delivered.push(request); epoch += 1n; return "done"; });
    const controller = new BreditorFlatListBrowserEventController(queue, {selectionBridge: bridge, deliveryAuthority: capability,
      keyboard: {editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled"}, scheduleTask: task => { tasks.push(task); }});
    const text = f.rendered.nodeForAstPath([0, 0, 0, 0])!;
    document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
    const input = (inputType: string, ranges: AbstractRange[] = [], data: string | null = null) => ({
      type: "beforeinput", target: f.host, cancelable: true, defaultPrevented: false,
      inputType, data, isComposing: false, getTargetRanges: () => ranges,
      preventDefault() { this.defaultPrevented = true; },
    });
    const dispose = () => { document.getSelection()!.removeAllRanges(); bridge.dispose(); queue.dispose(); f.renderer.releaseFlatList(f.rendered); f.host.remove(); };
    return {...f, bridge, queue, controller, delivery, capability, delivered, tasks, text, input, dispose};
  }

  it.each([
    ["insertText", "x", "breditor/insert-flat-list-text"],
    ["insertText", "x\ny", "breditor/insert-flat-list-plain-text"],
    ["insertParagraph", null, "breditor/insert-flat-list-break"],
    ["deleteContentBackward", null, "breditor/delete-flat-list-backward"],
    ["deleteContentForward", null, "breditor/delete-flat-list-forward"],
    ["deleteContent", null, "breditor/delete-flat-list-selection"],
  ] as const)("maps %s/%s into the explicit list action", (inputType, data, actionId) => {
    const f = eventFixture();
    try {
      const result = translateFlatListBeforeInput({inputType, data, isComposing: false}, false, f.delivery(), noSelectionSync());
      expect(result).toMatchObject({kind: "command", request: {command: {actionId}, delivery: {projection: f.projection}}});
      // @ts-expect-error Legacy translator cannot admit a list command token.
      expect(translateBeforeInput({inputType, data, isComposing: false}, false, f.delivery(), noSelectionSync()).kind).toBe("invalid");
    } finally { f.dispose(); }
  });

  it.each(["formatBold", "formatRemove", "historyUndo", "historyRedo"])("retains semantic intent/history mapping for %s", inputType => {
    const f = eventFixture();
    try {
      const result = translateFlatListBeforeInput({inputType, data: null, isComposing: false}, false, f.delivery(), preserveSelectionSync());
      expect(result.kind).toBe("command");
      if (result.kind === "command") {
        expect(result.request.command).toEqual(inputType.startsWith("history")
          ? {kind: "history", operation: inputType === "historyUndo" ? "undo" : "redo"}
          : {kind: "intent", intentId: inputType === "formatBold" ? "breditor/format-strong" : "breditor/clear-inline-formatting", input: {kind: "none"}});
        expect(result.request.requirements.history).toBe("closeBefore");
      }
    } finally { f.dispose(); }
  });

  it("retains list paths, rejects reversed/wrong-host/surrogate targets and stale ranges", () => {
    const f = eventFixture();
    try {
      const empty = f.rendered.nodeForAstPath([0, 1, 0])!;
      const range = new StaticRange({startContainer: f.text, startOffset: 1, endContainer: empty, endOffset: 0});
      const mapped = valueOf(mapDomFlatListTargetRange(f.rendered, range));
      expect(isOwnedFlatListTargetRange(mapped)).toBe(true);
      expect(mapped.start).toMatchObject({textPath: [0, 0, 0, 0], utf16Offset: 1});
      expect(mapped.end).toMatchObject({parentPath: [0, 1, 0], childIndex: 0});
      expect(Object.isFrozen(mapped)).toBe(true);
      expect(FlatListTargetRange.create(f.rendered, {kind: "range", start: mapped.end, end: mapped.start}).ok).toBe(false);
      expect(mapDomFlatListTargetRange(f.rendered, new StaticRange({startContainer: f.text, startOffset: 2, endContainer: f.text, endOffset: 3})).ok).toBe(false);
      expect(mapDomFlatListTargetRange(f.rendered, new StaticRange({startContainer: f.text, startOffset: 0, endContainer: document.body, endOffset: 0})).ok).toBe(false);
      // @ts-expect-error A list range must never be mapped as a base range.
      expect(mapDomTargetRange(f.rendered, range).ok).toBe(false);
      f.host.querySelector("ol")!.setAttribute("start", "9");
      expect(mapDomFlatListTargetRange(f.rendered, range).ok).toBe(false);
    } finally { f.dispose(); }
  });

  it("cancels mismatched replacement ranges and admits exact list targets once", () => {
    const f = eventFixture();
    try {
      const wrong = new StaticRange({startContainer: f.text, startOffset: 0, endContainer: f.text, endOffset: 1});
      const blocked = f.input("insertReplacementText", [wrong], "x");
      expect(f.controller.handleBeforeInput(blocked as unknown as InputEvent, f.rendered, f.delivery()))
        .toEqual({kind: "blocked", defaultPrevented: true, reason: "targetRangeMismatch"});
      expect(f.delivered).toHaveLength(0);
      const exact = new StaticRange({startContainer: f.text, startOffset: 1, endContainer: f.text, endOffset: 1});
      const admitted = f.input("insertReplacementText", [exact], "x");
      expect(f.controller.handleBeforeInput(admitted as unknown as InputEvent, f.rendered, f.delivery()).kind).toBe("handled");
      expect(admitted.defaultPrevented).toBe(true); expect(f.delivered).toHaveLength(1);
      expect(f.delivered[0]?.selection).toMatchObject({kind: "range", selection: {anchor: {textPath: [0, 0, 0, 0], utf16Offset: 1}}});
    } finally { f.dispose(); }
  });

  it("synchronizes native list selections but does not queue programmatic echoes", () => {
    const f = eventFixture();
    try {
      const event = {type: "selectionchange", target: document, cancelable: false, defaultPrevented: false} as unknown as Event;
      expect(f.controller.handleSelectionChange(event, f.rendered, f.delivery()).kind).toBe("synchronized");
      expect(f.delivered[0]?.requirements.history).toBe("preserve");
      const point = textPoint([0, 0, 0, 0], 1, "before");
      const selected = valueOf(FlatListRangeSelection.create(f.projection, {kind: "range", anchor: point, focus: point}));
      valueOf(f.bridge.write(f.rendered, selected));
      expect(f.controller.handleSelectionChange(event, f.rendered, f.delivery())).toEqual({kind: "ignored", reason: "programmaticEcho"});
      expect(f.delivered).toHaveLength(1);
    } finally { f.dispose(); }
  });

  it("admits the Chromium trailing-space alias only inside the exact list text path", () => {
    const f = eventFixture("a  ", "b  ");
    try {
      document.getSelection()!.setBaseAndExtent(f.text, 3, f.text, 3);
      const other = f.rendered.nodeForAstPath([0, 1, 0, 0])!;
      const mismatched = new StaticRange({startContainer: other, startOffset: 1, endContainer: other, endOffset: 1});
      expect(f.controller.handleBeforeInput(f.input("insertText", [mismatched], "x") as unknown as InputEvent, f.rendered, f.delivery()))
        .toMatchObject({kind: "blocked", reason: "targetRangeMismatch"});
      const alias = new StaticRange({startContainer: f.text, startOffset: 1, endContainer: f.text, endOffset: 1});
      expect(f.controller.handleBeforeInput(f.input("insertText", [alias], "x") as unknown as InputEvent, f.rendered, f.delivery()).kind).toBe("handled");
      expect(f.delivered[0]?.selection).toMatchObject({kind: "range", selection: {anchor: {textPath: [0, 0, 0, 0], utf16Offset: 3}}});
    } finally { f.dispose(); }
  });

  it("does not evaluate accessor fields in list target or command selection records", () => {
    const f = eventFixture(); const getter = vi.fn(() => "preserve");
    try {
      expect(FlatListTargetRange.create(f.rendered, {kind: "range", get start() { return getter(); }, end: textPoint([0, 0, 0, 0], 1)}).ok).toBe(false);
      expect(translateFlatListBeforeInput({inputType: "insertText", data: "x", isComposing: false}, false, f.delivery(),
        {get kind() { return getter(); }} as never).kind).toBe("invalid");
      expect(getter).not.toHaveBeenCalled();
      expect(() => Reflect.construct(FlatListTargetRange, [Symbol("forged"), f.rendered, {}, {}])).toThrow();
      expect(isOwnedFlatListTargetRange(Object.create(FlatListTargetRange.prototype))).toBe(false);
    } finally { f.dispose(); }
  });

  it("correlates list Enter keyboard echoes without executing a second edit", () => {
    const f = eventFixture();
    try {
      const keyboard = {key: "Enter", code: "Enter", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
        repeat: false, isComposing: false, keyCode: 13, altGraph: false};
      expect(translateFlatListKeyDown(keyboard, {editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled"},
        false, f.delivery(), noSelectionSync())).toMatchObject({kind: "command", request: {command: {actionId: "breditor/insert-flat-list-break"}}});
      const key = {...keyboard, type: "keydown", target: f.host, cancelable: true, defaultPrevented: false,
        getModifierState: () => false, preventDefault() { this.defaultPrevented = true; }};
      expect(f.controller.handleKeyDown(key as unknown as KeyboardEvent, f.rendered, f.delivery()).kind).toBe("handled");
      const echo = f.input("insertParagraph");
      expect(f.controller.handleBeforeInput(echo as unknown as InputEvent, f.rendered, f.delivery()).kind).toBe("keyboardEcho");
      expect(f.delivered).toHaveLength(1); f.tasks.forEach(task => task());
      expect(f.controller.handleBeforeInput(f.input("insertParagraph") as unknown as InputEvent, f.rendered, f.delivery()).kind).toBe("handled");
      expect(f.delivered).toHaveLength(2);
    } finally { f.dispose(); }
  });

  it("keeps list event construction closed to base queues and bridges", () => {
    const f = eventFixture();
    try {
      const options = {selectionBridge: f.bridge, deliveryAuthority: f.capability,
        keyboard: {editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled"} as const};
      // @ts-expect-error Legacy controller cannot receive a list queue/bridge.
      expect(() => new BreditorBrowserEventController(f.queue, options)).toThrow();
      // @ts-expect-error List controller requires a list queue.
      expect(() => new BreditorFlatListBrowserEventController(new BreditorCommandQueue(() => "done"), options)).toThrow();
    } finally { f.dispose(); }
  });

  function queuedRequest(detail = "one") {
    const f = fixture(), token = issueFlatListEditorDeliveryToken(f.projection, f.rendered, 0n, Symbol("queue owner"));
    return flatListCommandRequest(token, preserveSelectionSync(), {kind: "api", detail},
      {kind: "action", actionId: "breditor/wrap-bullet-list", input: {kind: "none"}});
  }

  it("drains list requests FIFO without recursively invoking the executor or observer", () => {
    const first = queuedRequest("one"), second = queuedRequest("two"), third = queuedRequest("three");
    const order: string[] = []; let depth = 0;
    const queue: BreditorFlatListCommandQueue<string> = new BreditorFlatListCommandQueue(request => {
      depth += 1; expect(depth).toBe(1); order.push(`execute:${request.source.detail}`);
      if (request.source.detail === "one") expect(queue.submit(second)).toEqual({status: "queued", sequence: 2n});
      depth -= 1; return request.source.detail;
    }, {observer: delivery => {
      order.push(`observe:${delivery.result}`);
      if (delivery.sequence === 1n) expect(queue.submit(third)).toEqual({status: "queued", sequence: 3n});
      expect(Object.isFrozen(delivery.request)).toBe(true);
    }});
    expect(queue.submit(first)).toEqual({status: "completed", sequence: 1n, result: "one"});
    expect(order).toEqual(["execute:one", "observe:one", "execute:two", "observe:two", "execute:three", "observe:three"]);
    expect(queue.pendingCount).toBe(0); expect(queue.failure).toBeUndefined();
  });

  it("uses authoritative list queue capacity even when public getters are replaced", () => {
    const request = queuedRequest();
    const queue: BreditorFlatListCommandQueue<string> = new BreditorFlatListCommandQueue(() => {
      expect(queue.submit(request)).toEqual({status: "rejected", reason: "capacity"}); return "done";
    }, {capacity: 1});
    Object.defineProperty(queue, "pendingCount", {get: () => 0});
    Object.defineProperty(queue, "capacity", {get: () => 999});
    expect(queue.submit(request).status).toBe("completed");
  });

  it("rejects base requests even through a borrowed legacy submit method", () => {
    const projection = valueOf(BaseDocumentProjection.create({schema: {name: "breditor/base", version: 1},
      snapshot: {lineage: "base-queue", revision: "0"}, paragraphs: [{runs: []}]}));
    const rendered = valueOf(new BreditorDomRenderer().render(document.createElement("div"), projection)).rendered;
    const token = issueEditorDeliveryToken(projection, rendered, 0n, Symbol());
    const request = noInputActionRequest(token, preserveSelectionSync(), {kind: "api", detail: "base"}, "breditor/delete-backward");
    const executor = vi.fn(); const queue = new BreditorFlatListCommandQueue(executor);
    expect(queue.submit(request as never)).toEqual({status: "rejected", reason: "invalidRequest"});
    expect(Reflect.apply(BreditorCommandQueue.prototype.submit, queue, [request])).toEqual({status: "rejected", reason: "invalidRequest"});
    expect(executor).not.toHaveBeenCalled();
  });

  it.each(["executor throw", "executor async", "observer throw", "observer async"])("quarantines list work after %s without retry", fault => {
    const request = queuedRequest(); let executions = 0;
    const queue: BreditorFlatListCommandQueue<unknown> = new BreditorFlatListCommandQueue<unknown>(() => {
      executions += 1; queue.submit(request);
      if (fault === "executor throw") throw new Error("uncertain");
      if (fault === "executor async") return Promise.resolve("uncertain");
      return "done";
    }, {observer: () => {
      if (fault === "observer throw") throw new Error("uncertain");
      if (fault === "observer async") return Promise.resolve();
      return undefined;
    }});
    expect(queue.submit(request).status).toBe("failed");
    expect(queue.failure?.code).toBe(fault.startsWith("executor") ? "command_queue.executor_threw" : "command_queue.observer_threw");
    expect(executions).toBe(1); expect(queue.pendingCount).toBe(1);
    expect(queue.submit(request)).toEqual({status: "rejected", reason: "failed"});
    queue.dispose(); expect(queue.pendingCount).toBe(0);
    expect(queue.submit(request)).toEqual({status: "rejected", reason: "disposed"});
  });

  it("binds list leases to their exact executor and mode and spends malformed settlements once", () => {
    const request = queuedRequest(), executor = vi.fn(() => "done");
    const queue = new BreditorFlatListCommandQueue(executor);
    expect(openFlatListCommandQueueLeasePort(queue, () => "done")).toBeUndefined();
    expect(openCommandQueueLeasePort(queue as never, executor)).toBeUndefined();
    expect(openFlatListCommandQueueLeasePort(new BreditorCommandQueue(executor) as never, executor)).toBeUndefined();
    const port = openFlatListCommandQueueLeasePort(queue, executor)!;
    Object.defineProperty(queue, "submit", {value: () => { throw new Error("public override"); }});
    const lease = port.acquireLease()!;
    expect(port.acquireLease()).toBeUndefined();
    expect(port.submitLeased(lease, {...request, extra: true} as never)).toEqual({status: "rejected", reason: "invalidRequest"});
    expect(port.submitLeased(lease, request)).toEqual({status: "rejected", reason: "leased"});
    expect(executor).not.toHaveBeenCalled(); expect(port.releaseLease(lease)).toBe(true);
    const next = port.acquireLease()!;
    expect(port.submitLeased(next, request)).toEqual({status: "completed", sequence: 1n, result: "done"});
    expect(executor).toHaveBeenCalledOnce(); expect(port.releaseLease(next)).toBe(true);
  });

  it("keeps list queue leases exclusive through observer callbacks", () => {
    const request = queuedRequest(), executor = vi.fn(() => "done");
    let lease: ReturnType<NonNullable<ReturnType<typeof openFlatListCommandQueueLeasePort>>["acquireLease"]>;
    const queue = new BreditorFlatListCommandQueue(executor, {observer: () => {
      expect(queue.submit(request)).toEqual({status: "rejected", reason: "leased"});
      expect(port.releaseLease(lease!)).toBe(false);
    }});
    const port = openFlatListCommandQueueLeasePort(queue, executor)!; lease = port.acquireLease();
    expect(port.submitLeased(lease!, request).status).toBe("completed");
    expect(port.releaseLease(lease!)).toBe(true);
  });

  it("rechecks disposal after inspecting a list request proxy", () => {
    const request = queuedRequest(), executor = vi.fn();
    const queue = new BreditorFlatListCommandQueue(executor);
    const proxy = new Proxy(request, {ownKeys(target) { queue.dispose(); return Reflect.ownKeys(target); }});
    expect(queue.submit(proxy)).toEqual({status: "rejected", reason: "disposed"});
    expect(executor).not.toHaveBeenCalled(); expect(queue.pendingCount).toBe(0);
  });

  it("lets the owning executor reject a queued stale epoch without applying it twice", () => {
    const f = fixture(), authority = Symbol(), token = issueFlatListEditorDeliveryToken(f.projection, f.rendered, 0n, authority);
    const request = flatListCommandRequest(token, preserveSelectionSync(), {kind: "api", detail: "list"}, {kind: "history", operation: "undo"});
    let epoch = 0n, applied = 0; const results: string[] = [];
    const queue: BreditorFlatListCommandQueue<string> = new BreditorFlatListCommandQueue<string>((request: FlatListEditorCommandRequest) => {
      if (!flatListEditorDeliveryTokenMatches(request.delivery, f.rendered, epoch, authority)) return "stale";
      queue.submit(request); applied += 1; epoch += 1n; return "applied";
    }, {observer: delivery => { results.push(delivery.result); }});
    expect(queue.submit(request).status).toBe("completed");
    expect(applied).toBe(1); expect(results).toEqual(["applied", "stale"]);
  });

  it("binds list delivery to exact render, authority and observation epoch", () => {
    const f = fixture(), authority = Symbol("list owner");
    const token = issueFlatListEditorDeliveryToken(f.projection, f.rendered, 4n, authority);
    expect(Object.isFrozen(token)).toBe(true);
    expect(flatListEditorDeliveryTokenMatches(token, f.rendered, 4n, authority)).toBe(true);
    expect(flatListEditorDeliveryTokenMatches(token, f.rendered, 5n, authority)).toBe(false);
    expect(flatListEditorDeliveryTokenMatches(token, f.rendered, 4n, Symbol("list owner"))).toBe(false);
    expect(flatListEditorDeliveryTokenMatchesRender({ ...token }, f.rendered)).toBe(false);
    expect(editorDeliveryTokenMatchesRender(token, f.rendered)).toBe(false);
    const port = issueEditorDeliveryAuthority(candidate => flatListEditorDeliveryTokenMatches(candidate, f.rendered, 4n, authority));
    expect(flatListEditorDeliveryAuthorityAccepts(port, token)).toBe(true);
    expect(editorDeliveryAuthorityAccepts(port, token)).toBe(false);
    expect(flatListEditorDeliveryAuthorityAccepts(issueEditorDeliveryAuthority(() => { throw new Error("owner failed"); }), token)).toBe(false);
    const next = valueOf(f.renderer.renderFlatList(f.host, f.make(1))).rendered;
    expect(flatListEditorDeliveryTokenMatchesRender(token, next)).toBe(false);
    expect(() => issueFlatListEditorDeliveryToken(f.projection, next, 4n, authority)).toThrow();
  });

  it("admits every supported command shape with exact backward list selection and immutable values", () => {
    const f = fixture(), token = issueFlatListEditorDeliveryToken(f.projection, f.rendered, 0n, Symbol());
    const selection = valueOf(FlatListRangeSelection.create(f.projection, {kind: "range",
      anchor: textPoint([1, 0], 2, "before"), focus: textPoint([0, 0, 0, 0], 1)}));
    const commands: EngineCommand[] = [
      {kind: "action", actionId: "breditor/wrap-bullet-list", input: {kind: "none"}},
      {kind: "action", actionId: "breditor/insert-flat-list-text", input: {kind: "string", value: "🙂"}},
      {kind: "action", actionId: "example/typed", input: {kind: "json", value: "{}"}},
      {kind: "intent", intentId: "breditor/format-bullet-list", input: {kind: "none"}},
      {kind: "intent", intentId: "example/typed", input: {kind: "json", value: "{}"}},
      {kind: "history", operation: "undo"}, {kind: "history", operation: "redo"},
      {kind: "control", operation: "closeHistoryGroup"}, {kind: "selection", operation: "synchronize"},
    ];
    for (const command of commands) {
      const request = flatListCommandRequest(token, flatListRangeSelectionSync(selection), {kind: "api", detail: "list test"}, command);
      expect(canonicalFlatListEditorCommandRequest(request)).toEqual(request);
      expect(request.selection).toEqual({kind: "range", selection});
      expect(request.command).not.toBe(command);
      expect(Object.isFrozen(request)).toBe(true); expect(Object.isFrozen(request.command)).toBe(true);
      expect(Object.isFrozen(request.requirements)).toBe(true); expect(Object.isFrozen(request.source)).toBe(true);
      expect(request.requirements.history).toBe(command.kind === "history" ? "closeBefore" : "preserve");
      expect(canonicalEditorCommandRequest(request)).toBeNull();
    }
    const execute = vi.fn(); const queue = new BreditorCommandQueue(execute);
    const request = flatListCommandRequest(token, preserveSelectionSync(), {kind: "api", detail: "list"}, commands[0]!);
    expect(queue.submit(request as never)).toEqual({status: "rejected", reason: "invalidRequest"});
    expect(execute).not.toHaveBeenCalled();
    expect(() => noInputActionRequest(token as never, preserveSelectionSync(), {kind: "api", detail: "list"}, "breditor/wrap-bullet-list")).toThrow();
  });

  it("rejects copied and equal-looking foreign selections without consulting accessor payloads", () => {
    const f = fixture(), token = issueFlatListEditorDeliveryToken(f.projection, f.rendered, 0n, Symbol());
    const point = textPoint([0, 0, 0, 0], 1);
    const selected = valueOf(FlatListRangeSelection.create(f.projection, {kind: "range", anchor: point, focus: point}));
    const other = valueOf(FlatListRangeSelection.create(f.make(), {kind: "range", anchor: point, focus: point}));
    const request = flatListCommandRequest(token, flatListRangeSelectionSync(selected), {kind: "api", detail: "list"}, {kind: "history", operation: "undo"});
    expect(canonicalFlatListEditorCommandRequest({...request, selection: {kind: "range", selection: other}})).toBeNull();
    expect(canonicalFlatListEditorCommandRequest({...request, selection: {kind: "range", selection: {...selected}}})).toBeNull();
    expect(canonicalFlatListEditorCommandRequest({...request, delivery: {...token}})).toBeNull();
    const getter = vi.fn(() => request.command);
    const accessor = {...request}; Object.defineProperty(accessor, "command", {get: getter});
    expect(canonicalFlatListEditorCommandRequest(accessor)).toBeNull(); expect(getter).not.toHaveBeenCalled();
    const kindGetter = vi.fn(() => "history");
    const command = {get kind() { return kindGetter(); }, operation: "undo"};
    expect(() => flatListCommandRequest(token, preserveSelectionSync(), {kind: "api", detail: "list"}, command as never)).toThrow();
    expect(kindGetter).not.toHaveBeenCalled();
    const selectionGetter = vi.fn(() => "preserve");
    expect(() => flatListCommandRequest(token, {get kind() { return selectionGetter(); }} as never,
      {kind: "api", detail: "list"}, {kind: "history", operation: "undo"})).toThrow();
    expect(selectionGetter).not.toHaveBeenCalled();
    expect(() => flatListRangeSelectionSync({...selected} as never)).toThrow();
  });

  it("retains command text limits, closed records and synchronization/history rules for lists", () => {
    const f = fixture(), token = issueFlatListEditorDeliveryToken(f.projection, f.rendered, 0n, Symbol());
    const valid = flatListCommandRequest(token, noSelectionSync(), {kind: "api", detail: "list"},
      {kind: "action", actionId: "breditor/insert-flat-list-text", input: {kind: "string", value: "🙂"}});
    expect(() => flatListCommandRequest(token, noSelectionSync(), {kind: "api", detail: "list"}, valid.command, null as never)).toThrow();
    for (const text of ["", "\ud800", "x".repeat(65_537), "🙂".repeat(16_385)]) {
      expect(canonicalFlatListEditorCommandRequest({...valid, command: {kind: "action", actionId: "breditor/insert-flat-list-text", input: {kind: "string", value: text}}})).toBeNull();
    }
    for (const value of [{...valid, extra: true}, {...valid, command: {kind: "history", operation: "undo"}},
      {...valid, command: {kind: "selection", operation: "synchronize"}},
      {...valid, requirements: {selection: "preserve", history: "preserve"}},
      {...valid, command: {kind: "intent", intentId: "example/typed", input: {kind: "string", value: "bad"}}},
    ]) expect(canonicalFlatListEditorCommandRequest(value)).toBeNull();
    const ids = flatListBrowserInputActionIds(token);
    expect(ids.insertText).toBe("breditor/insert-flat-list-text"); expect(ids.insertParagraphBreak).toBe("breditor/insert-flat-list-break");
    expect(Object.isFrozen(ids)).toBe(true);
    expect(() => browserInputActionIds(token as never)).toThrow();
    expect(() => flatListBrowserInputActionIds({...token} as never)).toThrow();
  });

  it("renders semantic list containers with real text and wrapper AST paths", () => {
    const {renderer, host, projection, rendered} = fixture();
    expect(host.innerHTML).toBe('<ol start="8"><li><h2><strong>a🙂b</strong></h2></li><li><p><br></p></li></ol><p>tail</p><ul><li><p>bullet</p></li></ul>');
    expect(renderer.ownsFlatList(rendered)).toBe(true);
    expect(renderer.owns(rendered)).toBe(false);
    expect(isOwnedFlatListRenderedProjection(rendered)).toBe(true);
    expect(isOwnedRenderedProjection(rendered)).toBe(false);
    expect(rendered.projection).toBe(projection);
    for (const path of [[], [0], [0, 0], [0, 0, 0], [0, 0, 0, 0], [0, 1, 0], [1], [1, 0], [2, 0, 0, 0]]) {
      const node = rendered.nodeForAstPath(path);
      expect(node).not.toBeNull();
      expect(rendered.astPathForDomNode(node!)).toEqual(path);
    }
    expect(rendered.astPathForDomNode(host.querySelector("strong")!)).toBeNull();
    expect(rendered.astPathForDomNode(host.querySelector("br")!)).toBeNull();
    expect(rendered.nodeForAstPath([0, 0, 0, 0, 0])).toBeNull();
    expect(renderer.releaseFlatList(rendered)).toBe(true);
    expect(rendered.current).toBe(false);
    expect(rendered.nodeForAstPath([0])).toBeNull();
    expect(renderer.releaseFlatList(rendered)).toBe(false);
  });

  it("preserves independent immutable reverse paths through repeated mixed-depth validation", () => {
    const {rendered} = fixture();
    // Ordered-list heading, empty item, root paragraph and trailing bullet list
    // exercise every depth transition in the complete canonical DOM proof.
    const paths = [[], [0], [0, 0], [0, 0, 0], [0, 0, 0, 0], [0, 1], [0, 1, 0],
      [1], [1, 0], [2], [2, 0], [2, 0, 0], [2, 0, 0, 0]];
    const retained = paths.map(path => {
      const node = rendered.nodeForAstPath(path)!;
      return {node, reverse: rendered.astPathForDomNode(node), expected: [...path]};
    });
    expect(new Set(retained.map(entry => entry.reverse)).size).toBe(paths.length);
    for (let pass = 0; pass < 3; pass += 1) {
      expect(rendered.validateCanonicalDom()).toBe(true);
      for (const {node, reverse, expected} of retained) {
        expect(Object.isFrozen(reverse)).toBe(true);
        expect(reverse).toEqual(expected);
        expect(rendered.astPathForDomNode(node)).toBe(reverse);
        expect(rendered.nodeForAstPath(expected)).toBe(node);
      }
    }
  });

  it("rejects implicit legacy list renders and missing/foreign presentations without mutation", () => {
    const {renderer, host, projection, rendered} = fixture();
    const before = host.innerHTML;
    // @ts-expect-error Lists are not paragraph documents.
    expect(renderer.render(host, projection).ok).toBe(false);
    expect(new BreditorDomRenderer().renderFlatList(host, projection).ok).toBe(false);
    const foreign = fixture();
    expect(foreign.renderer.renderFlatList(host, projection).ok).toBe(false);
    expect(host.innerHTML).toBe(before);
    expect(renderer.ownsFlatList(rendered)).toBe(true);
  });

  it("maps Unicode text, inline wrappers, empty placeholders and item edges", () => {
    const {host, rendered} = fixture();
    const text = rendered.nodeForAstPath([0, 0, 0, 0])!;
    expect(mapDomPointToFlatListSelectionPoint(rendered, text, 3)).toMatchObject({ok: true, value: textPoint([0, 0, 0, 0], 3)});
    expect(mapDomPointToFlatListSelectionPoint(rendered, text, 2)).toMatchObject({ok: false, error: {code: "selection.invalid_utf16_boundary"}});
    for (const offset of [-1, 5, NaN, 0.5]) expect(mapDomPointToFlatListSelectionPoint(rendered, text, offset).ok).toBe(false);
    expect(mapDomPointToFlatListSelectionPoint(rendered, host.querySelector("strong")!, 1)).toMatchObject({ok: true, value: textPoint([0, 0, 0, 0], 4, "before")});
    const empty = rendered.nodeForAstPath([0, 1, 0])!;
    for (const [node, offset] of [[empty, 0], [empty, 1], [host.querySelector("br")!, 0]] as const) {
      expect(mapDomPointToFlatListSelectionPoint(rendered, node, offset)).toMatchObject({ok: true, value: {kind: "children", parentPath: [0, 1, 0], childIndex: 0, affinity: "after"}});
    }
    expect(mapDomPointToFlatListSelectionPoint(rendered, empty, 2).ok).toBe(false);
    const item = rendered.nodeForAstPath([0, 0])!;
    expect(mapDomPointToFlatListSelectionPoint(rendered, item, 1)).toMatchObject({ok: true, value: {parentPath: [0, 0, 0], childIndex: 1, affinity: "before"}});
  });

  it("normalizes only outer root/list edges and rejects ambiguous interior gaps", () => {
    const {host, rendered} = fixture();
    expect(mapDomPointToFlatListSelectionPoint(rendered, host, 0)).toMatchObject({ok: true, value: {parentPath: [0, 0, 0], childIndex: 0}});
    expect(mapDomPointToFlatListSelectionPoint(rendered, host, 3)).toMatchObject({ok: true, value: {parentPath: [2, 0, 0], childIndex: 1}});
    for (const offset of [1, 2, 4]) expect(mapDomPointToFlatListSelectionPoint(rendered, host, offset).ok).toBe(false);
    const list = rendered.nodeForAstPath([0])!;
    expect(mapDomPointToFlatListSelectionPoint(rendered, list, 1).ok).toBe(false);
    expect(mapDomPointToFlatListSelectionPoint(rendered, list, 2)).toMatchObject({ok: true, value: {parentPath: [0, 1, 0], childIndex: 0}});
    expect(mapDomPointToFlatListSelectionPoint(rendered, document.createTextNode("outside"), 0).ok).toBe(false);
  });

  it("round-trips semantic endpoints to DOM while retaining exact directional selection", () => {
    const {projection, rendered} = fixture();
    const anchor = textPoint([1, 0], 3, "before");
    const focus = textPoint([0, 0, 0, 0], 1);
    const selection = valueOf(FlatListRangeSelection.create(projection, {kind: "range", anchor, focus}));
    expect(selection.order).toBe("backward");
    expect(selection.anchor).toEqual(anchor);
    expect(selection.focus).toEqual(focus);
    expect(isOwnedFlatListRangeSelection(selection)).toBe(true);
    anchor.textPath[0] = 99;
    expect(selection.anchor).toMatchObject({textPath: [1, 0]});
    for (const point of [selection.anchor, selection.focus]) {
      const dom = valueOf(mapFlatListSelectionPointToDomPoint(rendered, point));
      const roundtrip = valueOf(mapDomPointToFlatListSelectionPoint(rendered, dom.node, dom.offset));
      expect(roundtrip).toMatchObject({kind: "text", textPath: point.kind === "text" ? point.textPath : [], utf16Offset: point.kind === "text" ? point.utf16Offset : 0});
    }
    const equivalent = valueOf(FlatListRangeSelection.create(projection, {kind: "range",
      anchor: textPoint([0, 0, 0, 0], 4, "before"), focus: {kind: "children", parentPath: [0, 0, 0], childIndex: 1, affinity: "after"}}));
    expect(equivalent.order).toBe("collapsed");
    expect(equivalent.anchor.affinity).toBe("before");
    expect(equivalent.focus.affinity).toBe("after");
    expect(() => Reflect.construct(FlatListRangeSelection, [Symbol("forged")])).toThrow(TypeError);
  });

  it.each([[0], [0, 0], [0, 0, 1], [0, 0, 0, 5], [3, 0], [0, 0, 0, 0, 0]])("rejects invalid text path %j", (...path) => {
    const {projection, rendered} = fixture();
    const point = textPoint(path, 0);
    expect(FlatListRangeSelection.create(projection, {kind: "range", anchor: point, focus: point}).ok).toBe(false);
    expect(mapFlatListSelectionPointToDomPoint(rendered, point).ok).toBe(false);
  });

  it.each(["numbering", "list-attribute", "item-attribute", "tag", "extra-item", "placeholder"])("invalidates %s drift synchronously before selection mapping", fault => {
    const {host, rendered} = fixture();
    const text = rendered.nodeForAstPath([0, 0, 0, 0])!;
    if (fault === "numbering") host.querySelector("ol")!.setAttribute("start", "08");
    if (fault === "list-attribute") host.querySelector("ul")!.setAttribute("class", "extra");
    if (fault === "item-attribute") host.querySelector("li")!.setAttribute("value", "20");
    if (fault === "tag") host.querySelector("h2")!.replaceWith(document.createElement("p"));
    if (fault === "extra-item") host.querySelector("ol")!.append(document.createElement("li"));
    if (fault === "placeholder") host.querySelector("br")!.remove();
    expect(mapDomPointToFlatListSelectionPoint(rendered, text, 0)).toMatchObject({ok: false, error: {code: "selection.dom_drift"}});
    expect(rendered.current).toBe(false);
    expect(rendered.nodeForAstPath([0])).toBeNull();
  });

  it.each(["ol", "li", "h2", "strong", "p", "ul"])("rejects an identical %s clone with different mapped node identities", selector => {
    const {host, rendered} = fixture();
    const text = rendered.nodeForAstPath([0, 0, 0, 0])!;
    const before = host.innerHTML;
    const original = host.querySelector(selector)!;
    original.replaceWith(original.cloneNode(true));
    expect(host.innerHTML).toBe(before);
    // The semantic shape is unchanged, but the bidirectional ownership maps
    // must still reject replacement DOM before the observer callback runs.
    expect(mapDomPointToFlatListSelectionPoint(rendered, text, 0)).toMatchObject({ok: false, error: {code: "selection.dom_drift"}});
    expect(rendered.current).toBe(false);
  });

  it.each(["block-attribute", "item-attribute-shadow", "block-namespaced-attribute", "wrapper-attribute", "wrapper-tag", "wrapper-child", "wrapper-comment",
    "nested-wrapper", "text-value", "text-identity", "extra-run", "placeholder-attribute",
    "placeholder-child", "placeholder-text", "extra-placeholder"])("rejects flat-list %s drift before observer delivery", fault => {
    const {host, rendered} = fixture();
    const text = rendered.nodeForAstPath([0, 0, 0, 0])!;
    const block = host.querySelector("h2")!;
    const wrapper = host.querySelector("strong")!;
    const placeholder = host.querySelector("br")!;
    if (fault === "block-attribute") block.setAttribute("class", "foreign");
    if (fault === "item-attribute-shadow") {
      const item = host.querySelector("li")!;
      item.setAttribute("data-foreign", "");
      Object.defineProperty(item, "hasAttributes", {value: () => false});
      Object.defineProperty(item, "getAttributeNames", {value: () => []});
    }
    if (fault === "block-namespaced-attribute") block.setAttributeNS("urn:breditor-test", "test:value", "");
    if (fault === "wrapper-attribute") wrapper.setAttribute("title", "foreign");
    if (fault === "wrapper-tag") {
      const replacement = document.createElement("em");
      replacement.append(...wrapper.childNodes); wrapper.replaceWith(replacement);
    }
    if (fault === "wrapper-child") wrapper.append(document.createTextNode(""));
    if (fault === "wrapper-comment") wrapper.append(document.createComment(""));
    if (fault === "nested-wrapper") {
      const nested = document.createElement("em");
      nested.append(...wrapper.childNodes); wrapper.append(nested);
    }
    if (fault === "text-value") text.nodeValue = "changed";
    if (fault === "text-identity") text.parentNode!.replaceChild(text.cloneNode(), text);
    if (fault === "extra-run") block.append(document.createElement("br"));
    if (fault === "placeholder-attribute") placeholder.setAttribute("title", "foreign");
    if (fault === "placeholder-child") placeholder.append(document.createTextNode(""));
    if (fault === "placeholder-text") placeholder.replaceWith(document.createTextNode(""));
    if (fault === "extra-placeholder") placeholder.after(document.createElement("br"));
    expect(mapDomPointToFlatListSelectionPoint(rendered, text, 0)).toMatchObject({ok: false, error: {code: "selection.dom_drift"}});
    expect(rendered.current).toBe(false);
  });

  it("invalidates prior generations and arbitrates the host with legacy renderers", () => {
    const {host, renderer, rendered, make} = fixture();
    const next = valueOf(renderer.renderFlatList(host, make(1))).rendered;
    expect(rendered.current).toBe(false);
    expect(mapFlatListSelectionPointToDomPoint(rendered, textPoint([1, 0], 0)).ok).toBe(false);
    const legacy = new BreditorDomRenderer();
    const plain = valueOf(legacy.render(host, projection(0, [[{text: "legacy", strong: false}]]))).rendered;
    expect(next.current).toBe(false);
    expect(renderer.releaseFlatList(next)).toBe(false);
    expect(legacy.owns(plain)).toBe(true);
  });

  it("preserves current DOM when detached list construction fails", () => {
    const {host, renderer, rendered, make} = fixture();
    const before = host.innerHTML;
    const original = document.createElementNS.bind(document);
    const spy = vi.spyOn(document, "createElementNS").mockImplementation((namespace, name, options) => {
      if (name === "li") throw new Error("fixture failure");
      return original(namespace, name, options);
    });
    try { expect(renderer.renderFlatList(host, make(1))).toMatchObject({ok: false, error: {code: "renderer.dom_write_failed"}}); }
    finally { spy.mockRestore(); }
    expect(host.innerHTML).toBe(before);
    expect(renderer.ownsFlatList(rendered)).toBe(true);
  });

  it("blocks reentrant installation and refuses to overwrite constructor-time DOM drift", () => {
    const {host, renderer, rendered, make} = fixture();
    const next = make(1);
    const original = document.createElementNS.bind(document);
    let entered = false;
    let nested: unknown;
    const spy = vi.spyOn(document, "createElementNS").mockImplementation((namespace, name, options) => {
      if (!entered && name === "ol") {
        entered = true;
        nested = renderer.renderFlatList(host, next);
        host.querySelector("ol")!.setAttribute("start", "9");
      }
      return original(namespace, name, options);
    });
    try { expect(renderer.renderFlatList(host, next)).toMatchObject({ok: false, error: {code: "renderer.dom_write_failed"}}); }
    finally { spy.mockRestore(); }
    expect(nested).toMatchObject({ok: false, error: {code: "renderer.dom_write_failed"}});
    expect(host.querySelector("ol")!.getAttribute("start")).toBe("9");
    expect(rendered.current).toBe(false);
  });

  it("rejects own-data selection getters, invalid affinities and forged ranges", () => {
    const {projection, rendered} = fixture();
    const getter = vi.fn(() => 0);
    const point = {kind: "text", textPath: [0, 0, 0, 0], get utf16Offset() { return getter(); }, affinity: "after"};
    expect(FlatListRangeSelection.create(projection, {kind: "range", anchor: point, focus: point}).ok).toBe(false);
    expect(mapFlatListSelectionPointToDomPoint(rendered, point).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(isOwnedFlatListRangeSelection(Object.create(FlatListRangeSelection.prototype))).toBe(false);
    const badAffinity = textPoint([0, 0, 0, 0], 0, "forward");
    expect(FlatListRangeSelection.create(projection, {kind: "range", anchor: badAffinity, focus: badAffinity}).ok).toBe(false);
    const sparse = textPoint(new Array(4), 0);
    expect(FlatListRangeSelection.create(projection, {kind: "range", anchor: sparse, focus: sparse}).ok).toBe(false);
  });

  it("round-trips every scalar and text-container boundary in a mixed tree", () => {
    const {projection, rendered} = fixture();
    for (const {path, block} of projection.textBlocks) {
      const points: unknown[] = [];
      for (let childIndex = 0; childIndex <= block.runs.length; childIndex += 1) points.push({kind: "children", parentPath: path, childIndex, affinity: "after"});
      block.runs.forEach((run, runIndex) => {
        let offset = 0;
        points.push(textPoint([...path, runIndex], 0));
        for (const scalar of run.text) {
          offset += scalar.length;
          points.push(textPoint([...path, runIndex], offset));
        }
      });
      for (const point of points) {
        const dom = valueOf(mapFlatListSelectionPointToDomPoint(rendered, point));
        const back = valueOf(mapDomPointToFlatListSelectionPoint(rendered, dom.node, dom.offset));
        const range = valueOf(FlatListRangeSelection.create(projection, {kind: "range", anchor: point, focus: back}));
        expect(range.order).toBe("collapsed");
      }
    }
  });

  it("preserves every subtree for a verified document-unchanged update", () => {
    const {renderer, host, projection, rendered, make} = fixture();
    const prior = [...host.children];
    const result = make(1);
    const update = valueOf(FlatListProjectionUpdate.create({base: projection, result, impact: {kind: "none"}}));
    const next = valueOf(renderer.updateFlatList(rendered, update));
    expect(next.mode).toBe("incremental");
    expect([...host.children]).toEqual(prior);
    expect(rendered.current).toBe(false);
    expect(next.rendered.projection).toBe(result);
    expect(next.rendered.validateCanonicalDom()).toBe(true);
    expect(Object.isFrozen(update)).toBe(true);
    expect(() => Reflect.construct(FlatListProjectionUpdate, [Symbol("forged")])).toThrow(TypeError);
  });

  it("retains and remaps a whole list after a root deletion", () => {
    const {renderer, host, projection, rendered, make, inputBlocks} = fixture();
    const priorTail = host.children[1], priorList = host.children[2];
    const priorText = rendered.nodeForAstPath([2, 0, 0, 0]);
    const result = make(1, inputBlocks().slice(1));
    const update = valueOf(FlatListProjectionUpdate.create({base: projection, result,
      impact: {kind: "rootSplice", oldRange: {start: 0, end: 1}, newRange: {start: 0, end: 0}}}));
    const next = valueOf(renderer.updateFlatList(rendered, update));
    expect(next.mode).toBe("incremental");
    expect(host.children[0]).toBe(priorTail); expect(host.children[1]).toBe(priorList);
    expect(next.rendered.nodeForAstPath([1, 0, 0, 0])).toBe(priorText);
    expect(next.rendered.astPathForDomNode(priorText!)).toEqual([1, 0, 0, 0]);
    expect(next.rendered.nodeForAstPath([2, 0, 0, 0])).toBeNull();
  });

  it("limits textContainers to bare root blocks and preserves unrelated lists", () => {
    const {renderer, host, projection, rendered, make, inputBlocks} = fixture();
    const blocks = inputBlocks(); blocks[1]!.block!.runs[0]!.text = "changed";
    const result = make(1, blocks), prior = [...host.children];
    const update = valueOf(FlatListProjectionUpdate.create({base: projection, result, impact: {kind: "textContainers", paragraphIndexes: [1]}}));
    const next = valueOf(renderer.updateFlatList(rendered, update));
    expect(next.mode).toBe("incremental");
    expect(host.children[0]).toBe(prior[0]); expect(host.children[2]).toBe(prior[2]);
    expect(host.children[1]).not.toBe(prior[1]); expect(host.children[1]?.textContent).toBe("changed");
    expect(FlatListProjectionUpdate.create({base: projection, result, impact: {kind: "textContainers", paragraphIndexes: [0]}}).ok).toBe(false);
    expect(FlatListProjectionUpdate.create({base: projection, result, impact: {kind: "none"}}).ok).toBe(false);
  });

  it.each(["start", "rank", "text"])("rejects a false narrow claim hiding a list %s change", change => {
    const {projection, make, inputBlocks} = fixture();
    const blocks = inputBlocks();
    if (change === "start") blocks[0]!.start = 9;
    if (change === "rank") blocks[0]!.items![0]!.headingLevel = 3;
    if (change === "text") blocks[0]!.items![0]!.runs[0]!.text = "different";
    const result = make(1, blocks);
    for (const impact of [{kind: "none"}, {kind: "textContainers", paragraphIndexes: [1]},
      {kind: "rootSplice", oldRange: {start: 1, end: 2}, newRange: {start: 1, end: 2}}]) {
      expect(FlatListProjectionUpdate.create({base: projection, result, impact}).ok).toBe(false);
    }
    expect(FlatListProjectionUpdate.create({base: projection, result, impact: {kind: "root"}}).ok).toBe(true);
  });

  it("falls back to a full checked render for root impact or synchronous DOM drift", () => {
    for (const drift of [false, true]) {
      const {renderer, host, projection, rendered, make} = fixture();
      const prior = host.children[0];
      const update = valueOf(FlatListProjectionUpdate.create({base: projection, result: make(1), impact: {kind: drift ? "none" : "root"}}));
      if (drift) host.querySelector("ol")!.setAttribute("start", "99");
      const next = valueOf(renderer.updateFlatList(rendered, update));
      expect(next).toMatchObject({mode: "full", fallbackReason: drift ? "domDrift" : "root"});
      expect(host.children[0]).not.toBe(prior);
      expect(next.rendered.validateCanonicalDom()).toBe(true);
    }
  });

  it("rejects nonconsecutive/foreign bases, wrong-mode and stale updates before mutation", () => {
    const {renderer, host, projection, rendered, make} = fixture();
    for (const result of [make(0), make(2), fixture().make(1)]) expect(FlatListProjectionUpdate.create({base: projection, result, impact: {kind: "root"}}).ok).toBe(false);
    const update = valueOf(FlatListProjectionUpdate.create({base: projection, result: make(1), impact: {kind: "none"}}));
    // @ts-expect-error List updates must not enter the legacy renderer.
    expect(renderer.update(rendered, update).ok).toBe(false);
    expect(new BreditorDomRenderer().updateFlatList(rendered, update).ok).toBe(false);
    valueOf(renderer.updateFlatList(rendered, update));
    const before = host.innerHTML;
    expect(renderer.updateFlatList(rendered, update).ok).toBe(false); expect(host.innerHTML).toBe(before);
  });

  it("copies impact records and rejects sparse/getter/invalid ranges", () => {
    const {projection, make} = fixture(); const result = make(1);
    const impact = {kind: "rootSplice", oldRange: {start: 0, end: 1}, newRange: {start: 0, end: 1}};
    const update = valueOf(FlatListProjectionUpdate.create({base: projection, result, impact}));
    impact.oldRange.end = 3;
    expect(update.impact).toMatchObject({oldRange: {end: 1}});
    expect(Object.isFrozen(flatListUpdatePlan(update))).toBe(true);
    const getter = vi.fn(() => "none");
    for (const invalid of [{get kind() {return getter();}}, {kind: "textContainers", paragraphIndexes: new Array(1)},
      {kind: "textContainers", paragraphIndexes: [1, 1]}, {kind: "rootSplice", oldRange: {start: 0, end: 4}, newRange: {start: 0, end: 3}},
      {kind: "rootSplice", oldRange: {start: 0, end: 1}, newRange: {start: 1, end: 2}}]) expect(FlatListProjectionUpdate.create({base: projection, result, impact: invalid}).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
});

function valueOf<T>(result:
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{ code: string; message: string }>;
    }>
): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function projection(revision: number, paragraphs: readonly (readonly Run[])[]) {
  return valueOf(
    BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "dom-tests", revision: String(revision) },
      paragraphs: paragraphs.map((runs) => ({ runs })),
    }),
  );
}

function render(
  renderer: BreditorDomRenderer,
  host: HTMLElement,
  revision: number,
  paragraphs: readonly (readonly Run[])[],
): ProjectionRenderOutcome {
  return valueOf(renderer.render(host, projection(revision, paragraphs)));
}

describe("BreditorDomRenderer", () => {
  function headingFixture() {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, ["breditor/strong"]);
    const presentation = compileBrowserPresentation(generation, descriptor,
      createInlineFormatRenderManifest({ recipes: [{ formatKind: "breditor/strong", element: "strong" }] }));
    const input = (revision: number, levels: readonly unknown[]) => ({
      schema: descriptor.schema,
      snapshot: { lineage: "heading-dom", revision: String(revision) },
      paragraphs: levels.map((headingLevel) => ({ headingLevel,
        runs: [{ text: "a🙂b", formatDetails: propertyFreeFormats(["breditor/strong"]) }] })),
    });
    const make = (revision: number, levels: readonly unknown[]) => valueOf(
      createTextBlockDocumentProjection(input(revision, levels), generation, descriptor));
    return { generation, descriptor, input, make, renderer: new BreditorDomRenderer(presentation) };
  }

  it.each([null, 2] as const)("routes native input through explicit text-block mode at rank %s", (rank) => {
    const { make, renderer } = headingFixture();
    const projection = make(0, [rank]);
    const rendered = valueOf(renderer.render(document.createElement("div"), projection)).rendered;
    try {
      const delivery = issueEditorDeliveryToken(projection, rendered, 0n, Symbol("heading-input"));
      const selection = preserveSelectionSync();
      for (const [inputType, actionId] of [
        ["insertText", "breditor/insert-text-block-text"],
        ["insertParagraph", "breditor/insert-text-block-break"],
        ["deleteContentBackward", "breditor/delete-text-block-backward"],
        ["deleteContentForward", "breditor/delete-text-block-forward"],
        ["deleteContent", "breditor/delete-text-block-selection"],
      ]) {
        expect(translateBeforeInput({ inputType: inputType!, data: "x", isComposing: false }, false, delivery, selection))
          .toMatchObject({ kind: "command", request: { command: { actionId } } });
      }
      expect(cutDeleteRequest(delivery, selection).command).toMatchObject({ actionId: "breditor/delete-text-block-selection" });
      expect(pasteInsertRequest(delivery, selection, "a\nb").command).toMatchObject({ actionId: "breditor/insert-text-block-plain-text" });
      expect(translateKeyDown({ key: "Enter", code: "Enter", altKey: false, ctrlKey: false, metaKey: false,
        shiftKey: false, repeat: false, isComposing: false, keyCode: 13, altGraph: false },
      { editing: "structuralFallback", primaryModifier: "control", shortcuts: "enabled" }, false, delivery, selection))
        .toMatchObject({ kind: "command", request: { command: { actionId: "breditor/insert-text-block-break" } } });
      // Explicit API calls remain exact IDs, never aliases for a new protocol.
      expect(noInputActionRequest(delivery, selection, { kind: "api", detail: "test" }, "breditor/delete-backward").command)
        .toMatchObject({ actionId: "breditor/delete-backward" });
      expect(() => browserInputActionIds(Object.create(delivery))).toThrow();
    } finally { renderer.release(rendered); }
  });

  it("renders all heading ranks as semantic tags with exact scalar selection maps", () => {
    const { make, renderer } = headingFixture();
    const host = document.createElement("div");
    const projection = make(0, [null, 1, 2, 3, 4, 5, 6]);
    const rendered = valueOf(renderer.render(host, projection)).rendered;
    expect(Array.from(host.children, (element) => element.localName)).toEqual(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);
    expect(rendered.validateCanonicalDom()).toBe(true);
    for (let index = 0; index < 7; index += 1) {
      const node = rendered.nodeForAstPath([index, 0]);
      expect(node?.textContent).toBe("a🙂b");
      expect(mapDomPointToBaseSelectionPoint(rendered, node!, 3)).toMatchObject({
        ok: true, value: { kind: "text", textPath: [index, 0], utf16Offset: 3 },
      });
      expect(mapDomPointToBaseSelectionPoint(rendered, node!, 2).ok).toBe(false);
    }
    expect(Object.isFrozen(projection.paragraphs[1])).toBe(true);
  });

  it("replaces changed heading tags while retaining unaffected siblings", () => {
    const { make, renderer } = headingFixture();
    const host = document.createElement("div");
    const base = make(0, [2, null, 3]);
    const first = valueOf(renderer.render(host, base)).rendered;
    const prior = Array.from(host.children);
    const next = make(1, [4, null, 3]);
    expect(BaseProjectionUpdate.create({ base, result: next, impact: { kind: "none" } }).ok).toBe(false);
    expect(BaseProjectionUpdate.create({ base, result: next,
      impact: { kind: "textContainers", paragraphIndexes: [1] } }).ok).toBe(false);
    const update = valueOf(BaseProjectionUpdate.create({ base, result: next,
      impact: { kind: "textContainers", paragraphIndexes: [0] } }));
    const second = valueOf(renderer.update(first, update)).rendered;
    expect(host.children[0]?.localName).toBe("h4");
    expect(host.children[0]).not.toBe(prior[0]);
    expect(host.children[1]).toBe(prior[1]);
    expect(host.children[2]).toBe(prior[2]);
    expect(first.current).toBe(false);
    expect(second.validateCanonicalDom()).toBe(true);
    const back = make(2, [2, null, 3]);
    const undone = valueOf(renderer.update(second, valueOf(BaseProjectionUpdate.create({
      base: next, result: back, impact: { kind: "textContainers", paragraphIndexes: [0] },
    })))).rendered;
    expect(host.children[0]?.localName).toBe("h2");
    expect(undone.astPathForDomNode(undone.nodeForAstPath([0, 0])!)).toEqual([0, 0]);
  });

  it("keeps legacy constructors closed and rejects invalid heading ranks without coercion", () => {
    const { generation, descriptor, input } = headingFixture();
    expect(createProfiledDocumentProjection(input(0, [2]), generation, descriptor).ok).toBe(false);
    const experimental = valueOf(createTextBlockDocumentProjection(input(0, [null]), generation, descriptor));
    const legacyInput = input(1, [null]);
    const legacy = valueOf(createProfiledDocumentProjection({ ...legacyInput,
      paragraphs: legacyInput.paragraphs.map(({ runs }) => ({ runs })),
    }, generation, descriptor));
    expect(BaseProjectionUpdate.create({ base: experimental, result: legacy, impact: { kind: "none" } }).ok).toBe(false);
    for (const rank of [undefined, 0, 7, -1, 1.5, NaN, Infinity, "2", {}, new Number(2)]) {
      expect(createTextBlockDocumentProjection(input(0, [rank]), generation, descriptor).ok).toBe(false);
    }
    const bad = input(0, [2]);
    Object.defineProperty(bad.paragraphs[0], "headingLevel", { get() { throw new Error("must not call"); } });
    expect(createTextBlockDocumentProjection(bad, generation, descriptor).ok).toBe(false);
  });

  it("maps empty headings and invalidates semantic tag drift", () => {
    const { generation, descriptor, input, renderer } = headingFixture();
    const empty = input(0, [2]);
    empty.paragraphs[0]!.runs = [];
    const projection = valueOf(createTextBlockDocumentProjection(empty, generation, descriptor));
    const host = document.createElement("div");
    const rendered = valueOf(renderer.render(host, projection)).rendered;
    expect(host.innerHTML).toBe("<h2><br></h2>");
    expect(mapDomPointToBaseSelectionPoint(rendered, host.firstChild!, 0)).toMatchObject({
      ok: true, value: { kind: "children", parentPath: [0], childIndex: 0 },
    });
    const replacement = document.createElement("h3");
    replacement.append(document.createElement("br"));
    host.replaceChildren(replacement);
    expect(rendered.validateCanonicalDom()).toBe(false);
  });

  it("reconciles composition inside a heading but rejects a changed semantic rank", () => {
    const { make, renderer } = headingFixture();
    const projection = make(0, [2, null]);
    const host = document.createElement("div");
    document.body.append(host);
    const rendered = valueOf(renderer.render(host, projection)).rendered;
    const selection = valueOf(BaseRangeSelection.create(projection, {
      kind: "range",
      anchor: { kind: "text", textPath: [0, 0], utf16Offset: 1, affinity: "after" },
      focus: { kind: "text", textPath: [0, 0], utf16Offset: 3, affinity: "before" },
    }));
    expect(renderer.beginCompositionDomLease(rendered)).not.toBeNull();
    host.querySelector("h2 strong")!.textContent = "a漢b";
    expect(reconcileCompositionDom(host, projection, selection)).toMatchObject({
      ok: true, value: { originalText: "🙂", text: "漢" },
    });
    const wrong = document.createElement("h3");
    wrong.append(...Array.from(host.firstChild!.childNodes));
    host.replaceChild(wrong, host.firstChild!);
    expect(reconcileCompositionDom(host, projection, selection)).toMatchObject({
      ok: false, error: { code: "composition.dom.invalid_structure" },
    });
    host.remove();
  });

  it("renders canonical mixed profile formats and detects wrapper drift", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [
      "breditor/strong",
      "example/highlight",
      "example/whisper",
    ]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [
          { formatKind: "example/whisper", element: "em", after: ["example/highlight"] },
          { formatKind: "breditor/strong", element: "strong", before: ["example/highlight"] },
          { formatKind: "example/highlight", element: "mark", classes: ["accent"] },
        ],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: {
        name: descriptor.schema.name,
        version: descriptor.schema.version,
        fingerprint: descriptor.schema.fingerprint,
      },
      snapshot: { lineage: "profile-dom-tests", revision: "0" },
      paragraphs: [{
        runs: [
          {
            text: "mixed",
            formatDetails: propertyFreeFormats([
              "breditor/strong",
              "example/highlight",
              "example/whisper",
            ]),
          },
          { text: "plain", formatDetails: [] },
        ],
      }],
    }, generation, descriptor));
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer(presentation);

    const rendered = valueOf(renderer.render(host, profiled)).rendered;

    expect(host.innerHTML).toBe(
      '<p><strong><mark class="accent"><em>mixed</em></mark></strong>plain</p>',
    );
    const strong = host.querySelector("strong");
    const mark = host.querySelector("mark");
    const emphasis = host.querySelector("em");
    const text = emphasis?.firstChild;
    expect(rendered.nodeForAstPath([0, 0])).toBe(text);
    expect(rendered.astPathForDomNode(strong as Node)).toBeNull();
    expect(rendered.astPathForDomNode(mark as Node)).toBeNull();
    expect(rendered.astPathForDomNode(emphasis as Node)).toBeNull();
    expect(rendered.validateCanonicalDom()).toBe(true);
    expect(mapDomPointToBaseSelectionPoint(rendered, strong as Node, 0)).toMatchObject({
      ok: true,
      value: { kind: "text", textPath: [0, 0], utf16Offset: 0 },
    });
    expect(mapDomPointToBaseSelectionPoint(rendered, mark as Node, 1)).toMatchObject({
      ok: true,
      value: { kind: "text", textPath: [0, 0], utf16Offset: 5 },
    });

    mark?.setAttribute("class", "accent extra");
    expect(rendered.validateCanonicalDom()).toBe(false);
    expect(rendered.nodeForAstPath([0, 0])).toBeNull();
  });

  it("derives canonical safe-link attributes and renders unsafe URLs inert", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [
      "example/highlight",
      SAFE_LINK_FORMAT,
    ]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/highlight",
            element: "mark",
            classes: ["accent"],
            after: ["example/link"],
          },
          {
            formatKind: "example/link",
            element: "a",
            classes: ["breditor-link"],
            attributes: {
              kind: "safeLinkV1",
              hrefProperty: "example/href",
              openInNewWindowProperty: "example/open-in-new-window",
            },
          },
        ],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "safe-link-dom-tests", revision: "0" },
      paragraphs: [{
        runs: [
          {
            text: "safe",
            formatDetails: [
              { kind: "example/highlight", properties: [] },
              {
                kind: "example/link",
                properties: [
                  {
                    name: "example/href",
                    value: "HTTPS://Example.COM:443/a/../path?q=one&b=two",
                  },
                  { name: "example/open-in-new-window", value: true },
                ],
              },
            ],
          },
          {
            text: "unsafe",
            formatDetails: [{
              kind: "example/link",
              properties: [
                { name: "example/href", value: "javascript:alert(1)" },
                { name: "example/open-in-new-window", value: true },
              ],
            }],
          },
        ],
      }],
    }, generation, descriptor));
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer(presentation);

    const rendered = valueOf(renderer.render(host, profiled)).rendered;

    expect(host.innerHTML).toBe(
      '<p><a class="breditor-link" href="https://example.com/path?q=one&amp;b=two" rel="noopener noreferrer" target="_blank"><mark class="accent">safe</mark></a><a class="breditor-link">unsafe</a></p>',
    );
    expect(rendered.validateCanonicalDom()).toBe(true);
    const safeAnchor = host.querySelector("a");
    safeAnchor?.setAttribute("rel", "opener");
    expect(rendered.validateCanonicalDom()).toBe(false);
  });

  it("renders the exact RGB24 text-color contract without accepting CSS text", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [
      SAFE_TEXT_COLOR_FORMAT,
    ]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [{
          formatKind: "example/text-color",
          element: "span",
          classes: ["breditor-text-color"],
          attributes: { kind: "safeTextColorV1" },
        }],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "safe-text-color-dom-tests", revision: "0" },
      paragraphs: [{ runs: [{
        text: "colored",
        formatDetails: [{
          kind: "example/text-color",
          properties: [{ name: "example/rgb24", value: 0x00_a1_ff }],
        }],
      }] }],
    }, generation, descriptor));
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer(presentation);

    const rendered = valueOf(renderer.render(host, profiled)).rendered;

    expect(host.innerHTML).toBe(
      '<p><span class="breditor-text-color" style="color:#00a1ff">colored</span></p>',
    );
    expect(rendered.validateCanonicalDom()).toBe(true);
    const span = host.querySelector("span");
    const selection = valueOf(BaseRangeSelection.create(profiled, {
      kind: "range",
      anchor: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 2,
        affinity: "after",
      },
      focus: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 5,
        affinity: "before",
      },
    }));
    expect(renderer.beginCompositionDomLease(rendered)).not.toBeNull();
    span?.replaceChildren(document.createTextNode("coXed"));
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: true,
      value: { originalText: "lor", text: "X" },
    });

    span?.setAttribute(
      "style",
      "color:#00a1ff;background:url(javascript:alert(1))",
    );
    expect(rendered.validateCanonicalDom()).toBe(false);
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.invalid_structure" },
    });
  });

  it("renders, drift-checks, and composition-checks safe integer tokens", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [
      SAFE_INTEGER_TOKEN_FORMAT,
    ]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [{
          formatKind: "example/text-size",
          element: "span",
          classes: ["typographic-size"],
          attributes: {
            kind: "safeIntegerTokenV1",
            propertyName: "example/size",
            tokens: [
              { value: 1, token: "small" },
              { value: 2, token: "medium" },
              { value: 3, token: "large" },
            ],
          },
        }],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "safe-integer-token-dom-tests", revision: "0" },
      paragraphs: [{ runs: [{
        text: "sized",
        formatDetails: [{
          kind: "example/text-size",
          properties: [{ name: "example/size", value: 2 }],
        }],
      }] }],
    }, generation, descriptor));
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer(presentation);

    const rendered = valueOf(renderer.render(host, profiled)).rendered;

    expect(host.innerHTML).toBe(
      '<p><span class="typographic-size" data-breditor-integer-token="medium">sized</span></p>',
    );
    expect(rendered.validateCanonicalDom()).toBe(true);
    const span = host.querySelector("span");
    const selection = valueOf(BaseRangeSelection.create(profiled, {
      kind: "range",
      anchor: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 1,
        affinity: "after",
      },
      focus: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 4,
        affinity: "before",
      },
    }));
    expect(renderer.beginCompositionDomLease(rendered)).not.toBeNull();
    span?.replaceChildren(document.createTextNode("sXd"));
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: true,
      value: { originalText: "ize", text: "X" },
    });

    span?.setAttribute("data-breditor-integer-token", "unknown");
    expect(rendered.validateCanonicalDom()).toBe(false);
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.invalid_structure" },
    });
  });

  it("admits only canonical safe links during a native-composition lease", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [SAFE_LINK_FORMAT]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [{
          formatKind: "example/link",
          element: "a",
          classes: ["breditor-link"],
          attributes: {
            kind: "safeLinkV1",
            hrefProperty: "example/href",
            openInNewWindowProperty: "example/open-in-new-window",
          },
        }],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "safe-link-composition-tests", revision: "0" },
      paragraphs: [{ runs: [{
        text: "abcdef",
        formatDetails: [{
          kind: "example/link",
          properties: [
            { name: "example/href", value: "https://example.test/path" },
            { name: "example/open-in-new-window", value: false },
          ],
        }],
      }] }],
    }, generation, descriptor));
    const selection = valueOf(BaseRangeSelection.create(profiled, {
      kind: "range",
      anchor: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 2,
        affinity: "after",
      },
      focus: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 4,
        affinity: "before",
      },
    }));
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer(presentation);
    const rendered = valueOf(renderer.render(host, profiled)).rendered;
    expect(renderer.beginCompositionDomLease(rendered)).not.toBeNull();
    const anchor = host.querySelector("a");
    anchor?.replaceChildren(document.createTextNode("abXYef"));

    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: true,
      value: { originalText: "cd", text: "XY" },
    });

    anchor?.setAttribute("href", "javascript:alert(1)");
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.invalid_structure" },
    });
  });

  it("bounds aggregate transient safe-link attribute validation before URL parsing", () => {
    expect(MAX_COMPOSITION_DOM_DYNAMIC_ATTRIBUTE_UTF8_BYTES).toBe(1024 * 1024);
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [SAFE_LINK_FORMAT]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [{
          formatKind: "example/link",
          element: "a",
          classes: ["breditor-link"],
          attributes: {
            kind: "safeLinkV1",
            hrefProperty: "example/href",
            openInNewWindowProperty: "example/open-in-new-window",
          },
        }],
      }),
    );
    const prefix = "https://example.test/";
    const maximumHref = `${prefix}${"x".repeat(2_048 - prefix.length)}`;
    expect(maximumHref).toHaveLength(2_048);
    const linksAtLimit =
      MAX_COMPOSITION_DOM_DYNAMIC_ATTRIBUTE_UTF8_BYTES / maximumHref.length;
    expect(linksAtLimit).toBe(512);
    const baseText = "x".repeat(linksAtLimit + 1);
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "safe-link-composition-budget-tests", revision: "0" },
      paragraphs: [{ runs: [{
        text: baseText,
        formatDetails: [{
          kind: "example/link",
          properties: [
            { name: "example/href", value: "https://example.test/" },
            { name: "example/open-in-new-window", value: false },
          ],
        }],
      }] }],
    }, generation, descriptor));
    const selection = valueOf(BaseRangeSelection.create(profiled, {
      kind: "range",
      anchor: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 0,
        affinity: "after",
      },
      focus: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: baseText.length,
        affinity: "before",
      },
    }));
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer(presentation);
    const rendered = valueOf(renderer.render(host, profiled)).rendered;
    expect(renderer.beginCompositionDomLease(rendered)).not.toBeNull();
    const paragraph = host.firstElementChild;
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("expected rendered paragraph");
    }
    const makeLink = (href: string): HTMLAnchorElement => {
      const anchor = document.createElement("a");
      anchor.setAttribute("class", "breditor-link");
      anchor.setAttribute("href", href);
      anchor.append(document.createTextNode("x"));
      return anchor;
    };

    paragraph.replaceChildren(
      ...Array.from({ length: linksAtLimit }, () => makeLink(maximumHref)),
    );
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: true,
      value: { text: "x".repeat(linksAtLimit) },
    });

    paragraph.append(makeLink("javascript:must-not-be-parsed()"));
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.resource_limit" },
    });
  });

  it("reuses canonical profile paragraphs under the exact presentation", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [
      "breditor/strong",
      "example/highlight",
    ]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [
          { formatKind: "breditor/strong", element: "strong" },
          { formatKind: "example/highlight", element: "mark" },
        ],
      }),
    );
    const create = (revision: string, firstText: string) => valueOf(
      createProfiledDocumentProjection({
        schema: { ...descriptor.schema },
        snapshot: { lineage: "profile-update-tests", revision },
        paragraphs: [
          { runs: [{
            text: firstText,
            formatDetails: propertyFreeFormats([
              "breditor/strong",
              "example/highlight",
            ]),
          }] },
          { runs: [{ text: "stable", formatDetails: [] }] },
        ],
      }, generation, descriptor),
    );
    const base = create("0", "before");
    const result = create("1", "after");
    const update = valueOf(BaseProjectionUpdate.create({
      base,
      result,
      impact: { kind: "textContainers", paragraphIndexes: [0] },
    }));
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer(presentation);
    const initial = valueOf(renderer.render(host, base));
    const stableParagraph = host.childNodes[1];

    const outcome = valueOf(renderer.update(initial.rendered, update));

    expect(outcome.mode).toBe("incremental");
    expect(host.innerHTML).toBe("<p><strong><mark>after</mark></strong></p><p>stable</p>");
    expect(host.childNodes[1]).toBe(stableParagraph);
    expect(outcome.rendered.validateCanonicalDom()).toBe(true);
  });

  it("does not switch a projection between equal-profile presentation identities", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, ["example/highlight"]);
    const first = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [{ formatKind: "example/highlight", element: "mark" }],
      }),
    );
    const second = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [{ formatKind: "example/highlight", element: "em" }],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "presentation-identity-tests", revision: "0" },
      paragraphs: [{
        runs: [{
          text: "x",
          formatDetails: propertyFreeFormats(["example/highlight"]),
        }],
      }],
    }, generation, descriptor));

    expect(new BreditorDomRenderer(first).render(
      document.createElement("div"),
      profiled,
    ).ok).toBe(true);
    expect(new BreditorDomRenderer(second).render(
      document.createElement("div"),
      profiled,
    )).toMatchObject({
      ok: false,
      error: { code: "projection.invalid_shape" },
    });
  });

  it("rejects a profiled projection without its exact presentation", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, ["example/highlight"]);
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "profile-dom-tests", revision: "0" },
      paragraphs: [{
        runs: [{
          text: "x",
          formatDetails: propertyFreeFormats(["example/highlight"]),
        }],
      }],
    }, generation, descriptor));
    const host = document.createElement("div");

    expect(new BreditorDomRenderer().render(host, profiled)).toMatchObject({
      ok: false,
      error: { code: "projection.invalid_shape" },
    });
    expect(host.childNodes).toHaveLength(0);
  });

  it("requires the descriptor's exact generation before projection construction", () => {
    const descriptorGeneration = profileGeneration();
    const foreignGeneration = profileGeneration();
    const descriptor = ownedProfileDescriptor(
      descriptorGeneration,
      ["example/highlight"],
    );

    expect(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "profile-generation-tests", revision: "0" },
      paragraphs: [{
        runs: [{
          text: "x",
          formatDetails: propertyFreeFormats(["example/highlight"]),
        }],
      }],
    }, foreignGeneration, descriptor)).toMatchObject({
      ok: false,
      error: { code: "projection.invalid_shape" },
    });
  });

  it("reconciles composition through known profile wrappers and strips them", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [
      "breditor/strong",
      "example/highlight",
    ]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [
          { formatKind: "breditor/strong", element: "strong", before: ["example/highlight"] },
          { formatKind: "example/highlight", element: "mark", classes: ["accent"] },
        ],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "profile-composition-tests", revision: "0" },
      paragraphs: [{
        runs: [{
          text: "abcdef",
          formatDetails: propertyFreeFormats([
            "breditor/strong",
            "example/highlight",
          ]),
        }],
      }],
    }, generation, descriptor));
    const selection = valueOf(BaseRangeSelection.create(profiled, {
      kind: "range",
      anchor: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 2,
        affinity: "after",
      },
      focus: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 4,
        affinity: "before",
      },
    }));
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer(presentation);
    const rendered = valueOf(renderer.render(host, profiled)).rendered;
    const lease = renderer.beginCompositionDomLease(rendered);
    if (lease === null) throw new Error("expected composition lease");
    const strong = document.createElement("strong");
    const mark = document.createElement("mark");
    mark.className = "accent";
    mark.append(document.createTextNode("abXYef"));
    strong.append(mark);
    host.firstElementChild?.replaceChildren(strong);

    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: true,
      value: {
        replacementStartUtf16: 2,
        replacementEndUtf16: 4,
        originalText: "cd",
        text: "XY",
      },
    });

    const unknown = document.createElement("span");
    unknown.append(document.createTextNode("abXYef"));
    host.firstElementChild?.replaceChildren(unknown);
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.invalid_structure" },
    });

    const reversedMark = document.createElement("mark");
    reversedMark.className = "accent";
    const reversedStrong = document.createElement("strong");
    reversedStrong.append(document.createTextNode("abXYef"));
    reversedMark.append(reversedStrong);
    host.firstElementChild?.replaceChildren(reversedMark);
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.invalid_structure" },
    });

    const wrongClass = document.createElement("mark");
    wrongClass.className = "other";
    wrongClass.append(document.createTextNode("abXYef"));
    host.firstElementChild?.replaceChildren(wrongClass);
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.invalid_structure" },
    });
    expect(renderer.discardCompositionDomLease(lease)).toBe(true);
  });

  it("blocks same-host renderer reentry from detached DOM constructors", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const originalCreateTextNode = host.ownerDocument.createTextNode.bind(
      host.ownerDocument,
    );
    let nested: ReturnType<BreditorDomRenderer["render"]> | undefined;
    let attempted = false;
    const constructor = vi.spyOn(host.ownerDocument, "createTextNode")
      .mockImplementation((text) => {
        if (!attempted) {
          attempted = true;
          nested = renderer.render(
            host,
            projection(1, [[{ text: "nested", strong: false }]]),
          );
        }
        return originalCreateTextNode(text);
      });
    try {
      const outer = valueOf(renderer.render(
        host,
        projection(0, [[{ text: "outer", strong: false }]]),
      ));
      expect(nested).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(host.textContent).toBe("outer");
      expect(outer.rendered.validateCanonicalDom()).toBe(true);
    } finally {
      constructor.mockRestore();
    }
  });

  it.each(["nodeType", "ownerDocument"] as const)(
    "ignores an own %s identity getter while admitting the native HTML host",
    (propertyName) => {
      const host = document.createElement("div");
      const renderer = new BreditorDomRenderer();
      const applicationContent = document.createElement("aside");
      applicationContent.textContent = "application getter content";
      const nativeValue = host[propertyName];
      let getterReads = 0;
      Object.defineProperty(host, propertyName, {
        configurable: true,
        get: () => {
          getterReads += 1;
          if (applicationContent.parentNode === null) {
            host.append(applicationContent);
          }
          return nativeValue;
        },
      });

      try {
        const result = renderer.render(
          host,
          projection(0, [[{ text: "must not replace app content", strong: false }]]),
        );
        expect(result).toMatchObject({ ok: true });
        const hostChildren = nativeChildNodes(host);
        const paragraphChildren = nativeChildNodes(hostChildren[0] as Node);
        expect(getterReads).toBe(0);
        expect(hostChildren).toHaveLength(1);
        expect(paragraphChildren).toHaveLength(1);
        expect(nativeNodeValue(paragraphChildren[0] as Node)).toBe(
          "must not replace app content",
        );
        expect(nativeParentNode(applicationContent)).toBeNull();
      } finally {
        Reflect.deleteProperty(host, propertyName);
      }
    },
  );

  it("does not let an own childNodes getter forge the pre-render child baseline", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const applicationContent = document.createElement("aside");
    applicationContent.textContent = "application childNodes content";
    const nativeChildNodes = host.childNodes;
    let getterReads = 0;
    Object.defineProperty(host, "childNodes", {
      configurable: true,
      get: () => {
        getterReads += 1;
        if (applicationContent.parentNode === null) {
          host.append(applicationContent);
        }
        return nativeChildNodes;
      },
    });

    try {
      expect(renderer.render(
        host,
        projection(0, [[{ text: "must not survive", strong: false }]]),
      )).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(getterReads).toBeGreaterThan(0);
      expect(host.querySelectorAll("p")).toHaveLength(0);
      expect(applicationContent.parentElement).toBe(host);
      expect(host.textContent).toBe("application childNodes content");
    } finally {
      Reflect.deleteProperty(host, "childNodes");
    }
  });

  it("rejects an SVG host whose own namespace shadow claims to be HTML", () => {
    const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const prior = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    host.append(prior);
    document.body.append(host);
    const namespaceShadow = vi.fn(() => "http://www.w3.org/1999/xhtml");
    Object.defineProperty(host, "namespaceURI", {
      configurable: true,
      get: namespaceShadow,
    });

    expect(
      new BreditorDomRenderer().render(
        host as unknown as HTMLElement,
        projection(0, [[{ text: "must not install", strong: false }]]),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "renderer.invalid_host" },
    });
    expect(namespaceShadow).not.toHaveBeenCalled();
    expect(host.childNodes).toHaveLength(1);
    expect(host.firstChild).toBe(prior);
  });

  it("snapshots update children before a forged canonical childNodes read", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "before", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const result = projection(1, [[{ text: "after", strong: true }]]);
    const update = valueOf(BaseProjectionUpdate.create({
      base,
      result,
      impact: { kind: "textContainers", paragraphIndexes: [0] },
    }));
    const forgedCanonicalChildren = Object.freeze(Array.from(host.childNodes));
    const applicationContent = document.createElement("aside");
    applicationContent.textContent = "application update getter content";
    let getterReads = 0;
    Object.defineProperty(host, "childNodes", {
      configurable: true,
      get: () => {
        getterReads += 1;
        if (applicationContent.parentNode === null) {
          host.append(applicationContent);
        }
        return forgedCanonicalChildren;
      },
    });

    try {
      expect(renderer.update(initial.rendered, update)).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(getterReads).toBeGreaterThan(0);
      expect(applicationContent.parentElement).toBe(host);
      expect(host.querySelectorAll("p")).toHaveLength(1);
      expect(host.textContent).toBe("beforeapplication update getter content");
      expect(initial.rendered.current).toBe(false);
      expect(renderer.owns(initial.rendered)).toBe(false);
    } finally {
      Reflect.deleteProperty(host, "childNodes");
    }
  });

  it("does not erase top-level content inserted by a retained paragraph refresh", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "before", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const paragraph = host.querySelector("p");
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("expected rendered paragraph");
    }
    const result = projection(1, [[{ text: "after", strong: false }]]);
    const update = valueOf(BaseProjectionUpdate.create({
      base,
      result,
      impact: { kind: "textContainers", paragraphIndexes: [0] },
    }));
    const applicationContent = document.createElement("aside");
    applicationContent.textContent = "application refresh content";
    const nativeReplaceChildren = Element.prototype.replaceChildren;
    const replace = vi.spyOn(paragraph, "replaceChildren").mockImplementation(
      (...nodes: (Node | string)[]) => {
        Reflect.apply(nativeReplaceChildren, paragraph, nodes);
        if (applicationContent.parentNode === null) {
          host.append(applicationContent);
        }
      },
    );

    try {
      expect(renderer.update(initial.rendered, update)).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(applicationContent.parentElement).toBe(host);
      expect(host.querySelectorAll("p")).toHaveLength(1);
      expect(paragraph.textContent).toBe("before");
      expect(host.textContent).toBe("beforeapplication refresh content");
      expect(initial.rendered.current).toBe(false);
      expect(renderer.owns(initial.rendered)).toBe(false);
    } finally {
      replace.mockRestore();
    }
  });

  it("restores a retained paragraph when its write mutates then throws", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "before", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const paragraph = host.querySelector("p");
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("expected rendered paragraph");
    }
    const result = projection(1, [[{ text: "after", strong: false }]]);
    const update = valueOf(BaseProjectionUpdate.create({
      base,
      result,
      impact: { kind: "textContainers", paragraphIndexes: [0] },
    }));
    const nativeReplaceChildren = Element.prototype.replaceChildren;
    const replace = vi.spyOn(paragraph, "replaceChildren").mockImplementation(
      (...nodes: (Node | string)[]) => {
        Reflect.apply(nativeReplaceChildren, paragraph, nodes);
        throw new Error("retained write failed after mutation");
      },
    );

    try {
      expect(renderer.update(initial.rendered, update)).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(paragraph.textContent).toBe("before");
      expect(host.firstChild).toBe(paragraph);
      expect(initial.rendered.current).toBe(false);
      expect(renderer.owns(initial.rendered)).toBe(false);
    } finally {
      replace.mockRestore();
    }
  });

  it.each(["createElementNS", "createTextNode"] as const)(
    "does not clobber host content changed by %s during an initial detached build",
    (constructorName) => {
      const host = document.createElement("div");
      const renderer = new BreditorDomRenderer();
      const applicationContent = document.createElement("aside");
      applicationContent.textContent = "application initial content";
      let mutated = false;
      let restore: () => void;

      if (constructorName === "createElementNS") {
        const original = host.ownerDocument.createElementNS.bind(host.ownerDocument);
        const constructor = vi.spyOn(host.ownerDocument, "createElementNS")
          .mockImplementation((namespace, qualifiedName, options) => {
            const element = original(namespace, qualifiedName, options);
            if (!mutated) {
              mutated = true;
              host.replaceChildren(applicationContent);
            }
            return element;
          });
        restore = () => constructor.mockRestore();
      } else {
        const original = host.ownerDocument.createTextNode.bind(host.ownerDocument);
        const constructor = vi.spyOn(host.ownerDocument, "createTextNode")
          .mockImplementation((text) => {
            const node = original(text);
            if (!mutated) {
              mutated = true;
              host.replaceChildren(applicationContent);
            }
            return node;
          });
        restore = () => constructor.mockRestore();
      }

      try {
        expect(renderer.render(
          host,
          projection(0, [[{ text: "canonical", strong: false }]]),
        )).toMatchObject({
          ok: false,
          error: { code: "renderer.dom_write_failed" },
        });
        expect(mutated).toBe(true);
        expect(host.childNodes).toHaveLength(1);
        expect(host.firstChild).toBe(applicationContent);
        expect(host.textContent).toBe("application initial content");
      } finally {
        restore();
      }
    },
  );

  it.each(["createElementNS", "createTextNode"] as const)(
    "invalidates an update without clobbering host content changed by %s during its detached build",
    (constructorName) => {
      const host = document.createElement("div");
      const renderer = new BreditorDomRenderer();
      const base = projection(0, [[{ text: "before", strong: false }]]);
      const initial = valueOf(renderer.render(host, base));
      const result = projection(1, [[{ text: "after", strong: true }]]);
      const update = valueOf(BaseProjectionUpdate.create({
        base,
        result,
        impact: { kind: "textContainers", paragraphIndexes: [0] },
      }));
      const applicationContent = document.createElement("aside");
      applicationContent.textContent = "application update content";
      let mutated = false;
      let restore: () => void;

      if (constructorName === "createElementNS") {
        const original = host.ownerDocument.createElementNS.bind(host.ownerDocument);
        const constructor = vi.spyOn(host.ownerDocument, "createElementNS")
          .mockImplementation((namespace, qualifiedName, options) => {
            const element = original(namespace, qualifiedName, options);
            if (!mutated) {
              mutated = true;
              host.replaceChildren(applicationContent);
            }
            return element;
          });
        restore = () => constructor.mockRestore();
      } else {
        const original = host.ownerDocument.createTextNode.bind(host.ownerDocument);
        const constructor = vi.spyOn(host.ownerDocument, "createTextNode")
          .mockImplementation((text) => {
            const node = original(text);
            if (!mutated) {
              mutated = true;
              host.replaceChildren(applicationContent);
            }
            return node;
          });
        restore = () => constructor.mockRestore();
      }

      try {
        expect(renderer.update(initial.rendered, update)).toMatchObject({
          ok: false,
          error: { code: "renderer.dom_write_failed" },
        });
        expect(mutated).toBe(true);
        expect(host.childNodes).toHaveLength(1);
        expect(host.firstChild).toBe(applicationContent);
        expect(host.textContent).toBe("application update content");
        expect(initial.rendered.current).toBe(false);
        expect(initial.rendered.nodeForAstPath([])).toBeNull();
        expect(renderer.owns(initial.rendered)).toBe(false);
      } finally {
        restore();
      }
    },
  );

  it("fails closed when a host write reports success without installing canonical DOM", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const replace = vi.spyOn(host, "replaceChildren").mockImplementation(() => undefined);
    try {
      expect(renderer.render(
        host,
        projection(0, [[{ text: "missing", strong: false }]]),
      )).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(host.childNodes).toHaveLength(0);
    } finally {
      replace.mockRestore();
    }
  });

  it("removes only newly installed paragraphs when a host write throws after mutation", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const applicationNode = document.createElement("aside");
    applicationNode.textContent = "application content";
    const nativeReplaceChildren = Element.prototype.replaceChildren;
    const replace = vi.spyOn(host, "replaceChildren").mockImplementation(
      (...nodes: (Node | string)[]) => {
        Reflect.apply(nativeReplaceChildren, host, nodes);
        host.append(applicationNode);
        throw new Error("write failed after mutation");
      },
    );
    try {
      expect(
        renderer.render(
          host,
          projection(0, [[{ text: "must not remain", strong: false }]]),
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(applicationNode.parentElement).toBe(host);
      expect(host.querySelectorAll("p")).toHaveLength(0);
      expect(host.textContent).toBe("application content");
    } finally {
      replace.mockRestore();
    }
  });

  it("does not expose invariant-critical implementation helpers at runtime", () => {
    const surface = Object.getOwnPropertyNames(BreditorDomRenderer.prototype);
    expect(surface).not.toContain("liveCompositionLeaseRecord");
    expect(surface).not.toContain("invalidateCompositionLeaseRecord");
    expect(surface).not.toContain("install");
  });

  it("creates only the closed base DOM vocabulary and treats hostile text as text", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const outcome = render(renderer, host, 0, [
      [
        { text: '<img src=x onerror="attack()">', strong: false },
        { text: "bold", strong: true },
      ],
      [],
    ]);

    expect(outcome.mode).toBe("full");
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelectorAll("p")).toHaveLength(2);
    expect(host.querySelectorAll("strong")).toHaveLength(1);
    expect(host.querySelectorAll("br")).toHaveLength(1);
    expect(host.querySelectorAll("[data-path], [data-breditor-path]")).toHaveLength(0);
    expect(Array.from(host.querySelectorAll("p, strong, br")).every((node) => node.attributes.length === 0)).toBe(true);
    expect(host.textContent).toBe('<img src=x onerror="attack()">bold');
  });

  it("creates namespace-correct HTML descendants in an XML-owned XHTML host", () => {
    const xmlDocument = document.implementation.createDocument(null, "root");
    const host = xmlDocument.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    xmlDocument.documentElement.appendChild(host);
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[]]);

    const outcome = renderer.render(host, base);

    expect(outcome.ok).toBe(true);
    expect(host.firstElementChild?.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(host.firstElementChild?.localName).toBe("p");
    expect(host.firstElementChild?.firstElementChild?.namespaceURI).toBe(
      "http://www.w3.org/1999/xhtml",
    );
    expect(host.firstElementChild?.firstElementChild?.localName).toBe("br");
    const paragraph = host.firstElementChild;
    const result = projection(1, [[]]);
    const update = valueOf(
      BaseProjectionUpdate.create({ base, result, impact: { kind: "none" } }),
    );
    const updated = valueOf(renderer.update(valueOf(outcome).rendered, update));
    expect(updated.mode).toBe("incremental");
    expect(host.firstElementChild).toBe(paragraph);
  });

  it("keeps result methods controlled when MutationObserver setup or teardown throws", () => {
    const host = document.createElement("div");
    const window = host.ownerDocument.defaultView;
    if (window === null) {
      throw new Error("test document has no window");
    }
    const original = Object.getOwnPropertyDescriptor(window, "MutationObserver");
    try {
      Object.defineProperty(window, "MutationObserver", {
        configurable: true,
        value: class {
          constructor() {
            throw new Error("observer constructor failed");
          }
        },
      });
      const constructorRenderer = new BreditorDomRenderer();
      const constructed = valueOf(constructorRenderer.render(host, projection(0, [[]])));
      expect(host.innerHTML).toBe("<p><br></p>");
      expect(constructorRenderer.release(constructed.rendered)).toBe(true);

      Object.defineProperty(window, "MutationObserver", {
        configurable: true,
        value: class {
          observe(): void {}
          disconnect(): void {
            throw new Error("observer disconnect failed");
          }
        },
      });
      const disconnectRenderer = new BreditorDomRenderer();
      const observed = valueOf(disconnectRenderer.render(host, projection(1, [[]])));
      expect(disconnectRenderer.release(observed.rendered)).toBe(true);
      expect(observed.rendered.current).toBe(false);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(window, "MutationObserver");
      } else {
        Object.defineProperty(window, "MutationObserver", original);
      }
    }
  });

  it("bypasses an own defaultView shadow when installing observation", () => {
    const host = document.createElement("div");
    const ownerDocument = host.ownerDocument;
    const defaultView = vi.fn(() => {
      throw new Error("own defaultView shadow must not be read");
    });
    Object.defineProperty(ownerDocument, "defaultView", {
      configurable: true,
      get: defaultView,
    });
    try {
      const renderer = new BreditorDomRenderer();
      const outcome = valueOf(renderer.render(host, projection(0, [[]])));
      expect(outcome.rendered.validateCanonicalDom()).toBe(true);
      expect(defaultView).not.toHaveBeenCalled();
      expect(renderer.release(outcome.rendered)).toBe(true);
    } finally {
      Reflect.deleteProperty(ownerDocument, "defaultView");
    }
  });

  it("maps only exact AST-backed host, paragraph, and text nodes", () => {
    const host = document.createElement("section");
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host, 0, [
      [{ text: "plain", strong: false }, { text: "bold", strong: true }],
      [],
    ]);
    const firstParagraph = host.childNodes[0];
    const plainText = firstParagraph?.childNodes[0];
    const strong = firstParagraph?.childNodes[1];
    const strongText = strong?.childNodes[0];
    const emptyParagraph = host.childNodes[1];
    const placeholder = emptyParagraph?.childNodes[0];

    expect(rendered.nodeForAstPath([])).toBe(host);
    expect(rendered.nodeForAstPath([0])).toBe(firstParagraph);
    expect(rendered.nodeForAstPath([0, 0])).toBe(plainText);
    expect(rendered.nodeForAstPath([0, 1])).toBe(strongText);
    expect(rendered.astPathForDomNode(host)).toEqual([]);
    expect(rendered.astPathForDomNode(firstParagraph as Node)).toEqual([0]);
    expect(rendered.astPathForDomNode(strongText as Node)).toEqual([0, 1]);
    expect(rendered.astPathForDomNode(strong as Node)).toBeNull();
    expect(rendered.astPathForDomNode(placeholder as Node)).toBeNull();
    expect(rendered.nodeForAstPath([0, -1])).toBeNull();
    expect(rendered.nodeForAstPath([0, 0, 0])).toBeNull();
  });

  it("retains every affected paragraph element while refreshing its children", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [
      [{ text: "one", strong: false }],
      [{ text: "two", strong: false }],
      [{ text: "three", strong: false }],
    ]);
    const initial = valueOf(renderer.render(host, base));
    const oldParagraphs = Array.from(host.children);
    const oldFirstText = oldParagraphs[0]?.firstChild;
    const oldThirdText = oldParagraphs[2]?.firstChild;
    const result = projection(1, [
      [{ text: "ONE", strong: true }],
      [{ text: "two", strong: false }],
      [{ text: "THREE", strong: false }],
    ]);
    const update = valueOf(
      BaseProjectionUpdate.create({
        base,
        result,
        impact: { kind: "textContainers", paragraphIndexes: [0, 2] },
      }),
    );

    const outcome = valueOf(renderer.update(initial.rendered, update));
    expect(outcome.mode).toBe("incremental");
    expect(Array.from(host.children)).toEqual(oldParagraphs);
    expect(host.children[0]?.firstChild).not.toBe(oldFirstText);
    expect(host.children[1]?.firstChild?.nodeValue).toBe("two");
    expect(host.children[2]?.firstChild).not.toBe(oldThirdText);
    expect(host.children[0]?.firstChild?.nodeName).toBe("STRONG");
    expect(host.textContent).toBe("ONEtwoTHREE");
    expect(initial.rendered.current).toBe(false);
    expect(initial.rendered.nodeForAstPath([0])).toBeNull();
  });

  it("reuses an exact root-splice prefix and shifted suffix with rebound paths", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(10, [
      [{ text: "prefix", strong: false }],
      [{ text: "remove-a", strong: false }],
      [{ text: "remove-b", strong: false }],
      [{ text: "suffix", strong: false }],
    ]);
    const initial = valueOf(renderer.render(host, base));
    const prefix = host.children[0];
    const oldMiddle = host.children[1];
    const suffix = host.children[3];
    const result = projection(11, [
      [{ text: "prefix", strong: false }],
      [{ text: "new-a", strong: false }],
      [{ text: "new-b", strong: true }],
      [{ text: "new-c", strong: false }],
      [{ text: "suffix", strong: false }],
    ]);
    const update = valueOf(
      BaseProjectionUpdate.create({
        base,
        result,
        impact: {
          kind: "rootSplice",
          oldRange: { start: 1, end: 3 },
          newRange: { start: 1, end: 4 },
        },
      }),
    );

    const outcome = valueOf(renderer.update(initial.rendered, update));
    expect(outcome.mode).toBe("incremental");
    expect(host.children[0]).toBe(prefix);
    expect(host.children[1]).not.toBe(oldMiddle);
    expect(host.children[4]).toBe(suffix);
    expect(outcome.rendered.nodeForAstPath([4])).toBe(suffix);
    expect(outcome.rendered.astPathForDomNode(suffix as Node)).toEqual([4]);
  });

  it.each(["root", "multipleOperations", "untrusted"] as const)(
    "uses a full fallback for %s impact",
    (kind) => {
      const host = document.createElement("div");
      const renderer = new BreditorDomRenderer();
      const base = projection(0, [[{ text: "same", strong: false }]]);
      const initial = valueOf(renderer.render(host, base));
      const oldParagraph = host.firstChild;
      const result = projection(1, [[{ text: "same", strong: false }]]);
      const update = valueOf(BaseProjectionUpdate.create({ base, result, impact: { kind } }));

      const outcome = valueOf(renderer.update(initial.rendered, update));
      expect(outcome.mode).toBe("full");
      expect(outcome.fallbackReason).toBe(kind);
      expect(host.firstChild).not.toBe(oldParagraph);
    },
  );

  it("advances a no-content-change snapshot without replacing paragraph DOM", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(2, [[{ text: "same", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const paragraph = host.firstChild;
    const text = paragraph?.firstChild;
    const result = projection(3, [[{ text: "same", strong: false }]]);
    const update = valueOf(BaseProjectionUpdate.create({ base, result, impact: { kind: "none" } }));

    const outcome = valueOf(renderer.update(initial.rendered, update));
    expect(outcome.mode).toBe("incremental");
    expect(host.firstChild).toBe(paragraph);
    expect(host.firstChild?.firstChild).toBe(text);
    expect(outcome.rendered.rendererGeneration).toBe(initial.rendered.rendererGeneration + 1n);
  });

  it("falls back fully when a candidate retained paragraph drifted", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [
      [{ text: "unchanged", strong: false }],
      [{ text: "change", strong: false }],
    ]);
    const initial = valueOf(renderer.render(host, base));
    const drifted = host.children[0] as HTMLElement;
    drifted.setAttribute("class", "foreign");
    const result = projection(1, [
      [{ text: "unchanged", strong: false }],
      [{ text: "changed", strong: false }],
    ]);
    const update = valueOf(
      BaseProjectionUpdate.create({
        base,
        result,
        impact: { kind: "textContainers", paragraphIndexes: [1] },
      }),
    );

    const outcome = valueOf(renderer.update(initial.rendered, update));
    expect(outcome.mode).toBe("full");
    expect(outcome.fallbackReason).toBe("domDrift");
    expect(host.children[0]).not.toBe(drifted);
    expect(host.querySelector(".foreign")).toBeNull();
  });

  it("rejects stale and foreign handles before changing the DOM", () => {
    const host = document.createElement("div");
    const firstRenderer = new BreditorDomRenderer();
    const secondRenderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const first = valueOf(firstRenderer.render(host, base));
    const result = projection(1, [[{ text: "result", strong: false }]]);
    const update = valueOf(
      BaseProjectionUpdate.create({
        base,
        result,
        impact: { kind: "textContainers", paragraphIndexes: [0] },
      }),
    );

    const before = host.textContent;
    const foreign = secondRenderer.update(first.rendered, update);
    expect(foreign.ok).toBe(false);
    expect(host.textContent).toBe(before);

    valueOf(secondRenderer.render(host, base));
    expect(first.rendered.current).toBe(false);
    const stale = firstRenderer.update(first.rendered, update);
    expect(stale.ok).toBe(false);
    expect(host.textContent).toBe("base");
  });

  it("rejects an equal-looking but non-identical base before changing the DOM", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const renderedBase = projection(0, [[{ text: "base", strong: false }]]);
    const initial = valueOf(renderer.render(host, renderedBase));
    const copiedBase = projection(0, [[{ text: "base", strong: false }]]);
    const result = projection(1, [[{ text: "result", strong: false }]]);
    const update = valueOf(
      BaseProjectionUpdate.create({
        base: copiedBase,
        result,
        impact: { kind: "textContainers", paragraphIndexes: [0] },
      }),
    );

    const before = host.firstChild;
    const rejected = renderer.update(initial.rendered, update);
    expect(rejected.ok).toBe(false);
    expect(host.firstChild).toBe(before);
    expect(host.textContent).toBe("base");
  });

  it("invalidates mappings after observed external DOM mutation", async () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const outcome = render(renderer, host, 0, [[{ text: "base", strong: false }]]);
    expect(outcome.rendered.current).toBe(true);

    host.firstChild?.appendChild(document.createTextNode("foreign"));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(outcome.rendered.current).toBe(false);
    expect(outcome.rendered.nodeForAstPath([0])).toBeNull();
  });

  it("synchronously rejects subtree drift hidden behind own DOM shadows", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const outcome = render(renderer, host, 0, [[{ text: "base", strong: false }]]);
    const paragraph = host.querySelector("p");
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("expected rendered paragraph");
    }
    const forgedChildren = Object.freeze(Array.from(paragraph.childNodes));
    paragraph.append(document.createTextNode("foreign"));
    const childNodesShadow = vi.fn(() => forgedChildren);
    const attributesShadow = vi.fn(() => Object.freeze({ length: 0 }));
    Object.defineProperties(paragraph, {
      childNodes: { configurable: true, get: childNodesShadow },
      attributes: { configurable: true, get: attributesShadow },
    });

    try {
      expect(outcome.rendered.validateCanonicalDom()).toBe(false);
      expect(outcome.rendered.current).toBe(false);
      expect(outcome.rendered.nodeForAstPath([0, 0])).toBeNull();
      expect(childNodesShadow).not.toHaveBeenCalled();
      expect(attributesShadow).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(paragraph, "childNodes");
      Reflect.deleteProperty(paragraph, "attributes");
    }
  });

  it("leases exact renderer ownership across expected native composition DOM drift", async () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const outcome = valueOf(renderer.render(host, base));

    const lease = renderer.beginCompositionDomLease(outcome.rendered);
    expect(lease).not.toBeNull();
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    expect(outcome.rendered.current).toBe(false);
    expect(outcome.rendered.validateCanonicalDom()).toBe(false);
    expect(outcome.rendered.nodeForAstPath([0, 0])).toBeNull();
    expect(renderer.ownsCompositionDomLease(lease, outcome.rendered)).toBe(true);

    (host.firstChild as Element | null)?.replaceChildren(
      document.createTextNode("provisional"),
    );
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(renderer.ownsCompositionDomLease(lease, outcome.rendered)).toBe(true);
    expect(renderer.owns(outcome.rendered)).toBe(false);
  });

  it("restores a composition lease once and rejects forged or foreign capabilities", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const foreignRenderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    (host.firstChild as Element | null)?.replaceChildren(document.createTextNode("native"));

    expect(renderer.beginCompositionDomLease(initial.rendered)).toBeNull();
    expect(foreignRenderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(false);
    expect(
      renderer.ownsCompositionDomLease(Object.freeze({}), initial.rendered),
    ).toBe(false);

    const result = projection(1, [[{ text: "committed", strong: false }]]);
    const restored = valueOf(renderer.restoreCompositionDomLease(lease, result));
    expect(restored.mode).toBe("full");
    expect(host.textContent).toBe("committed");
    expect(restored.rendered.current).toBe(true);
    expect(initial.rendered.current).toBe(false);
    expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(false);

    const repeated = renderer.restoreCompositionDomLease(lease, base);
    expect(repeated.ok).toBe(false);
    expect(host.textContent).toBe("committed");
  });

  it("keeps a composition lease recoverable across invalid input and detached build failure", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    host.textContent = "native";

    expect(renderer.restoreCompositionDomLease(lease, {} as never)).toMatchObject({
      ok: false,
      error: { code: "projection.invalid_shape" },
    });
    expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(true);

    const constructor = vi.spyOn(host.ownerDocument, "createElementNS")
      .mockImplementation(() => {
        throw new Error("hostile detached DOM constructor");
      });
    try {
      expect(renderer.restoreCompositionDomLease(lease, base)).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
    } finally {
      constructor.mockRestore();
    }

    expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(true);
    expect(renderer.discardCompositionDomLease(lease)).toBe(true);
    expect(initial.rendered.current).toBe(false);

    const recovered = valueOf(renderer.render(host, base));
    expect(recovered.rendered.current).toBe(true);
    expect(host.textContent).toBe("base");
    const reacquired = renderer.beginCompositionDomLease(recovered.rendered);
    expect(reacquired).not.toBeNull();
    if (reacquired !== null) {
      expect(renderer.discardCompositionDomLease(reacquired)).toBe(true);
    }
  });

  it("does not absorb content inserted during composition restore construction", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    (host.firstChild as Element | null)?.replaceChildren(
      document.createTextNode("native"),
    );
    const applicationContent = document.createElement("aside");
    applicationContent.textContent = "application restore content";
    const original = host.ownerDocument.createElementNS.bind(host.ownerDocument);
    let mutated = false;
    const constructor = vi.spyOn(host.ownerDocument, "createElementNS")
      .mockImplementation((namespace, qualifiedName, options) => {
        const element = original(namespace, qualifiedName, options);
        if (!mutated) {
          mutated = true;
          host.append(applicationContent);
        }
        return element;
      });

    try {
      expect(renderer.restoreCompositionDomLease(
        lease,
        projection(1, [[{ text: "committed", strong: false }]]),
      )).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(mutated).toBe(true);
      expect(applicationContent.parentElement).toBe(host);
      expect(host.querySelectorAll("p")).toHaveLength(1);
      expect(host.textContent).toBe("nativeapplication restore content");
      expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(false);
      expect(initial.rendered.current).toBe(false);
    } finally {
      constructor.mockRestore();
    }
  });

  it("invalidates host ownership when installation fails after spending a lease", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    host.textContent = "native";

    const replace = vi.spyOn(host, "replaceChildren").mockImplementation(() => {
      throw new Error("hostile host write");
    });
    try {
      expect(renderer.restoreCompositionDomLease(lease, base)).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
    } finally {
      replace.mockRestore();
    }

    expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(false);
    expect(renderer.discardCompositionDomLease(lease)).toBe(false);
    expect(initial.rendered.current).toBe(false);
    expect(renderer.release(initial.rendered)).toBe(false);

    const recovered = valueOf(renderer.render(host, base));
    expect(recovered.rendered.current).toBe(true);
    expect(host.textContent).toBe("base");
    const reacquired = renderer.beginCompositionDomLease(recovered.rendered);
    expect(reacquired).not.toBeNull();
    if (reacquired !== null) {
      expect(renderer.discardCompositionDomLease(reacquired)).toBe(true);
    }
  });

  it("invalidates an explicitly discarded composition lease without changing DOM", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const initial = render(renderer, host, 0, [[{ text: "base", strong: false }]]);
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    host.textContent = "native";

    expect(renderer.discardCompositionDomLease(lease)).toBe(true);
    expect(renderer.discardCompositionDomLease(lease)).toBe(false);
    expect(initial.rendered.current).toBe(false);
    expect(host.textContent).toBe("native");
  });

  it("invalidates a lease when another render supersedes its host ownership", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const initial = render(renderer, host, 0, [[{ text: "base", strong: false }]]);
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }

    render(renderer, host, 1, [[{ text: "replacement", strong: false }]]);

    expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(false);
    expect(renderer.restoreCompositionDomLease(lease, initial.rendered.projection).ok).toBe(
      false,
    );
    expect(host.textContent).toBe("replacement");
  });

  it("releases a current mapping without removing DOM", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const outcome = render(renderer, host, 0, [[]]);

    expect(renderer.release(outcome.rendered)).toBe(true);
    expect(renderer.release(outcome.rendered)).toBe(false);
    expect(outcome.rendered.current).toBe(false);
    expect(host.childNodes).toHaveLength(1);
  });
});

const PROFILE_FINGERPRINT =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function profileGeneration(): WasmProfileGenerationView {
  const generation: WasmProfileGenerationView = {
    matches(candidate) {
      return candidate === generation;
    },
    free() {},
  };
  return generation;
}

function ownedProfileDescriptor(
  generation: WasmProfileGenerationView,
  formats: readonly ProfileFormatFixture[],
): BrowserCompiledProfileDescriptor {
  const absent = (): undefined => undefined;
  const normalized = formats.map((format) => typeof format === "string"
    ? { kind: format, properties: [] }
    : format);
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/document",
    schemaVersion: 1,
    schemaFingerprint: PROFILE_FINGERPRINT,
    formatCount: formats.length,
    intentCount: 0,
    actionStateCount: 0,
    inlineFormatSetCount: 0,
    matchesProfileGeneration: (candidate) => candidate === generation,
    formatKind: (index) => normalized[index]?.kind,
    formatRevision: (index) =>
      index >= 0 && index < formats.length ? 1 : undefined,
    formatPropertyCount: (index) => normalized[index]?.properties.length,
    formatPropertyName: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.name,
    formatPropertyPresence: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.presence,
    formatPropertyValueType: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.valueType.kind,
    formatPropertyIntegerMinimum: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "integer" ? type.minimum : undefined;
    },
    formatPropertyIntegerMaximum: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "integer" ? type.maximum : undefined;
    },
    formatPropertyStringMinimumUtf8Bytes: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "string" ? type.minimumUtf8Bytes : undefined;
    },
    formatPropertyStringMaximumUtf8Bytes: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "string" ? type.maximumUtf8Bytes : undefined;
    },
    intentId: absent,
    intentInputKind: absent,
    intentInputContractName: absent,
    intentInputContractVersion: absent,
    intentActivationContract: absent,
    intentValueContractName: absent,
    intentValueContractVersion: absent,
    actionStateId: absent,
    actionStateSourceKind: absent,
    actionStateSourceActionId: absent,
    actionStateSourceIntentId: absent,
    actionStateHistoryDirection: absent,
    actionStateActivationContract: absent,
    actionStateValueContractName: absent,
    actionStateValueContractVersion: absent,
    inlineFormatSetFormatKind: absent,
    inlineFormatSetIntentId: absent,
    inlineFormatSetActionStateId: absent,
    free: () => undefined,
  };
  const result = consumeWasmCompiledProfileDescriptor(generation, view);
  if (!result.ok) throw new Error("test descriptor was rejected");
  return result.descriptor;
}

type ProfilePropertyFixture = Readonly<{
  name: string;
  presence: "required" | "optional";
  valueType:
    | Readonly<{ kind: "boolean" }>
    | Readonly<{ kind: "integer"; minimum?: number; maximum?: number }>
    | Readonly<{
      kind: "string";
      minimumUtf8Bytes: number;
      maximumUtf8Bytes: number;
    }>;
}>;

type ProfileFormatFixture = string | Readonly<{
  kind: string;
  properties: readonly ProfilePropertyFixture[];
}>;

const SAFE_LINK_FORMAT: Exclude<ProfileFormatFixture, string> = Object.freeze({
  kind: "example/link",
  properties: Object.freeze([
    Object.freeze({
      name: "example/href",
      presence: "required" as const,
      valueType: Object.freeze({
        kind: "string" as const,
        minimumUtf8Bytes: 1,
        maximumUtf8Bytes: 2_048,
      }),
    }),
    Object.freeze({
      name: "example/open-in-new-window",
      presence: "required" as const,
      valueType: Object.freeze({ kind: "boolean" as const }),
    }),
  ]),
});

const SAFE_TEXT_COLOR_FORMAT: Exclude<ProfileFormatFixture, string> =
  Object.freeze({
    kind: "example/text-color",
    properties: Object.freeze([
      Object.freeze({
        name: "example/rgb24",
        presence: "required" as const,
        valueType: Object.freeze({
          kind: "integer" as const,
          minimum: 0,
          maximum: 0xff_ffff,
        }),
      }),
    ]),
  });

const SAFE_INTEGER_TOKEN_FORMAT: Exclude<ProfileFormatFixture, string> =
  Object.freeze({
    kind: "example/text-size",
    properties: Object.freeze([
      Object.freeze({
        name: "example/size",
        presence: "required" as const,
        valueType: Object.freeze({
          kind: "integer" as const,
          minimum: 1,
          maximum: 3,
        }),
      }),
    ]),
  });

function propertyFreeFormats(formats: readonly string[]) {
  return formats.map((kind) => ({ kind, properties: [] }));
}
