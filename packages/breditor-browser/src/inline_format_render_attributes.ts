import type {
  InlineFormatPropertyProjection,
  InlineFormatPropertyProjectionValue,
} from "./projection.js";
import {
  MAX_BROWSER_PROFILE_PROPERTIES_PER_FORMAT,
  type BrowserProfileFormatDescriptor,
  type BrowserProfileFormatPropertyDescriptor,
} from "./wasm_profile_descriptor.js";

/** Exact UTF-8 ceiling accepted by the built-in safe-link policy. */
export const MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES = 2_048;

/** Exact semantic contract rendered by the built-in safe text-color policy. */
export const INLINE_FORMAT_SAFE_TEXT_COLOR_V1_FORMAT_KIND =
  "example/text-color";
export const INLINE_FORMAT_SAFE_TEXT_COLOR_V1_FORMAT_REVISION = 1;
export const INLINE_FORMAT_SAFE_TEXT_COLOR_V1_PROPERTY_NAME = "example/rgb24";
export const INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MINIMUM = 0;
export const INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MAXIMUM = 0xff_ffff;
export const INLINE_FORMAT_SAFE_TEXT_COLOR_V1_CLASS = "breditor-text-color";

/** Closed attribute policy for one schema-declared link format. */
export interface InlineFormatRenderSafeLinkV1Policy {
  readonly kind: "safeLinkV1";
  readonly hrefProperty: string;
  readonly openInNewWindowProperty: string;
}

/** Closed zero-configuration policy for the exact RGB24 text-color format. */
export interface InlineFormatRenderSafeTextColorV1Policy {
  readonly kind: "safeTextColorV1";
}

/** Closed browser-owned attribute policies admitted by render recipes. */
export type InlineFormatRenderAttributePolicy =
  | InlineFormatRenderSafeLinkV1Policy
  | InlineFormatRenderSafeTextColorV1Policy;

/** One canonical browser-derived DOM attribute emitted by a closed policy. */
export interface InlineFormatRenderAttribute {
  readonly name: "href" | "rel" | "style" | "target";
  readonly value: string;
}

const EMPTY_ATTRIBUTES: readonly InlineFormatRenderAttribute[] = Object.freeze([]);
const QUALIFIED_NAME = /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u;
const MAX_QUALIFIED_NAME_ASCII = 128;
const ARRAY_IS_ARRAY = Array.isArray;
const OWN_KEYS = Reflect.ownKeys;
const GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const APPLY = Reflect.apply;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const OBJECT_IS = Object.is;
const STRING_CHAR_CODE_AT = String.prototype.charCodeAt;
const URL_CONSTRUCTOR = URL;
const URL_PROTOCOL_GETTER = urlGetter("protocol");
const URL_USERNAME_GETTER = urlGetter("username");
const URL_PASSWORD_GETTER = urlGetter("password");
const URL_HOSTNAME_GETTER = urlGetter("hostname");
const URL_HREF_GETTER = urlGetter("href");

/**
 * Copies an application value into the exact callback-free attribute schema.
 *
 * The input must have the exact own-data shape of one closed policy. The
 * returned policy is detached from the caller and frozen. `safeTextColorV1`
 * deliberately has no configurable property names or CSS surface.
 * @internal
 */
