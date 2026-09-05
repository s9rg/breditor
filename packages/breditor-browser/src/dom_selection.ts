import {
  type RenderedProjection,
  isOwnedRenderedProjection,
} from "./dom_renderer.js";
import {
  BaseRangeSelection,
  type BaseEditorSelection,
  type BaseSelectionPoint,
  isOwnedBaseRangeSelection,
  isUnicodeScalarBoundary,
} from "./selection.js";
import type {
  BrowserSelectionErrorCode,
  BrowserSelectionResult,
} from "./selection_result.js";
import { selectionFailure, selectionSuccess } from "./selection_result.js";

/**
 * Frozen affinity policy for DOM-originated points lacking an exact sidecar.
 *
 * Target starts (and the sole empty boundary) use `after`; target ends use
 * `before`; interior boundaries use `after`.
 */
export type DomSelectionAffinityPolicy = "boundaryDerived";

/** Whether a DOM observation is new input or an echo of our last exact write. */
export type DomSelectionOrigin = "dom" | "programmaticEcho";

/** Why the browser currently has no semantic range inside this editor host. */
export type DomSelectionUnavailableReason = "noDomRange" | "outsideHost";

/**
 * A DOM selection observation which never conflates missing browser focus with
 * the core's explicit `None` selection value.
 */
export type DomSelectionObservation =
  | Readonly<{
      kind: "range";
      selection: BaseRangeSelection;
      origin: DomSelectionOrigin;
    }>
  | Readonly<{
      kind: "unavailable";
      reason: DomSelectionUnavailableReason;
      origin: DomSelectionOrigin;
    }>;

/** Browser focus is observed independently from semantic selection. */
export type DomFocusObservation =
  | Readonly<{ kind: "withinHost"; activeElement: Element }>
  | Readonly<{ kind: "outsideHost"; activeElement: Element }>
  | Readonly<{ kind: "unavailable" }>;

/** Receipt for one exact DOM selection installation. */
export interface DomSelectionWriteOutcome {
  readonly kind: "range" | "none";
  readonly rendererGeneration: bigint;
}

interface DomPoint {
  readonly node: Node;
  readonly offset: number;
}

interface PointMapping {
  readonly point: BaseSelectionPoint;
}

interface SuppressionReceipt {
  readonly rendered: RenderedProjection;
  readonly rendererGeneration: bigint;
  readonly signature: string;
  readonly selection: BaseRangeSelection | null;
}

type PointMappingResult =
  | { readonly ok: true; readonly value: PointMapping }
  | { readonly ok: false; readonly code: BrowserSelectionErrorCode };

type RenderPreflight =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: BrowserSelectionErrorCode };

type SelectionOwnershipResult =
  | { readonly ok: true; readonly value: "empty" | "insideHost" | "outsideHost" }
  | { readonly ok: false; readonly code: BrowserSelectionErrorCode };

type DomSelectionSnapshot =
  | Readonly<{ kind: "empty" }>
  | Readonly<{
      kind: "range";
      anchorNode: Node;
      anchorOffset: number;
      focusNode: Node;
      focusOffset: number;
      startNode: Node;
      startOffset: number;
      endNode: Node;
      endOffset: number;
    }>;

type DomSelectionSnapshotResult =
  | { readonly ok: true; readonly value: DomSelectionSnapshot }
  | { readonly ok: false; readonly code: BrowserSelectionErrorCode };

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/**
 * Exact base-schema AST/DOM selection mapper with generation-bound echo control.
 *
 * The bridge supports one light-DOM host and one browser range. It never calls
 * `focus()` or `blur()`: focus observation and semantic selection publication
 * remain separate integration decisions.
 */
export class BreditorDomSelectionBridge {
  /** Policy used only when no exact programmatic affinity sidecar is available. */
  get affinityPolicy(): DomSelectionAffinityPolicy {
    return "boundaryDerived";
  }
  #receipt: SuppressionReceipt | undefined;

