import { measureBoundedUnicodeText } from "./composition_event.js";
import {
  BASE_INTENT_IDS,
  browserCommandTextIsAdmissible,
} from "./editor_command.js";

/** Minimum controls admitted by one presentation manifest. */
export const MIN_TOOLBAR_CONTROLS = 1;

/** Maximum controls admitted by one presentation manifest. */
export const MAX_TOOLBAR_CONTROLS = 64;

/** Maximum UTF-16 length of the toolbar's accessible name. */
export const MAX_TOOLBAR_LABEL_UTF16 = 128;

/** UTF-8 companion to {@link MAX_TOOLBAR_LABEL_UTF16}. */
export const MAX_TOOLBAR_LABEL_UTF8 = 512;

/** Maximum UTF-16 length of one optional presentation group. */
export const MAX_TOOLBAR_GROUP_UTF16 = 64;

/** Maximum UTF-8 length of one optional presentation group. */
export const MAX_TOOLBAR_GROUP_UTF8 = 256;

/** Maximum ASCII length of a toolbar state or action qualified name. */
export const MAX_TOOLBAR_QUALIFIED_NAME_ASCII = 128;

/** Minimum fields admitted by one inline-format form control. */
export const MIN_TOOLBAR_INLINE_FORMAT_FORM_FIELDS = 1;

/** Maximum fields admitted by one inline-format form control. */
export const MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS = 32;

/** Maximum fields admitted across all inline-format forms in one manifest. */
export const MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS_TOTAL = 64;

/** Maximum UTF-8 ceiling admitted by one single-line URL-presented string field. */
export const MAX_TOOLBAR_INLINE_FORMAT_FORM_STRING_UTF8 = 65_536;

/** Fixed observable identities used by the base toolbar/action-state catalog. */
export const BASE_TOOLBAR_STATE_IDS = Object.freeze({
  bold: "breditor/control-bold",
  clearInlineFormatting: "breditor/control-clear-inline-formatting",
  undo: "breditor/control-undo",
  redo: "breditor/control-redo",
} as const);

/** A callback-free semantic command described by a toolbar control. */
export type ToolbarCommandDeclaration =
  | Readonly<{ kind: "intent"; intentId: string }>
  | Readonly<{
      kind: "action";
      actionId: string;
      input:
        | Readonly<{ kind: "none" }>
        | Readonly<{ kind: "string"; value: string }>;
      history: "preserve" | "closeBefore";
    }>
  | Readonly<{ kind: "history"; operation: "undo" | "redo" }>;

/** One native-button presentation bound to an observable action-state entry. */
export interface ToolbarButtonDeclaration {
  readonly kind: "button";
  /** Unique `ActionStateId` used for both presentation identity and state lookup. */
  readonly stateId: string;
  /** Visible text and accessible name. */
  readonly label: string;
  /** Whether the action-state activation contract drives `aria-pressed`. */
  readonly activation: "stateless" | "tracked";
  /** Optional non-semantic host grouping key. */
  readonly group?: string;
  readonly command: ToolbarCommandDeclaration;
}

/** Required single-line URL-presented string property collected by a form. */
export interface ToolbarInlineFormatFormStringFieldDeclaration {
  readonly kind: "string";
  readonly propertyName: string;
  readonly label: string;
  readonly presentation: "url";
  readonly autocomplete: "url" | "off";
  readonly minimumUtf8Bytes: number;
  readonly maximumUtf8Bytes: number;
  readonly placeholder?: string;
}

/** Required Boolean property collected by an inline-format form. */
export interface ToolbarInlineFormatFormBooleanFieldDeclaration {
  readonly kind: "boolean";
  readonly propertyName: string;
  readonly label: string;
  readonly defaultValue: false;
}

/** Closed field vocabulary supported by the alpha.7 inline-format form. */
export type ToolbarInlineFormatFormFieldDeclaration =
  | ToolbarInlineFormatFormStringFieldDeclaration
  | ToolbarInlineFormatFormBooleanFieldDeclaration;

/** Callback-free, runtime-rendered form for one property-aware inline format. */
export interface ToolbarInlineFormatFormDeclaration {
  readonly kind: "inlineFormatForm";
  /** Unique `ActionStateId` used for both presentation identity and state lookup. */
  readonly stateId: string;
  /** Visible launcher text and accessible name. */
  readonly label: string;
  /** Optional non-semantic host grouping key. */
  readonly group?: string;
  readonly formatKind: string;
  readonly intentId: string;
  readonly fields: readonly ToolbarInlineFormatFormFieldDeclaration[];
  readonly applyLabel: string;
  readonly removeLabel: string;
  readonly closeLabel: string;
}

