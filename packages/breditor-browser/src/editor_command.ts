import {
  isOwnedRenderedProjection,
  type RenderedProjection,
} from "./dom_renderer.js";
import type { BaseDocumentProjection } from "./projection.js";
import {
  isOwnedBaseRangeSelection,
  type BaseRangeSelection,
} from "./selection.js";

/** Maximum UTF-16 code units admitted for one browser-originated string command. */
export const MAX_BROWSER_COMMAND_TEXT_UTF16 = 65_536;

/** Maximum UTF-8 bytes admitted for one browser-originated string command. */
export const MAX_BROWSER_COMMAND_TEXT_UTF8 = 65_536;

/** Stable command origins. Presentation layers add detail without changing semantics. */
export type EditorCommandSource = Readonly<{
  kind: "beforeinput" | "keyboard" | "clipboard" | "toolbar" | "api";
  detail: string;
}>;

/** Semantic work which can cross the current generated Wasm command boundary. */
export type EngineCommand =
  | Readonly<{
      kind: "action";
      actionId: string;
      input: Readonly<{ kind: "none" }>;
    }>
  | Readonly<{
      kind: "action";
      actionId: string;
      input: Readonly<{ kind: "string"; value: string }>;
    }>
  | Readonly<{ kind: "history"; operation: "undo" | "redo" }>
  | Readonly<{ kind: "control"; operation: "closeHistoryGroup" }>;

/**
 * A clipboard request, deliberately not an editor mutation.
 *
 * Copy/cut serialization and paste admission are added by the clipboard
 * checkpoint. In particular, `cut` carries no deletion command which could run
 * before a clipboard write succeeds.
 */
export type StagedClipboardCommand = Readonly<{
  kind: "clipboard";
  operation: "copy" | "cut" | "paste";
  stage: "request";
}>;

/** Closed v0.0.53 command set accepted by the shared queue. */
export type EditorCommand = EngineCommand | StagedClipboardCommand;

/** Work which must occur before the command can be delivered. */
export interface EditorCommandRequirements {
  /** DOM selection must first be synchronized into the semantic core. */
  readonly selection: "synchronize";
  /** Whether the open typing group must be closed before delivery. */
  readonly history: "preserve" | "closeBefore";
}

/** Exact semantic selection captured while deriving a command request. */
export type EditorSelectionSync =
  | Readonly<{ kind: "range"; selection: BaseRangeSelection }>
  | Readonly<{ kind: "none" }>;

/** Immutable source, requirements, and semantic command delivered as one FIFO item. */
export interface EditorCommandRequest {
  /** Opaque exact-base capability issued by the owning command adapter. */
  readonly delivery: EditorDeliveryToken;
  /** Immutable selection intent derived against that exact delivery base. */
  readonly selection: EditorSelectionSync;
  readonly source: EditorCommandSource;
  readonly requirements: Readonly<EditorCommandRequirements>;
  readonly command: EditorCommand;
}

declare const EDITOR_DELIVERY_TOKEN_BRAND: unique symbol;
declare const EDITOR_DELIVERY_AUTHORITY_BRAND: unique symbol;

const DELIVERY_TOKENS = new WeakSet<object>();
const DELIVERY_TOKEN_AUTHORITIES = new WeakMap<object, symbol>();
const DELIVERY_AUTHORITY_VALIDATORS = new WeakMap<
  object,
  (token: unknown) => boolean
>();

/**
 * Opaque adapter-local authority binding queued work to one render and observation epoch.
 *
 * Visible fields are diagnostics. Only the adapter that issued the token can
 * prove its hidden authority when delivery occurs.
 */
export interface EditorDeliveryToken {
  readonly projection: BaseDocumentProjection;
  readonly rendered: RenderedProjection;
  readonly snapshotLineage: string;
  readonly snapshotRevision: string;
  readonly rendererGeneration: bigint;
  readonly observationEpoch: bigint;
  /** Prevents structural construction outside this module. */
  readonly [EDITOR_DELIVERY_TOKEN_BRAND]: true;
}

/**
 * Opaque proof that browser admission is consulting the token's owning adapter.
 *
 * The adapter exposes this value for controller wiring. It has no public
 * constructor or callable surface; validation stays inside this package.
 */
export interface EditorDeliveryAuthority {
  /** Prevents structural construction outside this module. */
  readonly [EDITOR_DELIVERY_AUTHORITY_BRAND]: true;
}