export function createInlineFormatRenderAttributePolicy(
  value: unknown,
): InlineFormatRenderAttributePolicy {
  let policyKind: unknown;
  try {
    policyKind = ownDataValue(value, "kind");
  } catch {
    throw new TypeError(
      "inline-format render attribute policy could not be inspected",
    );
  }
  if (policyKind === "safeTextColorV1") {
    const record = readExactDataRecord(
      value,
      ["kind"],
      "inline-format render attribute policy",
    );
    if (record["kind"] !== policyKind) {
      throw new TypeError("inline-format render attribute policy kind is invalid");
    }
    return Object.freeze({ kind: policyKind });
  }
  const record = readExactDataRecord(
    value,
    ["kind", "hrefProperty", "openInNewWindowProperty"],
    "inline-format render attribute policy",
  );
  const kind = record["kind"];
  const hrefProperty = record["hrefProperty"];
  const openInNewWindowProperty = record["openInNewWindowProperty"];
  if (kind !== "safeLinkV1") {
    throw new TypeError("inline-format render attribute policy kind is invalid");
  }
  if (
    !isQualifiedName(hrefProperty) ||
    !isQualifiedName(openInNewWindowProperty)
  ) {
    throw new TypeError(
      "inline-format render attribute policy property name is invalid",
    );
  }
  if (hrefProperty === openInNewWindowProperty) {
    throw new TypeError(
      "inline-format render attribute policy property names must be distinct",
    );
  }
  return Object.freeze({ kind, hrefProperty, openInNewWindowProperty });
}

/**
 * Checks whether one format descriptor provides one policy's exact values.
 *
 * `safeLinkV1` requires its closed two-property contract. `safeTextColorV1`
 * requires literal `example/text-color@1` with one required integer
 * `example/rgb24` property bounded to `0..=16777215`. Extra semantic values
 * are rejected rather than silently discarded by rendering.
 * @internal
 */
export function inlineFormatRenderAttributePolicyMatchesFormatDescriptor(
  policy: InlineFormatRenderAttributePolicy,
  format: BrowserProfileFormatDescriptor,
): boolean {
  try {
    if (isExactSafeTextColorV1Policy(policy)) {
      return formatMatchesSafeTextColorV1(format);
    }
    const fields = safeLinkPolicyFields(policy);
    if (fields === null) return false;
    const properties = ownDataValue(format, "properties");
    const propertyCount = boundedArrayLength(
      properties,
      MAX_BROWSER_PROFILE_PROPERTIES_PER_FORMAT,
    );
    if (propertyCount === null) {
      return false;
    }
    if (propertyCount !== 2) return false;
    const href = findPropertyDescriptor(
      properties,
      propertyCount,
      fields.hrefProperty,
    );
    const openInNewWindow = findPropertyDescriptor(
      properties,
      propertyCount,
      fields.openInNewWindowProperty,
    );
    return href !== null &&
      openInNewWindow !== null &&
      propertyPresence(href) === "required" &&
      propertyPresence(openInNewWindow) === "required" &&
      isExactHrefValueType(ownDataValue(href, "valueType")) &&
      isBooleanValueType(ownDataValue(openInNewWindow, "valueType"));
  } catch {
    return false;
  }
}

/**
 * Resolves one closed policy against projected scalar properties.
 *
 * The text-color policy emits only `style="color:#rrggbb"` derived from an
 * admitted integer; it never consumes CSS text. The link policy admits only
 * absolute credential-free HTTP(S) URLs without control or Unicode
 * whitespace scalars are admitted. Both source and normalized URL must fit 2048
 * UTF-8 bytes. Any absent, duplicate, ill-typed, malformed, or unsafe stored
 * value yields the shared frozen empty list, so callers create an inert `<a>`.
 * A true new-window flag emits `rel` before `target` in a canonical order.
 * @internal
 */
