import {
  MAX_REFERENCE_TEXT_COLOR_RGB24,
  MIN_REFERENCE_TEXT_COLOR_RGB24,
  REFERENCE_COLOR_SHOWCASE_IDS,
} from "./color_showcase_ids.js";
import { REFERENCE_COLOR_SHOWCASE_SCHEMA_FINGERPRINT } from "./color_showcase_profile.js";
import {
  MAX_REFERENCE_SHOWCASE_DOCUMENT_TEXT_UTF8,
  createReferenceShowcaseDocument,
  type ReferenceShowcaseFormatV2,
  type ReferenceShowcaseLinkPropertiesV2,
} from "./showcase_documents.js";

/** Maximum UTF-8 bytes accepted by this one-text-leaf fixture helper. */
export const MAX_REFERENCE_COLOR_SHOWCASE_DOCUMENT_TEXT_UTF8 =
  MAX_REFERENCE_SHOWCASE_DOCUMENT_TEXT_UTF8;

/** Closed optional formatting accepted by the Color Showcase fixture helper. */
export interface ReferenceColorShowcaseDocumentOptions {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly strikethrough?: boolean;
  readonly code?: boolean;
  readonly highlighted?: boolean;
  readonly link?: Readonly<{
    href: string;
    openInNewWindow: boolean;
  }>;
  readonly textColor?: number;
}

/** Exact stored semantic representation of one RGB24 text color. */
export type ReferenceColorShowcaseTextColorPropertiesV2 = Readonly<{
  [REFERENCE_COLOR_SHOWCASE_IDS.textColorRgb24Property]: number;
}>;

export interface ReferenceColorShowcaseTextColorFormatV2 {
  readonly type: typeof REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind;
  readonly properties: ReferenceColorShowcaseTextColorPropertiesV2;
}

/** Every inline format admitted by the Color Showcase's one-leaf helper. */
export type ReferenceColorShowcaseFormatV2 =
  | ReferenceShowcaseFormatV2
  | ReferenceColorShowcaseTextColorFormatV2;

export interface ReferenceColorShowcaseTextV2 {
  readonly kind: "text";
  readonly text: string;
  readonly formats: readonly ReferenceColorShowcaseFormatV2[];
}

export interface ReferenceColorShowcaseParagraphV2 {
  readonly kind: "element";
  readonly type: "breditor/paragraph";
  readonly entityId: null;
  readonly properties: Readonly<Record<string, never>>;
  readonly children: readonly [] | readonly [ReferenceColorShowcaseTextV2];
}

export interface ReferenceColorShowcaseDocumentV2 {
  readonly format: "breditor/document";
  readonly formatVersion: 2;
  readonly schema: Readonly<{
    name: typeof REFERENCE_COLOR_SHOWCASE_IDS.schemaName;
    version: typeof REFERENCE_COLOR_SHOWCASE_IDS.schemaVersion;
  }>;
  readonly schemaFingerprint: typeof REFERENCE_COLOR_SHOWCASE_SCHEMA_FINGERPRINT;
  readonly root: Readonly<{
    kind: "element";
    type: "breditor/document";
    entityId: null;
    properties: Readonly<Record<string, never>>;
    children: readonly [ReferenceColorShowcaseParagraphV2];
  }>;
}

interface ReadColorShowcaseOptions {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly strikethrough: boolean;
  readonly code: boolean;
  readonly highlighted: boolean;
  readonly link?: Readonly<{ href: string; openInNewWindow: boolean }>;
  readonly textColor?: number;
}

const EMPTY_OPTIONS: ReferenceColorShowcaseDocumentOptions = Object.freeze({});
const EMPTY_PROPERTIES: Readonly<Record<string, never>> = Object.freeze({});

/**
 * Creates a deeply frozen, fingerprint-bound Color Showcase Document V2.
 *
 * Existing Showcase validation and canonical format order are reused. RGB24
 * is appended in its lexical `example/text-color` position. CSS text never
 * enters this semantic document helper.
 */