class OwnedEditorDeliveryToken implements EditorDeliveryToken {
  declare readonly [EDITOR_DELIVERY_TOKEN_BRAND]: true;
  readonly projection: BaseDocumentProjection;
  readonly rendered: RenderedProjection;
  readonly snapshotLineage: string;
  readonly snapshotRevision: string;
  readonly rendererGeneration: bigint;
  readonly observationEpoch: bigint;

  constructor(
    projection: BaseDocumentProjection,
    rendered: RenderedProjection,
    observationEpoch: bigint,
    authority: symbol,
  ) {
    this.projection = projection;
    this.rendered = rendered;
    this.snapshotLineage = projection.snapshot.lineage;
    this.snapshotRevision = projection.snapshot.revision;
    this.rendererGeneration = rendered.rendererGeneration;
    this.observationEpoch = observationEpoch;
    DELIVERY_TOKENS.add(this);
    DELIVERY_TOKEN_AUTHORITIES.set(this, authority);
    Object.freeze(this);
  }
}

class OwnedEditorDeliveryAuthority implements EditorDeliveryAuthority {
  declare readonly [EDITOR_DELIVERY_AUTHORITY_BRAND]: true;
}

Object.freeze(OwnedEditorDeliveryToken.prototype);
Object.freeze(OwnedEditorDeliveryAuthority.prototype);

/** @internal Issues an opaque delivery token for one exact adapter base. */
export function issueEditorDeliveryToken(
  projection: BaseDocumentProjection,
  rendered: RenderedProjection,
  observationEpoch: bigint,
  authority: symbol,
): EditorDeliveryToken {
  return new OwnedEditorDeliveryToken(
    projection,
    rendered,
    observationEpoch,
    authority,
  );
}

/** @internal Creates an opaque controller validator owned by one adapter. */
export function issueEditorDeliveryAuthority(
  validator: (token: unknown) => boolean,
): EditorDeliveryAuthority {
  if (typeof validator !== "function") {
    throw new TypeError("editor delivery authority validator is invalid");
  }
  const authority = Object.freeze(new OwnedEditorDeliveryAuthority());
  DELIVERY_AUTHORITY_VALIDATORS.set(authority, validator);
  return authority;
}

/** @internal Consults an adapter-owned validator without exposing its callback. */
export function editorDeliveryAuthorityAccepts(
  authority: unknown,
  token: unknown,
): token is EditorDeliveryToken {
  try {
    if (typeof authority !== "object" || authority === null) {
      return false;
    }
    const validator = DELIVERY_AUTHORITY_VALIDATORS.get(authority);
    return validator !== undefined && validator(token) === true;
  } catch {
    return false;
  }
}

/** @internal Checks authority provenance without invoking its validator. */
export function isEditorDeliveryAuthority(
  authority: unknown,
): authority is EditorDeliveryAuthority {
  try {
    return (
      typeof authority === "object" &&
      authority !== null &&
      DELIVERY_AUTHORITY_VALIDATORS.has(authority)
    );
  } catch {
    return false;
  }
}

/** @internal Proves token ownership and hidden adapter-local correlation. */
export function editorDeliveryTokenMatches(
  token: unknown,
  rendered: unknown,
  observationEpoch: bigint,
  authority: symbol,
): token is EditorDeliveryToken {
  return (
    editorDeliveryTokenMatchesRender(token, rendered) &&
    DELIVERY_TOKEN_AUTHORITIES.get(token) === authority &&
    token.observationEpoch === observationEpoch
  );
}

/** @internal Checks the immutable visible render correlation without adapter authority. */
export function editorDeliveryTokenMatchesRender(
  token: unknown,
  rendered: unknown,
): token is EditorDeliveryToken {
  try {
    return (
      isOwnedRenderedProjection(rendered) &&
      isIssuedEditorDeliveryToken(token) &&
      token.rendered === rendered &&
      token.projection === rendered.projection &&
      token.rendererGeneration === rendered.rendererGeneration &&
      token.snapshotLineage === rendered.projection.snapshot.lineage &&
      token.snapshotRevision === rendered.projection.snapshot.revision
    );
  } catch {
    return false;
  }
}

/** A request whose semantic command is executable by the current Wasm ABI. */
export interface EngineCommandRequest extends EditorCommandRequest {
  readonly command: EngineCommand;
}

