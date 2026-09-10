import {
  type RenderedProjection,
  isOwnedRenderedProjection,
} from "./dom_renderer.js";
import {
  mapDomPointToBaseSelectionPoint,
  soleMappedTextDescendant,
} from "./dom_point_mapping.js";
import {
  nativeContainsNode,
  nativeDocumentCreateRange,
  nativeDocumentSelection,
  nativeElementLocalName,
  nativeHtmlHostFacts,
  nativeNodeType,
  nativeOwnerDocument,
  nativeParentNode,
  nativeRangeFacts,
  nativeRangeIntersectsNode,
  nativeRangeSetEnd,
  nativeRangeSetStart,
  nativeSelectionAddRange,
  nativeSelectionCollapseAndExtend,
  nativeSelectionFacts,
  nativeSelectionGetRangeAt,
  nativeSelectionRemoveAllRanges,
  nativeSelectionSetBaseAndExtent,
  nativeSelectionSupportsCollapseExtend,
  nativeSelectionSupportsSetBaseAndExtent,
  nativeTreeRoot,
  nativeTreeRootActiveElement,
} from "./html_host.js";
import {
  BaseRangeSelection,
  type BaseEditorSelection,
  type BaseSelectionPoint,
  isOwnedBaseRangeSelection,
  spatialPositionForPoint,
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

interface SuppressionReceipt {
  readonly rendered: RenderedProjection;
  readonly rendererGeneration: bigint;
  readonly signature: string;
  readonly selection: BaseRangeSelection | null;
}

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

type DomSelectionRangeSnapshot = Extract<
  DomSelectionSnapshot,
  Readonly<{ kind: "range" }>
>;

type DomSelectionSnapshotResult =
  | { readonly ok: true; readonly value: DomSelectionSnapshot }
  | {
      readonly ok: false;
      readonly code: BrowserSelectionErrorCode;
      /** Present only for a one-range, valid-offset anchor/Range disagreement. */
      readonly incoherent?: DomSelectionRangeSnapshot;
    };

const ACTIVE_SELECTION_WRITE_DOCUMENTS = new WeakSet<Document>();

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
        const origin = this.#matchesReceipt(rendered, "none", null)
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
        if (!rendered.validateCanonicalDom()) {
          return selectionFailure("selection.dom_drift");
        }
        return selectionSuccess(
          Object.freeze({ kind: "unavailable", reason: "outsideHost", origin: "dom" }),
        );
      }
      const anchor = mapDomPointToBaseSelectionPoint(
        rendered,
        anchorNode,
        anchorOffset,
      );
      if (!anchor.ok) {
        this.#receipt = undefined;
        return selectionFailure(anchor.code);
      }
      const focus = mapDomPointToBaseSelectionPoint(
        rendered,
        focusNode,
        focusOffset,
      );
      if (!focus.ok) {
        this.#receipt = undefined;
        return selectionFailure(focus.code);
      }
      const created = BaseRangeSelection.create(rendered.projection, {
        kind: "range",
        anchor: anchor.value,
        focus: focus.value,
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
      const exact = this.#matchingReceiptSelection(rendered, signature);
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
   * Directional anchor/focus semantics are verified after the browser call;
   * browser-normalized DOM aliases are accepted only at the same exact spatial
   * positions. An exact same-container caret uses `Range` to avoid WebKit's
   * transient directional-API incoherence. Other ranges use
   * `setBaseAndExtent` when available. Without it, forward/collapsed ranges may
   * use a verified `Range`, but backward ranges fail before DOM mutation.
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
    let operationDocument: Document;
    try {
      operationDocument = requiredOwnerDocument(rendered.host);
    } catch {
      this.#receipt = undefined;
      return selectionFailure("selection.dom_write_failed");
    }
    if (ACTIVE_SELECTION_WRITE_DOCUMENTS.has(operationDocument)) {
      this.#receipt = undefined;
      return selectionFailure("selection.dom_write_failed");
    }
    ACTIVE_SELECTION_WRITE_DOCUMENTS.add(operationDocument);
    try {
      const domSelection = selectionForRendered(rendered);
      if (domSelection === null) {
        this.#receipt = undefined;
        return selectionFailure("selection.selection_api_unavailable");
      }
      const priorResult = captureDomSelection(domSelection);
      const prior = priorResult.ok ? priorResult.value : undefined;
      // WebKit can transiently report anchor/focus offsets which disagree with
      // getRangeAt(0) after an editor-owned subtree replacement. If either
      // complete endpoint representation still maps into the new canonical
      // projection, it is safe to overwrite that unrestorable editor-owned
      // state. Outside/cross-host or wholly unmappable inconsistencies continue
      // to fail before DOM mutation.
      if (
        !priorResult.ok &&
        (selection === null ||
          priorResult.incoherent === undefined ||
          !incoherentSelectionIsOwnedByRenderedProjection(
            rendered,
            priorResult.incoherent,
          ))
      ) {
        this.#receipt = undefined;
        return selectionFailure(priorResult.code);
      }
      if (!rendered.validateCanonicalDom()) {
        this.#receipt = undefined;
        return selectionFailure("selection.dom_drift");
      }
      if (selection === null) {
        const ownership =
          prior === undefined
            ? ({ ok: true, value: "insideHost" } as const)
            : selectionSnapshotOwnership(rendered.host, prior);
        if (!ownership.ok) {
          this.#receipt = undefined;
          return selectionFailure(ownership.code);
        }
        if (ownership.value === "outsideHost") {
          this.#receipt = undefined;
          if (!rendered.validateCanonicalDom()) {
            return selectionFailure("selection.dom_drift");
          }
          return selectionSuccess(
            Object.freeze({ kind: "none", rendererGeneration: rendered.rendererGeneration }),
          );
        }
        if (ownership.value === "insideHost") {
          try {
            nativeSelectionRemoveAllRanges(domSelection);
          } catch {
            rollbackDomSelection(rendered.host, domSelection, prior);
            this.#receipt = undefined;
            return selectionFailure("selection.dom_write_failed");
          }
        }
        const cleared = nativeSelectionFacts(domSelection);
        if (cleared.rangeCount !== 0 || cleared.anchorNode !== null || cleared.focusNode !== null) {
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
      const supportsSetBaseAndExtent =
        nativeSelectionSupportsSetBaseAndExtent(domSelection);
      if (!supportsSetBaseAndExtent && selection.order === "backward") {
        this.#receipt = undefined;
        return selectionFailure("selection.backward_unsupported");
      }
      try {
        // A Range-installed exact caret avoids a WebKit race where
        // setBaseAndExtent() updates anchor/focus immediately after an owned
        // subtree replacement but getRangeAt(0) briefly retains the old range.
        // Use the directional API for every non-identical endpoint so backward
        // selections and semantically collapsed DOM aliases remain exact.
        if (
          anchor.node === focus.node &&
          anchor.offset === focus.offset
        ) {
          installForwardRange(
            requiredOwnerDocument(rendered.host),
            domSelection,
            anchor,
            focus,
          );
        } else if (supportsSetBaseAndExtent) {
          nativeSelectionSetBaseAndExtent(
            domSelection,
            anchor.node,
            anchor.offset,
            focus.node,
            focus.offset,
          );
        } else {
          installForwardRange(
            requiredOwnerDocument(rendered.host),
            domSelection,
            anchor,
            focus,
          );
        }
      } catch {
        rollbackDomSelection(rendered.host, domSelection, prior);
        this.#receipt = undefined;
        return selectionFailure("selection.dom_write_failed");
      }
      const signature = installedSemanticSelectionSignature(
        rendered,
        domSelection,
        selection,
      );
      if (signature === null) {
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
        signature,
        selection,
      });
      return selectionSuccess(
        Object.freeze({ kind: "range", rendererGeneration: rendered.rendererGeneration }),
      );
    } catch {
      this.#receipt = undefined;
      return selectionFailure("selection.dom_write_failed");
    } finally {
      ACTIVE_SELECTION_WRITE_DOCUMENTS.delete(operationDocument);
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
      const activeElement = nativeTreeRootActiveElement(
        nativeTreeRoot(rendered.host),
      );
      if (activeElement === null) {
        return selectionSuccess(Object.freeze({ kind: "unavailable" }));
      }
      const kind =
        nodeIsInsideHost(rendered.host, activeElement)
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

  #matchesReceipt(
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

  #matchingReceiptSelection(
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
  try {
    const hostFacts = nativeHtmlHostFacts(rendered.host);
    return hostFacts !== undefined &&
      hostFacts.isConnected &&
      nativeTreeRoot(hostFacts.element) === hostFacts.ownerDocument &&
      rendered.validateCanonicalDom()
      ? { ok: true }
      : { ok: false, code: "selection.dom_drift" };
  } catch {
    return { ok: false, code: "selection.dom_drift" };
  }
}

function selectionForRendered(rendered: RenderedProjection): Selection | null {
  return nativeDocumentSelection(requiredOwnerDocument(rendered.host));
}

function captureDomSelection(selection: Selection): DomSelectionSnapshotResult {
  const facts = nativeSelectionFacts(selection);
  const rangeCount = facts.rangeCount;
  if (!Number.isSafeInteger(rangeCount) || rangeCount < 0) {
    return { ok: false, code: "selection.dom_read_failed" };
  }
  if (rangeCount > 1) {
    return { ok: false, code: "selection.multirange_unsupported" };
  }
  const anchorNode = facts.anchorNode;
  const focusNode = facts.focusNode;
  if (rangeCount === 0) {
    return anchorNode === null && focusNode === null
      ? { ok: true, value: Object.freeze({ kind: "empty" }) }
      : { ok: false, code: "selection.dom_read_failed" };
  }
  if (anchorNode === null || focusNode === null) {
    return { ok: false, code: "selection.dom_read_failed" };
  }
  const anchorOffset = facts.anchorOffset;
  const focusOffset = facts.focusOffset;
  const range = nativeSelectionGetRangeAt(selection, 0);
  const rangeFacts = nativeRangeFacts(range);
  const startNode = rangeFacts.startContainer;
  const startOffset = rangeFacts.startOffset;
  const endNode = rangeFacts.endContainer;
  const endOffset = rangeFacts.endOffset;
  if (
    !isDomOffset(anchorOffset) ||
    !isDomOffset(focusOffset) ||
    !isDomOffset(startOffset) ||
    !isDomOffset(endOffset)
  ) {
    return { ok: false, code: "selection.dom_read_failed" };
  }
  const snapshot: DomSelectionRangeSnapshot = Object.freeze({
    kind: "range",
    anchorNode,
    anchorOffset,
    focusNode,
    focusOffset,
    startNode,
    startOffset,
    endNode,
    endOffset,
  });
  if (
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
    return {
      ok: false,
      code: "selection.dom_read_failed",
      incoherent: snapshot,
    };
  }
  return {
    ok: true,
    value: snapshot,
  };
}

function incoherentSelectionIsOwnedByRenderedProjection(
  rendered: RenderedProjection,
  snapshot: DomSelectionRangeSnapshot,
): boolean {
  try {
    const anchorInside = domPointMapsInsideRendered(
      rendered,
      snapshot.anchorNode,
      snapshot.anchorOffset,
    );
    const focusInside = domPointMapsInsideRendered(
      rendered,
      snapshot.focusNode,
      snapshot.focusOffset,
    );
    const startInside = domPointMapsInsideRendered(
      rendered,
      snapshot.startNode,
      snapshot.startOffset,
    );
    const endInside = domPointMapsInsideRendered(
      rendered,
      snapshot.endNode,
      snapshot.endOffset,
    );
    return incoherentSelectionHasOwnedEndpointWitness(
      anchorInside,
      focusInside,
      startInside,
      endInside,
    );
  } catch {
    return false;
  }
}

/**
 * Requires one complete representation of an incoherent native selection to
 * remain inside the current canonical projection. Mixed endpoint pairs are not
 * ownership proof. @internal
 */
export function incoherentSelectionHasOwnedEndpointWitness(
  anchorInside: boolean,
  focusInside: boolean,
  startInside: boolean,
  endInside: boolean,
): boolean {
  return (
    (anchorInside === true && focusInside === true) ||
    (startInside === true && endInside === true)
  );
}

function domPointMapsInsideRendered(
  rendered: RenderedProjection,
  node: Node,
  offset: number,
): boolean {
  return (
    nodeIsInsideHost(rendered.host, node) &&
    isDomOffset(offset) &&
    mapDomPointToBaseSelectionPoint(rendered, node, offset).ok
  );
}

function installedSemanticSelectionSignature(
  rendered: RenderedProjection,
  domSelection: Selection,
  expected: BaseRangeSelection,
): string | null {
  const captured = captureDomSelection(domSelection);
  if (!captured.ok || captured.value.kind !== "range") return null;
  const actualAnchor = mapDomPointToBaseSelectionPoint(
    rendered,
    captured.value.anchorNode,
    captured.value.anchorOffset,
  );
  const actualFocus = mapDomPointToBaseSelectionPoint(
    rendered,
    captured.value.focusNode,
    captured.value.focusOffset,
  );
  if (!actualAnchor.ok || !actualFocus.ok) return null;
  const expectedAnchor = spatialPositionForPoint(
    rendered.projection,
    expected.anchor,
  );
  const expectedFocus = spatialPositionForPoint(
    rendered.projection,
    expected.focus,
  );
  const installedAnchor = spatialPositionForPoint(
    rendered.projection,
    actualAnchor.value,
  );
  const installedFocus = spatialPositionForPoint(
    rendered.projection,
    actualFocus.value,
  );
  if (
    expectedAnchor === null ||
    expectedFocus === null ||
    installedAnchor === null ||
    installedFocus === null ||
    expectedAnchor.paragraphIndex !== installedAnchor.paragraphIndex ||
    expectedAnchor.utf16Offset !== installedAnchor.utf16Offset ||
    expectedFocus.paragraphIndex !== installedFocus.paragraphIndex ||
    expectedFocus.utf16Offset !== installedFocus.utf16Offset
  ) {
    return null;
  }
  return domRangeSignature(
    rendered,
    captured.value.anchorNode,
    captured.value.anchorOffset,
    captured.value.focusNode,
    captured.value.focusOffset,
  );
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
    const range = nativeDocumentCreateRange(requiredOwnerDocument(host));
    nativeRangeSetStart(range, snapshot.startNode, snapshot.startOffset);
    nativeRangeSetEnd(range, snapshot.endNode, snapshot.endOffset);
    return nativeRangeIntersectsNode(range, host)
      ? { ok: false, code: "selection.crosses_host" }
      : { ok: true, value: "outsideHost" };
  } catch {
    return { ok: false, code: "selection.dom_read_failed" };
  }
}

function rollbackDomSelection(
  host: HTMLElement,
  selection: Selection,
  snapshot: DomSelectionSnapshot | undefined,
): void {
  try {
    if (snapshot === undefined || snapshot.kind === "empty") {
      nativeSelectionRemoveAllRanges(selection);
    } else {
      if (nativeSelectionSupportsSetBaseAndExtent(selection)) {
        nativeSelectionSetBaseAndExtent(
          selection,
          snapshot.anchorNode,
          snapshot.anchorOffset,
          snapshot.focusNode,
          snapshot.focusOffset,
        );
      } else if (nativeSelectionSupportsCollapseExtend(selection)) {
        nativeSelectionCollapseAndExtend(
          selection,
          snapshot.anchorNode,
          snapshot.anchorOffset,
          snapshot.focusNode,
          snapshot.focusOffset,
        );
      } else {
        const range = nativeDocumentCreateRange(requiredOwnerDocument(host));
        nativeRangeSetStart(range, snapshot.startNode, snapshot.startOffset);
        nativeRangeSetEnd(range, snapshot.endNode, snapshot.endOffset);
        nativeSelectionRemoveAllRanges(selection);
        nativeSelectionAddRange(selection, range);
      }
    }
    if (domSelectionMatchesSnapshot(selection, snapshot)) {
      return;
    }
  } catch {
    // Best effort continues below by removing a failed editor-owned result.
  }
  try {
    const facts = nativeSelectionFacts(selection);
    const anchorNode = facts.anchorNode;
    const focusNode = facts.focusNode;
    if (
      (anchorNode !== null && nodeIsInsideHost(host, anchorNode)) ||
      (focusNode !== null && nodeIsInsideHost(host, focusNode))
    ) {
      nativeSelectionRemoveAllRanges(selection);
    }
  } catch {
    // Hostile platform methods can make rollback impossible; core state is untouched.
  }
}

function domSelectionMatchesSnapshot(
  selection: Selection,
  snapshot: DomSelectionSnapshot | undefined,
): boolean {
  const facts = nativeSelectionFacts(selection);
  if (snapshot === undefined || snapshot.kind === "empty") {
    return (
      facts.rangeCount === 0 &&
      facts.anchorNode === null &&
      facts.focusNode === null
    );
  }
  return (
    facts.rangeCount === 1 &&
    facts.anchorNode === snapshot.anchorNode &&
    facts.anchorOffset === snapshot.anchorOffset &&
    facts.focusNode === snapshot.focusNode &&
    facts.focusOffset === snapshot.focusOffset
  );
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
    return nativeNodeType(node) === 3 ? { node, offset: point.utf16Offset } : null;
  }
  const paragraphIndex = point.parentPath[0];
  const paragraph =
    paragraphIndex === undefined ? undefined : rendered.projection.paragraphs[paragraphIndex];
  if (paragraph === undefined || nativeNodeType(node) !== 1) {
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
  const range = nativeDocumentCreateRange(document);
  nativeRangeSetStart(range, anchor.node, anchor.offset);
  nativeRangeSetEnd(range, focus.node, focus.offset);
  const facts = nativeRangeFacts(range);
  if (
    facts.startContainer !== anchor.node ||
    facts.startOffset !== anchor.offset ||
    facts.endContainer !== focus.node ||
    facts.endOffset !== focus.offset
  ) {
    throw new TypeError("Range cannot preserve the requested anchor and focus.");
  }
  nativeSelectionRemoveAllRanges(selection);
  nativeSelectionAddRange(selection, range);
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
  if (isHtmlElementNamed(node, "BR")) {
    const paragraph = nativeParentNode(node);
    const paragraphPath = paragraph === null ? null : rendered.astPathForDomNode(paragraph);
    const paragraphIndex = paragraphPath?.[0];
    return paragraphPath !== null && paragraphPath.length === 1 && paragraphIndex !== undefined
      ? `placeholder:${paragraphIndex}`
      : null;
  }
  if (nativeNodeType(node) === 1) {
    const mapped = soleMappedTextDescendant(rendered, node);
    return mapped === null
      ? null
      : `wrapper:${mapped.path[0]}:${mapped.path[1]}:${mapped.wrapperDepth}`;
  }
  return null;
}

function nodeIsInsideHost(host: HTMLElement, node: Node): boolean {
  return nativeContainsNode(host, node);
}

function isHtmlElementNamed(node: Node, localName: "BR"): node is HTMLElement {
  const facts = nativeHtmlHostFacts(node);
  return (
    facts !== undefined &&
    nativeElementLocalName(facts.element) === localName.toLowerCase()
  );
}

function requiredOwnerDocument(node: Node): Document {
  const ownerDocument = nativeOwnerDocument(node);
  if (ownerDocument === null) throw new TypeError("DOM owner document is unavailable");
  return ownerDocument;
}

function isDomOffset(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 4_294_967_295;
}