  /**
   * Reads anchor and focus from the rendered host's own `Window.getSelection()`.
   *
   * Strong-wrapper and empty-paragraph placeholder points are normalized. A
   * range outside the host is reported as unavailable, not semantic absence.
   */
  read(
    rendered: RenderedProjection,
  ): BrowserSelectionResult<DomSelectionObservation> {
    const preflight = validateRenderedForSelection(rendered);
    if (!preflight.ok) {
      this.#receipt = undefined;
      return selectionFailure(preflight.code);
    }
    try {
      const domSelection = selectionForRendered(rendered);
      if (domSelection === null) {
        this.#receipt = undefined;
        return selectionFailure("selection.selection_api_unavailable");
      }
      const snapshotResult = captureDomSelection(domSelection);
      if (!snapshotResult.ok) {
        this.#receipt = undefined;
        return selectionFailure(snapshotResult.code);
      }
      const snapshot = snapshotResult.value;
      if (snapshot.kind === "empty") {
        if (!rendered.validateCanonicalDom()) {
          this.#receipt = undefined;
          return selectionFailure("selection.dom_drift");
        }
        const origin = this.matchesReceipt(rendered, "none", null)
          ? "programmaticEcho"
          : "dom";
        this.#receipt = undefined;
        return selectionSuccess(
          Object.freeze({ kind: "unavailable", reason: "noDomRange", origin }),
        );
      }
      const { anchorNode, anchorOffset, focusNode, focusOffset } = snapshot;
      if (!rendered.validateCanonicalDom()) {
        this.#receipt = undefined;
        return selectionFailure("selection.dom_drift");
      }
      const ownership = selectionSnapshotOwnership(rendered.host, snapshot);
      if (!ownership.ok) {
        this.#receipt = undefined;
        return selectionFailure(ownership.code);
      }
      if (ownership.value === "outsideHost") {
        this.#receipt = undefined;
        return selectionSuccess(
          Object.freeze({ kind: "unavailable", reason: "outsideHost", origin: "dom" }),
        );
      }
      const anchor = pointFromDom(rendered, anchorNode, anchorOffset);
      if (!anchor.ok) {
        this.#receipt = undefined;
        return selectionFailure(anchor.code);
      }
      const focus = pointFromDom(rendered, focusNode, focusOffset);
      if (!focus.ok) {
        this.#receipt = undefined;
        return selectionFailure(focus.code);
      }
      const created = BaseRangeSelection.create(rendered.projection, {
        kind: "range",
        anchor: anchor.value.point,
        focus: focus.value.point,
      });
      if (!created.ok) {
        this.#receipt = undefined;
        return created;
      }
      const signature = domRangeSignature(
        rendered,
        anchorNode,
        anchorOffset,
        focusNode,
        focusOffset,
      );
      if (signature === null) {
        this.#receipt = undefined;
        return selectionFailure("selection.invalid_point");
      }
      if (!rendered.validateCanonicalDom()) {
        this.#receipt = undefined;
        return selectionFailure("selection.dom_drift");
      }
      const exact = this.matchingReceiptSelection(rendered, signature);
      if (exact !== null) {
        this.#receipt = undefined;
        return selectionSuccess(
          Object.freeze({ kind: "range", selection: exact, origin: "programmaticEcho" }),
        );
      }
      this.#receipt = undefined;
      return selectionSuccess(
        Object.freeze({ kind: "range", selection: created.value, origin: "dom" }),
      );
    } catch {
      this.#receipt = undefined;
      return selectionFailure("selection.dom_read_failed");
    }
  }

