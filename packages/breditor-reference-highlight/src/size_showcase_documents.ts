import {
  MAX_REFERENCE_TEXT_SIZE_STEP,
  MIN_REFERENCE_TEXT_SIZE_STEP,
  REFERENCE_SIZE_SHOWCASE_IDS,
  type ReferenceTextSizeStep,
} from "./size_showcase_ids.js";
import { REFERENCE_SIZE_SHOWCASE_SCHEMA_FINGERPRINT } from "./size_showcase_profile.js";
import {
  MAX_REFERENCE_COLOR_SHOWCASE_DOCUMENT_TEXT_UTF8,
  createReferenceColorShowcaseDocument,
  type ReferenceColorShowcaseDocumentOptions,
  type ReferenceColorShowcaseFormatV2,
} from "./color_showcase_documents.js";

/** Lineage used by the React Text Size Showcase integration. */
export const REFERENCE_SIZE_SHOWCASE_LINEAGE_ID =
  "breditor-react-reference-size-showcase" as const;

/** Maximum UTF-8 bytes accepted by this one-text-leaf fixture helper. */
export const MAX_REFERENCE_SIZE_SHOWCASE_DOCUMENT_TEXT_UTF8 =
  MAX_REFERENCE_COLOR_SHOWCASE_DOCUMENT_TEXT_UTF8;

/** Closed optional formatting accepted by the Text Size Showcase helper. */
export interface ReferenceSizeShowcaseDocumentOptions
  extends ReferenceColorShowcaseDocumentOptions {
  readonly textSize?: ReferenceTextSizeStep;
}

/** Exact stored semantic representation of one text-size step. */
export type ReferenceSizeShowcaseTextSizePropertiesV2 = Readonly<{
  [REFERENCE_SIZE_SHOWCASE_IDS.textSizeStepProperty]: ReferenceTextSizeStep;
}>;

export interface ReferenceSizeShowcaseTextSizeFormatV2 {
  readonly type: typeof REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind;
  readonly properties: ReferenceSizeShowcaseTextSizePropertiesV2;
}

/** Every inline format admitted by the Text Size Showcase helper. */
export type ReferenceSizeShowcaseFormatV2 =
  | ReferenceColorShowcaseFormatV2
  | ReferenceSizeShowcaseTextSizeFormatV2;

export interface ReferenceSizeShowcaseTextV2 {
  readonly kind: "text";
  readonly text: string;
  readonly formats: readonly ReferenceSizeShowcaseFormatV2[];
}

export interface ReferenceSizeShowcaseParagraphV2 {
  readonly kind: "element";
  readonly type: "breditor/paragraph";
  readonly entityId: null;
  readonly properties: Readonly<Record<string, never>>;
  readonly children: readonly [] | readonly [ReferenceSizeShowcaseTextV2];
}

export interface ReferenceSizeShowcaseDocumentV2 {
  readonly format: "breditor/document";
  readonly formatVersion: 2;
  readonly schema: Readonly<{
    name: typeof REFERENCE_SIZE_SHOWCASE_IDS.schemaName;
    version: typeof REFERENCE_SIZE_SHOWCASE_IDS.schemaVersion;
  }>;
  readonly schemaFingerprint: typeof REFERENCE_SIZE_SHOWCASE_SCHEMA_FINGERPRINT;
  readonly root: Readonly<{
    kind: "element";
    type: "breditor/document";
    entityId: null;
    properties: Readonly<Record<string, never>>;
    readonly children: readonly [ReferenceSizeShowcaseParagraphV2];
  }>;
}

const EMPTY_OPTIONS: ReferenceSizeShowcaseDocumentOptions = Object.freeze({});
const EMPTY_PROPERTIES: Readonly<Record<string, never>> = Object.freeze({});
const COLOR_OPTION_KEYS = Object.freeze([
  "bold",
  "italic",
  "strikethrough",
  "code",
  "highlighted",
  "link",
  "textColor",
] as const);

