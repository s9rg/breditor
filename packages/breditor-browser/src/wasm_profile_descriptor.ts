import { snapshotProtectedHandleArray } from "./protected_handle_snapshot.js";

/** Maximum inline-format descriptors admitted by the browser ABI boundary. */
export const MAX_BROWSER_PROFILE_FORMATS = 256;

/** Maximum intent descriptors admitted by the browser ABI boundary. */
export const MAX_BROWSER_PROFILE_INTENTS = 1_024;

/** Maximum action-state descriptors admitted by the browser ABI boundary. */
export const MAX_BROWSER_PROFILE_ACTION_STATES = 512;

/** Opaque process-local generation owner produced by the generated Wasm API. */
export interface WasmProfileGenerationView {
  matches(other: WasmProfileGenerationView): boolean;
  free(): void;
}

/** Generated values tied to one compiled profile implement this comparison. */
export interface WasmProfileCorrelatedView {
  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean;
}

/** Structural subset of the generated compiled-profile descriptor owner. */
export interface WasmCompiledProfileDescriptorView
  extends WasmProfileCorrelatedView {
  readonly schemaName: string;
  readonly schemaVersion: number;
  readonly schemaFingerprint: string;
  readonly formatCount: number;
  readonly intentCount: number;
  readonly actionStateCount: number;
  formatKind(index: number): string | undefined;
  formatRevision(index: number): number | undefined;
  intentId(index: number): string | undefined;
  intentInputKind(index: number): "none" | "typed" | undefined;
  intentInputContractName(index: number): string | undefined;
  intentInputContractVersion(index: number): number | undefined;
  intentActivationContract(index: number): "stateless" | "tracked" | undefined;
  intentValueContractName(index: number): string | undefined;
  intentValueContractVersion(index: number): number | undefined;
  actionStateId(index: number): string | undefined;
  actionStateSourceKind(index: number): "direct" | "routed" | "history" | undefined;
  actionStateSourceActionId(index: number): string | undefined;
  actionStateSourceIntentId(index: number): string | undefined;
  actionStateHistoryDirection(index: number): "undo" | "redo" | undefined;
  actionStateActivationContract(index: number): "stateless" | "tracked" | undefined;
  actionStateValueContractName(index: number): string | undefined;
  actionStateValueContractVersion(index: number): number | undefined;
  free(): void;
}

/** Exact durable identity of the schema sealed into one compiled profile. */
export interface BrowserProfileSchemaDescriptor {
  readonly name: string;
  readonly version: number;
  readonly fingerprint: string;
}

/** One admitted property-free inline-format identity. */
export interface BrowserProfileFormatDescriptor {
  readonly kind: string;
  readonly revision: number;
}

/** Exact versioned identity of one typed value contract. */
export interface BrowserProfileValueContract {
  readonly name: string;
  readonly version: number;
}

/** Exact input shape accepted by one semantic intent. */
export type BrowserProfileIntentInput =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "typed";
      contract: BrowserProfileValueContract;
    }>;

/** Observable shape promised by one intent or action-state entry. */
export interface BrowserProfileStateContract {
  readonly activation: "stateless" | "tracked";
  readonly value: BrowserProfileValueContract | undefined;
}

/** One semantic intent and its exact input and observable contracts. */
export interface BrowserProfileIntentDescriptor {
  readonly id: string;
  readonly input: BrowserProfileIntentInput;
  readonly state: BrowserProfileStateContract;
}

/** Exact immutable evaluation source of one action-state entry. */
export type BrowserProfileActionStateSource =
  | Readonly<{ kind: "direct"; actionId: string }>
  | Readonly<{ kind: "routed"; intentId: string }>
  | Readonly<{ kind: "history"; direction: "undo" | "redo" }>;

/** One observable state identity, source relationship, and value shape. */
export interface BrowserProfileActionStateDescriptor {
  readonly id: string;
  readonly source: BrowserProfileActionStateSource;
  readonly state: BrowserProfileStateContract;
}

/** Complete handle-free metadata copied from one compiled Rust profile. */
export interface BrowserCompiledProfileDescriptor {
  readonly schema: BrowserProfileSchemaDescriptor;
  readonly formats: readonly BrowserProfileFormatDescriptor[];
  readonly intents: readonly BrowserProfileIntentDescriptor[];
  readonly actionStates: readonly BrowserProfileActionStateDescriptor[];
}