  /**
   * Installs one semantic range or explicit semantic absence without changing focus.
   *
   * Directional anchor/focus endpoints are verified after the browser call. A
   * browser lacking `setBaseAndExtent` can receive forward/collapsed ranges via
   * `Range`, but backward ranges fail before DOM selection mutation.
   */
  write(
    rendered: RenderedProjection,
    selection: BaseEditorSelection,
  ): BrowserSelectionResult<DomSelectionWriteOutcome> {
    const preflight = validateRenderedForSelection(rendered);
    if (!preflight.ok) {
      this.#receipt = undefined;
      return selectionFailure(preflight.code);
    }
    if (
      selection !== null &&
      (!isOwnedBaseRangeSelection(selection) || selection.projection !== rendered.projection)
    ) {
      this.#receipt = undefined;
      return selectionFailure("selection.snapshot_mismatch");
    }
    try {
      const domSelection = selectionForRendered(rendered);
      if (domSelection === null) {
        this.#receipt = undefined;
        return selectionFailure("selection.selection_api_unavailable");
      }
      const priorResult = captureDomSelection(domSelection);
      if (!priorResult.ok) {
        this.#receipt = undefined;
        return selectionFailure(priorResult.code);
      }
      const prior = priorResult.value;
      if (!rendered.validateCanonicalDom()) {
        this.#receipt = undefined;
        return selectionFailure("selection.dom_drift");
      }
      if (selection === null) {
        const ownership = selectionSnapshotOwnership(rendered.host, prior);
        if (!ownership.ok) {
          this.#receipt = undefined;
          return selectionFailure(ownership.code);
        }
        if (ownership.value === "outsideHost") {
          this.#receipt = undefined;
          return selectionSuccess(
            Object.freeze({ kind: "none", rendererGeneration: rendered.rendererGeneration }),
          );
        }
        if (ownership.value === "insideHost") {
          try {
            domSelection.removeAllRanges();
          } catch {
            rollbackDomSelection(rendered.host, domSelection, prior);
            this.#receipt = undefined;
            return selectionFailure("selection.dom_write_failed");
          }
        }
        if (
          domSelection.rangeCount !== 0 ||
          domSelection.anchorNode !== null ||
          domSelection.focusNode !== null
        ) {
          rollbackDomSelection(rendered.host, domSelection, prior);
          this.#receipt = undefined;
          return selectionFailure("selection.dom_write_failed");
        }
        if (!rendered.validateCanonicalDom()) {
          rollbackDomSelection(rendered.host, domSelection, prior);
          this.#receipt = undefined;
          return selectionFailure("selection.dom_drift");
        }
        this.#receipt = Object.freeze({
          rendered,
          rendererGeneration: rendered.rendererGeneration,
          signature: "none",
          selection: null,
        });
        return selectionSuccess(
          Object.freeze({ kind: "none", rendererGeneration: rendered.rendererGeneration }),
        );
      }

