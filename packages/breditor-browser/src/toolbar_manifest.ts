import { measureBoundedUnicodeText } from "./composition_event.js";
import { browserCommandTextIsAdmissible } from "./editor_command.js";

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

/** Fixed observable identities used by the base toolbar/action-state catalog. */
export const BASE_TOOLBAR_STATE_IDS = Object.freeze({
  bold: "breditor/control-bold",
  undo: "breditor/control-undo",
  redo: "breditor/control-redo",
} as const);

/** A callback-free semantic command described by a toolbar control. */
export type ToolbarCommandDeclaration =
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
export interface ToolbarControlDeclaration {
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
 * The returned object, control array, controls, commands, and inputs are frozen.
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
    const activation = requiredOwnDataProperty(
      control,
      "activation",
      "toolbar activation presentation",
    );
    const group = optionalOwnDataProperty(
      control,
      "group",
      "toolbar presentation group",
    );
    const command = requiredOwnDataProperty(
      control,
      "command",
      "toolbar command",
    );
    if (kind !== "button") {
      throw new TypeError("toolbar control kind is invalid");
    }
    if (!validQualifiedName(stateId)) {
      throw new TypeError("toolbar state identity is invalid");
    }
    if (seenStateIds.has(stateId)) {
      throw new TypeError("toolbar state identity is duplicated");
    }
    if (!validLabel(controlLabel)) {
      throw new TypeError("toolbar control label is invalid");
    }
    if (activation !== "stateless" && activation !== "tracked") {
      throw new TypeError("toolbar activation presentation is invalid");
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
        kind: "action",
        actionId: "breditor/toggle-strong",
        input: { kind: "none" },
        history: "closeBefore",
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
