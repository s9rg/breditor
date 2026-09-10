import {
  MAX_REFERENCE_FORMATTING_DOCUMENT_TEXT_UTF8,
  createReferenceFormattingDocument,
} from "./formatting_documents.js";
import { REFERENCE_SHOWCASE_IDS } from "./showcase_ids.js";
import { REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT } from "./showcase_profile.js";

/** Maximum UTF-8 bytes accepted by this one-text-leaf fixture helper. */
export const MAX_REFERENCE_SHOWCASE_DOCUMENT_TEXT_UTF8 =
  MAX_REFERENCE_FORMATTING_DOCUMENT_TEXT_UTF8;

/** Closed optional formatting accepted by the showcase fixture helper. */
export interface ReferenceShowcaseDocumentOptions {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly strikethrough?: boolean;
  readonly code?: boolean;
  readonly highlighted?: boolean;
  readonly link?: Readonly<{
    href: string;
    openInNewWindow: boolean;
  }>;
}

export interface ReferenceShowcaseStrongFormatV2 {
  readonly type: "breditor/strong";
  readonly properties: Readonly<Record<string, never>>;
}

export interface ReferenceShowcaseCodeFormatV2 {
  readonly type: typeof REFERENCE_SHOWCASE_IDS.codeFormatKind;
  readonly properties: Readonly<Record<string, never>>;
}

export interface ReferenceShowcaseEmphasisFormatV2 {
  readonly type: typeof REFERENCE_SHOWCASE_IDS.emphasisFormatKind;
  readonly properties: Readonly<Record<string, never>>;
}

export interface ReferenceShowcaseHighlightFormatV2 {
  readonly type: typeof REFERENCE_SHOWCASE_IDS.highlightFormatKind;
  readonly properties: Readonly<Record<string, never>>;
}

export type ReferenceShowcaseLinkPropertiesV2 = Readonly<{
  [REFERENCE_SHOWCASE_IDS.linkHrefProperty]: string;
  [REFERENCE_SHOWCASE_IDS.linkOpenInNewWindowProperty]: boolean;
}>;

export interface ReferenceShowcaseLinkFormatV2 {
  readonly type: typeof REFERENCE_SHOWCASE_IDS.linkFormatKind;
  readonly properties: ReferenceShowcaseLinkPropertiesV2;
}

export interface ReferenceShowcaseStrikethroughFormatV2 {
  readonly type: typeof REFERENCE_SHOWCASE_IDS.strikethroughFormatKind;
  readonly properties: Readonly<Record<string, never>>;
}

/** Every inline format admitted by the showcase's one-leaf helper. */
export type ReferenceShowcaseFormatV2 =
  | ReferenceShowcaseStrongFormatV2
  | ReferenceShowcaseCodeFormatV2
  | ReferenceShowcaseEmphasisFormatV2
  | ReferenceShowcaseHighlightFormatV2
  | ReferenceShowcaseLinkFormatV2
  | ReferenceShowcaseStrikethroughFormatV2;

export interface ReferenceShowcaseTextV2 {
  readonly kind: "text";
  readonly text: string;
  readonly formats: readonly ReferenceShowcaseFormatV2[];
}

export interface ReferenceShowcaseParagraphV2 {
  readonly kind: "element";
  readonly type: "breditor/paragraph";
  readonly entityId: null;
  readonly properties: Readonly<Record<string, never>>;
  readonly children: readonly [] | readonly [ReferenceShowcaseTextV2];
}

export interface ReferenceShowcaseDocumentV2 {
  readonly format: "breditor/document";
  readonly formatVersion: 2;
  readonly schema: Readonly<{
    name: typeof REFERENCE_SHOWCASE_IDS.schemaName;
    version: typeof REFERENCE_SHOWCASE_IDS.schemaVersion;
  }>;
  readonly schemaFingerprint: typeof REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT;
  readonly root: Readonly<{
    kind: "element";
    type: "breditor/document";
    entityId: null;
    properties: Readonly<Record<string, never>>;
    children: readonly [ReferenceShowcaseParagraphV2];
  }>;
}

interface ReadShowcaseOptions {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly strikethrough: boolean;
  readonly code: boolean;
  readonly highlighted: boolean;
  readonly link?: Readonly<{ href: string; openInNewWindow: boolean }>;
}

const EMPTY_OPTIONS: ReferenceShowcaseDocumentOptions = Object.freeze({});
const EMPTY_PROPERTIES: Readonly<Record<string, never>> = Object.freeze({});

/**
 * Creates a deeply frozen, fingerprint-bound, single-paragraph Document V2.
 *
 * Format entries use canonical lexical semantic identity order. Empty text is
 * represented by an empty paragraph. Options must be an exact plain or null-
 * prototype own-data graph; accessors, symbols, callbacks, DOM values, exotic
 * objects, and hidden extension state fail closed before anything is
 * serialized.
 */