export function resolveInlineFormatRenderAttributes(
  policy: InlineFormatRenderAttributePolicy,
  properties: readonly InlineFormatPropertyProjection[],
): readonly InlineFormatRenderAttribute[] {
  try {
    if (isExactSafeTextColorV1Policy(policy)) {
      const propertyCount = exactDenseArrayLength(
        properties,
        MAX_BROWSER_PROFILE_PROPERTIES_PER_FORMAT,
      );
      if (propertyCount !== 1) return EMPTY_ATTRIBUTES;
      const property = ownArrayValue(properties, 0);
      if (
        !hasExactOwnDataKeys(property, ["name", "value"]) ||
        ownDataValue(property, "name") !==
          INLINE_FORMAT_SAFE_TEXT_COLOR_V1_PROPERTY_NAME
      ) {
        return EMPTY_ATTRIBUTES;
      }
      const value = ownDataValue(property, "value");
      const style = canonicalSafeTextColorStyle(value);
      return style === null
        ? EMPTY_ATTRIBUTES
        : Object.freeze([
          Object.freeze({ name: "style" as const, value: style }),
        ]);
    }
    const fields = safeLinkPolicyFields(policy);
    const propertyCount = boundedArrayLength(
      properties,
      MAX_BROWSER_PROFILE_PROPERTIES_PER_FORMAT,
    );
    if (fields === null || propertyCount !== 2) {
      return EMPTY_ATTRIBUTES;
    }
    const hrefValue = findProjectedPropertyValue(
      properties,
      propertyCount,
      fields.hrefProperty,
    );
    const openValue = findProjectedPropertyValue(
      properties,
      propertyCount,
      fields.openInNewWindowProperty,
    );
    if (
      hrefValue === ABSENT_OR_DUPLICATE ||
      openValue === ABSENT_OR_DUPLICATE ||
      typeof hrefValue !== "string" ||
      typeof openValue !== "boolean"
    ) {
      return EMPTY_ATTRIBUTES;
    }
    const href = canonicalSafeLinkHref(hrefValue);
    if (href === null) return EMPTY_ATTRIBUTES;

    const attributes: InlineFormatRenderAttribute[] = [
      Object.freeze({ name: "href", value: href }),
    ];
    if (openValue) {
      attributes.push(
        Object.freeze({ name: "rel", value: "noopener noreferrer" }),
        Object.freeze({ name: "target", value: "_blank" }),
      );
    }
    return Object.freeze(attributes);
  } catch {
    return EMPTY_ATTRIBUTES;
  }
}

/**
 * Checks an exact attribute list against the complete `safeLinkV1` output set.
 *
 * This is the inverse admission guard used by DOM drift, native-composition,
 * and clipboard readers. It accepts only an inert empty list, one canonical
 * same-window href, or the exact href/rel/target new-window sequence. It never
 * accepts a merely parseable URL whose spelling is non-canonical.
 * @internal
 */
export function inlineFormatRenderAttributesAreCanonicalSafeLinkV1(
  value: unknown,
): value is readonly InlineFormatRenderAttribute[] {
  try {
    const length = exactDenseArrayLength(value, 3);
    if (length === null) return false;
    if (length === 0) return true;
    if (length !== 1 && length !== 3) return false;
    const href = readExactRenderAttribute(ownArrayValue(value, 0));
    if (
      href === null ||
      href.name !== "href" ||
      canonicalSafeLinkHref(href.value) !== href.value
    ) {
      return false;
    }
    if (length === 1) return true;
    const rel = readExactRenderAttribute(ownArrayValue(value, 1));
    const target = readExactRenderAttribute(ownArrayValue(value, 2));
    return rel?.name === "rel" &&
      rel.value === "noopener noreferrer" &&
      target?.name === "target" &&
      target.value === "_blank";
  } catch {
    return false;
  }
}

/** Checks the sole canonical style emitted by `safeTextColorV1`. @internal */
export function inlineFormatRenderAttributesAreCanonicalSafeTextColorV1(
  value: unknown,
): value is readonly InlineFormatRenderAttribute[] {
  try {
    if (exactDenseArrayLength(value, 1) !== 1) return false;
    const style = readExactRenderAttribute(ownArrayValue(value, 0));
    return style?.name === "style" && isCanonicalSafeTextColorStyle(style.value);
  } catch {
    return false;
  }
}

/** Dispatches inverse attribute admission through one exact closed policy. @internal */
export function inlineFormatRenderAttributesAreCanonicalForPolicy(
  policy: InlineFormatRenderAttributePolicy,
  value: unknown,
): value is readonly InlineFormatRenderAttribute[] {
  try {
    if (isExactSafeTextColorV1Policy(policy)) {
      return inlineFormatRenderAttributesAreCanonicalSafeTextColorV1(value);
    }
    return safeLinkPolicyFields(policy) !== null &&
      inlineFormatRenderAttributesAreCanonicalSafeLinkV1(value);
  } catch {
    return false;
  }
}

