import { REFERENCE_HIGHLIGHT_IDS } from "./ids.js";
import { REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT } from "./profile.js";

/** Maximum UTF-8 bytes accepted in this one-text-leaf fixture helper. */
export const MAX_REFERENCE_HIGHLIGHT_DOCUMENT_TEXT_UTF8 = 1_048_576;

/** Whether the helper's optional text leaf starts plain or highlighted. */
export type ReferenceHighlightTextStyle = "plain" | "highlighted";

export interface ReferenceHighlightFormatV2 {
  readonly type: typeof REFERENCE_HIGHLIGHT_IDS.formatKind;
  readonly properties: Readonly<Record<string, never>>;
}

export interface ReferenceHighlightTextV2 {
  readonly kind: "text";
  readonly text: string;
  readonly formats: readonly [] | readonly [ReferenceHighlightFormatV2];
}

export interface ReferenceHighlightParagraphV2 {
  readonly kind: "element";
  readonly type: "breditor/paragraph";
  readonly entityId: null;
  readonly properties: Readonly<Record<string, never>>;
  readonly children: readonly [] | readonly [ReferenceHighlightTextV2];
}

export interface ReferenceHighlightDocumentV2 {
  readonly format: "breditor/document";
  readonly formatVersion: 2;
  readonly schema: Readonly<{
    name: typeof REFERENCE_HIGHLIGHT_IDS.schemaName;
    version: typeof REFERENCE_HIGHLIGHT_IDS.schemaVersion;
  }>;
  readonly schemaFingerprint: typeof REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT;
  readonly root: Readonly<{
    kind: "element";
    type: "breditor/document";
    entityId: null;
    properties: Readonly<Record<string, never>>;
    children: readonly [ReferenceHighlightParagraphV2];
  }>;
}

const TEXT_ENCODER = new TextEncoder();

/**
 * Creates a deeply frozen, fingerprint-bound, single-paragraph Document V2.
 *
 * Empty text is represented canonically as an empty paragraph, not an empty
 * text node. The helper rejects malformed UTF-16 and text too large for one
 * default Rust document leaf before producing JSON.
 */
export function createReferenceHighlightDocument(
  text = "",
  style: ReferenceHighlightTextStyle = "plain",
): ReferenceHighlightDocumentV2 {
  if (typeof text !== "string") {
    throw new TypeError("reference Highlight document text is invalid");
  }
  // Every well-formed UTF-8 encoding has at least one byte per UTF-16 code
  // unit. Rejecting this cheap upper bound first keeps validation and the
  // encoder allocation bounded for hostile caller input.
  if (text.length > MAX_REFERENCE_HIGHLIGHT_DOCUMENT_TEXT_UTF8) {
    throw new RangeError("reference Highlight document text exceeds its fixed bound");
  }
  if (!isWellFormedUtf16(text)) {
    throw new TypeError("reference Highlight document text is invalid");
  }
  if (style !== "plain" && style !== "highlighted") {
    throw new TypeError("reference Highlight document style is invalid");
  }
  if (TEXT_ENCODER.encode(text).byteLength > MAX_REFERENCE_HIGHLIGHT_DOCUMENT_TEXT_UTF8) {
    throw new RangeError("reference Highlight document text exceeds its fixed bound");
  }

  const formats: readonly [] | readonly [ReferenceHighlightFormatV2] =
    style === "highlighted" && text.length > 0
      ? Object.freeze([
          Object.freeze({
            type: REFERENCE_HIGHLIGHT_IDS.formatKind,
            properties: Object.freeze({}),
          }),
        ] as const)
      : Object.freeze([] as const);
  const children: readonly [] | readonly [ReferenceHighlightTextV2] =
    text.length === 0
      ? Object.freeze([] as const)
      : Object.freeze([
          Object.freeze({
            kind: "text" as const,
            text,
            formats,
          }),
        ] as const);

  return Object.freeze({
    format: "breditor/document",
    formatVersion: 2,
    schema: Object.freeze({
      name: REFERENCE_HIGHLIGHT_IDS.schemaName,
      version: REFERENCE_HIGHLIGHT_IDS.schemaVersion,
    }),
    schemaFingerprint: REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
    root: Object.freeze({
      kind: "element",
      type: "breditor/document",
      entityId: null,
      properties: Object.freeze({}),
      children: Object.freeze([
        Object.freeze({
          kind: "element",
          type: "breditor/paragraph",
          entityId: null,
          properties: Object.freeze({}),
          children,
        }),
      ] as const),
    }),
  });
}

/** Creates the compact canonical JSON form of the helper's Document V2. */
export function createReferenceHighlightDocumentJson(
  text = "",
  style: ReferenceHighlightTextStyle = "plain",
): string {
  return JSON.stringify(createReferenceHighlightDocument(text, style));
}

/** Canonical empty Document V2 data for a fresh reference editor. */
export const REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT =
  createReferenceHighlightDocument();

/** Compact JSON form of {@link REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT}. */
export const REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT_JSON = JSON.stringify(
  REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT,
);

/** Small highlighted Document V2 fixture useful in examples and smoke tests. */
export const REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT =
  createReferenceHighlightDocument("Highlighted text", "highlighted");

/** Compact JSON form of {@link REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT}. */
export const REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT_JSON = JSON.stringify(
  REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT,
);

function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}