/** A request whose clipboard capability remains staged in the browser. */
export interface StagedClipboardCommandRequest extends EditorCommandRequest {
  readonly command: StagedClipboardCommand;
}

/** Captures one owned range for exact later synchronization. */
export function rangeSelectionSync(selection: BaseRangeSelection): EditorSelectionSync {
  if (!isOwnedBaseRangeSelection(selection)) {
    throw new TypeError("editor range selection is foreign or invalid");
  }
  return Object.freeze({ kind: "range", selection });
}

/** Explicit semantic absence for non-DOM API integrations. */
export function noSelectionSync(): EditorSelectionSync {
  return Object.freeze({ kind: "none" });
}

/** Fixed base action IDs used by browser input translation. */
export const BASE_ACTION_IDS = Object.freeze({
  deleteBackward: "breditor/delete-backward",
  deleteForward: "breditor/delete-forward",
  deleteSelection: "breditor/delete-selection",
  insertParagraphBreak: "breditor/insert-paragraph-break",
  insertPlainText: "breditor/insert-plain-text",
  insertText: "breditor/insert-text",
  toggleStrong: "breditor/toggle-strong",
} as const);

/** Creates an immutable no-input action request for events, toolbars, or APIs. */
export function noInputActionRequest(
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  source: EditorCommandSource,
  actionId: string,
  history: EditorCommandRequirements["history"] = "preserve",
): EngineCommandRequest {
  const safeSource = requireSource(source);
  requireQualifiedName(actionId);
  requireHistory(history);
  const safeDelivery = requireDelivery(delivery);
  return freezeRequest(safeDelivery, requireSelection(selection, safeDelivery), safeSource, history, {
    kind: "action",
    actionId,
    input: Object.freeze({ kind: "none" }),
  });
}

/** Creates an immutable, bounded string-input action request. */
export function stringActionRequest(
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  source: EditorCommandSource,
  actionId: string,
  value: string,
  history: EditorCommandRequirements["history"] = "preserve",
): EngineCommandRequest {
  const safeSource = requireSource(source);
  requireQualifiedName(actionId);
  requireHistory(history);
  if (!browserCommandTextIsAdmissible(value)) {
    throw new RangeError("editor command text is empty or exceeds its browser boundary");
  }
  const safeDelivery = requireDelivery(delivery);
  return freezeRequest(safeDelivery, requireSelection(selection, safeDelivery), safeSource, history, {
    kind: "action",
    actionId,
    input: Object.freeze({ kind: "string", value }),
  });
}

/** Creates an immutable undo or redo request. */
export function historyRequest(
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  source: EditorCommandSource,
  operation: "undo" | "redo",
): EngineCommandRequest {
  const safeSource = requireSource(source);
  if (operation !== "undo" && operation !== "redo") {
    throw new TypeError("history operation is invalid");
  }
  const safeDelivery = requireDelivery(delivery);
  return freezeRequest(
    safeDelivery,
    requireSelection(selection, safeDelivery),
    safeSource,
    "closeBefore",
    Object.freeze({ kind: "history", operation }),
  );
}

/** Creates an explicit history-group boundary without a document action. */
export function closeHistoryGroupRequest(
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  source: EditorCommandSource,
): EngineCommandRequest {
  const safeSource = requireSource(source);
  const safeDelivery = requireDelivery(delivery);
  return freezeRequest(
    safeDelivery,
    requireSelection(selection, safeDelivery),
    safeSource,
    "preserve",
    Object.freeze({ kind: "control", operation: "closeHistoryGroup" }),
  );
}

/** Creates an immutable staged clipboard request with no implicit mutation. */
export function stagedClipboardRequest(
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  source: EditorCommandSource,
  operation: "copy" | "cut" | "paste",
): StagedClipboardCommandRequest {
  const safeSource = requireSource(source);
  if (operation !== "copy" && operation !== "cut" && operation !== "paste") {
    throw new TypeError("clipboard operation is invalid");
  }
  const safeDelivery = requireDelivery(delivery);
  return freezeRequest(
    safeDelivery,
    requireSelection(selection, safeDelivery),
    safeSource,
    operation === "copy" ? "preserve" : "closeBefore",
    Object.freeze({ kind: "clipboard", operation, stage: "request" }),
  );
}