interface SafeLinkPolicyFields {
  readonly hrefProperty: string;
  readonly openInNewWindowProperty: string;
}

const ABSENT_OR_DUPLICATE = Symbol("absent or duplicate property");

function safeLinkPolicyFields(
  policy: InlineFormatRenderAttributePolicy,
): SafeLinkPolicyFields | null {
  if (ownDataValue(policy, "kind") !== "safeLinkV1") return null;
  const hrefProperty = ownDataValue(policy, "hrefProperty");
  const openInNewWindowProperty = ownDataValue(
    policy,
    "openInNewWindowProperty",
  );
  return isQualifiedName(hrefProperty) &&
      isQualifiedName(openInNewWindowProperty) &&
      hrefProperty !== openInNewWindowProperty
    ? { hrefProperty, openInNewWindowProperty }
    : null;
}

function isExactSafeTextColorV1Policy(
  policy: InlineFormatRenderAttributePolicy,
): policy is InlineFormatRenderSafeTextColorV1Policy {
  return hasExactOwnDataKeys(policy, ["kind"]) &&
    ownDataValue(policy, "kind") === "safeTextColorV1";
}

function formatMatchesSafeTextColorV1(
  format: BrowserProfileFormatDescriptor,
): boolean {
  if (
    !hasExactOwnDataKeys(format, ["kind", "revision", "properties"]) ||
    ownDataValue(format, "kind") !==
      INLINE_FORMAT_SAFE_TEXT_COLOR_V1_FORMAT_KIND ||
    ownDataValue(format, "revision") !==
      INLINE_FORMAT_SAFE_TEXT_COLOR_V1_FORMAT_REVISION
  ) {
    return false;
  }
  const properties = ownDataValue(format, "properties");
  if (exactDenseArrayLength(properties, 1) !== 1) return false;
  const property = ownArrayValue(properties, 0);
  if (
    !hasExactOwnDataKeys(property, ["name", "presence", "valueType"]) ||
    ownDataValue(property, "name") !==
      INLINE_FORMAT_SAFE_TEXT_COLOR_V1_PROPERTY_NAME ||
    ownDataValue(property, "presence") !== "required"
  ) {
    return false;
  }
  const valueType = ownDataValue(property, "valueType");
  return hasExactOwnDataKeys(valueType, ["kind", "minimum", "maximum"]) &&
    ownDataValue(valueType, "kind") === "integer" &&
    ownDataValue(valueType, "minimum") ===
      INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MINIMUM &&
    ownDataValue(valueType, "maximum") ===
      INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MAXIMUM;
}

function findPropertyDescriptor(
  properties: unknown,
  length: number,
  name: string,
): BrowserProfileFormatPropertyDescriptor | null {
  let found: BrowserProfileFormatPropertyDescriptor | null = null;
  for (let index = 0; index < length; index += 1) {
    const candidate = ownArrayValue(properties, index);
    if (!isRecord(candidate) || ownDataValue(candidate, "name") !== name) continue;
    if (found !== null) return null;
    found = candidate as unknown as BrowserProfileFormatPropertyDescriptor;
  }
  return found;
}

function findProjectedPropertyValue(
  properties: unknown,
  length: number,
  name: string,
): InlineFormatPropertyProjectionValue | typeof ABSENT_OR_DUPLICATE {
  let seen = false;
  let found: InlineFormatPropertyProjectionValue | typeof ABSENT_OR_DUPLICATE =
    ABSENT_OR_DUPLICATE;
  for (let index = 0; index < length; index += 1) {
    const candidate = ownArrayValue(properties, index);
    if (!isRecord(candidate) || ownDataValue(candidate, "name") !== name) continue;
    if (seen) return ABSENT_OR_DUPLICATE;
    seen = true;
    const value = ownDataValue(candidate, "value");
    if (!isPropertyScalar(value)) return ABSENT_OR_DUPLICATE;
    found = value;
  }
  return found;
}

