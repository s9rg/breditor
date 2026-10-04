import {
  isOwnedRenderedProjection,
  isOwnedFlatListRenderedProjection,
  type RenderedProjection,
} from "./dom_renderer.js";
import { isOwnedProjection, projectionUsesTextBlockActions, type BaseDocumentProjection } from "./projection.js";
import { isOwnedFlatListProjection, type FlatListDocumentProjection } from "./flat_list_projection.js";
import { isOwnedFlatListRangeSelection, type FlatListRangeSelection } from "./flat_list_selection.js";
import {
  isOwnedBaseRangeSelection,
  type BaseRangeSelection,
} from "./selection.js";
import { wellFormedUtf8Length } from "./well_formed_utf8_length.js";

/** Maximum UTF-16 code units admitted for one browser-originated string command. */
export const MAX_BROWSER_COMMAND_TEXT_UTF16 = 65_536;

/** Maximum UTF-8 bytes admitted for one browser-originated string command. */
export const MAX_BROWSER_COMMAND_TEXT_UTF8 = 65_536;

/** Maximum UTF-16 code units admitted for one typed JSON command transport. */
export const MAX_BROWSER_COMMAND_JSON_UTF16 = 512 * 1024;

/** Maximum UTF-8 bytes admitted for one typed JSON command transport. */
export const MAX_BROWSER_COMMAND_JSON_UTF8 = 512 * 1024;

/** Stable command origins. Presentation layers add detail without changing semantics. */
export type EditorCommandSource = Readonly<{
  kind:
    | "beforeinput"
    | "keyboard"
    | "clipboard"
    | "selectionchange"
    | "toolbar"
    | "api";
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
  | Readonly<{
      kind: "action";
      actionId: string;
      input: Readonly<{ kind: "json"; value: string }>;
    }>
  | Readonly<{
      kind: "intent";
      intentId: string;
      input: Readonly<{ kind: "none" }>;
    }>
  | Readonly<{
      kind: "intent";
      intentId: string;
      input: Readonly<{ kind: "json"; value: string }>;
    }>
  | Readonly<{ kind: "selection"; operation: "synchronize" }>
  | Readonly<{ kind: "history"; operation: "undo" | "redo" }>
  | Readonly<{ kind: "control"; operation: "closeHistoryGroup" }>;

/** Closed executable command set accepted by the shared queue. */
export type EditorCommand = EngineCommand;

/** Work which must occur before the command can be delivered. */
export interface EditorCommandRequirements {
  /** Whether delivery synchronizes a captured selection or uses core state. */
  readonly selection: "synchronize" | "preserve";
  /** Whether the open typing group must be closed before delivery. */
  readonly history: "preserve" | "closeBefore";
}

/** Exact semantic selection captured while deriving a command request. */
type CommandProjection = BaseDocumentProjection | FlatListDocumentProjection;
type CommandSelection = BaseRangeSelection | FlatListRangeSelection;
export type EditorSelectionSync<S extends CommandSelection = BaseRangeSelection> =
  | Readonly<{ kind: "range"; selection: S }>
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "preserve" }>;

/** Immutable source, requirements, and semantic command delivered as one FIFO item. */
export interface EditorCommandRequest<P extends CommandProjection = BaseDocumentProjection, S extends CommandSelection = BaseRangeSelection> {
  /** Opaque exact-base capability issued by the owning command adapter. */
  readonly delivery: EditorDeliveryToken<P>;
  /** Immutable selection intent derived against that exact delivery base. */
  readonly selection: EditorSelectionSync<S>;
  readonly source: EditorCommandSource;
  readonly requirements: Readonly<EditorCommandRequirements>;
  readonly command: EngineCommand;
}

declare const EDITOR_DELIVERY_TOKEN_BRAND: unique symbol;
declare const EDITOR_DELIVERY_AUTHORITY_BRAND: unique symbol;

