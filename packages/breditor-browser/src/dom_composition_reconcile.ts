import {
  MAX_COMPOSITION_TEXT_UTF16,
  MAX_COMPOSITION_TEXT_UTF8,
  measureBoundedUnicodeText,
} from "./composition_event.js";
import type { CompositionResult } from "./composition_result.js";
import { compositionFailure, compositionSuccess } from "./composition_result.js";
import {
  type BaseDocumentProjection,
  type BaseParagraphProjection,
  isOwnedProjection,
} from "./projection.js";
import {
  type BaseRangeSelection,
  isOwnedBaseRangeSelection,
  spatialPositionForPoint,
} from "./selection.js";

/** Maximum nodes inspected during strict leased-DOM reconciliation. */
export const MAX_COMPOSITION_DOM_NODES = 265_536;

/** Base projection total plus the largest admissible replacement. */
export const MAX_COMPOSITION_DOM_TEXT_UTF16 =
  8 * 1024 * 1024 + MAX_COMPOSITION_TEXT_UTF16;

/** Base projection total plus the largest admissible replacement. */
export const MAX_COMPOSITION_DOM_TEXT_UTF8 =
  8 * 1024 * 1024 + MAX_COMPOSITION_TEXT_UTF8;

/** Semantic replacement recovered from a strictly checked temporary DOM lease. */
export interface DomCompositionReconciliation {
  readonly paragraphIndex: number;
  readonly replacementStartUtf16: number;
  readonly replacementEndUtf16: number;
  /** Exact base text covered by the captured semantic range. */
  readonly originalText: string;
  /** Exact text observed in that range after the native composition lease. */
  readonly text: string;
}

interface ScanBudget {
  nodes: number;
}

type DomScanFailure = "invalidStructure" | "resourceLimit" | "invalidUnicode";

type TargetTextResult =
  | Readonly<{ ok: true; text: string }>
  | Readonly<{ ok: false; reason: DomScanFailure }>;