function readExactRenderAttribute(
  value: unknown,
): InlineFormatRenderAttribute | null {
  if (!isRecord(value)) return null;
  const keys = OWN_KEYS(value);
  if (
    keys.length !== 2 ||
    !keys.includes("name") ||
    !keys.includes("value") ||
    keys.some((key) => key !== "name" && key !== "value")
  ) {
    return null;
  }
  const name = ownDataValue(value, "name");
  const attributeValue = ownDataValue(value, "value");
  return (name === "href" || name === "rel" || name === "style" ||
      name === "target") &&
      typeof attributeValue === "string"
    ? { name, value: attributeValue }
    : null;
}

function canonicalSafeTextColorStyle(value: unknown): string | null {
  if (
    typeof value !== "number" ||
    !NUMBER_IS_SAFE_INTEGER(value) ||
    OBJECT_IS(value, -0) ||
    value < INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MINIMUM ||
    value > INLINE_FORMAT_SAFE_TEXT_COLOR_V1_MAXIMUM
  ) {
    return null;
  }
  const hex = "0123456789abcdef";
  let color = "color:#";
  for (let shift = 20; shift >= 0; shift -= 4) {
    color += hex[(value >>> shift) & 0xf];
  }
  return color;
}

function isCanonicalSafeTextColorStyle(value: string): boolean {
  if (
    value.length !== 13 ||
    stringCharCodeAt(value, 0) !== 0x63 ||
    stringCharCodeAt(value, 1) !== 0x6f ||
    stringCharCodeAt(value, 2) !== 0x6c ||
    stringCharCodeAt(value, 3) !== 0x6f ||
    stringCharCodeAt(value, 4) !== 0x72 ||
    stringCharCodeAt(value, 5) !== 0x3a ||
    stringCharCodeAt(value, 6) !== 0x23
  ) {
    return false;
  }
  for (let index = 7; index < value.length; index += 1) {
    const unit = stringCharCodeAt(value, index);
    if (!((unit >= 0x30 && unit <= 0x39) || (unit >= 0x61 && unit <= 0x66))) {
      return false;
    }
  }
  return true;
}

function isExactHrefValueType(value: unknown): boolean {
  return isRecord(value) &&
    ownDataValue(value, "kind") === "string" &&
    ownDataValue(value, "minimumUtf8Bytes") === 1 &&
    ownDataValue(value, "maximumUtf8Bytes") ===
      MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES;
}

function isBooleanValueType(value: unknown): boolean {
  return isRecord(value) && ownDataValue(value, "kind") === "boolean";
}

function propertyPresence(value: BrowserProfileFormatPropertyDescriptor): unknown {
  return ownDataValue(value, "presence");
}

function canonicalSafeLinkHref(value: string): string | null {
  const sourceBytes = unicodeScalarUtf8Length(value);
  if (
    sourceBytes === null ||
    sourceBytes === 0 ||
    sourceBytes > MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES ||
    !rawAbsoluteHttpUrlIsAdmissible(value)
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL_CONSTRUCTOR(value);
  } catch {
    return null;
  }
  const protocol = readUrlString(URL_PROTOCOL_GETTER, parsed);
  const username = readUrlString(URL_USERNAME_GETTER, parsed);
  const password = readUrlString(URL_PASSWORD_GETTER, parsed);
  const hostname = readUrlString(URL_HOSTNAME_GETTER, parsed);
  const canonical = readUrlString(URL_HREF_GETTER, parsed);
  if (
    (protocol !== "http:" && protocol !== "https:") ||
    username !== "" ||
    password !== "" ||
    hostname === "" ||
    canonical === null
  ) {
    return null;
  }
  const canonicalBytes = unicodeScalarUtf8Length(canonical);
  return canonicalBytes !== null &&
      canonicalBytes <= MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES
    ? canonical
    : null;
}