/** Payload-redacted compiled-profile descriptor boundary failure. */
export interface BrowserProfileDescriptorError {
  readonly kind: "boundary";
  readonly code: "profile_descriptor.invalid_wasm_view";
  readonly message: "The Wasm compiled-profile descriptor is invalid.";
}

/** Exact synchronous outcome of consuming one descriptor owner. */
export type BrowserProfileDescriptorResult =
  | Readonly<{ ok: true; descriptor: BrowserCompiledProfileDescriptor }>
  | Readonly<{ ok: false; error: BrowserProfileDescriptorError }>;

const INVALID_DESCRIPTOR: BrowserProfileDescriptorError = Object.freeze({
  kind: "boundary",
  code: "profile_descriptor.invalid_wasm_view",
  message: "The Wasm compiled-profile descriptor is invalid.",
});
const OWNED_DESCRIPTORS = new WeakSet<object>();
const DESCRIPTOR_PROFILE_GENERATIONS =
  new WeakMap<object, WasmProfileGenerationView>();

const PROMISE_RESOLVE = Promise.resolve.bind(Promise);
const PROMISE_THEN = Promise.prototype.then;
const IGNORE_SETTLEMENT = (): undefined => undefined;

type GeneratedCleanup = () => unknown;

interface DescriptorMethods {
  readonly matchesProfileGeneration: WasmCompiledProfileDescriptorView["matchesProfileGeneration"];
  readonly formatKind: WasmCompiledProfileDescriptorView["formatKind"];
  readonly formatRevision: WasmCompiledProfileDescriptorView["formatRevision"];
  readonly intentId: WasmCompiledProfileDescriptorView["intentId"];
  readonly intentInputKind: WasmCompiledProfileDescriptorView["intentInputKind"];
  readonly intentInputContractName: WasmCompiledProfileDescriptorView["intentInputContractName"];
  readonly intentInputContractVersion: WasmCompiledProfileDescriptorView["intentInputContractVersion"];
  readonly intentActivationContract: WasmCompiledProfileDescriptorView["intentActivationContract"];
  readonly intentValueContractName: WasmCompiledProfileDescriptorView["intentValueContractName"];
  readonly intentValueContractVersion: WasmCompiledProfileDescriptorView["intentValueContractVersion"];
  readonly actionStateId: WasmCompiledProfileDescriptorView["actionStateId"];
  readonly actionStateSourceKind: WasmCompiledProfileDescriptorView["actionStateSourceKind"];
  readonly actionStateSourceActionId: WasmCompiledProfileDescriptorView["actionStateSourceActionId"];
  readonly actionStateSourceIntentId: WasmCompiledProfileDescriptorView["actionStateSourceIntentId"];
  readonly actionStateHistoryDirection: WasmCompiledProfileDescriptorView["actionStateHistoryDirection"];
  readonly actionStateActivationContract: WasmCompiledProfileDescriptorView["actionStateActivationContract"];
  readonly actionStateValueContractName: WasmCompiledProfileDescriptorView["actionStateValueContractName"];
  readonly actionStateValueContractVersion: WasmCompiledProfileDescriptorView["actionStateValueContractVersion"];
}

/**
 * Consumes one generated descriptor into bounded, deeply frozen metadata.
 *
 * The opaque generation remains caller-owned. The descriptor is freed exactly
 * once on every path where its cleanup can be captured safely.
 */
export function consumeWasmCompiledProfileDescriptor(
  generation: WasmProfileGenerationView,
  view: WasmCompiledProfileDescriptorView,
  protectedHandles: readonly unknown[] = [],
): BrowserProfileDescriptorResult {
  const protectedSet = snapshotProtectedHandleArray(protectedHandles, generation);
  if (protectedSet === null || protectedSet.has(view)) return descriptorFailure();
  const cleanup = snapshotGeneratedCleanup(view);
  const asynchronous = containGeneratedThenable(view);
  if (cleanup === null) return descriptorFailure();
  return consumeWasmCompiledProfileDescriptorWithCleanup(
    generation,
    view,
    cleanup,
    protectedSet,
    asynchronous,
  );
}

