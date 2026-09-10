import { measureBoundedUnicodeText } from "./composition_event.js";
import type { ToolbarInlineFormatFormDeclaration } from "./toolbar_manifest.js";

/** Action-state value contract understood by the alpha.8 inline-format form. */
export const TOOLBAR_INLINE_FORMAT_FORM_STATE_VALUE_CONTRACT_NAME =
  "breditor/set-inline-format-input" as const;

/** Independently versioned output contract consumed by the form hydrator. */
export const TOOLBAR_INLINE_FORMAT_FORM_STATE_VALUE_CONTRACT_VERSION = 1 as const;

export type ToolbarInlineFormatFormHydratedField = Readonly<{
  name: string;
  value: string | boolean;
}>;

/** Safe, detached form seed decoded from one authoritative action-state value. */
export type ToolbarInlineFormatFormStateSeed =
  | Readonly<{ status: "unset" | "mixed" }>
  | Readonly<{
      status: "uniform";
      fields: readonly ToolbarInlineFormatFormHydratedField[];
    }>;

const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_PROTOTYPE = Array.prototype;
const arrayIsArray = Array.isArray;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const numberIsSafeInteger = Number.isSafeInteger;
const ownKeys = Reflect.ownKeys;

type SafeField =
  | Readonly<{
      kind: "string";
      propertyName: string;
      minimumUtf8Bytes: number;
      maximumUtf8Bytes: number;
    }>
  | Readonly<{ kind: "boolean"; propertyName: string }>;

/**
 * Decodes the exact versioned Rust state-value contract without retaining any
 * application-owned container. Malformed, accessor-backed, incomplete, or
 * out-of-contract values fail closed as `null` and are never written to DOM.
 */
export function decodeToolbarInlineFormatFormStateValue(
  form: ToolbarInlineFormatFormDeclaration,
  value: unknown,
): ToolbarInlineFormatFormStateSeed | null {
  try {
    const fields = snapshotFields(form);
    const state = exactRecord(value, ["status", "contract"], ["value"]);
    const status = ownData(state, "status");
    if (status !== "unset" && status !== "uniform" && status !== "mixed") {
      return null;
    }
    if (!validContract(ownData(state, "contract"))) return null;

    if (status === "unset" || status === "mixed") {
      if (hasOwnData(state, "value")) return null;
      return Object.freeze({ status });
    }
    if (!hasOwnData(state, "value")) return null;

    const input = exactRecord(ownData(state, "value"), [
      "operation",
      "properties",
    ]);
    if (ownData(input, "operation") !== "set") return null;
    const properties = ownData(input, "properties");
    if (
      !arrayIsArray(properties) ||
      getPrototypeOf(properties) !== ARRAY_PROTOTYPE
    ) {
      return null;
    }
    const length = ownData(properties, "length");
    if (
      typeof length !== "number" ||
      !numberIsSafeInteger(length) ||
      length !== fields.length ||
      !hasExactArrayKeys(properties, length)
    ) {
      return null;
    }

    const expected = [...fields].sort((left, right) => {
      if (left.propertyName < right.propertyName) return -1;
      if (left.propertyName > right.propertyName) return 1;
      return 0;
    });
    const hydrated: ToolbarInlineFormatFormHydratedField[] = [];
    for (let index = 0; index < length; index += 1) {
      const property = exactRecord(ownData(properties, String(index)), [
        "name",
        "value",
      ]);
      const field = expected[index];
      const name = ownData(property, "name");
      const propertyValue = ownData(property, "value");
      if (field === undefined || name !== field.propertyName) return null;
      if (field.kind === "boolean") {
        if (typeof propertyValue !== "boolean") return null;
      } else {
        if (typeof propertyValue !== "string") return null;
        // Single-line HTML inputs must strip CR/LF from their value. Reject
        // such a seed instead of displaying and later submitting a different
        // scalar than Rust owns.
        if (/\r|\n/u.test(propertyValue)) return null;
        const measurement = measureBoundedUnicodeText(
          propertyValue,
          field.maximumUtf8Bytes,
          field.maximumUtf8Bytes,
        );
        if (
          !measurement.ok ||
          measurement.utf8Length < field.minimumUtf8Bytes
        ) {
          return null;
        }
      }
      hydrated.push(Object.freeze({ name, value: propertyValue }));
    }
    return Object.freeze({ status, fields: Object.freeze(hydrated) });
  } catch {
    return null;
  }
}

function snapshotFields(form: ToolbarInlineFormatFormDeclaration): SafeField[] {
  const result: SafeField[] = [];
  for (const field of form.fields) {
    if (field.kind === "boolean") {
      result.push(
        Object.freeze({
          kind: field.kind,
          propertyName: field.propertyName,
        }),
      );
    } else {
      result.push(
        Object.freeze({
          kind: field.kind,
          propertyName: field.propertyName,
          minimumUtf8Bytes: field.minimumUtf8Bytes,
          maximumUtf8Bytes: field.maximumUtf8Bytes,
        }),
      );
    }
  }
  return result;
}

function validContract(value: unknown): boolean {
  const contract = exactRecord(value, ["name", "version"]);
  return (
    ownData(contract, "name") ===
      TOOLBAR_INLINE_FORMAT_FORM_STATE_VALUE_CONTRACT_NAME &&
    ownData(contract, "version") ===
      TOOLBAR_INLINE_FORMAT_FORM_STATE_VALUE_CONTRACT_VERSION
  );
}

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): object {
  if (
    typeof value !== "object" ||
    value === null ||
    arrayIsArray(value) ||
    (getPrototypeOf(value) !== OBJECT_PROTOTYPE && getPrototypeOf(value) !== null)
  ) {
    throw new TypeError("invalid record");
  }
  const keys = ownKeys(value);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        (!required.includes(key) && !optional.includes(key)),
    ) ||
    required.some((key) => !hasOwnData(value, key)) ||
    keys.length < required.length ||
    keys.length > required.length + optional.length
  ) {
    throw new TypeError("invalid record shape");
  }
  for (const key of keys) ownData(value, key as string);
  return value;
}

function hasOwnData(value: object, key: string): boolean {
  const descriptor = getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor;
}

function ownData(value: object, key: string): unknown {
  const descriptor = getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new TypeError("missing own data property");
  }
  return descriptor.value;
}

function hasExactArrayKeys(value: readonly unknown[], length: number): boolean {
  const keys = ownKeys(value);
  if (keys.length !== length + 1 || !keys.includes("length")) return false;
  for (let index = 0; index < length; index += 1) {
    if (!keys.includes(String(index)) || !hasOwnData(value, String(index))) {
      return false;
    }
  }
  return keys.every(
    (key) =>
      key === "length" ||
      (typeof key === "string" &&
        Number.isSafeInteger(Number(key)) &&
        String(Number(key)) === key &&
        Number(key) >= 0 &&
        Number(key) < length),
  );
}