/**
 * Rejects ambiguous special-URL spellings before invoking the URL parser.
 *
 * WHATWG parsers intentionally repair inputs such as excess slashes and
 * backslashes. That behavior is useful for navigation but is too permissive
 * for a security boundary. The raw spelling must therefore contain exactly
 * `http://` or `https://`, followed immediately by a non-empty visible-ASCII
 * authority. Raw credentials, percent escapes in the authority, and every
 * backslash are rejected even if parsing would later erase or reinterpret
 * them. Internationalized host names remain available through their explicit
 * ASCII-compatible (`xn--`) spelling.
 */
function rawAbsoluteHttpUrlIsAdmissible(value: string): boolean {
  const authorityStart = rawHttpAuthorityStart(value);
  if (authorityStart === null || authorityStart >= value.length) return false;

  let authorityLength = 0;
  let insideAuthority = true;
  for (let index = authorityStart; index < value.length; index += 1) {
    const unit = stringCharCodeAt(value, index);
    if (unit === 0x5c || isControlOrUnicodeWhitespace(unit)) return false;
    if (
      insideAuthority &&
      (unit === 0x2f || unit === 0x3f || unit === 0x23)
    ) {
      if (authorityLength === 0) return false;
      insideAuthority = false;
      continue;
    }
    if (insideAuthority) {
      if (unit > 0x7e || unit === 0x25 || unit === 0x40) return false;
      authorityLength += 1;
    }
  }
  return authorityLength > 0;
}

function rawHttpAuthorityStart(value: string): 7 | 8 | null {
  if (
    value.length >= 7 &&
    asciiUnitEqualsIgnoreCase(stringCharCodeAt(value, 0), 0x68) &&
    asciiUnitEqualsIgnoreCase(stringCharCodeAt(value, 1), 0x74) &&
    asciiUnitEqualsIgnoreCase(stringCharCodeAt(value, 2), 0x74) &&
    asciiUnitEqualsIgnoreCase(stringCharCodeAt(value, 3), 0x70)
  ) {
    if (
      stringCharCodeAt(value, 4) === 0x3a &&
      stringCharCodeAt(value, 5) === 0x2f &&
      stringCharCodeAt(value, 6) === 0x2f
    ) {
      return 7;
    }
    if (
      asciiUnitEqualsIgnoreCase(stringCharCodeAt(value, 4), 0x73) &&
      value.length >= 8 &&
      stringCharCodeAt(value, 5) === 0x3a &&
      stringCharCodeAt(value, 6) === 0x2f &&
      stringCharCodeAt(value, 7) === 0x2f
    ) {
      return 8;
    }
  }
  return null;
}

function asciiUnitEqualsIgnoreCase(unit: number, lowercase: number): boolean {
  return unit === lowercase || unit === lowercase - 0x20;
}

function isControlOrUnicodeWhitespace(unit: number): boolean {
  return unit <= 0x20 ||
    (unit >= 0x7f && unit <= 0x9f) ||
    unit === 0x00a0 ||
    unit === 0x1680 ||
    (unit >= 0x2000 && unit <= 0x200a) ||
    unit === 0x2028 ||
    unit === 0x2029 ||
    unit === 0x202f ||
    unit === 0x205f ||
    unit === 0x3000;
}

type UrlGetter = (this: URL) => unknown;

function urlGetter(name: string): UrlGetter | null {
  try {
    let current: object | null = URL_CONSTRUCTOR.prototype;
    for (let depth = 0; depth < 4 && current !== null; depth += 1) {
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(current, name);
      if (typeof descriptor?.get === "function") {
        return descriptor.get as UrlGetter;
      }
      current = GET_PROTOTYPE_OF(current);
    }
    return null;
  } catch {
    return null;
  }
}

