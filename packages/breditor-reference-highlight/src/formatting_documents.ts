import { REFERENCE_FORMATTING_IDS } from "./formatting_ids.js";
import { REFERENCE_FORMATTING_SCHEMA_FINGERPRINT } from "./formatting_profile.js";
import { createReferenceLinkSetInput } from "./link_input.js";

/** Maximum UTF-8 bytes accepted in this one-text-leaf fixture helper. */
export const MAX_REFERENCE_FORMATTING_DOCUMENT_TEXT_UTF8 = 1_048_576;

/** Closed optional formatting accepted by the combined fixture helper. */
export interface ReferenceFormattingDocumentOptions {
  readonly highlighted?: boolean;
  readonly link?: Readonly<{
    href: string;
    openInNewWindow: boolean;
  }>;
}

export interface ReferenceFormattingHighlightFormatV2 {
  readonly type: typeof REFERENCE_FORMATTING_IDS.highlightFormatKind;
  readonly properties: Readonly<Record<string, never>>;
}

export type ReferenceFormattingLinkPropertiesV2 = Readonly<{
  [REFERENCE_FORMATTING_IDS.linkHrefProperty]: string;
  [REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty]: boolean;
}>;

export interface ReferenceFormattingLinkFormatV2 {
  readonly type: typeof REFERENCE_FORMATTING_IDS.linkFormatKind;
  readonly properties: ReferenceFormattingLinkPropertiesV2;
}

export type ReferenceFormattingFormatV2 =
  | ReferenceFormattingHighlightFormatV2
  | ReferenceFormattingLinkFormatV2;

export interface ReferenceFormattingTextV2 {
  readonly kind: "text";
  readonly text: string;
  readonly formats: readonly ReferenceFormattingFormatV2[];
}

export interface ReferenceFormattingParagraphV2 {
  readonly kind: "element";
  readonly type: "breditor/paragraph";
  readonly entityId: null;
  readonly properties: Readonly<Record<string, never>>;
  readonly children: readonly [] | readonly [ReferenceFormattingTextV2];
}

export interface ReferenceFormattingDocumentV2 {
  readonly format: "breditor/document";
  readonly formatVersion: 2;
  readonly schema: Readonly<{
    name: typeof REFERENCE_FORMATTING_IDS.schemaName;
    version: typeof REFERENCE_FORMATTING_IDS.schemaVersion;
  }>;
  readonly schemaFingerprint: typeof REFERENCE_FORMATTING_SCHEMA_FINGERPRINT;
  readonly root: Readonly<{
    kind: "element";
    type: "breditor/document";
    entityId: null;
    properties: Readonly<Record<string, never>>;
    children: readonly [ReferenceFormattingParagraphV2];
  }>;
}

const TEXT_ENCODER = new TextEncoder();
const EMPTY_OPTIONS: ReferenceFormattingDocumentOptions = Object.freeze({});

/**
 * Creates a deeply frozen, fingerprint-bound, single-paragraph Document V2.
 *
 * Formats and Link properties are emitted in lexical identity order. Empty
 * text always becomes the one canonical empty paragraph. The options boundary
 * accepts only own data properties so examples cannot accidentally serialize
 * callbacks, accessors, DOM values, or extension state.
 */