/** One closed runtime-rendered toolbar control declaration. */
export type ToolbarControlDeclaration =
  | ToolbarButtonDeclaration
  | ToolbarInlineFormatFormDeclaration;

/** Immutable, bounded toolbar presentation data with no executable members. */
export interface ToolbarManifest {
  readonly label: string;
  readonly controls: readonly ToolbarControlDeclaration[];
}

const OWNED_MANIFESTS = new WeakSet<object>();
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;

/**
 * Copies and validates a toolbar manifest across the application boundary.
 *
 * Only the closed primitive schema is retained. Extra properties, including
 * callbacks, DOM nodes, and mutable plugin objects, are deliberately dropped.
 * The returned object, arrays, controls, commands, inputs, and form fields are
 * frozen.
 */
export function createToolbarManifest(value: unknown): ToolbarManifest {
  const manifest = snapshotRecord(value, "toolbar manifest");
  const label = requiredOwnDataProperty(manifest, "label", "toolbar label");
  const controls = requiredOwnDataProperty(
    manifest,
    "controls",
    "toolbar controls",
  );
  if (!validLabel(label)) {
    throw new TypeError("toolbar label is invalid");
  }
  if (!arrayIsArray(controls)) {
    throw new TypeError("toolbar controls must be an array");
  }
  const rawControlCount = requiredOwnDataProperty(
    controls,
    "length",
    "toolbar control count",
  );
  if (
    typeof rawControlCount !== "number" ||
    !numberIsSafeInteger(rawControlCount)
  ) {
    throw new TypeError("toolbar control count is invalid");
  }
  const controlCount = rawControlCount;
  if (
    controlCount < MIN_TOOLBAR_CONTROLS ||
    controlCount > MAX_TOOLBAR_CONTROLS
  ) {
    throw new RangeError("toolbar control count is outside its fixed bounds");
  }

  const seenStateIds = new Set<string>();
  const safeControls: ToolbarControlDeclaration[] = [];
  let inlineFormatFormFieldCount = 0;
  for (let index = 0; index < controlCount; index += 1) {
    const rawControl = requiredOwnDataProperty(
      controls,
      String(index),
      `toolbar control ${index}`,
    );
    const control = snapshotRecord(rawControl, "toolbar control");
    const kind = requiredOwnDataProperty(
      control,
      "kind",
      "toolbar control kind",
    );
    const stateId = requiredOwnDataProperty(
      control,
      "stateId",
      "toolbar state identity",
    );
    const controlLabel = requiredOwnDataProperty(
      control,
      "label",
      "toolbar control label",
    );
    const group = optionalOwnDataProperty(
      control,
      "group",
      "toolbar presentation group",
    );
    if (!validQualifiedName(stateId)) {
      throw new TypeError("toolbar state identity is invalid");
    }
    if (seenStateIds.has(stateId)) {
      throw new TypeError("toolbar state identity is duplicated");
    }
    if (!validLabel(controlLabel)) {
      throw new TypeError("toolbar control label is invalid");
    }
    if (
      group !== undefined &&
      !validPresentationString(
        group,
        MAX_TOOLBAR_GROUP_UTF16,
        MAX_TOOLBAR_GROUP_UTF8,
      )
    ) {
      throw new TypeError("toolbar presentation group is invalid");
    }

    if (kind === "inlineFormatForm") {
      const safeForm = snapshotInlineFormatForm(
        control,
        stateId,
        controlLabel,
        group,
      );
      inlineFormatFormFieldCount += safeForm.fields.length;
      if (
        inlineFormatFormFieldCount >
        MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS_TOTAL
      ) {
        throw new RangeError(
          "toolbar inline-format form field count is outside its fixed aggregate bound",
        );
      }
      seenStateIds.add(stateId);
      safeControls.push(safeForm);
      continue;
    }
    if (kind !== "button") {
      throw new TypeError("toolbar control kind is invalid");
    }
    const activation = requiredOwnDataProperty(
      control,
      "activation",
      "toolbar activation presentation",
    );
    const command = requiredOwnDataProperty(
      control,
      "command",
      "toolbar command",
    );
    if (activation !== "stateless" && activation !== "tracked") {
      throw new TypeError("toolbar activation presentation is invalid");
    }
    const safeCommand = snapshotCommand(command);
    seenStateIds.add(stateId);
    safeControls.push(
      Object.freeze({
        kind: "button",
        stateId,
        label: controlLabel,
        activation,
        ...(group === undefined ? {} : { group }),
        command: safeCommand,
      }),
    );
  }

  const safeManifest: ToolbarManifest = Object.freeze({
    label,
    controls: Object.freeze(safeControls),
  });
  OWNED_MANIFESTS.add(safeManifest);
  return safeManifest;
}

