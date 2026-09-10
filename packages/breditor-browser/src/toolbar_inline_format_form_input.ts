import { measureBoundedUnicodeText } from "./composition_event.js";
import { browserCommandJsonIsAdmissible } from "./editor_command.js";
import {
  MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS,
  MAX_TOOLBAR_INLINE_FORMAT_FORM_STRING_UTF8,
  MAX_TOOLBAR_QUALIFIED_NAME_ASCII,
  type ToolbarInlineFormatFormDeclaration,
} from "./toolbar_manifest.js";

/** Values captured from one typed inline-format form, keyed by property name. */
export type ToolbarInlineFormatFormValues = Readonly<Record<string, unknown>>;

/** Canonical typed input which removes the form's target inline format. */
export const TOOLBAR_INLINE_FORMAT_FORM_REMOVE_INPUT_JSON =
  '{"operation":"remove"}' as const;

const QUALIFIED_NAME = /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u;

const INVALID_INPUT = Object.freeze({});
const OUTSIDE_BOUNDS = Object.freeze({});
const OBJECT_PROTOTYPE = Object.prototype;
const arrayIsArray = Array.isArray;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const jsonStringify = JSON.stringify;
const numberIsSafeInteger = Number.isSafeInteger;

type SafeField =
  | Readonly<{
      kind: "string";
      propertyName: string;
      minimumUtf8Bytes: number;
      maximumUtf8Bytes: number;
    }>
  | Readonly<{ kind: "boolean"; propertyName: string }>;

/**
 * Creates compact canonical JSON for one declared typed inline-format form.
 *
 * The declaration is presentation data already admitted against a compiled
 * profile. Values cross a separate hostile boundary here: only an exact plain
 * own-data-property record is copied, strings are bounded before measurement,
 * and no submitted scalar is retained in a diagnostic. Rust remains
 * authoritative when the resulting input is executed.
 */
export function createToolbarInlineFormatFormSetInputJson(
  form: ToolbarInlineFormatFormDeclaration,
  values: ToolbarInlineFormatFormValues,
): string {
  try {
    return createSetInputJson(form, values);
  } catch (error: unknown) {
    if (error === OUTSIDE_BOUNDS) {
      throw new RangeError(
        "toolbar inline-format form input is outside its fixed bounds",
      );
    }
    throw new TypeError("toolbar inline-format form input is invalid");
  }
}

/** Returns the property-free canonical removal input. */
export function createToolbarInlineFormatFormRemoveInputJson(): string {
  return TOOLBAR_INLINE_FORMAT_FORM_REMOVE_INPUT_JSON;
}

function createSetInputJson(
  form: ToolbarInlineFormatFormDeclaration,
  values: ToolbarInlineFormatFormValues,
): string {
  const fields = snapshotFields(form);
  const supplied = snapshotValues(values, fields);
  const properties: string[] = [];

  fields.sort(compareFields);
  for (const field of fields) {
    const value = supplied.get(field.propertyName);
    if (field.kind === "boolean") {
      if (typeof value !== "boolean") invalid();
      properties.push(
        `{"name":${quote(field.propertyName)},"value":${value ? "true" : "false"}}`,
      );
      continue;
    }

    if (typeof value !== "string") invalid();
    // `presentation: "url"` is deliberately a single-line browser surface.
    // Reject values that an HTML text control cannot retain exactly.
    if (/\r|\n/u.test(value)) invalid();
    const measurement = measureBoundedUnicodeText(
      value,
      field.maximumUtf8Bytes,
      field.maximumUtf8Bytes,
    );
    if (!measurement.ok) {
      if (measurement.reason === "resourceLimit") outsideBounds();
      invalid();
    }
    if (measurement.utf8Length < field.minimumUtf8Bytes) outsideBounds();
    properties.push(
      `{"name":${quote(field.propertyName)},"value":${quote(value)}}`,
    );
  }

  const json = `{"operation":"set","properties":[${properties.join(",")}]}`;
  if (!browserCommandJsonIsAdmissible(json)) outsideBounds();
  return json;
}