const DELIVERY_TOKENS = new WeakSet<object>();
const FLAT_LIST_DELIVERY_TOKENS = new WeakSet<object>();
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
export interface EditorDeliveryToken<P extends CommandProjection = BaseDocumentProjection> {
  readonly projection: P;
  readonly rendered: RenderedProjection<P>;
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

class OwnedEditorDeliveryToken<P extends CommandProjection> implements EditorDeliveryToken<P> {
  declare readonly [EDITOR_DELIVERY_TOKEN_BRAND]: true;
  readonly projection: P;
  readonly rendered: RenderedProjection<P>;
  readonly snapshotLineage: string;
  readonly snapshotRevision: string;
  readonly rendererGeneration: bigint;
  readonly observationEpoch: bigint;

  constructor(
    projection: P,
    rendered: RenderedProjection<P>,
    observationEpoch: bigint,
    authority: symbol,
    flatLists = false,
  ) {
    this.projection = projection;
    this.rendered = rendered;
    this.snapshotLineage = projection.snapshot.lineage;
    this.snapshotRevision = projection.snapshot.revision;
    this.rendererGeneration = rendered.rendererGeneration;
    this.observationEpoch = observationEpoch;
    DELIVERY_TOKENS.add(this);
    if (flatLists) FLAT_LIST_DELIVERY_TOKENS.add(this);
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

/** Explicit list command types keep legacy delivery/selection admission closed. @internal */
export type FlatListEditorCommandRequest = EditorCommandRequest<FlatListDocumentProjection, FlatListRangeSelection>;
export type FlatListEditorDeliveryToken = EditorDeliveryToken<FlatListDocumentProjection>;
export type FlatListEditorSelectionSync = EditorSelectionSync<FlatListRangeSelection>;

/** Issues a list capability against one exact owned render, never flattened text. @internal */
export function issueFlatListEditorDeliveryToken(projection: FlatListDocumentProjection,
  rendered: RenderedProjection<FlatListDocumentProjection>, observationEpoch: bigint, authority: symbol): FlatListEditorDeliveryToken {
  if (!isOwnedFlatListProjection(projection) || !isOwnedFlatListRenderedProjection(rendered) || rendered.projection !== projection ||
    typeof observationEpoch !== "bigint" || observationEpoch < 0n || typeof authority !== "symbol") {
    throw new TypeError("flat-list delivery base is invalid");
  }
  return new OwnedEditorDeliveryToken(projection, rendered, observationEpoch, authority, true);
}

/** Same epoch/authority checks as legacy delivery, with an explicit list render. @internal */
export function flatListEditorDeliveryTokenMatches(token: unknown, rendered: unknown, observationEpoch: bigint,
  authority: symbol): token is FlatListEditorDeliveryToken {
  return flatListEditorDeliveryTokenMatchesRender(token, rendered) && DELIVERY_TOKEN_AUTHORITIES.get(token) === authority &&
    token.observationEpoch === observationEpoch;
}

/** Visible list correlation alone is not adapter authorization. @internal */
export function flatListEditorDeliveryTokenMatchesRender(token: unknown, rendered: unknown): token is FlatListEditorDeliveryToken {
  if (!isOwnedFlatListRenderedProjection(rendered) || !isIssuedDeliveryToken(token, true)) return false;
  return token.rendered === rendered && token.projection === rendered.projection &&
    token.rendererGeneration === rendered.rendererGeneration && token.snapshotLineage === rendered.projection.snapshot.lineage &&
    token.snapshotRevision === rendered.projection.snapshot.revision;
}

/** Captures an exact owned list selection for later queue delivery. @internal */
export function flatListRangeSelectionSync(selection: FlatListRangeSelection): FlatListEditorSelectionSync {
  if (!isOwnedFlatListRangeSelection(selection)) throw new TypeError("flat-list selection is foreign or invalid");
  return Object.freeze({ kind: "range", selection });
}

/** Consults the existing opaque authority, after explicit list token admission. @internal */
export function flatListEditorDeliveryAuthorityAccepts(authority: unknown, token: unknown): token is FlatListEditorDeliveryToken {
  return isIssuedDeliveryToken(token, true) && deliveryAuthorityAccepts(authority, token);
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
  return isIssuedEditorDeliveryToken(token) && deliveryAuthorityAccepts(authority, token);
}

function deliveryAuthorityAccepts(authority: unknown, token: unknown): boolean {
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

/** Captures one owned range for exact later synchronization. */
export function rangeSelectionSync(selection: BaseRangeSelection): EditorSelectionSync {
  if (!isOwnedBaseRangeSelection(selection)) {
    throw new TypeError("editor range selection is foreign or invalid");
  }
  return Object.freeze({ kind: "range", selection });
}

/** Explicit semantic absence for non-DOM API integrations. */
export function noSelectionSync(): Readonly<{ kind: "none" }> {
  return Object.freeze({ kind: "none" });
}

/** Uses the core's current semantic selection without reading or writing DOM. */
export function preserveSelectionSync(): Readonly<{ kind: "preserve" }> {
  return Object.freeze({ kind: "preserve" });
}

/** Fixed base action IDs used by browser input translation. */
export const BASE_ACTION_IDS = Object.freeze({
  clearInlineFormats: "breditor/clear-inline-formats",
  deleteBackward: "breditor/delete-backward",
  deleteForward: "breditor/delete-forward",
  deleteSelection: "breditor/delete-selection",
  insertParagraphBreak: "breditor/insert-paragraph-break",
  insertPlainText: "breditor/insert-plain-text",
  insertText: "breditor/insert-text",
  toggleStrong: "breditor/toggle-strong",
} as const);

const TEXT_BLOCK_ACTION_IDS = Object.freeze({
  clearInlineFormats: "breditor/clear-text-block-inline-formats",
  deleteBackward: "breditor/delete-text-block-backward",
  deleteForward: "breditor/delete-text-block-forward",
  deleteSelection: "breditor/delete-text-block-selection",
  insertParagraphBreak: "breditor/insert-text-block-break",
  insertPlainText: "breditor/insert-text-block-plain-text",
  insertText: "breditor/insert-text-block-text",
  toggleStrong: "breditor/toggle-text-block-strong",
});

const FLAT_LIST_ACTION_IDS = Object.freeze({
  clearInlineFormats: "breditor/clear-flat-list-inline-formats",
  deleteBackward: "breditor/delete-flat-list-backward",
  deleteForward: "breditor/delete-flat-list-forward",
  deleteSelection: "breditor/delete-flat-list-selection",
  insertParagraphBreak: "breditor/insert-flat-list-break",
  insertPlainText: "breditor/insert-flat-list-plain-text",
  insertText: "breditor/insert-flat-list-text",
  toggleStrong: "breditor/toggle-flat-list-strong",
});

/** Native-input IDs only for an explicitly issued list capability. @internal */
export function flatListBrowserInputActionIds(delivery: FlatListEditorDeliveryToken): Readonly<Record<keyof typeof BASE_ACTION_IDS, string>> {
  if (!isIssuedDeliveryToken(delivery, true)) throw new TypeError("flat-list delivery token is invalid");
  return FLAT_LIST_ACTION_IDS;
}

/** Selects native-input handlers from a validated profile-bound delivery. @internal */
export function browserInputActionIds(delivery: EditorDeliveryToken): Readonly<Record<keyof typeof BASE_ACTION_IDS, string>> {
  return projectionUsesTextBlockActions(requireDelivery(delivery).projection)
    ? TEXT_BLOCK_ACTION_IDS : BASE_ACTION_IDS;
}

/** Fixed built-in semantic intent IDs used by supported browser controls. */
export const BASE_INTENT_IDS = Object.freeze({
  clearInlineFormatting: "breditor/clear-inline-formatting",
  formatStrong: "breditor/format-strong",
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

/** Creates an immutable, bounded typed-JSON action request. */
export function jsonActionRequest(
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
  if (!browserCommandJsonIsAdmissible(value)) {
    throw new RangeError("editor command JSON is empty, malformed Unicode, or too large");
  }
  const safeDelivery = requireDelivery(delivery);
  return freezeRequest(
    safeDelivery,
    requireSelection(selection, safeDelivery),
    safeSource,
    history,
    {
      kind: "action",
      actionId,
      input: Object.freeze({ kind: "json", value }),
    },
  );
}

/** Creates an immutable no-input semantic intent request. */
export function noInputIntentRequest(
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  source: EditorCommandSource,
  intentId: string,
  history: EditorCommandRequirements["history"] = "preserve",
): EngineCommandRequest {
  const safeSource = requireSource(source);
  requireQualifiedName(intentId, "intent ID");
  requireHistory(history);
  const safeDelivery = requireDelivery(delivery);
  return freezeRequest(
    safeDelivery,
    requireSelection(selection, safeDelivery),
    safeSource,
    history,
    {
      kind: "intent",
      intentId,
      input: Object.freeze({ kind: "none" }),
    },
  );
}

/** Creates an immutable, bounded typed-JSON semantic-intent request. */
export function jsonIntentRequest(
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  source: EditorCommandSource,
  intentId: string,
  value: string,
  history: EditorCommandRequirements["history"] = "preserve",
): EngineCommandRequest {
  const safeSource = requireSource(source);
  requireQualifiedName(intentId, "intent ID");
  requireHistory(history);
  if (!browserCommandJsonIsAdmissible(value)) {
    throw new RangeError("editor command JSON is empty, malformed Unicode, or too large");
  }
  const safeDelivery = requireDelivery(delivery);
  return freezeRequest(
    safeDelivery,
    requireSelection(selection, safeDelivery),
    safeSource,
    history,
    {
      kind: "intent",
      intentId,
      input: Object.freeze({ kind: "json", value }),
    },
  );
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

/** Creates queue-routed semantic selection synchronization with no other work. */
export function selectionSynchronizationRequest(
  delivery: EditorDeliveryToken,
  selection: BaseRangeSelection,
  source: EditorCommandSource,
): EngineCommandRequest {
  const safeDelivery = requireDelivery(delivery);
  const synchronized = rangeSelectionSync(selection);
  return freezeRequest(
    safeDelivery,
    requireSelection(synchronized, safeDelivery),
    requireSource(source),
    "preserve",
    Object.freeze({ kind: "selection", operation: "synchronize" }),
  );
}

/** Returns whether a string fits both browser-side action-input ceilings. */
export function browserCommandTextIsAdmissible(value: unknown): value is string {
  return boundedWellFormedUtf8String(
    value,
    MAX_BROWSER_COMMAND_TEXT_UTF16,
    MAX_BROWSER_COMMAND_TEXT_UTF8,
  );
}

/** Returns whether a typed JSON transport fits the exact browser/Wasm ceiling. */
export function browserCommandJsonIsAdmissible(value: unknown): value is string {
  return boundedWellFormedUtf8String(
    value,
    MAX_BROWSER_COMMAND_JSON_UTF16,
    MAX_BROWSER_COMMAND_JSON_UTF8,
  );
}

function boundedWellFormedUtf8String(
  value: unknown,
  maximumUtf16: number,
  maximumUtf8: number,
): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumUtf16) {
    return false;
  }
  return wellFormedUtf8Length(value, maximumUtf8) !== null;
}

/** Runtime check used at the queue and Wasm boundaries. */
export function isEditorCommandRequest(value: unknown): value is EditorCommandRequest {
  return canonicalEditorCommandRequest(value) !== null;
}

/** @internal Creates a deeply frozen snapshot after exact runtime validation. */
export function canonicalEditorCommandRequest(value: unknown): EditorCommandRequest | null {
  return canonicalRequest(value, false);
}

/** Copies and validates one list request with the shared command/Unicode limits. @internal */
export function canonicalFlatListEditorCommandRequest(value: unknown): FlatListEditorCommandRequest | null {
  return canonicalRequest(value, true);
}

/** All list actions, intents, selections and history share one request constructor. @internal */
export function flatListCommandRequest(delivery: FlatListEditorDeliveryToken, selection: FlatListEditorSelectionSync,
  source: EditorCommandSource, command: EngineCommand,
  history?: EditorCommandRequirements["history"]): FlatListEditorCommandRequest {
  const safeCommand = snapshotEngineCommand(command);
  const safeSelection = snapshotSelectionForMode(selection, isIssuedDeliveryToken(delivery, true) ? delivery : null, true);
  if (safeCommand === null || safeSelection === null) throw new TypeError("flat-list command request is invalid");
  const result = canonicalFlatListEditorCommandRequest({ delivery, selection: safeSelection, source,
    requirements: { selection: safeSelection.kind === "preserve" ? "preserve" : "synchronize",
      history: history === undefined ? (safeCommand.kind === "history" ? "closeBefore" : "preserve") : history }, command: safeCommand });
  if (result === null) throw new TypeError("flat-list command request is invalid");
  return result;
}

function canonicalRequest(value: unknown, flatLists: false): EditorCommandRequest | null;
function canonicalRequest(value: unknown, flatLists: true): FlatListEditorCommandRequest | null;
function canonicalRequest(value: unknown, flatLists: boolean): EditorCommandRequest<CommandProjection, CommandSelection> | null {
  try {
    const outer = readExactDataRecord(value, [
      "delivery",
      "selection",
      "source",
      "requirements",
      "command",
    ]);
    const delivery = isIssuedDeliveryToken(outer?.["delivery"], flatLists) ? outer!["delivery"] as EditorDeliveryToken<CommandProjection> : null;
    const selection = snapshotSelectionForMode(outer?.["selection"], delivery, flatLists);
    const source = snapshotSource(outer?.["source"]);
    const requirements = readExactDataRecord(outer?.["requirements"], [
      "selection",
      "history",
    ]);
    const command = snapshotEngineCommand(outer?.["command"]);
    if (
      delivery === null ||
      selection === null ||
      source === null ||
      requirements === null ||
      (requirements["selection"] !== "synchronize" &&
        requirements["selection"] !== "preserve") ||
      (requirements["history"] !== "preserve" && requirements["history"] !== "closeBefore") ||
      command === null ||
      !selectionRequirementMatches(requirements["selection"], selection) ||
      !requirementsMatchCommand(requirements["history"], command)
    ) {
      return null;
    }
    const history = requirements["history"];
    if (command.kind === "selection" && selection.kind !== "range") return null;
    return freezeRequest(delivery, selection, source, history, command);
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

function freezeRequest<TCommand extends EngineCommand, P extends CommandProjection, S extends CommandSelection>(
  delivery: EditorDeliveryToken<P>,
  selection: EditorSelectionSync<S>,
  source: EditorCommandSource,
  history: EditorCommandRequirements["history"],
  command: TCommand,
): EditorCommandRequest<P, S> & { readonly command: TCommand } {
  const frozenSource = Object.freeze({ kind: source.kind, detail: source.detail });
  return Object.freeze({
    delivery,
    selection,
    source: frozenSource,
    requirements: Object.freeze({
      selection: selection.kind === "preserve" ? "preserve" : "synchronize",
      history,
    }),
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
  return snapshotSelectionForMode(value, delivery, false) as EditorSelectionSync | null;
}

function snapshotSelectionForMode(value: unknown, delivery: EditorDeliveryToken<CommandProjection> | null,
  flatLists: boolean): EditorSelectionSync<CommandSelection> | null {
  if (delivery === null) {
    return null;
  }
  const preserve = readExactDataRecord(value, ["kind"]);
  if (preserve !== null && preserve["kind"] === "preserve") {
    return Object.freeze({ kind: "preserve" });
  }
  const none = readExactDataRecord(value, ["kind"]);
  if (none !== null && none["kind"] === "none") {
    return Object.freeze({ kind: "none" });
  }
  const range = readExactDataRecord(value, ["kind", "selection"]);
  const selection = range?.["selection"];
  if (flatLists ? !isOwnedFlatListRangeSelection(selection) : !isOwnedBaseRangeSelection(selection)) return null;
  // The explicit mode guard above proves this union; correlation is by identity.
  const owned = selection as CommandSelection;
  if (
    range === null ||
    range["kind"] !== "range" ||
    owned.projection !== delivery.projection
  ) {
    return null;
  }
  return Object.freeze({ kind: "range", selection: owned });
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
  return isIssuedDeliveryToken(value, false);
}

function isIssuedDeliveryToken(value: unknown, flatLists: true): value is FlatListEditorDeliveryToken;
function isIssuedDeliveryToken(value: unknown, flatLists: false): value is EditorDeliveryToken;
function isIssuedDeliveryToken(value: unknown, flatLists: boolean): value is EditorDeliveryToken<CommandProjection>;
function isIssuedDeliveryToken(value: unknown, flatLists: boolean): value is EditorDeliveryToken<CommandProjection> {
  if (typeof value !== "object" || value === null || !DELIVERY_TOKENS.has(value)) return false;
  if (FLAT_LIST_DELIVERY_TOKENS.has(value) !== flatLists) return false;
  const projection = (value as EditorDeliveryToken<CommandProjection>).projection;
  return flatLists ? isOwnedFlatListProjection(projection) : isOwnedProjection(projection);
}

function requirementsMatchCommand(
  history: unknown,
  command: EngineCommand,
): boolean {
  if (command.kind === "history") {
    return history === "closeBefore";
  }
  if (command.kind === "control") {
    return history === "preserve";
  }
  if (command.kind === "selection") {
    return history === "preserve";
  }
  return history === "preserve" || history === "closeBefore";
}

function selectionRequirementMatches(
  requirement: unknown,
  selection: EditorSelectionSync<CommandSelection>,
): boolean {
  return requirement === (selection.kind === "preserve" ? "preserve" : "synchronize");
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
      source["kind"] !== "selectionchange" &&
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

function requireQualifiedName(
  value: string,
  description = "action ID",
): void {
  if (typeof value !== "string" || !isQualifiedName(value)) {
    throw new TypeError(`${description} is not a bounded qualified name`);
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

function snapshotEngineCommand(value: unknown): EngineCommand | null {
  const selection = readExactDataRecord(value, ["kind", "operation"]);
  if (
    selection !== null &&
    selection["kind"] === "selection" &&
    selection["operation"] === "synchronize"
  ) {
    return Object.freeze({ kind: "selection", operation: "synchronize" });
  }
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
  const intent = readExactDataRecord(value, ["kind", "intentId", "input"]);
  if (
    intent !== null &&
    intent["kind"] === "intent" &&
    typeof intent["intentId"] === "string" &&
    isQualifiedName(intent["intentId"])
  ) {
    const input = readExactDataRecord(intent["input"], ["kind"]);
    if (input !== null && input["kind"] === "none") {
      return Object.freeze({
        kind: "intent",
        intentId: intent["intentId"],
        input: Object.freeze({ kind: "none" }),
      });
    }
    const json = readExactDataRecord(intent["input"], ["kind", "value"]);
    if (
      json !== null &&
      json["kind"] === "json" &&
      browserCommandJsonIsAdmissible(json["value"])
    ) {
      return Object.freeze({
        kind: "intent",
        intentId: intent["intentId"],
        input: Object.freeze({ kind: "json", value: json["value"] }),
      });
    }
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
    string !== null &&
    string["kind"] === "string" &&
    browserCommandTextIsAdmissible(string["value"])
  ) {
    return Object.freeze({
      kind: "action",
      actionId: action["actionId"],
      input: Object.freeze({ kind: "string", value: string["value"] }),
    });
  }
  const json = readExactDataRecord(action["input"], ["kind", "value"]);
  return json !== null &&
      json["kind"] === "json" &&
      browserCommandJsonIsAdmissible(json["value"])
    ? Object.freeze({
        kind: "action" as const,
        actionId: action["actionId"],
        input: Object.freeze({ kind: "json" as const, value: json["value"] }),
      })
    : null;
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