function snapshotInlineFormatForm(
  control: object,
  stateId: string,
  label: string,
  group: unknown,
): ToolbarInlineFormatFormDeclaration {
  const formatKind = requiredOwnDataProperty(
    control,
    "formatKind",
    "toolbar inline-format form format identity",
  );
  const intentId = requiredOwnDataProperty(
    control,
    "intentId",
    "toolbar inline-format form intent identity",
  );
  const fields = requiredOwnDataProperty(
    control,
    "fields",
    "toolbar inline-format form fields",
  );
  const applyLabel = requiredOwnDataProperty(
    control,
    "applyLabel",
    "toolbar inline-format form apply label",
  );
  const removeLabel = requiredOwnDataProperty(
    control,
    "removeLabel",
    "toolbar inline-format form remove label",
  );
  const closeLabel = requiredOwnDataProperty(
    control,
    "closeLabel",
    "toolbar inline-format form close label",
  );
  if (!validQualifiedName(formatKind)) {
    throw new TypeError("toolbar inline-format form format identity is invalid");
  }
  if (!validQualifiedName(intentId)) {
    throw new TypeError("toolbar inline-format form intent identity is invalid");
  }
  if (
    !validLabel(applyLabel) ||
    !validLabel(removeLabel) ||
    !validLabel(closeLabel)
  ) {
    throw new TypeError("toolbar inline-format form action label is invalid");
  }
  if (!arrayIsArray(fields)) {
    throw new TypeError("toolbar inline-format form fields must be an array");
  }
  const rawFieldCount = requiredOwnDataProperty(
    fields,
    "length",
    "toolbar inline-format form field count",
  );
  if (
    typeof rawFieldCount !== "number" ||
    !numberIsSafeInteger(rawFieldCount)
  ) {
    throw new TypeError("toolbar inline-format form field count is invalid");
  }
  if (
    rawFieldCount < MIN_TOOLBAR_INLINE_FORMAT_FORM_FIELDS ||
    rawFieldCount > MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS
  ) {
    throw new RangeError(
      "toolbar inline-format form field count is outside its fixed bounds",
    );
  }

  const safeFields: ToolbarInlineFormatFormFieldDeclaration[] = [];
  const seenPropertyNames = new Set<string>();
  let hasUrlField = false;
  for (let index = 0; index < rawFieldCount; index += 1) {
    const field = snapshotInlineFormatFormField(
      requiredOwnDataProperty(
        fields,
        String(index),
        `toolbar inline-format form field ${index}`,
      ),
    );
    if (seenPropertyNames.has(field.propertyName)) {
      throw new TypeError(
        "toolbar inline-format form property identity is duplicated",
      );
    }
    seenPropertyNames.add(field.propertyName);
    if (field.kind === "string") hasUrlField = true;
    safeFields.push(field);
  }
  if (!hasUrlField) {
    throw new TypeError(
      "toolbar inline-format form requires a URL-presented string field",
    );
  }

  return Object.freeze({
    kind: "inlineFormatForm",
    stateId,
    label,
    ...(group === undefined ? {} : { group: group as string }),
    formatKind,
    intentId,
    fields: Object.freeze(safeFields),
    applyLabel,
    removeLabel,
    closeLabel,
  });
}