function snapshotFields(form: unknown): SafeField[] {
  if (!isRecord(form)) invalid();
  if (ownDataProperty(form, "kind") !== "inlineFormatForm") invalid();
  const rawFields = ownDataProperty(form, "fields");
  if (!arrayIsArray(rawFields)) invalid();
  const length = ownDataProperty(rawFields, "length");
  if (
    typeof length !== "number" ||
    !numberIsSafeInteger(length) ||
    length < 1 ||
    length > MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS
  ) {
    invalid();
  }

  const seen = new Set<string>();
  const fields: SafeField[] = [];
  for (let index = 0; index < length; index += 1) {
    const rawField = ownDataProperty(rawFields, String(index));
    if (!isRecord(rawField)) invalid();
    const kind = ownDataProperty(rawField, "kind");
    const propertyName = ownDataProperty(rawField, "propertyName");
    if (!validQualifiedName(propertyName) || seen.has(propertyName)) invalid();
    seen.add(propertyName);

    if (kind === "boolean") {
      if (ownDataProperty(rawField, "defaultValue") !== false) invalid();
      fields.push(Object.freeze({ kind, propertyName }));
      continue;
    }
    if (kind !== "string" || ownDataProperty(rawField, "presentation") !== "url") {
      invalid();
    }
    const minimumUtf8Bytes = ownDataProperty(rawField, "minimumUtf8Bytes");
    const maximumUtf8Bytes = ownDataProperty(rawField, "maximumUtf8Bytes");
    if (
      typeof minimumUtf8Bytes !== "number" ||
      !numberIsSafeInteger(minimumUtf8Bytes) ||
      minimumUtf8Bytes < 1 ||
      typeof maximumUtf8Bytes !== "number" ||
      !numberIsSafeInteger(maximumUtf8Bytes) ||
      maximumUtf8Bytes < minimumUtf8Bytes ||
      maximumUtf8Bytes > MAX_TOOLBAR_INLINE_FORMAT_FORM_STRING_UTF8
    ) {
      invalid();
    }
    fields.push(
      Object.freeze({
        kind,
        propertyName,
        minimumUtf8Bytes,
        maximumUtf8Bytes,
      }),
    );
  }
  return fields;
}

function snapshotValues(
  values: unknown,
  fields: readonly SafeField[],
): ReadonlyMap<string, unknown> {
  if (!isPlainRecord(values)) invalid();
  const keys = ownKeys(values);
  if (keys.length !== fields.length) invalid();

  const expected = new Set(fields.map((field) => field.propertyName));
  const supplied = new Map<string, unknown>();
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key) || supplied.has(key)) {
      invalid();
    }
    supplied.set(key, ownDataProperty(values, key));
  }
  if (supplied.size !== expected.size) invalid();
  return supplied;
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !arrayIsArray(value);
}

function isPlainRecord(value: unknown): value is object {
  if (!isRecord(value)) return false;
  const prototype = getPrototypeOf(value);
  return prototype === OBJECT_PROTOTYPE || prototype === null;
}

function ownDataProperty(record: object, key: string): unknown {
  const descriptor = getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined || !("value" in descriptor)) invalid();
  return descriptor.value;
}

function validQualifiedName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_TOOLBAR_QUALIFIED_NAME_ASCII &&
    QUALIFIED_NAME.test(value)
  );
}

function compareFields(left: SafeField, right: SafeField): number {
  return left.propertyName < right.propertyName
    ? -1
    : left.propertyName > right.propertyName
      ? 1
      : 0;
}

function quote(value: string): string {
  const quoted = jsonStringify(value);
  if (quoted === undefined) invalid();
  return quoted;
}

function invalid(): never {
  throw INVALID_INPUT;
}

function outsideBounds(): never {
  throw OUTSIDE_BOUNDS;
}
