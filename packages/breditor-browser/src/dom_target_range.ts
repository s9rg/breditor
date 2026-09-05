import {
  type RenderedProjection,
  isOwnedRenderedProjection,
} from "./dom_renderer.js";
import { mapDomPointToBaseSelectionPoint } from "./dom_point_mapping.js";
import type {
  BrowserSelectionErrorCode,
  BrowserSelectionResult,
} from "./selection_result.js";
import { selectionFailure } from "./selection_result.js";
import { BaseTargetRange } from "./target_range.js";

interface DomRangeSnapshot {
  readonly startContainer: Node;
  readonly startOffset: number;
  readonly endContainer: Node;
  readonly endOffset: number;
}

type DomRangeSnapshotResult =
  | { readonly ok: true; readonly value: DomRangeSnapshot }
  | { readonly ok: false; readonly code: BrowserSelectionErrorCode };

type DomRangePreflight =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: BrowserSelectionErrorCode };

/**
 * Normalizes one native directionless range into snapshot-local semantic points.
 *
 * The four DOM boundary fields are read once and immediately reduced to scalar
 * AST coordinates. Neither the supplied `StaticRange`/`Range` nor its endpoint
 * nodes are retained. Native ordering and host ownership are proved rather than
 * inferred from the eventual semantic aliases.
 */
export function mapDomTargetRange(
  rendered: RenderedProjection,
  range: AbstractRange,
): BrowserSelectionResult<BaseTargetRange> {
  const preflight = validateRenderedForTargetRange(rendered);
  if (!preflight.ok) {
    return selectionFailure(preflight.code);
  }

  try {
    const captured = captureDomRange(range);
    if (!captured.ok) {
      return selectionFailure(captured.code);
    }
    if (!rendered.validateCanonicalDom()) {
      return selectionFailure("selection.dom_drift");
    }
    const snapshot = captured.value;
    const ownership = validateDomRangeOwnershipAndOrder(rendered.host, snapshot);
    if (!ownership.ok) {
      return selectionFailure(ownership.code);
    }
    if (!rendered.validateCanonicalDom()) {
      return selectionFailure("selection.dom_drift");
    }

    const start = mapDomPointToBaseSelectionPoint(
      rendered,
      snapshot.startContainer,
      snapshot.startOffset,
    );
    if (!start.ok) {
      return selectionFailure(start.code);
    }
    const end = mapDomPointToBaseSelectionPoint(
      rendered,
      snapshot.endContainer,
      snapshot.endOffset,
    );
    if (!end.ok) {
      return selectionFailure(end.code);
    }
    if (!rendered.validateCanonicalDom()) {
      return selectionFailure("selection.dom_drift");
    }
    return BaseTargetRange.create(rendered, {
      kind: "range",
      start: start.value,
      end: end.value,
    });
  } catch {
    return selectionFailure("selection.dom_read_failed");
  }
}

function validateRenderedForTargetRange(rendered: RenderedProjection): DomRangePreflight {
  if (!isOwnedRenderedProjection(rendered) || !rendered.current) {
    return { ok: false, code: "selection.foreign_or_stale_render" };
  }
  return rendered.validateCanonicalDom()
    ? { ok: true }
    : { ok: false, code: "selection.dom_drift" };
}

function captureDomRange(range: AbstractRange): DomRangeSnapshotResult {
  if (typeof range !== "object" || range === null) {
    return { ok: false, code: "selection.dom_read_failed" };
  }
  try {
    // Each native property is intentionally read exactly once. A live Range may
    // continue changing after this point without changing this normalization.
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    const endContainer = range.endContainer;
    const endOffset = range.endOffset;
    if (
      !isNodeLike(startContainer) ||
      !isNodeLike(endContainer) ||
      !isDomOffset(startOffset) ||
      !isDomOffset(endOffset)
    ) {
      return { ok: false, code: "selection.dom_read_failed" };
    }
    return {
      ok: true,
      value: { startContainer, startOffset, endContainer, endOffset },
    };
  } catch {
    return { ok: false, code: "selection.dom_read_failed" };
  }
}

function validateDomRangeOwnershipAndOrder(
  host: HTMLElement,
  snapshot: DomRangeSnapshot,
): DomRangePreflight {
  try {
    const document = host.ownerDocument;
    if (
      snapshot.startContainer.ownerDocument !== document ||
      snapshot.endContainer.ownerDocument !== document
    ) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }

    const startInside = nodeIsInsideHost(host, snapshot.startContainer);
    const endInside = nodeIsInsideHost(host, snapshot.endContainer);
    if (startInside !== endInside) {
      return { ok: false, code: "selection.crosses_host" };
    }
    if (
      !host.isConnected ||
      !snapshot.startContainer.isConnected ||
      !snapshot.endContainer.isConnected
    ) {
      return { ok: false, code: "selection.ambiguous_dom_point" };
    }

    const normalized = document.createRange();
    normalized.setStart(snapshot.startContainer, snapshot.startOffset);
    normalized.setEnd(snapshot.endContainer, snapshot.endOffset);
    if (!rangeMatchesSnapshot(normalized, snapshot)) {
      // Setting an end before a start collapses a native Range. Requiring all
      // four fields to survive also rejects malformed node-specific offsets.
      return { ok: false, code: "selection.dom_read_failed" };
    }
    if (!startInside) {
      return normalized.intersectsNode(host)
        ? { ok: false, code: "selection.crosses_host" }
        : { ok: false, code: "selection.ambiguous_dom_point" };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "selection.dom_read_failed" };
  }
}

function rangeMatchesSnapshot(range: Range, snapshot: DomRangeSnapshot): boolean {
  return (
    range.startContainer === snapshot.startContainer &&
    range.startOffset === snapshot.startOffset &&
    range.endContainer === snapshot.endContainer &&
    range.endOffset === snapshot.endOffset
  );
}

function nodeIsInsideHost(host: HTMLElement, node: Node): boolean {
  return node === host || host.contains(node);
}

function isNodeLike(value: unknown): value is Node {
  return typeof value === "object" && value !== null;
}

function isDomOffset(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 4_294_967_295
  );
}