function snapshotInlineFormatFormField(
  value: unknown,
): ToolbarInlineFormatFormFieldDeclaration {
  const field = snapshotRecord(value, "toolbar inline-format form field");
  const kind = requiredOwnDataProperty(
    field,
    "kind",
    "toolbar inline-format form field kind",
  );
  const propertyName = requiredOwnDataProperty(
    field,
    "propertyName",
    "toolbar inline-format form property identity",
  );
  const label = requiredOwnDataProperty(
    field,
    "label",
    "toolbar inline-format form field label",
  );
  if (!validQualifiedName(propertyName)) {
    throw new TypeError("toolbar inline-format form property identity is invalid");
  }
  if (!validLabel(label)) {
    throw new TypeError("toolbar inline-format form field label is invalid");
  }

  if (kind === "boolean") {
    const defaultValue = requiredOwnDataProperty(
      field,
      "defaultValue",
      "toolbar inline-format form Boolean default",
    );
    if (defaultValue !== false) {
      throw new TypeError("toolbar inline-format form Boolean default is invalid");
    }
    return Object.freeze({ kind, propertyName, label, defaultValue });
  }
  if (kind !== "string") {
    throw new TypeError("toolbar inline-format form field kind is invalid");
  }
  const presentation = requiredOwnDataProperty(
    field,
    "presentation",
    "toolbar inline-format form string presentation",
  );
  const autocomplete = requiredOwnDataProperty(
    field,
    "autocomplete",
    "toolbar inline-format form string autocomplete",
  );
  const minimumUtf8Bytes = requiredOwnDataProperty(
    field,
    "minimumUtf8Bytes",
    "toolbar inline-format form string minimum",
  );
  const maximumUtf8Bytes = requiredOwnDataProperty(
    field,
    "maximumUtf8Bytes",
    "toolbar inline-format form string maximum",
  );
  const placeholder = optionalOwnDataProperty(
    field,
    "placeholder",
    "toolbar inline-format form string placeholder",
  );
  if (presentation !== "url") {
    throw new TypeError("toolbar inline-format form string presentation is invalid");
  }
  if (autocomplete !== "url" && autocomplete !== "off") {
    throw new TypeError("toolbar inline-format form string autocomplete is invalid");
  }
  if (
    typeof minimumUtf8Bytes !== "number" ||
    !numberIsSafeInteger(minimumUtf8Bytes) ||
    minimumUtf8Bytes < 1 ||
    typeof maximumUtf8Bytes !== "number" ||
    !numberIsSafeInteger(maximumUtf8Bytes) ||
    maximumUtf8Bytes < minimumUtf8Bytes ||
    maximumUtf8Bytes > MAX_TOOLBAR_INLINE_FORMAT_FORM_STRING_UTF8
  ) {
    throw new RangeError(
      "toolbar inline-format form string bounds are outside their fixed limits",
    );
  }
  if (placeholder !== undefined && !validLabel(placeholder)) {
    throw new TypeError("toolbar inline-format form string placeholder is invalid");
  }
  return Object.freeze({
    kind,
    propertyName,
    label,
    presentation,
    autocomplete,
    minimumUtf8Bytes,
    maximumUtf8Bytes,
    ...(placeholder === undefined ? {} : { placeholder }),
  });
}

/** Returns whether a value is a manifest produced by this module. */
export function isOwnedToolbarManifest(value: unknown): value is ToolbarManifest {
  try {
    return typeof value === "object" && value !== null && OWNED_MANIFESTS.has(value);
  } catch {
    return false;
  }
}

/** Base Bold/Undo/Redo presentation. Hosts may supply another validated manifest. */
export const DEFAULT_TOOLBAR_MANIFEST: ToolbarManifest = createToolbarManifest({
  label: "Editor controls",
  controls: [
    {
      kind: "button",
      stateId: BASE_TOOLBAR_STATE_IDS.bold,
      label: "Bold",
      activation: "tracked",
      command: {
        kind: "intent",
        intentId: BASE_INTENT_IDS.formatStrong,
      },
    },
    {
      kind: "button",
      stateId: BASE_TOOLBAR_STATE_IDS.undo,
      label: "Undo",
      activation: "stateless",
      command: { kind: "history", operation: "undo" },
    },
    {
      kind: "button",
      stateId: BASE_TOOLBAR_STATE_IDS.redo,
      label: "Redo",
      activation: "stateless",
      command: { kind: "history", operation: "redo" },
    },
  ],
});