      const anchor = domPointForSemantic(rendered, selection.anchor);
      const focus = domPointForSemantic(rendered, selection.focus);
      if (anchor === null || focus === null) {
        this.#receipt = undefined;
        return selectionFailure("selection.invalid_point");
      }
      const setBaseAndExtent = domSelection.setBaseAndExtent;
      if (typeof setBaseAndExtent !== "function" && selection.order === "backward") {
        this.#receipt = undefined;
        return selectionFailure("selection.backward_unsupported");
      }
      try {
        if (typeof setBaseAndExtent === "function") {
          setBaseAndExtent.call(
            domSelection,
            anchor.node,
            anchor.offset,
            focus.node,
            focus.offset,
          );
        } else {
          installForwardRange(rendered.host.ownerDocument, domSelection, anchor, focus);
        }
      } catch {
        rollbackDomSelection(rendered.host, domSelection, prior);
        this.#receipt = undefined;
        return selectionFailure("selection.dom_write_failed");
      }
      if (
        domSelection.rangeCount !== 1 ||
        domSelection.anchorNode !== anchor.node ||
        domSelection.anchorOffset !== anchor.offset ||
        domSelection.focusNode !== focus.node ||
        domSelection.focusOffset !== focus.offset
      ) {
        rollbackDomSelection(rendered.host, domSelection, prior);
        this.#receipt = undefined;
        return selectionFailure("selection.dom_write_failed");
      }
      if (!rendered.validateCanonicalDom()) {
        rollbackDomSelection(rendered.host, domSelection, prior);
        this.#receipt = undefined;
        return selectionFailure("selection.dom_drift");
      }
      const signature = domRangeSignature(
        rendered,
        anchor.node,
        anchor.offset,
        focus.node,
        focus.offset,
      );
      if (signature === null) {
        this.#receipt = undefined;
        return selectionFailure("selection.invalid_point");
      }
      this.#receipt = Object.freeze({
        rendered,
        rendererGeneration: rendered.rendererGeneration,
        signature,
        selection,
      });
      return selectionSuccess(
        Object.freeze({ kind: "range", rendererGeneration: rendered.rendererGeneration }),
      );
    } catch {
      this.#receipt = undefined;
      return selectionFailure("selection.dom_write_failed");
    }
  }

  /** Reads focus ownership without reading or changing semantic selection. */
  readFocus(rendered: RenderedProjection): BrowserSelectionResult<DomFocusObservation> {
    try {
      const receipt = this.#receipt;
      if (
        receipt !== undefined &&
        (receipt.rendered !== rendered ||
          receipt.rendererGeneration !== rendered.rendererGeneration)
      ) {
        this.#receipt = undefined;
      }
    } catch {
      this.#receipt = undefined;
      return selectionFailure("selection.dom_read_failed");
    }
    const preflight = validateRenderedForSelection(rendered);
    if (!preflight.ok) {
      this.#receipt = undefined;
      return selectionFailure(preflight.code);
    }
    try {
      const activeElement = rendered.host.ownerDocument.activeElement;
      if (activeElement === null) {
        return selectionSuccess(Object.freeze({ kind: "unavailable" }));
      }
      const kind =
        activeElement === rendered.host || rendered.host.contains(activeElement)
          ? "withinHost"
          : "outsideHost";
      return selectionSuccess(Object.freeze({ kind, activeElement }));
    } catch {
      return selectionFailure("selection.dom_read_failed");
    }
  }

  /** Explicitly forgets the generation-bound programmatic echo receipt. */
  clearSuppression(): void {
    this.#receipt = undefined;
  }

  /** Releases all bridge-local lifecycle state; it does not alter DOM or focus. */
  dispose(): void {
    this.#receipt = undefined;
  }

  private matchesReceipt(
    rendered: RenderedProjection,
    signature: string,
    selection: BaseRangeSelection | null,
  ): boolean {
    const receipt = this.#receipt;
    return (
      receipt !== undefined &&
      receipt.rendered === rendered &&
      receipt.rendererGeneration === rendered.rendererGeneration &&
      receipt.signature === signature &&
      receipt.selection === selection
    );
  }

  private matchingReceiptSelection(
    rendered: RenderedProjection,
    signature: string,
  ): BaseRangeSelection | null {
    const receipt = this.#receipt;
    return receipt !== undefined &&
      receipt.rendered === rendered &&
      receipt.rendererGeneration === rendered.rendererGeneration &&
      receipt.signature === signature &&
      receipt.selection !== null
      ? receipt.selection
      : null;
  }
}

function validateRenderedForSelection(rendered: RenderedProjection): RenderPreflight {
  if (!isOwnedRenderedProjection(rendered) || !rendered.current) {
    return { ok: false, code: "selection.foreign_or_stale_render" };
  }
  return rendered.validateCanonicalDom()
    ? { ok: true }
    : { ok: false, code: "selection.dom_drift" };
}

function selectionForRendered(rendered: RenderedProjection): Selection | null {
  const view = rendered.host.ownerDocument.defaultView;
  if (view === null || typeof view.getSelection !== "function") {
    return null;
  }
  return view.getSelection();
}

function captureDomSelection(selection: Selection): DomSelectionSnapshotResult {
  const rangeCount = selection.rangeCount;
  if (!Number.isSafeInteger(rangeCount) || rangeCount < 0) {
    return { ok: false, code: "selection.dom_read_failed" };
  }
  if (rangeCount > 1) {
    return { ok: false, code: "selection.multirange_unsupported" };
  }
  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (rangeCount === 0) {
    return anchorNode === null && focusNode === null
      ? { ok: true, value: Object.freeze({ kind: "empty" }) }
      : { ok: false, code: "selection.dom_read_failed" };
  }
  if (anchorNode === null || focusNode === null) {
    return { ok: false, code: "selection.dom_read_failed" };
  }
  const anchorOffset = selection.anchorOffset;
  const focusOffset = selection.focusOffset;
  const range = selection.getRangeAt(0);
  const startNode = range.startContainer;
  const startOffset = range.startOffset;
  const endNode = range.endContainer;
  const endOffset = range.endOffset;
  if (
    !isDomOffset(anchorOffset) ||
    !isDomOffset(focusOffset) ||
    !isDomOffset(startOffset) ||
    !isDomOffset(endOffset) ||
    !(
      (startNode === anchorNode &&
        startOffset === anchorOffset &&
        endNode === focusNode &&
        endOffset === focusOffset) ||
      (startNode === focusNode &&
        startOffset === focusOffset &&
        endNode === anchorNode &&
        endOffset === anchorOffset)
    )
  ) {
    return { ok: false, code: "selection.dom_read_failed" };
  }
  return {
    ok: true,
    value: Object.freeze({
      kind: "range",
      anchorNode,
      anchorOffset,
      focusNode,
      focusOffset,
      startNode,
      startOffset,
      endNode,
      endOffset,
    }),
  };
}