/**
 * Creates a deeply frozen, fingerprint-bound Text Size Showcase Document V2.
 *
 * Existing Color Showcase validation and canonical semantic ordering are
 * reused. Text size follows text color lexically in the stored format set;
 * browser wrapper order remains an independent presentation contract.
 */
export function createReferenceSizeShowcaseDocument(
  text = "",
  options: ReferenceSizeShowcaseDocumentOptions = EMPTY_OPTIONS,
): ReferenceSizeShowcaseDocumentV2 {
  const record = exactDataRecord(
    options,
    [...COLOR_OPTION_KEYS, "textSize"],
    "reference Text Size Showcase document options",
  );
  const textSize = ownDataValue(record, "textSize");
  if (textSize !== undefined) assertTextSizeStep(textSize);

  const colorOptions: Record<string, unknown> = {};
  for (const key of COLOR_OPTION_KEYS) {
    const value = ownDataValue(record, key);
    if (value !== undefined) colorOptions[key] = value;
  }
  const base = createReferenceColorShowcaseDocument(
    text,
    colorOptions as ReferenceColorShowcaseDocumentOptions,
  );
  const baseParagraph = base.root.children[0];
  let children: readonly [] | readonly [ReferenceSizeShowcaseTextV2];
  if (text.length === 0) {
    children = Object.freeze([] as const);
  } else {
    const baseText = baseParagraph.children[0];
    if (baseText === undefined) {
      throw new TypeError("reference Text Size Showcase document is inconsistent");
    }
    const formats: ReferenceSizeShowcaseFormatV2[] = [...baseText.formats];
    if (textSize !== undefined) {
      formats.push(
        Object.freeze({
          type: REFERENCE_SIZE_SHOWCASE_IDS.textSizeFormatKind,
          properties: Object.freeze({
            [REFERENCE_SIZE_SHOWCASE_IDS.textSizeStepProperty]: textSize,
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
      name: REFERENCE_SIZE_SHOWCASE_IDS.schemaName,
      version: REFERENCE_SIZE_SHOWCASE_IDS.schemaVersion,
    }),
    schemaFingerprint: REFERENCE_SIZE_SHOWCASE_SCHEMA_FINGERPRINT,
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

/** Creates compact canonical JSON for the Text Size Showcase Document V2. */
export function createReferenceSizeShowcaseDocumentJson(
  text = "",
  options: ReferenceSizeShowcaseDocumentOptions = EMPTY_OPTIONS,
): string {
  return JSON.stringify(createReferenceSizeShowcaseDocument(text, options));
}

/** Canonical empty Document V2 for a fresh Text Size Showcase editor. */
export const REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT =
  createReferenceSizeShowcaseDocument();

/** Compact JSON form of {@link REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT}. */
export const REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT_JSON = JSON.stringify(
  REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT,
);

/** Sample starts without size so applying the default Large step is visible. */
export const REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT =
  createReferenceSizeShowcaseDocument("Breditor showcase", {
    highlighted: true,
    link: {
      href: "https://example.test/reference",
      openInNewWindow: true,
    },
  });

/** Compact JSON form of {@link REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT}. */
export const REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON = JSON.stringify(
  REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT,
);

function assertTextSizeStep(value: unknown): asserts value is ReferenceTextSizeStep {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0)
  ) {
    throw new TypeError("reference Text Size Showcase step is invalid");
  }
  if (
    value < MIN_REFERENCE_TEXT_SIZE_STEP ||
    value > MAX_REFERENCE_TEXT_SIZE_STEP
  ) {
    throw new RangeError(
      "reference Text Size Showcase step is outside its fixed bounds",
    );
  }
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
    throw new TypeError("reference Text Size Showcase option is invalid");
  }
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor)) {
    throw new TypeError(
      "reference Text Size Showcase option must be a data property",
    );
  }
  return descriptor.value;
}