/** Consumes a descriptor using cleanup already captured by an outer owner. @internal */
export function consumeWasmCompiledProfileDescriptorWithCleanup(
  generation: WasmProfileGenerationView,
  view: WasmCompiledProfileDescriptorView,
  cleanup: GeneratedCleanup,
  protectedHandles: readonly unknown[] | ReadonlySet<object> = [],
  asynchronous = containGeneratedThenable(view),
): BrowserProfileDescriptorResult {
  const protectedSet = normalizeProtectedHandles(protectedHandles, generation);
  if (protectedSet === null || protectedSet.has(view)) return descriptorFailure();
  let result: BrowserProfileDescriptorResult = descriptorFailure();
  try {
    result = asynchronous
      ? descriptorFailure()
      : readDescriptor(generation, view);
  } catch {
    result = descriptorFailure();
  } finally {
    if (!runGeneratedCleanup(cleanup)) result = descriptorFailure();
  }
  if (
    result.ok &&
    !browserCompiledProfileDescriptorMatchesGeneration(
      result.descriptor,
      generation,
    )
  ) {
    result = descriptorFailure();
  }
  return result;
}

/** Exact, exception-contained generation comparison for a generated view. */
export function wasmViewMatchesProfileGeneration(
  view: unknown,
  generation: WasmProfileGenerationView,
): boolean {
  if (!objectLike(view) || !objectLike(generation)) return false;
  try {
    const method = Reflect.get(view, "matchesProfileGeneration", view) as unknown;
    if (typeof method !== "function" || valueIsThenable(method)) return false;
    const matched = Reflect.apply(method, view, [generation]) as unknown;
    return !valueIsThenable(matched) && matched === true;
  } catch {
    return false;
  }
}

/** Whether metadata was minted by this strict descriptor consumer. @internal */
export function isOwnedBrowserCompiledProfileDescriptor(
  value: unknown,
): value is BrowserCompiledProfileDescriptor {
  return objectLike(value) &&
    OWNED_DESCRIPTORS.has(value) &&
    DESCRIPTOR_PROFILE_GENERATIONS.has(value);
}

/**
 * Proves that owned descriptor metadata came from one matching live profile
 * generation. Both opaque owners must affirm the relationship, so an
 * asymmetric, dead, throwing, or asynchronous comparison fails closed.
 * @internal
 */
export function browserCompiledProfileDescriptorMatchesGeneration(
  descriptor: unknown,
  generation: unknown,
): descriptor is BrowserCompiledProfileDescriptor {
  if (!isOwnedBrowserCompiledProfileDescriptor(descriptor)) return false;
  const retainedGeneration = DESCRIPTOR_PROFILE_GENERATIONS.get(descriptor);
  return retainedGeneration !== undefined &&
    profileGenerationsMatchSymmetrically(retainedGeneration, generation);
}

/** Whether one opaque generation owner is live and self-consistent. */
export function wasmProfileGenerationIsLive(
  generation: unknown,
): generation is WasmProfileGenerationView {
  if (!objectLike(generation) || containGeneratedThenable(generation)) return false;
  try {
    const matches = Reflect.get(generation, "matches", generation) as unknown;
    const free = Reflect.get(generation, "free", generation) as unknown;
    if (
      typeof matches !== "function" ||
      valueIsThenable(matches) ||
      typeof free !== "function" ||
      valueIsThenable(free)
    ) {
      return false;
    }
    const matched = Reflect.apply(matches, generation, [generation]) as unknown;
    return !valueIsThenable(matched) && matched === true;
  } catch {
    return false;
  }
}