function selectionSnapshotOwnership(
  host: HTMLElement,
  snapshot: DomSelectionSnapshot,
): SelectionOwnershipResult {
  if (snapshot.kind === "empty") {
    return { ok: true, value: "empty" };
  }
  const anchorInside = nodeIsInsideHost(host, snapshot.anchorNode);
  const focusInside = nodeIsInsideHost(host, snapshot.focusNode);
  if (anchorInside !== focusInside) {
    return { ok: false, code: "selection.crosses_host" };
  }
  if (anchorInside) {
    return { ok: true, value: "insideHost" };
  }
  try {
    const range = host.ownerDocument.createRange();
    range.setStart(snapshot.startNode, snapshot.startOffset);
    range.setEnd(snapshot.endNode, snapshot.endOffset);
    return range.intersectsNode(host)
      ? { ok: false, code: "selection.crosses_host" }
      : { ok: true, value: "outsideHost" };
  } catch {
    return { ok: false, code: "selection.dom_read_failed" };
  }
}

function rollbackDomSelection(
  host: HTMLElement,
  selection: Selection,
  snapshot: DomSelectionSnapshot,
): void {
  try {
    if (snapshot.kind === "empty") {
      selection.removeAllRanges();
    } else {
      const setBaseAndExtent = selection.setBaseAndExtent;
      if (typeof setBaseAndExtent === "function") {
        setBaseAndExtent.call(
          selection,
          snapshot.anchorNode,
          snapshot.anchorOffset,
          snapshot.focusNode,
          snapshot.focusOffset,
        );
      } else if (
        typeof selection.collapse === "function" &&
        typeof selection.extend === "function"
      ) {
        selection.collapse(snapshot.anchorNode, snapshot.anchorOffset);
        selection.extend(snapshot.focusNode, snapshot.focusOffset);
      } else {
        const range = host.ownerDocument.createRange();
        range.setStart(snapshot.startNode, snapshot.startOffset);
        range.setEnd(snapshot.endNode, snapshot.endOffset);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    if (domSelectionMatchesSnapshot(selection, snapshot)) {
      return;
    }
  } catch {
    // Best effort continues below by removing a failed editor-owned result.
  }
  try {
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (
      (anchorNode !== null && nodeIsInsideHost(host, anchorNode)) ||
      (focusNode !== null && nodeIsInsideHost(host, focusNode))
    ) {
      selection.removeAllRanges();
    }
  } catch {
    // Hostile platform methods can make rollback impossible; core state is untouched.
  }
}

function domSelectionMatchesSnapshot(
  selection: Selection,
  snapshot: DomSelectionSnapshot,
): boolean {
  if (snapshot.kind === "empty") {
    return (
      selection.rangeCount === 0 &&
      selection.anchorNode === null &&
      selection.focusNode === null
    );
  }
  return (
    selection.rangeCount === 1 &&
    selection.anchorNode === snapshot.anchorNode &&
    selection.anchorOffset === snapshot.anchorOffset &&
    selection.focusNode === snapshot.focusNode &&
    selection.focusOffset === snapshot.focusOffset
  );
}

function pointFromDom(
  rendered: RenderedProjection,
  node: Node,
  offset: number,
): PointMappingResult {
  if (node === rendered.host) {
    const paragraphCount = rendered.projection.paragraphs.length;
    if (offset === 0) {
      return {
        ok: true,
        value: {
          point: Object.freeze({
            kind: "children",
            parentPath: Object.freeze([0]),
            childIndex: 0,
            affinity: "after",
          }),
        },
      };
    }
    if (offset === paragraphCount) {
      const paragraphIndex = paragraphCount - 1;
      const paragraph = rendered.projection.paragraphs[paragraphIndex];
      if (paragraph === undefined) {
        return { ok: false, code: "selection.ambiguous_dom_point" };
      }
      return {
        ok: true,
        value: {
          point: Object.freeze({
            kind: "children",
            parentPath: Object.freeze([paragraphIndex]),
            childIndex: paragraph.runs.length,
            affinity: paragraph.runs.length === 0 ? "after" : "before",
          }),
        },
      };
    }
    return { ok: false, code: "selection.ambiguous_dom_point" };
  }
  const exactPath = rendered.astPathForDomNode(node);
  if (exactPath !== null) {
    if (exactPath.length === 2) {
      const paragraphIndex = exactPath[0];
      const runIndex = exactPath[1];
      const run =
        paragraphIndex === undefined || runIndex === undefined
          ? undefined
          : rendered.projection.paragraphs[paragraphIndex]?.runs[runIndex];
      if (run === undefined || node.nodeType !== 3 || offset > run.text.length) {
        return { ok: false, code: "selection.ambiguous_dom_point" };
      }
      if (!isUnicodeScalarBoundary(run.text, offset)) {
        return { ok: false, code: "selection.invalid_utf16_boundary" };
      }
      return {
        ok: true,
        value: {
          point: Object.freeze({
            kind: "text",
            textPath: exactPath,
            utf16Offset: offset,
            affinity: boundaryAffinity(offset, run.text.length),
          }),
        },
      };
    }
    if (exactPath.length === 1) {
      const paragraphIndex = exactPath[0];
      const paragraph =
        paragraphIndex === undefined ? undefined : rendered.projection.paragraphs[paragraphIndex];
      if (paragraph === undefined) {
        return { ok: false, code: "selection.ambiguous_dom_point" };
      }
      const childIndex =
        paragraph.runs.length === 0 && (offset === 0 || offset === 1) ? 0 : offset;
      if (childIndex > paragraph.runs.length || (paragraph.runs.length === 0 && offset > 1)) {
        return { ok: false, code: "selection.ambiguous_dom_point" };
      }
      return {
        ok: true,
        value: {
          point: Object.freeze({
            kind: "children",
            parentPath: exactPath,
            childIndex,
            affinity: boundaryAffinity(childIndex, paragraph.runs.length),
          }),
        },
      };
    }
    return { ok: false, code: "selection.ambiguous_dom_point" };
  }

  if (isHtmlElementNamed(node, "STRONG")) {
    const paragraph = node.parentNode;
    const paragraphPath = paragraph === null ? null : rendered.astPathForDomNode(paragraph);
    if (
      paragraph === null ||
      paragraphPath === null ||
      paragraphPath.length !== 1 ||
      (offset !== 0 && offset !== 1)
    ) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }
    const runIndex = indexOfChild(paragraph, node);
    const paragraphIndex = paragraphPath[0];
    const run =
      paragraphIndex === undefined || runIndex < 0
        ? undefined
        : rendered.projection.paragraphs[paragraphIndex]?.runs[runIndex];
    const text = node.childNodes[0];
    if (
      paragraphIndex === undefined ||
      runIndex < 0 ||
      run === undefined ||
      !run.strong ||
      text === undefined ||
      text.nodeType !== 3
    ) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }
    return {
      ok: true,
      value: {
        point: Object.freeze({
          kind: "text",
          textPath: Object.freeze([paragraphIndex, runIndex]),
          utf16Offset: offset === 0 ? 0 : run.text.length,
          affinity: boundaryAffinity(offset === 0 ? 0 : run.text.length, run.text.length),
        }),
      },
    };
  }

  if (isHtmlElementNamed(node, "BR") && offset === 0) {
    const paragraph = node.parentNode;
    const paragraphPath = paragraph === null ? null : rendered.astPathForDomNode(paragraph);
    const paragraphIndex = paragraphPath?.[0];
    if (
      paragraphPath === null ||
      paragraphPath.length !== 1 ||
      paragraphIndex === undefined ||
      rendered.projection.paragraphs[paragraphIndex]?.runs.length !== 0
    ) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }
    return {
      ok: true,
      value: {
        point: Object.freeze({
          kind: "children",
          parentPath: paragraphPath,
          childIndex: 0,
          affinity: "after",
        }),
      },
    };
  }
  return { ok: false, code: "selection.ambiguous_dom_point" };
}