export function createReferenceFormattingDocument(
  text = "",
  options: ReferenceFormattingDocumentOptions = EMPTY_OPTIONS,
): ReferenceFormattingDocumentV2 {
  assertDocumentText(text);
  const formatting = readFormattingOptions(options);

  const formats: ReferenceFormattingFormatV2[] = [];
  if (text.length > 0 && formatting.highlighted) {
    formats.push(
      Object.freeze({
        type: REFERENCE_FORMATTING_IDS.highlightFormatKind,
        properties: Object.freeze({}),
      }),
    );
  }
  if (text.length > 0 && formatting.link !== undefined) {
    const linkInput = createReferenceLinkSetInput(
      formatting.link.href,
      formatting.link.openInNewWindow,
    );
    formats.push(
      Object.freeze({
        type: REFERENCE_FORMATTING_IDS.linkFormatKind,
        properties: Object.freeze({
          [REFERENCE_FORMATTING_IDS.linkHrefProperty]:
            linkInput.properties[0].value,
          [REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty]:
            linkInput.properties[1].value,
        }),
      }),
    );
  }

  const children: readonly [] | readonly [ReferenceFormattingTextV2] =
    text.length === 0
      ? Object.freeze([] as const)
      : Object.freeze([
          Object.freeze({
            kind: "text" as const,
            text,
            formats: Object.freeze(formats),
          }),
        ] as const);

  return Object.freeze({
    format: "breditor/document",
    formatVersion: 2,
    schema: Object.freeze({
      name: REFERENCE_FORMATTING_IDS.schemaName,
      version: REFERENCE_FORMATTING_IDS.schemaVersion,
    }),
    schemaFingerprint: REFERENCE_FORMATTING_SCHEMA_FINGERPRINT,
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

/** Creates compact canonical JSON for the combined Document V2 helper. */
export function createReferenceFormattingDocumentJson(
  text = "",
  options: ReferenceFormattingDocumentOptions = EMPTY_OPTIONS,
): string {
  return JSON.stringify(createReferenceFormattingDocument(text, options));
}

/** Canonical empty Document V2 for a fresh combined-profile editor. */
export const REFERENCE_FORMATTING_EMPTY_DOCUMENT =
  createReferenceFormattingDocument();

/** Compact JSON form of {@link REFERENCE_FORMATTING_EMPTY_DOCUMENT}. */
export const REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON = JSON.stringify(
  REFERENCE_FORMATTING_EMPTY_DOCUMENT,
);

/** Highlighted Link fixture exercising both additive semantic formats. */
export const REFERENCE_FORMATTING_SAMPLE_DOCUMENT =
  createReferenceFormattingDocument("Highlighted link", {
    highlighted: true,
    link: {
      href: "https://example.test/reference",
      openInNewWindow: true,
    },
  });

/** Compact JSON form of {@link REFERENCE_FORMATTING_SAMPLE_DOCUMENT}. */
export const REFERENCE_FORMATTING_SAMPLE_DOCUMENT_JSON = JSON.stringify(
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT,
);

function assertDocumentText(text: string): void {
  if (typeof text !== "string" || !isWellFormedUtf16(text)) {
    throw new TypeError("reference formatting document text is invalid");
  }
  if (text.length > MAX_REFERENCE_FORMATTING_DOCUMENT_TEXT_UTF8) {
    throw new RangeError(
      "reference formatting document text exceeds its fixed bound",
    );
  }
  if (
    TEXT_ENCODER.encode(text).byteLength >
    MAX_REFERENCE_FORMATTING_DOCUMENT_TEXT_UTF8
  ) {
    throw new RangeError(
      "reference formatting document text exceeds its fixed bound",
    );
  }
}

function readFormattingOptions(
  options: ReferenceFormattingDocumentOptions,
): Readonly<{
  highlighted: boolean;
  link?: Readonly<{ href: string; openInNewWindow: boolean }>;
}> {
  const record = exactDataRecord(
    options,
    ["highlighted", "link"],
    "reference formatting document options",
  );
  const highlighted = ownDataValue(record, "highlighted");
  if (highlighted !== undefined && typeof highlighted !== "boolean") {
    throw new TypeError("reference formatting highlighted option is invalid");
  }
  const rawLink = ownDataValue(record, "link");
  if (rawLink === undefined) {
    return Object.freeze({ highlighted: highlighted ?? false });
  }
  const link = exactDataRecord(
    rawLink,
    ["href", "openInNewWindow"],
    "reference formatting Link options",
  );
  const href = ownDataValue(link, "href");
  const openInNewWindow = ownDataValue(link, "openInNewWindow");
  if (typeof href !== "string" || typeof openInNewWindow !== "boolean") {
    throw new TypeError("reference formatting Link options are invalid");
  }
  // Reuse the canonical Link input boundary to validate UTF-16 and UTF-8 bounds.
  createReferenceLinkSetInput(href, openInNewWindow);
  return Object.freeze({
    highlighted: highlighted ?? false,
    link: Object.freeze({ href, openInNewWindow }),
  });
}

function exactDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  description: string,
): Readonly<Record<string, unknown>> {
  let keys: readonly PropertyKey[];
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError(`${description} must be an object`);
    }
    keys = Reflect.ownKeys(value);
  } catch {
    throw new TypeError(`${description} must be an object`);
  }
  if (
    keys.some((key) =>
      typeof key !== "string" || !allowedKeys.includes(key)
    )
  ) {
    throw new TypeError(`${description} has an invalid exact shape`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function ownDataValue(
  record: Readonly<Record<string, unknown>>,
  key: string,
): unknown {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(record, key);
  } catch {
    throw new TypeError("reference formatting option is invalid");
  }
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor)) {
    throw new TypeError("reference formatting option must be a data property");
  }
  return descriptor.value;
}

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