interface TextAccumulator {
  readonly chunks: string[];
  utf16Length: number;
  utf8Length: number;
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/**
 * Extracts one replacement from a temporary native-composition DOM lease.
 *
 * The AST projection remains authoritative. Every non-target paragraph must
 * still be canonical, the target must use only text and property-free strong
 * wrappers, and unchanged prefix/suffix text must match the base exactly. No
 * DOM object is returned or retained.
 */
export function reconcileCompositionDom(
  host: unknown,
  projection: unknown,
  selection: unknown,
): CompositionResult<DomCompositionReconciliation> {
  try {
    if (
      !isUsableConnectedHost(host) ||
      !isOwnedProjection(projection) ||
      !isOwnedBaseRangeSelection(selection) ||
      selection.projection !== projection
    ) {
      return compositionFailure("composition.dom.invalid_input");
    }

    const anchor = spatialPositionForPoint(projection, selection.anchor);
    const focus = spatialPositionForPoint(projection, selection.focus);
    if (anchor === null || focus === null) {
      return compositionFailure("composition.dom.invalid_input");
    }
    if (anchor.paragraphIndex !== focus.paragraphIndex) {
      return compositionFailure("composition.dom.cross_paragraph");
    }
    const paragraphIndex = anchor.paragraphIndex;
    const baseParagraph = projection.paragraphs[paragraphIndex];
    if (baseParagraph === undefined) {
      return compositionFailure("composition.dom.invalid_input");
    }

    const hostChildren = host.childNodes;
    if (hostChildren.length !== projection.paragraphs.length) {
      return compositionFailure("composition.dom.invalid_structure");
    }
    const budget: ScanBudget = { nodes: 1 };
    let observedTargetText: string | null = null;
    for (let index = 0; index < projection.paragraphs.length; index += 1) {
      const paragraphNode = hostChildren[index];
      const paragraph = projection.paragraphs[index];
      if (
        paragraphNode === undefined ||
        paragraph === undefined ||
        !consumeNode(budget) ||
        !isPropertyFreeHtmlElement(paragraphNode, "p")
      ) {
        return compositionFailure(
          budget.nodes > MAX_COMPOSITION_DOM_NODES
            ? "composition.dom.resource_limit"
            : "composition.dom.invalid_structure",
        );
      }
      if (index === paragraphIndex) {
        const target = extractTargetText(paragraphNode, budget);
        if (!target.ok) {
          return compositionFailure(scanFailureCode(target.reason));
        }
        observedTargetText = target.text;
      } else {
        const failure = validateCanonicalParagraph(paragraphNode, paragraph, budget);
        if (failure !== null) {
          return compositionFailure(scanFailureCode(failure));
        }
      }
    }
    if (observedTargetText === null) {
      return compositionFailure("composition.dom.invalid_input");
    }

    const baseText = baseParagraph.runs.map((run) => run.text).join("");
    const start = Math.min(anchor.utf16Offset, focus.utf16Offset);
    const end = Math.max(anchor.utf16Offset, focus.utf16Offset);
    const prefix = baseText.slice(0, start);
    const suffix = baseText.slice(end);
    if (
      observedTargetText.length < prefix.length + suffix.length ||
      observedTargetText.slice(0, prefix.length) !== prefix ||
      observedTargetText.slice(observedTargetText.length - suffix.length) !== suffix
    ) {
      return compositionFailure("composition.dom.unchanged_region_mismatch");
    }
    const candidateEnd = observedTargetText.length - suffix.length;
    if (candidateEnd < prefix.length) {
      return compositionFailure("composition.dom.unchanged_region_mismatch");
    }
    const text = observedTargetText.slice(prefix.length, candidateEnd);
    const candidateMeasure = measureBoundedUnicodeText(
      text,
      MAX_COMPOSITION_TEXT_UTF16,
      MAX_COMPOSITION_TEXT_UTF8,
    );
    if (!candidateMeasure.ok) {
      return compositionFailure(
        candidateMeasure.reason === "invalidUnicode"
          ? "composition.dom.invalid_unicode"
          : "composition.dom.resource_limit",
      );
    }
    return compositionSuccess(
      Object.freeze({
        paragraphIndex,
        replacementStartUtf16: start,
        replacementEndUtf16: end,
        originalText: baseText.slice(start, end),
        text,
      }),
    );
  } catch {
    return compositionFailure("composition.dom.invalid_input");
  }
}

function extractTargetText(
  paragraph: Element,
  budget: ScanBudget,
): TargetTextResult {
  const children = paragraph.childNodes;
  if (children.length === 0) {
    return Object.freeze({ ok: true, text: "" });
  }
  if (children.length === 1) {
    const only = children[0];
    if (
      only !== undefined &&
      isPropertyFreeHtmlElement(only, "br") &&
      only.childNodes.length === 0
    ) {
      return consumeNode(budget)
        ? Object.freeze({ ok: true, text: "" })
        : Object.freeze({ ok: false, reason: "resourceLimit" });
    }
  }

  const accumulator: TextAccumulator = {
    chunks: [],
    utf16Length: 0,
    utf8Length: 0,
  };
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child === undefined || !consumeNode(budget)) {
      return Object.freeze({ ok: false, reason: "resourceLimit" });
    }
    if (child.nodeType === 3) {
      const failure = appendTextNode(child, accumulator);
      if (failure !== null) {
        return Object.freeze({ ok: false, reason: failure });
      }
      continue;
    }
    if (!isPropertyFreeHtmlElement(child, "strong")) {
      return Object.freeze({ ok: false, reason: "invalidStructure" });
    }
    const strongChildren = child.childNodes;
    if (strongChildren.length === 0) {
      return Object.freeze({ ok: false, reason: "invalidStructure" });
    }
    for (let strongIndex = 0; strongIndex < strongChildren.length; strongIndex += 1) {
      const text = strongChildren[strongIndex];
      if (text === undefined || !consumeNode(budget)) {
        return Object.freeze({ ok: false, reason: "resourceLimit" });
      }
      if (text.nodeType !== 3) {
        return Object.freeze({ ok: false, reason: "invalidStructure" });
      }
      const failure = appendTextNode(text, accumulator);
      if (failure !== null) {
        return Object.freeze({ ok: false, reason: failure });
      }
    }
  }
  return Object.freeze({ ok: true, text: accumulator.chunks.join("") });
}