function domPointForSemantic(
  rendered: RenderedProjection,
  point: BaseSelectionPoint,
): DomPoint | null {
  const path = point.kind === "text" ? point.textPath : point.parentPath;
  const node = rendered.nodeForAstPath(path);
  if (node === null) {
    return null;
  }
  if (point.kind === "text") {
    return node.nodeType === 3 ? { node, offset: point.utf16Offset } : null;
  }
  const paragraphIndex = point.parentPath[0];
  const paragraph =
    paragraphIndex === undefined ? undefined : rendered.projection.paragraphs[paragraphIndex];
  if (paragraph === undefined || node.nodeType !== 1) {
    return null;
  }
  return { node, offset: paragraph.runs.length === 0 ? 0 : point.childIndex };
}

function installForwardRange(
  document: Document,
  selection: Selection,
  anchor: DomPoint,
  focus: DomPoint,
): void {
  const range = document.createRange();
  range.setStart(anchor.node, anchor.offset);
  range.setEnd(focus.node, focus.offset);
  if (
    range.startContainer !== anchor.node ||
    range.startOffset !== anchor.offset ||
    range.endContainer !== focus.node ||
    range.endOffset !== focus.offset
  ) {
    throw new TypeError("Range cannot preserve the requested anchor and focus.");
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function domRangeSignature(
  rendered: RenderedProjection,
  anchorNode: Node,
  anchorOffset: number,
  focusNode: Node,
  focusOffset: number,
): string | null {
  const anchor = domContainerDescriptor(rendered, anchorNode);
  const focus = domContainerDescriptor(rendered, focusNode);
  return anchor === null || focus === null
    ? null
    : `range:${anchor}@${anchorOffset}>${focus}@${focusOffset}`;
}

function domContainerDescriptor(rendered: RenderedProjection, node: Node): string | null {
  if (node === rendered.host) {
    return "host";
  }
  const path = rendered.astPathForDomNode(node);
  if (path !== null) {
    const paragraphIndex = path[0];
    if (path.length === 1 && paragraphIndex !== undefined) {
      return `paragraph:${paragraphIndex}`;
    }
    const runIndex = path[1];
    if (path.length === 2 && paragraphIndex !== undefined && runIndex !== undefined) {
      return `text:${paragraphIndex}:${runIndex}`;
    }
    return null;
  }
  if (isHtmlElementNamed(node, "STRONG")) {
    const paragraph = node.parentNode;
    const paragraphPath = paragraph === null ? null : rendered.astPathForDomNode(paragraph);
    const paragraphIndex = paragraphPath?.[0];
    const runIndex = paragraph === null ? -1 : indexOfChild(paragraph, node);
    return paragraphPath !== null &&
      paragraphPath.length === 1 &&
      paragraphIndex !== undefined &&
      runIndex >= 0
      ? `strong:${paragraphIndex}:${runIndex}`
      : null;
  }
  if (isHtmlElementNamed(node, "BR")) {
    const paragraph = node.parentNode;
    const paragraphPath = paragraph === null ? null : rendered.astPathForDomNode(paragraph);
    const paragraphIndex = paragraphPath?.[0];
    return paragraphPath !== null && paragraphPath.length === 1 && paragraphIndex !== undefined
      ? `placeholder:${paragraphIndex}`
      : null;
  }
  return null;
}

function nodeIsInsideHost(host: HTMLElement, node: Node): boolean {
  return node === host || host.contains(node);
}

function indexOfChild(parent: Node, child: Node): number {
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    if (parent.childNodes[index] === child) {
      return index;
    }
  }
  return -1;
}

function isHtmlElementNamed(node: Node, localName: "STRONG" | "BR"): node is HTMLElement {
  return (
    node.nodeType === 1 &&
    (node as Element).namespaceURI === HTML_NAMESPACE &&
    (node as Element).localName === localName.toLowerCase()
  );
}

function isDomOffset(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 4_294_967_295;
}

function boundaryAffinity(offset: number, length: number): "before" | "after" {
  return length > 0 && offset === length ? "before" : "after";
}