function readDescriptor(
  generation: WasmProfileGenerationView,
  view: WasmCompiledProfileDescriptorView,
): BrowserProfileDescriptorResult {
  if (!wasmProfileGenerationIsLive(generation)) return descriptorFailure();
  const methods = snapshotDescriptorMethods(view);
  if (methods === null) return descriptorFailure();
  const matched = Reflect.apply(methods.matchesProfileGeneration, view, [generation]) as unknown;
  if (valueIsThenable(matched) || matched !== true) return descriptorFailure();

  const schemaName = readScalar(view, "schemaName");
  const schemaVersion = readScalar(view, "schemaVersion");
  const schemaFingerprint = readScalar(view, "schemaFingerprint");
  const formatCount = readScalar(view, "formatCount");
  const intentCount = readScalar(view, "intentCount");
  const actionStateCount = readScalar(view, "actionStateCount");
  if (
    !isQualifiedName(schemaName) ||
    !isPositiveU32(schemaVersion) ||
    !isSchemaFingerprint(schemaFingerprint) ||
    !isBoundedCount(formatCount, MAX_BROWSER_PROFILE_FORMATS) ||
    !isBoundedCount(intentCount, MAX_BROWSER_PROFILE_INTENTS) ||
    !isBoundedCount(actionStateCount, MAX_BROWSER_PROFILE_ACTION_STATES)
  ) {
    return descriptorFailure();
  }

  const formats = readFormats(view, methods, formatCount);
  const intents = readIntents(view, methods, intentCount);
  if (formats === null || intents === null) return descriptorFailure();
  const actionStates = readActionStates(view, methods, actionStateCount, intents);
  if (actionStates === null || !descriptorSentinelsAreAbsent(view, methods, {
    formatCount,
    intentCount,
    actionStateCount,
  })) {
    return descriptorFailure();
  }

  const descriptor: BrowserCompiledProfileDescriptor = Object.freeze({
    schema: Object.freeze({
      name: schemaName,
      version: schemaVersion,
      fingerprint: schemaFingerprint,
    }),
    formats: Object.freeze(formats),
    intents: Object.freeze(intents),
    actionStates: Object.freeze(actionStates),
  });
  DESCRIPTOR_PROFILE_GENERATIONS.set(descriptor, generation);
  OWNED_DESCRIPTORS.add(descriptor);
  return Object.freeze({ ok: true, descriptor });
}

function profileGenerationsMatchSymmetrically(
  left: unknown,
  right: unknown,
): boolean {
  if (
    !wasmProfileGenerationIsLive(left) ||
    !wasmProfileGenerationIsLive(right)
  ) {
    return false;
  }
  try {
    const leftMatches = Reflect.get(left, "matches", left) as unknown;
    const rightMatches = Reflect.get(right, "matches", right) as unknown;
    if (
      typeof leftMatches !== "function" ||
      valueIsThenable(leftMatches) ||
      typeof rightMatches !== "function" ||
      valueIsThenable(rightMatches)
    ) {
      return false;
    }
    const forward = Reflect.apply(leftMatches, left, [right]) as unknown;
    if (valueIsThenable(forward) || forward !== true) return false;
    const reverse = Reflect.apply(rightMatches, right, [left]) as unknown;
    return !valueIsThenable(reverse) && reverse === true;
  } catch {
    return false;
  }
}

function readFormats(
  receiver: WasmCompiledProfileDescriptorView,
  methods: DescriptorMethods,
  count: number,
): BrowserProfileFormatDescriptor[] | null {
  const output: BrowserProfileFormatDescriptor[] = [];
  let prior = "";
  for (let index = 0; index < count; index += 1) {
    const kind = invoke(methods.formatKind, receiver, index);
    const revision = invoke(methods.formatRevision, receiver, index);
    if (!isQualifiedName(kind) || !isPositiveU32(revision) || kind <= prior) return null;
    prior = kind;
    output.push(Object.freeze({ kind, revision }));
  }
  return output;
}

function readIntents(
  receiver: WasmCompiledProfileDescriptorView,
  methods: DescriptorMethods,
  count: number,
): BrowserProfileIntentDescriptor[] | null {
  const output: BrowserProfileIntentDescriptor[] = [];
  let prior = "";
  for (let index = 0; index < count; index += 1) {
    const id = invoke(methods.intentId, receiver, index);
    const inputKind = invoke(methods.intentInputKind, receiver, index);
    const inputName = invoke(methods.intentInputContractName, receiver, index);
    const inputVersion = invoke(methods.intentInputContractVersion, receiver, index);
    const activation = invoke(methods.intentActivationContract, receiver, index);
    const valueName = invoke(methods.intentValueContractName, receiver, index);
    const valueVersion = invoke(methods.intentValueContractVersion, receiver, index);
    if (!isQualifiedName(id) || id <= prior) return null;
    const input = readInputContract(inputKind, inputName, inputVersion);
    const state = readStateContract(activation, valueName, valueVersion);
    if (input === null || state === null) return null;
    prior = id;
    output.push(Object.freeze({ id, input, state }));
  }
  return output;
}