/** Returns whether a string fits both browser-side action-input ceilings. */
export function browserCommandTextIsAdmissible(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_BROWSER_COMMAND_TEXT_UTF16
  ) {
    return false;
  }
  let utf8Bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    let codePoint = first;
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) {
        return false;
      }
      codePoint = 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
      index += 1;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      return false;
    }
    utf8Bytes +=
      codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (utf8Bytes > MAX_BROWSER_COMMAND_TEXT_UTF8) {
      return false;
    }
  }
  return true;
}

/** Runtime check used at the queue and Wasm boundaries. */
export function isEditorCommandRequest(value: unknown): value is EditorCommandRequest {
  return canonicalEditorCommandRequest(value) !== null;
}

/** @internal Creates a deeply frozen snapshot after exact runtime validation. */
export function canonicalEditorCommandRequest(value: unknown): EditorCommandRequest | null {
  try {
    const outer = readExactDataRecord(value, [
      "delivery",
      "selection",
      "source",
      "requirements",
      "command",
    ]);
    const delivery = snapshotDelivery(outer?.["delivery"]);
    const selection = snapshotSelection(outer?.["selection"], delivery);
    const source = snapshotSource(outer?.["source"]);
    const requirements = readExactDataRecord(outer?.["requirements"], [
      "selection",
      "history",
    ]);
    const command = snapshotEditorCommand(outer?.["command"]);
    if (
      delivery === null ||
      selection === null ||
      source === null ||
      requirements === null ||
      requirements["selection"] !== "synchronize" ||
      (requirements["history"] !== "preserve" && requirements["history"] !== "closeBefore") ||
      command === null ||
      !requirementsMatchCommand(requirements["history"], command)
    ) {
      return null;
    }
    const history = requirements["history"];
    if (command.kind === "history") {
      return historyRequest(delivery, selection, source, command.operation);
    }
    if (command.kind === "control") {
      return closeHistoryGroupRequest(delivery, selection, source);
    }
    if (command.kind === "clipboard") {
      return stagedClipboardRequest(delivery, selection, source, command.operation);
    }
    return command.input.kind === "none"
      ? noInputActionRequest(delivery, selection, source, command.actionId, history)
      : stringActionRequest(
          delivery,
          selection,
          source,
          command.actionId,
          command.input.value,
          history,
        );
  } catch {
    return null;
  }
}

/** Runtime check which narrows a queued command to the generated engine surface. */
export function isEngineCommand(value: unknown): value is EngineCommand {
  try {
    return snapshotEngineCommand(value) !== null;
  } catch {
    return false;
  }
}

function freezeRequest<TCommand extends EditorCommand>(
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  source: EditorCommandSource,
  history: EditorCommandRequirements["history"],
  command: TCommand,
): EditorCommandRequest & { readonly command: TCommand } {
  const frozenSource = Object.freeze({ kind: source.kind, detail: source.detail });
  return Object.freeze({
    delivery,
    selection,
    source: frozenSource,
    requirements: Object.freeze({ selection: "synchronize" as const, history }),
    command: Object.freeze(command) as TCommand,
  });
}

function requireSelection(
  value: EditorSelectionSync,
  delivery: EditorDeliveryToken,
): EditorSelectionSync {
  const selection = snapshotSelection(value, delivery);
  if (selection === null) {
    throw new TypeError("editor command selection is invalid or snapshot-mismatched");
  }
  return selection;
}

function snapshotSelection(
  value: unknown,
  delivery: EditorDeliveryToken | null,
): EditorSelectionSync | null {
  if (delivery === null) {
    return null;
  }
  const none = readExactDataRecord(value, ["kind"]);
  if (none !== null && none["kind"] === "none") {
    return Object.freeze({ kind: "none" });
  }
  const range = readExactDataRecord(value, ["kind", "selection"]);
  if (
    range === null ||
    range["kind"] !== "range" ||
    !isOwnedBaseRangeSelection(range["selection"]) ||
    range["selection"].projection !== delivery.projection
  ) {
    return null;
  }
  return Object.freeze({ kind: "range", selection: range["selection"] });
}

function requireDelivery(value: EditorDeliveryToken): EditorDeliveryToken {
  const delivery = snapshotDelivery(value);
  if (delivery === null) {
    throw new TypeError("editor command delivery token is invalid");
  }
  return delivery;
}

