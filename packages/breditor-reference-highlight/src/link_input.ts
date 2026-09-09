import { REFERENCE_FORMATTING_IDS } from "./formatting_ids.js";

/** Inclusive UTF-8 limit declared by the reference Link contract. */
export const MAX_REFERENCE_LINK_HREF_UTF8 = 2_048;

/** Exact typed input for the generated Link set action and semantic intent. */
export interface ReferenceLinkSetInput {
  readonly operation: "set";
  readonly properties: readonly [
    Readonly<{
      name: typeof REFERENCE_FORMATTING_IDS.linkHrefProperty;
      value: string;
    }>,
    Readonly<{
      name: typeof REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty;
      value: boolean;
    }>,
  ];
}

/** Exact typed input that removes Link while retaining the selected text. */
export interface ReferenceLinkRemoveInput {
  readonly operation: "remove";
}

const TEXT_ENCODER = new TextEncoder();

/**
 * Creates frozen Link-set input with properties in qualified-name lexical order.
 *
 * The helper enforces the same primitive bounds as the Rust profile before it
 * produces an input value. Rust remains authoritative at command execution.
 */
export function createReferenceLinkSetInput(
  href: string,
  openInNewWindow = false,
): ReferenceLinkSetInput {
  assertReferenceLinkValues(href, openInNewWindow);
  return Object.freeze({
    operation: "set",
    properties: Object.freeze([
      Object.freeze({
        name: REFERENCE_FORMATTING_IDS.linkHrefProperty,
        value: href,
      }),
      Object.freeze({
        name: REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty,
        value: openInNewWindow,
      }),
    ] as const),
  });
}

/** Creates compact canonical JSON for the generated Link set intent/action. */
export function createReferenceLinkSetInputJson(
  href: string,
  openInNewWindow = false,
): string {
  return JSON.stringify(createReferenceLinkSetInput(href, openInNewWindow));
}

/** Creates the frozen, property-free Link removal input. */
export function createReferenceLinkRemoveInput(): ReferenceLinkRemoveInput {
  return Object.freeze({ operation: "remove" });
}

/** Creates compact canonical JSON for the generated Link remove intent/action. */
export function createReferenceLinkRemoveInputJson(): string {
  return REFERENCE_LINK_REMOVE_INPUT_JSON;
}

/** Shared canonical Link removal JSON. */
export const REFERENCE_LINK_REMOVE_INPUT_JSON = JSON.stringify(
  createReferenceLinkRemoveInput(),
);

function assertReferenceLinkValues(
  href: string,
  openInNewWindow: boolean,
): void {
  if (typeof href !== "string" || !isWellFormedUtf16(href)) {
    throw new TypeError("reference Link href is invalid");
  }
  if (typeof openInNewWindow !== "boolean") {
    throw new TypeError("reference Link target flag is invalid");
  }
  if (href.length === 0) {
    throw new RangeError("reference Link href is outside its fixed bounds");
  }
  if (href.length > MAX_REFERENCE_LINK_HREF_UTF8) {
    throw new RangeError("reference Link href is outside its fixed bounds");
  }
  const utf8Bytes = TEXT_ENCODER.encode(href).byteLength;
  if (utf8Bytes < 1 || utf8Bytes > MAX_REFERENCE_LINK_HREF_UTF8) {
    throw new RangeError("reference Link href is outside its fixed bounds");
  }
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