function readActionStates(
  receiver: WasmCompiledProfileDescriptorView,
  methods: DescriptorMethods,
  count: number,
  intents: readonly BrowserProfileIntentDescriptor[],
): BrowserProfileActionStateDescriptor[] | null {
  const output: BrowserProfileActionStateDescriptor[] = [];
  const intentMap = new Map(intents.map((intent) => [intent.id, intent] as const));
  let prior = "";
  for (let index = 0; index < count; index += 1) {
    const id = invoke(methods.actionStateId, receiver, index);
    const sourceKind = invoke(methods.actionStateSourceKind, receiver, index);
    const actionId = invoke(methods.actionStateSourceActionId, receiver, index);
    const intentId = invoke(methods.actionStateSourceIntentId, receiver, index);
    const direction = invoke(methods.actionStateHistoryDirection, receiver, index);
    const activation = invoke(methods.actionStateActivationContract, receiver, index);
    const valueName = invoke(methods.actionStateValueContractName, receiver, index);
    const valueVersion = invoke(methods.actionStateValueContractVersion, receiver, index);
    if (!isQualifiedName(id) || id <= prior) return null;
    const source = readStateSource(sourceKind, actionId, intentId, direction);
    const state = readStateContract(activation, valueName, valueVersion);
    if (source === null || state === null) return null;
    if (source.kind === "routed") {
      const intent = intentMap.get(source.intentId);
      if (intent === undefined || !stateContractsEqual(state, intent.state)) return null;
    }
    prior = id;
    output.push(Object.freeze({ id, source, state }));
  }
  return output;
}

function readInputContract(
  kind: unknown,
  name: unknown,
  version: unknown,
): BrowserProfileIntentInput | null {
  if (kind === "none") {
    return name === undefined && version === undefined
      ? Object.freeze({ kind: "none" })
      : null;
  }
  if (kind !== "typed" || !isQualifiedName(name) || !isPositiveU32(version)) return null;
  return Object.freeze({
    kind: "typed",
    contract: Object.freeze({ name, version }),
  });
}

function readStateContract(
  activation: unknown,
  valueName: unknown,
  valueVersion: unknown,
): BrowserProfileStateContract | null {
  if (activation !== "stateless" && activation !== "tracked") return null;
  let value: BrowserProfileValueContract | undefined;
  if (valueName === undefined && valueVersion === undefined) {
    value = undefined;
  } else if (isQualifiedName(valueName) && isPositiveU32(valueVersion)) {
    value = Object.freeze({ name: valueName, version: valueVersion });
  } else {
    return null;
  }
  return Object.freeze({ activation, value });
}

function readStateSource(
  kind: unknown,
  actionId: unknown,
  intentId: unknown,
  direction: unknown,
): BrowserProfileActionStateSource | null {
  if (kind === "direct") {
    return isQualifiedName(actionId) && intentId === undefined && direction === undefined
      ? Object.freeze({ kind, actionId })
      : null;
  }
  if (kind === "routed") {
    return actionId === undefined && isQualifiedName(intentId) && direction === undefined
      ? Object.freeze({ kind, intentId })
      : null;
  }
  if (kind === "history") {
    return actionId === undefined && intentId === undefined &&
      (direction === "undo" || direction === "redo")
      ? Object.freeze({ kind, direction })
      : null;
  }
  return null;
}

function descriptorSentinelsAreAbsent(
  receiver: WasmCompiledProfileDescriptorView,
  methods: DescriptorMethods,
  counts: Readonly<{
    formatCount: number;
    intentCount: number;
    actionStateCount: number;
  }>,
): boolean {
  const calls: readonly [Function, number][] = [
    [methods.formatKind, counts.formatCount],
    [methods.formatRevision, counts.formatCount],
    [methods.intentId, counts.intentCount],
    [methods.intentInputKind, counts.intentCount],
    [methods.intentInputContractName, counts.intentCount],
    [methods.intentInputContractVersion, counts.intentCount],
    [methods.intentActivationContract, counts.intentCount],
    [methods.intentValueContractName, counts.intentCount],
    [methods.intentValueContractVersion, counts.intentCount],
    [methods.actionStateId, counts.actionStateCount],
    [methods.actionStateSourceKind, counts.actionStateCount],
    [methods.actionStateSourceActionId, counts.actionStateCount],
    [methods.actionStateSourceIntentId, counts.actionStateCount],
    [methods.actionStateHistoryDirection, counts.actionStateCount],
    [methods.actionStateActivationContract, counts.actionStateCount],
    [methods.actionStateValueContractName, counts.actionStateCount],
    [methods.actionStateValueContractVersion, counts.actionStateCount],
  ];
  return calls.every(([method, index]) => invoke(method, receiver, index) === undefined);
}