function snapshotDelivery(value: unknown): EditorDeliveryToken | null {
  return isIssuedEditorDeliveryToken(value) ? value : null;
}

function isIssuedEditorDeliveryToken(value: unknown): value is EditorDeliveryToken {
  return typeof value === "object" && value !== null && DELIVERY_TOKENS.has(value);
}

function requirementsMatchCommand(
  history: unknown,
  command: EditorCommand,
): boolean {
  if (command.kind === "history") {
    return history === "closeBefore";
  }
  if (command.kind === "control") {
    return history === "preserve";
  }
  if (command.kind === "clipboard") {
    return history === (command.operation === "copy" ? "preserve" : "closeBefore");
  }
  return history === "preserve" || history === "closeBefore";
}

function requireSource(source: EditorCommandSource): EditorCommandSource {
  const snapshot = snapshotSource(source);
  if (snapshot === null) {
    throw new TypeError("editor command source is invalid");
  }
  return snapshot;
}

function snapshotSource(value: unknown): EditorCommandSource | null {
  const source = readExactDataRecord(value, ["kind", "detail"]);
  if (
    source === null ||
    (source["kind"] !== "beforeinput" &&
      source["kind"] !== "keyboard" &&
      source["kind"] !== "clipboard" &&
      source["kind"] !== "toolbar" &&
      source["kind"] !== "api") ||
    typeof source["detail"] !== "string" ||
    source["detail"].length > 128 ||
    /[\u0000-\u001f\u007f]/u.test(source["detail"])
  ) {
    return null;
  }
  return Object.freeze({ kind: source["kind"], detail: source["detail"] });
}

function requireQualifiedName(value: string): void {
  if (typeof value !== "string" || !isQualifiedName(value)) {
    throw new TypeError("action ID is not a bounded qualified name");
  }
}

function requireHistory(value: unknown): asserts value is EditorCommandRequirements["history"] {
  if (value !== "preserve" && value !== "closeBefore") {
    throw new TypeError("history requirement is invalid");
  }
}

function isQualifiedName(value: string): boolean {
  return value.length <= 128 && /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u.test(value);
}

function snapshotEditorCommand(value: unknown): EditorCommand | null {
  const engine = snapshotEngineCommand(value);
  if (engine !== null) {
    return engine;
  }
  const clipboard = readExactDataRecord(value, ["kind", "operation", "stage"]);
  if (
    clipboard === null ||
    clipboard["kind"] !== "clipboard" ||
    (clipboard["operation"] !== "copy" &&
      clipboard["operation"] !== "cut" &&
      clipboard["operation"] !== "paste") ||
    clipboard["stage"] !== "request"
  ) {
    return null;
  }
  return Object.freeze({
    kind: "clipboard",
    operation: clipboard["operation"],
    stage: "request",
  });
}

function snapshotEngineCommand(value: unknown): EngineCommand | null {
  const history = readExactDataRecord(value, ["kind", "operation"]);
  if (
    history !== null &&
    history["kind"] === "history" &&
    (history["operation"] === "undo" || history["operation"] === "redo")
  ) {
    return Object.freeze({ kind: "history", operation: history["operation"] });
  }
  if (
    history !== null &&
    history["kind"] === "control" &&
    history["operation"] === "closeHistoryGroup"
  ) {
    return Object.freeze({ kind: "control", operation: "closeHistoryGroup" });
  }
  const action = readExactDataRecord(value, ["kind", "actionId", "input"]);
  if (
    action === null ||
    action["kind"] !== "action" ||
    typeof action["actionId"] !== "string" ||
    !isQualifiedName(action["actionId"])
  ) {
    return null;
  }
  const none = readExactDataRecord(action["input"], ["kind"]);
  if (none !== null && none["kind"] === "none") {
    return Object.freeze({
      kind: "action",
      actionId: action["actionId"],
      input: Object.freeze({ kind: "none" }),
    });
  }
  const string = readExactDataRecord(action["input"], ["kind", "value"]);
  if (
    string === null ||
    string["kind"] !== "string" ||
    !browserCommandTextIsAdmissible(string["value"])
  ) {
    return null;
  }
  return Object.freeze({
    kind: "action",
    actionId: action["actionId"],
    input: Object.freeze({ kind: "string", value: string["value"] }),
  });
}

function readExactDataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      return null;
    }
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}
