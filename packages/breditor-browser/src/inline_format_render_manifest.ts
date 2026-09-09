import { MAX_BROWSER_PROFILE_FORMATS } from "./wasm_profile_descriptor.js";
import {
  createInlineFormatRenderAttributePolicy,
  type InlineFormatRenderAttributePolicy,
} from "./inline_format_render_attributes.js";

/**
 * Maximum recipes in one browser presentation.
 *
 * This intentionally equals the Rust schema compiler's aggregate format limit:
 * every admitted format requires exactly one browser recipe.
 */
export const MAX_INLINE_FORMAT_RENDER_RECIPES = MAX_BROWSER_PROFILE_FORMATS;

/** Maximum canonical CSS class tokens retained by one recipe. */
export const MAX_INLINE_FORMAT_RENDER_CLASSES_PER_RECIPE = 8;

/** Maximum lowercase-ASCII characters retained by one CSS class token. */
export const MAX_INLINE_FORMAT_RENDER_CLASS_TOKEN_ASCII = 64;

/**
 * Maximum `before` plus `after` declarations retained by one recipe.
 *
 * The bound matches the maximum number of vertices in the render-order graph.
 */
export const MAX_INLINE_FORMAT_RENDER_ORDER_REFERENCES_PER_RECIPE =
  MAX_BROWSER_PROFILE_FORMATS;

/** Maximum declared ordering references across one complete manifest. */
export const MAX_INLINE_FORMAT_RENDER_ORDER_REFERENCES = 4_096;

/** Maximum lowercase-ASCII length of one format qualified name. */
export const MAX_INLINE_FORMAT_RENDER_FORMAT_KIND_ASCII = 128;

/** Closed element vocabulary allowed in editing and clipboard projections. */
export const INLINE_FORMAT_RENDER_ELEMENTS = Object.freeze([
  "a",
  "code",
  "em",
  "mark",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
] as const);

/** One inert inline HTML element from the closed browser vocabulary. */
export type InlineFormatRenderElement =
  (typeof INLINE_FORMAT_RENDER_ELEMENTS)[number];

/**
 * Canonical callback-free rendering recipe for one semantic format.
 *
 * `before` means ancestor/outer to the named format; `after` means
 * descendant/inner. The arrays are lexical sets, not registration order.
 */
export interface InlineFormatRenderRecipe {
  readonly formatKind: string;
  readonly element: InlineFormatRenderElement;
  readonly classes: readonly string[];
  readonly before: readonly string[];
  readonly after: readonly string[];
  readonly attributes?: InlineFormatRenderAttributePolicy;
}

/** Complete immutable browser render declaration. */
export interface InlineFormatRenderManifest {
  readonly recipes: readonly InlineFormatRenderRecipe[];
}

const OWNED_MANIFESTS = new WeakSet<object>();
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const OWN_KEYS = Reflect.ownKeys;
const HAS_OWN = Object.hasOwn;
const SAFE_ELEMENTS = new Set<string>(INLINE_FORMAT_RENDER_ELEMENTS);
const QUALIFIED_NAME = /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u;
const CLASS_TOKEN = /^[a-z][a-z0-9_-]*$/u;

/**
 * Copies an application value into the exact inert render-manifest schema.
 *
 * The input object may contain only `recipes`. A recipe may contain only
 * `formatKind`, `element`, and the optional `classes`, `before`, `after`, and
 * closed `attributes` declaration. Every retained field and dense array
 * element must be an own data property. Consequently accessors, symbols,
 * callbacks, DOM objects, HTML strings, and hidden extension state cannot
 * cross this boundary.
 *
 * Recipes and every set-like child array are sorted lexically before the
 * complete copied graph is frozen. Graph target coverage and acyclicity are
 * checked later against an exact compiled semantic profile.
 */
export function createInlineFormatRenderManifest(
  value: unknown,
): InlineFormatRenderManifest {
  const manifest = readExactDataRecord(
    value,
    ["recipes"],
    [],
    "inline-format render manifest",
  );
  const rawRecipes = readDenseArray(
    manifest["recipes"],
    MAX_INLINE_FORMAT_RENDER_RECIPES,
    "inline-format render recipes",
  );
  if (rawRecipes.length === 0) {
    throw new RangeError("inline-format render manifest must contain a recipe");
  }

  let orderReferenceCount = 0;
  const seenKinds = new Set<string>();
  const recipes: InlineFormatRenderRecipe[] = [];
  for (let index = 0; index < rawRecipes.length; index += 1) {
    const record = readExactDataRecord(
      rawRecipes[index],
      ["formatKind", "element"],
      ["classes", "before", "after", "attributes"],
      `inline-format render recipe ${index}`,
    );
    const formatKind = record["formatKind"];
    const element = record["element"];
    if (!validFormatKind(formatKind)) {
      throw new TypeError("inline-format render recipe kind is invalid");
    }
    if (seenKinds.has(formatKind)) {
      throw new TypeError("inline-format render recipe kind is duplicated");
    }
    if (typeof element !== "string" || !SAFE_ELEMENTS.has(element)) {
      throw new TypeError("inline-format render recipe element is invalid");
    }

    const classes = readOptionalCanonicalStringSet(
      record,
      "classes",
      MAX_INLINE_FORMAT_RENDER_CLASSES_PER_RECIPE,
      validClassToken,
      "inline-format render recipe classes",
    );
    const attributes = HAS_OWN(record, "attributes")
      ? createInlineFormatRenderAttributePolicy(record["attributes"])
      : undefined;
    if (element === "a") {
      if (
        attributes === undefined ||
        classes.length !== 1 ||
        classes[0] !== "breditor-link"
      ) {
        throw new TypeError(
          "inline-format link recipe requires safeLinkV1 attributes and the canonical class",
        );
      }
    } else if (attributes !== undefined) {
      throw new TypeError(
        "inline-format render attributes are allowed only on link recipes",
      );
    }
    const before = readOptionalCanonicalStringSet(
      record,
      "before",
      MAX_INLINE_FORMAT_RENDER_ORDER_REFERENCES_PER_RECIPE,
      validFormatKind,
      "inline-format render recipe before references",
    );
    const after = readOptionalCanonicalStringSet(
      record,
      "after",
      MAX_INLINE_FORMAT_RENDER_ORDER_REFERENCES_PER_RECIPE,
      validFormatKind,
      "inline-format render recipe after references",
    );
    if (before.includes(formatKind) || after.includes(formatKind)) {
      throw new TypeError("inline-format render recipe cannot order itself");
    }
    orderReferenceCount += before.length + after.length;
    if (
      orderReferenceCount > MAX_INLINE_FORMAT_RENDER_ORDER_REFERENCES
    ) {
      throw new RangeError(
        "inline-format render order exceeds its aggregate bound",
      );
    }

    seenKinds.add(formatKind);
    recipes.push(
      Object.freeze(
        attributes === undefined
          ? {
            formatKind,
            element: element as InlineFormatRenderElement,
            classes,
            before,
            after,
          }
          : {
            formatKind,
            element: element as InlineFormatRenderElement,
            classes,
            before,
            after,
            attributes,
          },
      ),
    );
  }

  recipes.sort(compareRecipesByKind);
  const safeManifest: InlineFormatRenderManifest = Object.freeze({
    recipes: Object.freeze(recipes),
  });
  OWNED_MANIFESTS.add(safeManifest);
  return safeManifest;
}