function snapshotDescriptorMethods(
  value: WasmCompiledProfileDescriptorView,
): DescriptorMethods | null {
  const names = [
    "matchesProfileGeneration",
    "formatKind",
    "formatRevision",
    "intentId",
    "intentInputKind",
    "intentInputContractName",
    "intentInputContractVersion",
    "intentActivationContract",
    "intentValueContractName",
    "intentValueContractVersion",
    "actionStateId",
    "actionStateSourceKind",
    "actionStateSourceActionId",
    "actionStateSourceIntentId",
    "actionStateHistoryDirection",
    "actionStateActivationContract",
    "actionStateValueContractName",
    "actionStateValueContractVersion",
  ] as const;
  const output: Record<string, Function> = Object.create(null) as Record<string, Function>;
  for (const name of names) {
    let method: unknown;
    try {
      method = Reflect.get(value, name, value) as unknown;
    } catch {
      return null;
    }
    if (typeof method !== "function" || valueIsThenable(method)) return null;
    output[name] = method;
  }
  return output as unknown as DescriptorMethods;
}

function stateContractsEqual(
  left: BrowserProfileStateContract,
  right: BrowserProfileStateContract,
): boolean {
  return left.activation === right.activation &&
    left.value?.name === right.value?.name &&
    left.value?.version === right.value?.version;
}

function readScalar(value: object, key: string): unknown {
  const result = Reflect.get(value, key, value) as unknown;
  if (valueIsThenable(result)) throw new TypeError("asynchronous descriptor scalar");
  return result;
}

function invoke(method: Function, receiver: object, index: number): unknown {
  const result = Reflect.apply(method, receiver, [index]) as unknown;
  if (valueIsThenable(result)) throw new TypeError("asynchronous descriptor method");
  return result;
}

function snapshotGeneratedCleanup(value: unknown): GeneratedCleanup | null {
  if (!objectLike(value)) return null;
  try {
    const free = Reflect.get(value, "free", value) as unknown;
    if (typeof free !== "function" || valueIsThenable(free)) return null;
    return () => Reflect.apply(free, value, []) as unknown;
  } catch {
    return null;
  }
}

function runGeneratedCleanup(cleanup: GeneratedCleanup): boolean {
  try {
    const returned = cleanup();
    if (returned === undefined) return true;
    containGeneratedSettlement(returned);
    return false;
  } catch {
    return false;
  }
}

function normalizeProtectedHandles(
  values: readonly unknown[] | ReadonlySet<object>,
  required: unknown,
): ReadonlySet<object> | null {
  try {
    if (Array.isArray(values)) {
      return snapshotProtectedHandleArray(values, required);
    }
    const size = Reflect.apply(SET_SIZE_GETTER, values, []);
    if (!Number.isInteger(size) || size < 0 || size > 64) return null;
    const result = new Set<object>();
    if (objectLike(required)) result.add(required);
    Reflect.apply(SET_FOR_EACH, values, [
      (value: unknown): void => {
        if (objectLike(value)) result.add(value);
      },
    ]);
    return result.size <= 65 ? result : null;
  } catch {
    return null;
  }
}

const SET_SIZE_GETTER = Object.getOwnPropertyDescriptor(Set.prototype, "size")
  ?.get as (this: Set<unknown>) => number;
const SET_FOR_EACH = Set.prototype.forEach;

function containGeneratedThenable(value: unknown): boolean {
  if (!objectLike(value)) return false;
  let then: unknown;
  try {
    then = Reflect.get(value, "then", value) as unknown;
  } catch {
    return true;
  }
  if (then === undefined) return false;
  containGeneratedSettlement(value);
  return true;
}

function valueIsThenable(value: unknown): boolean {
  return containGeneratedThenable(value);
}

function containGeneratedSettlement(value: unknown): void {
  if (!objectLike(value)) return;
  try {
    const settled = PROMISE_RESOLVE(value);
    Reflect.apply(PROMISE_THEN, settled, [
      IGNORE_SETTLEMENT,
      IGNORE_SETTLEMENT,
    ]);
  } catch {
    // The value remains rejected as an asynchronous generated object.
  }
}

function isQualifiedName(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u.test(value);
}

function isPositiveU32(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 4_294_967_295;
}

function isBoundedCount(value: unknown, maximum: number): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= maximum;
}

function isSchemaFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function descriptorFailure(): BrowserProfileDescriptorResult {
  return Object.freeze({ ok: false, error: INVALID_DESCRIPTOR });
}