function snapshotCommand(value: unknown): ToolbarCommandDeclaration {
  const command = snapshotRecord(value, "toolbar command");
  const kind = requiredOwnDataProperty(command, "kind", "toolbar command kind");
  if (kind === "history") {
    const operation = requiredOwnDataProperty(
      command,
      "operation",
      "toolbar history operation",
    );
    if (operation !== "undo" && operation !== "redo") {
      throw new TypeError("toolbar history operation is invalid");
    }
    return Object.freeze({ kind, operation });
  }
  if (kind === "intent") {
    const intentId = requiredOwnDataProperty(
      command,
      "intentId",
      "toolbar intent identity",
    );
    if (!validQualifiedName(intentId)) {
      throw new TypeError("toolbar intent identity is invalid");
    }
    return Object.freeze({ kind, intentId });
  }
  if (kind !== "action") {
    throw new TypeError("toolbar command kind is invalid");
  }

  const actionId = requiredOwnDataProperty(
    command,
    "actionId",
    "toolbar action identity",
  );
  const history = requiredOwnDataProperty(
    command,
    "history",
    "toolbar action history policy",
  );
  if (!validQualifiedName(actionId)) {
    throw new TypeError("toolbar action identity is invalid");
  }
  if (history !== "preserve" && history !== "closeBefore") {
    throw new TypeError("toolbar action history policy is invalid");
  }
  const inputRecord = snapshotRecord(
    requiredOwnDataProperty(command, "input", "toolbar action input"),
    "toolbar action input",
  );
  const inputKind = requiredOwnDataProperty(
    inputRecord,
    "kind",
    "toolbar action input kind",
  );
  let input: Readonly<{ kind: "none" }> | Readonly<{ kind: "string"; value: string }>;
  if (inputKind === "none") {
    input = Object.freeze({ kind: "none" });
  } else if (inputKind === "string") {
    const value = requiredOwnDataProperty(
      inputRecord,
      "value",
      "toolbar action input value",
    );
    if (!browserCommandTextIsAdmissible(value)) {
      throw new TypeError("toolbar action input is invalid");
    }
    input = Object.freeze({ kind: "string", value });
  } else {
    throw new TypeError("toolbar action input is invalid");
  }
  return Object.freeze({ kind, actionId, input, history });
}

/** @internal Copies one callback-free command declaration for queue admission. */
export function snapshotToolbarCommandDeclaration(
  value: unknown,
): ToolbarCommandDeclaration {
  return snapshotCommand(value);
}

function snapshotRecord(value: unknown, description: string): object {
  let isArray = false;
  try {
    isArray = arrayIsArray(value);
  } catch {
    throw new TypeError(`${description} must be an object`);
  }
  if (typeof value !== "object" || value === null || isArray) {
    throw new TypeError(`${description} must be an object`);
  }
  return value;
}

/**
 * Reads a declared boundary field without performing ordinary property access.
 * Accessors and inherited fields are not data supplied by this closed schema.
 */
function requiredOwnDataProperty(
  record: object,
  key: string,
  description: string,
): unknown {
  const descriptor = ownPropertyDescriptor(record, key, description);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new TypeError(`${description} must be an own data property`);
  }
  return descriptor.value;
}

/** Reads an optional declared field while ignoring inherited properties. */
function optionalOwnDataProperty(
  record: object,
  key: string,
  description: string,
): unknown {
  const descriptor = ownPropertyDescriptor(record, key, description);
  if (descriptor === undefined) {
    return undefined;
  }
  if (!("value" in descriptor)) {
    throw new TypeError(`${description} must be an own data property`);
  }
  return descriptor.value;
}

function ownPropertyDescriptor(
  record: object,
  key: string,
  description: string,
): PropertyDescriptor | undefined {
  try {
    return getOwnPropertyDescriptor(record, key);
  } catch {
    throw new TypeError(`${description} could not be inspected`);
  }
}

function validLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    measureBoundedUnicodeText(
      value,
      MAX_TOOLBAR_LABEL_UTF16,
      MAX_TOOLBAR_LABEL_UTF8,
    ).ok &&
    value.trim().length > 0 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function validPresentationString(
  value: unknown,
  maximumUtf16: number,
  maximumUtf8: number,
): value is string {
  return (
    typeof value === "string" &&
    measureBoundedUnicodeText(value, maximumUtf16, maximumUtf8).ok &&
    value.trim() === value &&
    value.length > 0 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

/** Mirrors the core's bounded lowercase ASCII `namespace/local-name` grammar. */
function validQualifiedName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_TOOLBAR_QUALIFIED_NAME_ASCII &&
    /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u.test(value)
  );
}
