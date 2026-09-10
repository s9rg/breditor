import { measureBoundedUnicodeText } from "./composition_event.js";

/** Maximum options admitted by one bounded integer select field. */
export const MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_OPTIONS = 32;

/** Maximum UTF-16 length of one integer select option label. */
export const MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_LABEL_UTF16 = 128;

/** UTF-8 companion to the integer select option-label bound. */
export const MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_LABEL_UTF8 = 512;

/** One detached, validated option in an exhaustive integer select. @internal */
export interface ToolbarInlineFormatIntegerSelectOptionSnapshot {
  readonly value: number;
  readonly label: string;
}

/** Detached scalar and option data for one exhaustive integer select. @internal */
export interface ToolbarInlineFormatIntegerSelectSnapshot {
  readonly minimum: number;
  readonly maximum: number;
  readonly defaultValue: number;
  readonly options: readonly ToolbarInlineFormatIntegerSelectOptionSnapshot[];
}

const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const NUMBER_CONSTRUCTOR = Number;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const NUMBER_TO_STRING = Number.prototype.toString;
const OBJECT_IS = Object.is;
const REFLECT_APPLY = Reflect.apply;

/**
 * Copies and validates the hostile scalar boundary of one integer select.
 *
 * The options must exhaust one contiguous, explicitly bounded safe-integer
 * domain. Consequently every value admitted by the matching Rust property
 * contract has exactly one native presentation and no browser-only gap.
 *
 * @internal
 */
export function snapshotToolbarInlineFormatIntegerSelect(
  minimum: unknown,
  maximum: unknown,
  defaultValue: unknown,
  options: unknown,
): ToolbarInlineFormatIntegerSelectSnapshot {
  if (!isCanonicalSafeInteger(minimum) || !isCanonicalSafeInteger(maximum)) {
    throw new TypeError(
      "toolbar inline-format form integer select bounds are invalid",
    );
  }
  if (!ARRAY_IS_ARRAY(options)) {
    throw new TypeError(
      "toolbar inline-format form integer select options must be an array",
    );
  }
  const optionCount = ownDataValue(
    options,
    "length",
    "toolbar inline-format form integer select option count",
  );
  if (typeof optionCount !== "number" || !NUMBER_IS_SAFE_INTEGER(optionCount)) {
    throw new TypeError(
      "toolbar inline-format form integer select option count is invalid",
    );
  }
  if (
    optionCount < 1 ||
    optionCount > MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_OPTIONS
  ) {
    throw new RangeError(
      "toolbar inline-format form integer select option count is outside its fixed bounds",
    );
  }

  const safeOptions: ToolbarInlineFormatIntegerSelectOptionSnapshot[] = [];
  let expectedValue = minimum;
  for (let index = 0; index < optionCount; index += 1) {
    const rawOption = ownDataValue(
      options,
      String(index),
      `toolbar inline-format form integer select option ${index}`,
    );
    if (
      typeof rawOption !== "object" ||
      rawOption === null ||
      ARRAY_IS_ARRAY(rawOption)
    ) {
      throw new TypeError(
        "toolbar inline-format form integer select option must be an object",
      );
    }
    const value = ownDataValue(
      rawOption,
      "value",
      "toolbar inline-format form integer select option value",
    );
    const label = ownDataValue(
      rawOption,
      "label",
      "toolbar inline-format form integer select option label",
    );
    if (!isCanonicalSafeInteger(value) || value !== expectedValue) {
      throw new RangeError(
        "toolbar inline-format form integer select options must be sorted, unique, and contiguous",
      );
    }
    if (!isValidOptionLabel(label)) {
      throw new TypeError(
        "toolbar inline-format form integer select option label is invalid",
      );
    }
    safeOptions.push(Object.freeze({ value, label }));
    if (index + 1 < optionCount) {
      expectedValue += 1;
      if (!NUMBER_IS_SAFE_INTEGER(expectedValue)) {
        throw new RangeError(
          "toolbar inline-format form integer select options exceed the safe-integer domain",
        );
      }
    }
  }
  if (safeOptions[optionCount - 1]?.value !== maximum) {
    throw new RangeError(
      "toolbar inline-format form integer select options must exhaust their declared bounds",
    );
  }
  if (
    !isToolbarInlineFormatIntegerSelectValue(defaultValue, minimum, maximum)
  ) {
    throw new RangeError(
      "toolbar inline-format form integer select default is outside its declared bounds",
    );
  }

  return Object.freeze({
    minimum,
    maximum,
    defaultValue,
    options: Object.freeze(safeOptions),
  });
}

/** Whether a value is one canonical integer inside an explicit select domain. */
export function isToolbarInlineFormatIntegerSelectValue(
  value: unknown,
  minimum: unknown,
  maximum: unknown,
): value is number {
  return (
    isCanonicalSafeInteger(value) &&
    isCanonicalSafeInteger(minimum) &&
    isCanonicalSafeInteger(maximum) &&
    minimum <= maximum &&
    value >= minimum &&
    value <= maximum
  );
}

/** Encodes one select value as its canonical base-ten option value. @internal */
export function encodeToolbarInlineFormatIntegerSelectValue(
  value: unknown,
  minimum: unknown,
  maximum: unknown,
): string | null {
  return isToolbarInlineFormatIntegerSelectValue(value, minimum, maximum)
    ? (REFLECT_APPLY(NUMBER_TO_STRING, value, [10]) as string)
    : null;
}

/** Decodes only a canonical base-ten value inside the select domain. @internal */
export function decodeToolbarInlineFormatIntegerSelectValue(
  value: unknown,
  minimum: unknown,
  maximum: unknown,
): number | null {
  // A JavaScript-safe integer needs at most 17 ASCII characters including a
  // negative sign. Bound before numeric parsing so hostile text cannot turn a
  // tiny native-select contract into unbounded conversion work.
  if (typeof value !== "string" || value.length > 17) return null;
  const decoded = NUMBER_CONSTRUCTOR(value);
  if (
    !isToolbarInlineFormatIntegerSelectValue(decoded, minimum, maximum) ||
    REFLECT_APPLY(NUMBER_TO_STRING, decoded, [10]) !== value
  ) {
    return null;
  }
  return decoded;
}

function isCanonicalSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    NUMBER_IS_SAFE_INTEGER(value) &&
    !OBJECT_IS(value, -0)
  );
}

function isValidOptionLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    measureBoundedUnicodeText(
      value,
      MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_LABEL_UTF16,
      MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_LABEL_UTF8,
    ).ok &&
    value.trim().length > 0 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function ownDataValue(
  record: object,
  key: string,
  description: string,
): unknown {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = GET_OWN_PROPERTY_DESCRIPTOR(record, key);
  } catch {
    throw new TypeError(`${description} could not be inspected`);
  }
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new TypeError(`${description} must be an own data property`);
  }
  return descriptor.value;
}