export function createReferenceShowcaseDocument(
  text = "",
  options: ReferenceShowcaseDocumentOptions = EMPTY_OPTIONS,
): ReferenceShowcaseDocumentV2 {
  // Reuse the established helper's exact UTF-16 and one-leaf UTF-8 boundary.
  createReferenceFormattingDocument(text);
  const formatting = readShowcaseOptions(options);
  const formats: ReferenceShowcaseFormatV2[] = [];

  // This is the canonical lexical order of the complete compiled catalog.
  if (text.length > 0 && formatting.bold) {
    formats.push(propertyFreeFormat("breditor/strong"));
  }
  if (text.length > 0 && formatting.code) {
    formats.push(propertyFreeFormat(REFERENCE_SHOWCASE_IDS.codeFormatKind));
  }
  if (text.length > 0 && formatting.italic) {
    formats.push(propertyFreeFormat(REFERENCE_SHOWCASE_IDS.emphasisFormatKind));
  }
  if (text.length > 0 && formatting.highlighted) {
    formats.push(propertyFreeFormat(REFERENCE_SHOWCASE_IDS.highlightFormatKind));
  }
  if (text.length > 0 && formatting.link !== undefined) {
    formats.push(
      Object.freeze({
        type: REFERENCE_SHOWCASE_IDS.linkFormatKind,
        properties: Object.freeze({
          [REFERENCE_SHOWCASE_IDS.linkHrefProperty]:
            formatting.link.href,
          [REFERENCE_SHOWCASE_IDS.linkOpenInNewWindowProperty]:
            formatting.link.openInNewWindow,
        }),
      }),
    );
  }
  if (text.length > 0 && formatting.strikethrough) {
    formats.push(
      propertyFreeFormat(REFERENCE_SHOWCASE_IDS.strikethroughFormatKind),
    );
  }

  const children: readonly [] | readonly [ReferenceShowcaseTextV2] =
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
      name: REFERENCE_SHOWCASE_IDS.schemaName,
      version: REFERENCE_SHOWCASE_IDS.schemaVersion,
    }),
    schemaFingerprint: REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT,
    root: Object.freeze({
      kind: "element",
      type: "breditor/document",
      entityId: null,
      properties: EMPTY_PROPERTIES,
      children: Object.freeze([
        Object.freeze({
          kind: "element",
          type: "breditor/paragraph",
          entityId: null,
          properties: EMPTY_PROPERTIES,
          children,
        }),
      ] as const),
    }),
  });
}

/** Creates compact canonical JSON for the showcase Document V2 helper. */
export function createReferenceShowcaseDocumentJson(
  text = "",
  options: ReferenceShowcaseDocumentOptions = EMPTY_OPTIONS,
): string {
  return JSON.stringify(createReferenceShowcaseDocument(text, options));
}

/** Canonical empty Document V2 for a fresh showcase editor. */
export const REFERENCE_SHOWCASE_EMPTY_DOCUMENT =
  createReferenceShowcaseDocument();

/** Compact JSON form of {@link REFERENCE_SHOWCASE_EMPTY_DOCUMENT}. */
export const REFERENCE_SHOWCASE_EMPTY_DOCUMENT_JSON = JSON.stringify(
  REFERENCE_SHOWCASE_EMPTY_DOCUMENT,
);

/** Highlighted safe-Link fixture; the three new style controls start inactive. */
export const REFERENCE_SHOWCASE_SAMPLE_DOCUMENT =
  createReferenceShowcaseDocument("Breditor showcase", {
    highlighted: true,
    link: {
      href: "https://example.test/reference",
      openInNewWindow: true,
    },
  });

/** Compact JSON form of {@link REFERENCE_SHOWCASE_SAMPLE_DOCUMENT}. */
export const REFERENCE_SHOWCASE_SAMPLE_DOCUMENT_JSON = JSON.stringify(
  REFERENCE_SHOWCASE_SAMPLE_DOCUMENT,
);

function propertyFreeFormat<Type extends
  | "breditor/strong"
  | typeof REFERENCE_SHOWCASE_IDS.codeFormatKind
  | typeof REFERENCE_SHOWCASE_IDS.emphasisFormatKind
  | typeof REFERENCE_SHOWCASE_IDS.highlightFormatKind
  | typeof REFERENCE_SHOWCASE_IDS.strikethroughFormatKind>(
  type: Type,
): Readonly<{ type: Type; properties: Readonly<Record<string, never>> }> {
  return Object.freeze({ type, properties: EMPTY_PROPERTIES });
}

function readShowcaseOptions(
  options: ReferenceShowcaseDocumentOptions,
): ReadShowcaseOptions {
  const record = exactDataRecord(
    options,
    ["bold", "italic", "strikethrough", "code", "highlighted", "link"],
    "reference showcase document options",
  );
  const bold = optionalBoolean(record, "bold");
  const italic = optionalBoolean(record, "italic");
  const strikethrough = optionalBoolean(record, "strikethrough");
  const code = optionalBoolean(record, "code");
  const highlighted = optionalBoolean(record, "highlighted");
  const rawLink = ownDataValue(record, "link");
  if (rawLink === undefined) {
    return Object.freeze({
      bold,
      italic,
      strikethrough,
      code,
      highlighted,
    });
  }
  const link = exactDataRecord(
    rawLink,
    ["href", "openInNewWindow"],
    "reference showcase Link options",
  );
  const href = ownDataValue(link, "href");
  const openInNewWindow = ownDataValue(link, "openInNewWindow");
  if (typeof href !== "string" || typeof openInNewWindow !== "boolean") {
    throw new TypeError("reference showcase Link options are invalid");
  }
  // Reuse the established Link helper's exact UTF-16 and UTF-8 validation.
  createReferenceFormattingDocument("", {
    link: { href, openInNewWindow },
  });
  return Object.freeze({
    bold,
    italic,
    strikethrough,
    code,
    highlighted,
    link: Object.freeze({ href, openInNewWindow }),
  });
}

function optionalBoolean(
  record: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  const value = ownDataValue(record, key);
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`reference showcase ${key} option is invalid`);
  }
  return value ?? false;
}

function exactDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  description: string,
): Readonly<Record<string, unknown>> {
  let keys: readonly PropertyKey[];
  let prototype: object | null;
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError(`${description} must be an object`);
    }
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    throw new TypeError(`${description} must be an object`);
  }
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    keys.some(
      (key) => typeof key !== "string" || !allowedKeys.includes(key),
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
    throw new TypeError("reference showcase option is invalid");
  }
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor)) {
    throw new TypeError("reference showcase option must be a data property");
  }
  return descriptor.value;
}