export function createReferenceColorShowcaseDocument(
  text = "",
  options: ReferenceColorShowcaseDocumentOptions = EMPTY_OPTIONS,
): ReferenceColorShowcaseDocumentV2 {
  const formatting = readColorShowcaseOptions(options);
  const baseOptions = Object.freeze({
    bold: formatting.bold,
    italic: formatting.italic,
    strikethrough: formatting.strikethrough,
    code: formatting.code,
    highlighted: formatting.highlighted,
    ...(formatting.link === undefined ? {} : { link: formatting.link }),
  });
  const base = createReferenceShowcaseDocument(text, baseOptions);
  const baseParagraph = base.root.children[0];
  let children: readonly [] | readonly [ReferenceColorShowcaseTextV2];
  if (text.length === 0) {
    children = Object.freeze([] as const);
  } else {
    const baseText = baseParagraph.children[0];
    if (baseText === undefined) {
      throw new TypeError("reference Color Showcase document is inconsistent");
    }
    const formats: ReferenceColorShowcaseFormatV2[] = [...baseText.formats];
    if (formatting.textColor !== undefined) {
      formats.push(
        Object.freeze({
          type: REFERENCE_COLOR_SHOWCASE_IDS.textColorFormatKind,
          properties: Object.freeze({
            [REFERENCE_COLOR_SHOWCASE_IDS.textColorRgb24Property]:
              formatting.textColor,
          }),
        }),
      );
    }
    children = Object.freeze([
      Object.freeze({
        kind: "text" as const,
        text,
        formats: Object.freeze(formats),
      }),
    ] as const);
  }

  return Object.freeze({
    format: "breditor/document",
    formatVersion: 2,
    schema: Object.freeze({
      name: REFERENCE_COLOR_SHOWCASE_IDS.schemaName,
      version: REFERENCE_COLOR_SHOWCASE_IDS.schemaVersion,
    }),
    schemaFingerprint: REFERENCE_COLOR_SHOWCASE_SCHEMA_FINGERPRINT,
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

/** Creates compact canonical JSON for the Color Showcase Document V2. */
export function createReferenceColorShowcaseDocumentJson(
  text = "",
  options: ReferenceColorShowcaseDocumentOptions = EMPTY_OPTIONS,
): string {
  return JSON.stringify(createReferenceColorShowcaseDocument(text, options));
}

/** Canonical empty Document V2 for a fresh Color Showcase editor. */
export const REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT =
  createReferenceColorShowcaseDocument();

/** Compact JSON form of {@link REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT}. */
export const REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT_JSON = JSON.stringify(
  REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT,
);

/** Sample starts uncolored so the native picker can visibly apply a value. */
export const REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT =
  createReferenceColorShowcaseDocument("Breditor showcase", {
    highlighted: true,
    link: {
      href: "https://example.test/reference",
      openInNewWindow: true,
    },
  });

/** Compact JSON form of {@link REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT}. */
export const REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT_JSON = JSON.stringify(
  REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT,
);

function readColorShowcaseOptions(
  options: ReferenceColorShowcaseDocumentOptions,
): ReadColorShowcaseOptions {
  const record = exactDataRecord(
    options,
    [
      "bold",
      "italic",
      "strikethrough",
      "code",
      "highlighted",
      "link",
      "textColor",
    ],
    "reference Color Showcase document options",
  );
  const bold = optionalBoolean(record, "bold");
  const italic = optionalBoolean(record, "italic");
  const strikethrough = optionalBoolean(record, "strikethrough");
  const code = optionalBoolean(record, "code");
  const highlighted = optionalBoolean(record, "highlighted");
  const textColor = ownDataValue(record, "textColor");
  if (textColor !== undefined) assertRgb24(textColor);

  const rawLink = ownDataValue(record, "link");
  if (rawLink === undefined) {
    return Object.freeze({
      bold,
      italic,
      strikethrough,
      code,
      highlighted,
      ...(textColor === undefined ? {} : { textColor }),
    });
  }
  const link = exactDataRecord(
    rawLink,
    ["href", "openInNewWindow"],
    "reference Color Showcase Link options",
  );
  const href = ownDataValue(link, "href");
  const openInNewWindow = ownDataValue(link, "openInNewWindow");
  if (typeof href !== "string" || typeof openInNewWindow !== "boolean") {
    throw new TypeError("reference Color Showcase Link options are invalid");
  }
  // Reuse the established helper's exact Link and text validation.
  createReferenceShowcaseDocument("", {
    link: { href, openInNewWindow },
  });
  return Object.freeze({
    bold,
    italic,
    strikethrough,
    code,
    highlighted,
    link: Object.freeze({ href, openInNewWindow }),
    ...(textColor === undefined ? {} : { textColor }),
  });
}

function assertRgb24(value: unknown): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0)
  ) {
    throw new TypeError("reference Color Showcase RGB24 value is invalid");
  }
  if (
    value < MIN_REFERENCE_TEXT_COLOR_RGB24 ||
    value > MAX_REFERENCE_TEXT_COLOR_RGB24
  ) {
    throw new RangeError(
      "reference Color Showcase RGB24 value is outside its fixed bounds",
    );
  }
}

function optionalBoolean(
  record: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  const value = ownDataValue(record, key);
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`reference Color Showcase ${key} option is invalid`);
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
    keys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))
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
    throw new TypeError("reference Color Showcase option is invalid");
  }
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor)) {
    throw new TypeError("reference Color Showcase option must be a data property");
  }
  return descriptor.value;
}

// This imported type intentionally remains part of the public document shape.
export type { ReferenceShowcaseLinkPropertiesV2 };