function readUrlString(getter: UrlGetter | null, value: URL): string | null {
  if (getter === null) return null;
  try {
    const candidate = APPLY(getter, value, []);
    return typeof candidate === "string" ? candidate : null;
  } catch {
    return null;
  }
}

function unicodeScalarUtf8Length(value: string): number | null {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = stringCharCodeAt(value, index);
    if (unit <= 0x7f) {
      bytes += 1;
    } else if (unit <= 0x7ff) {
      bytes += 2;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      const trailing = stringCharCodeAt(value, index + 1);
      if (!Number.isInteger(trailing) || trailing < 0xdc00 || trailing > 0xdfff) {
        return null;
      }
      bytes += 4;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return null;
    } else {
      bytes += 3;
    }
    if (bytes > MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES) return bytes;
  }
  return bytes;
}

function stringCharCodeAt(value: string, index: number): number {
  return APPLY(STRING_CHAR_CODE_AT, value, [index]) as number;
}

function boundedArrayLength(value: unknown, maximum: number): number | null {
  if (!ARRAY_IS_ARRAY(value)) return null;
  const length = ownDataValue(value, "length");
  return typeof length === "number" &&
    Number.isSafeInteger(length) &&
    length >= 0 &&
    length <= maximum
    ? length
    : null;
}

function exactDenseArrayLength(value: unknown, maximum: number): number | null {
  const length = boundedArrayLength(value, maximum);
  if (length === null || !ARRAY_IS_ARRAY(value)) return null;
  const keys = OWN_KEYS(value);
  if (keys.length !== length + 1 || !keys.includes("length")) return null;
  for (let index = 0; index < length; index += 1) {
    if (!keys.includes(String(index))) return null;
  }
  return length;
}

function ownArrayValue(value: unknown, index: number): unknown {
  return ownDataValue(value, String(index));
}

function ownDataValue(value: unknown, key: PropertyKey): unknown {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return undefined;
  }
  const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
  return typeof value === "object" && value !== null && !ARRAY_IS_ARRAY(value);
}

function hasExactOwnDataKeys(
  value: unknown,
  expected: readonly string[],
): boolean {
  if (!isRecord(value)) return false;
  const keys = OWN_KEYS(value);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== "string" || !expected.includes(key))
  ) {
    return false;
  }
  return expected.every((key) => {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    return descriptor !== undefined && "value" in descriptor;
  });
}

function isPropertyScalar(
  value: unknown,
): value is InlineFormatPropertyProjectionValue {
  return typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" &&
      Number.isSafeInteger(value) &&
      !Object.is(value, -0));
}

function isQualifiedName(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= MAX_QUALIFIED_NAME_ASCII &&
    QUALIFIED_NAME.test(value);
}

function readExactDataRecord(
  value: unknown,
  requiredKeys: readonly string[],
  description: string,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new TypeError(`${description} must be an object`);
  }
  const keys = ownKeys(value, description);
  if (
    keys.length !== requiredKeys.length ||
    keys.some((key) => typeof key !== "string" || !requiredKeys.includes(key)) ||
    requiredKeys.some((key) => !keys.includes(key))
  ) {
    throw new TypeError(`${description} has an invalid exact shape`);
  }
  const output: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const key of requiredKeys) {
    const descriptor = ownPropertyDescriptor(value, key, description);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(`${description} fields must be own data properties`);
    }
    output[key] = descriptor.value as unknown;
  }
  return output;
}

function ownKeys(value: object, description: string): readonly PropertyKey[] {
  try {
    return OWN_KEYS(value);
  } catch {
    throw new TypeError(`${description} could not be inspected`);
  }
}

function ownPropertyDescriptor(
  value: object,
  key: PropertyKey,
  description: string,
): PropertyDescriptor | undefined {
  try {
    return GET_OWN_PROPERTY_DESCRIPTOR(value, key);
  } catch {
    throw new TypeError(`${description} could not be inspected`);
  }
}