/** Whether a value was copied and frozen by this exact-schema boundary. */
export function isOwnedInlineFormatRenderManifest(
  value: unknown,
): value is InlineFormatRenderManifest {
  try {
    return typeof value === "object" && value !== null && OWNED_MANIFESTS.has(value);
  } catch {
    return false;
  }
}

/** Canonical built-in rendering for the mandatory base strong format. */
export const DEFAULT_INLINE_FORMAT_RENDER_MANIFEST: InlineFormatRenderManifest =
  createInlineFormatRenderManifest({
    recipes: [
      {
        formatKind: "breditor/strong",
        element: "strong",
      },
    ],
  });

function readOptionalCanonicalStringSet(
  record: Readonly<Record<string, unknown>>,
  key: string,
  maximum: number,
  predicate: (candidate: unknown) => candidate is string,
  description: string,
): readonly string[] {
  if (!HAS_OWN(record, key)) return Object.freeze([]);
  const raw = readDenseArray(record[key], maximum, description);
  const seen = new Set<string>();
  const safe: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const candidate = raw[index];
    if (!predicate(candidate)) {
      throw new TypeError(`${description} contain an invalid value`);
    }
    if (seen.has(candidate)) {
      throw new TypeError(`${description} contain a duplicate value`);
    }
    seen.add(candidate);
    safe.push(candidate);
  }
  safe.sort();
  return Object.freeze(safe);
}

function readDenseArray(
  value: unknown,
  maximum: number,
  description: string,
): readonly unknown[] {
  let array = false;
  try {
    array = ARRAY_IS_ARRAY(value);
  } catch {
    throw new TypeError(`${description} must be an array`);
  }
  if (!array) throw new TypeError(`${description} must be an array`);

  const source = value as unknown[];
  const lengthDescriptor = ownPropertyDescriptor(source, "length", description);
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    throw new TypeError(`${description} length is invalid`);
  }
  const length = lengthDescriptor.value;
  if (length > maximum) {
    throw new RangeError(`${description} exceed their fixed bound`);
  }

  const keys = ownKeys(source, description);
  if (keys.length !== length + 1 || !keys.includes("length")) {
    throw new TypeError(`${description} must be a dense exact array`);
  }
  const safe: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (!keys.includes(key)) {
      throw new TypeError(`${description} must be a dense exact array`);
    }
    const descriptor = ownPropertyDescriptor(source, key, description);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(`${description} values must be own data properties`);
    }
    safe.push(descriptor.value as unknown);
  }
  return safe;
}

function readExactDataRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  description: string,
): Readonly<Record<string, unknown>> {
  let array = false;
  try {
    array = ARRAY_IS_ARRAY(value);
  } catch {
    throw new TypeError(`${description} must be an object`);
  }
  if (typeof value !== "object" || value === null || array) {
    throw new TypeError(`${description} must be an object`);
  }
  const keys = ownKeys(value, description);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    requiredKeys.some((key) => !keys.includes(key))
  ) {
    throw new TypeError(`${description} has an invalid exact shape`);
  }

  const output: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const key of keys) {
    if (typeof key !== "string") {
      throw new TypeError(`${description} has an invalid exact shape`);
    }
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

function validFormatKind(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= MAX_INLINE_FORMAT_RENDER_FORMAT_KIND_ASCII &&
    QUALIFIED_NAME.test(value);
}

function validClassToken(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= MAX_INLINE_FORMAT_RENDER_CLASS_TOKEN_ASCII &&
    CLASS_TOKEN.test(value);
}

function compareRecipesByKind(
  left: InlineFormatRenderRecipe,
  right: InlineFormatRenderRecipe,
): number {
  return left.formatKind < right.formatKind
    ? -1
    : left.formatKind > right.formatKind
      ? 1
      : 0;
}