function appendTextNode(
  node: Node,
  accumulator: TextAccumulator,
): DomScanFailure | null {
  const text = node.nodeValue;
  if (typeof text !== "string") {
    return "invalidStructure";
  }
  const measure = measureBoundedUnicodeText(
    text,
    MAX_COMPOSITION_DOM_TEXT_UTF16 - accumulator.utf16Length,
    MAX_COMPOSITION_DOM_TEXT_UTF8 - accumulator.utf8Length,
  );
  if (!measure.ok) {
    return measure.reason === "invalidUnicode" ? "invalidUnicode" : "resourceLimit";
  }
  accumulator.utf16Length += measure.utf16Length;
  accumulator.utf8Length += measure.utf8Length;
  accumulator.chunks.push(text);
  return null;
}

function validateCanonicalParagraph(
  paragraphNode: Element,
  paragraph: BaseParagraphProjection,
  budget: ScanBudget,
): DomScanFailure | null {
  const children = paragraphNode.childNodes;
  if (paragraph.runs.length === 0) {
    const child = children[0];
    if (
      children.length !== 1 ||
      child === undefined ||
      !consumeNode(budget)
    ) {
      return budget.nodes > MAX_COMPOSITION_DOM_NODES
        ? "resourceLimit"
        : "invalidStructure";
    }
    return isPropertyFreeHtmlElement(child, "br") && child.childNodes.length === 0
      ? null
      : "invalidStructure";
  }
  if (children.length !== paragraph.runs.length) {
    return "invalidStructure";
  }
  for (let index = 0; index < paragraph.runs.length; index += 1) {
    const run = paragraph.runs[index];
    const child = children[index];
    if (run === undefined || child === undefined || !consumeNode(budget)) {
      return budget.nodes > MAX_COMPOSITION_DOM_NODES
        ? "resourceLimit"
        : "invalidStructure";
    }
    if (!run.strong) {
      if (child.nodeType !== 3 || child.nodeValue !== run.text) {
        return "invalidStructure";
      }
      continue;
    }
    if (
      !isPropertyFreeHtmlElement(child, "strong") ||
      child.childNodes.length !== 1
    ) {
      return "invalidStructure";
    }
    const text = child.childNodes[0];
    if (text === undefined || !consumeNode(budget)) {
      return budget.nodes > MAX_COMPOSITION_DOM_NODES
        ? "resourceLimit"
        : "invalidStructure";
    }
    if (text.nodeType !== 3 || text.nodeValue !== run.text) {
      return "invalidStructure";
    }
  }
  return null;
}

function consumeNode(budget: ScanBudget): boolean {
  budget.nodes += 1;
  return budget.nodes <= MAX_COMPOSITION_DOM_NODES;
}

function isUsableConnectedHost(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    (value as Element).namespaceURI === HTML_NAMESPACE &&
    (value as Node).ownerDocument !== null &&
    (value as Node).isConnected === true
  );
}

function isPropertyFreeHtmlElement(node: Node, localName: string): node is Element {
  return (
    node.nodeType === 1 &&
    (node as Element).namespaceURI === HTML_NAMESPACE &&
    (node as Element).localName === localName &&
    (node as Element).attributes.length === 0
  );
}

function scanFailureCode(
  failure: DomScanFailure,
):
  | "composition.dom.invalid_structure"
  | "composition.dom.resource_limit"
  | "composition.dom.invalid_unicode" {
  switch (failure) {
    case "invalidStructure":
      return "composition.dom.invalid_structure";
    case "resourceLimit":
      return "composition.dom.resource_limit";
    case "invalidUnicode":
      return "composition.dom.invalid_unicode";
  }
}
