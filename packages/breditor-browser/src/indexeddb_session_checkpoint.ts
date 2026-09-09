/** Exact IndexedDB database used by the session-checkpoint storage profile. */
export const SESSION_CHECKPOINT_DATABASE_NAME = "breditor-session-checkpoint-v1";
export const SESSION_CHECKPOINT_DATABASE_VERSION = 1;
export const SESSION_CHECKPOINT_OBJECT_STORE_NAME = "checkpoints";
export const SESSION_CHECKPOINT_SLOT = "current";
export const MAX_SESSION_CHECKPOINT_UTF8_BYTES = 16 * 1_024 * 1_024;
/** Maximum ASCII bytes in one resolved profile-aware storage slot. */
export const MAX_SESSION_CHECKPOINT_SLOT_ASCII_BYTES = 128;

const FORMAT = "breditor/indexeddb-session-checkpoint";
const LEGACY_RECORD_FORMAT_VERSION = 1;
const PROFILE_RECORD_FORMAT_VERSION = 2;
const BASE_SCHEMA_FINGERPRINT =
  "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const MAX_U64 = 18_446_744_073_709_551_615n;
const GENERATION = /^[1-9][0-9]*$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SCHEMA_FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const SLOT = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const LEGACY_RECORD_KEYS = Object.freeze([
  "checkpointJson",
  "checkpointSha256",
  "checkpointUtf8Bytes",
  "format",
  "formatVersion",
  "generation",
  "slot",
]);
const PROFILE_RECORD_KEYS = Object.freeze([
  ...LEGACY_RECORD_KEYS,
  "checkpointFormatVersion",
  "schemaFingerprint",
]);
const BINDING_KEYS = Object.freeze([
  "checkpointFormatVersion",
  "schemaFingerprint",
  "slot",
]);

declare const CAS_TOKEN_BRAND: unique symbol;

/** Opaque, runtime store-bound token for one observed slot state. */
export interface IndexedDbSessionCheckpointCasToken {
  readonly [CAS_TOKEN_BRAND]: never;
}

export type IndexedDbSessionCheckpointErrorCode =
  | "session_checkpoint.invalid_input"
  | "session_checkpoint.resource_limit"
  | "session_checkpoint.invalid_token"
  | "session_checkpoint.binding_mismatch"
  | "session_checkpoint.version_unsupported"
  | "session_checkpoint.schema_mismatch"
  | "session_checkpoint.corrupt"
  | "session_checkpoint.conflict"
  | "session_checkpoint.quota"
  | "session_checkpoint.aborted"
  | "session_checkpoint.connection"
  | "session_checkpoint.generation_exhausted"
  | "session_checkpoint.digest_failed";

/** Static, payload-redacted storage failure. */
export interface IndexedDbSessionCheckpointError {
  readonly code: IndexedDbSessionCheckpointErrorCode;
  readonly message: string;
}

export type IndexedDbSessionCheckpointLoadResult =
  | Readonly<{
      ok: true;
      status: "empty";
      token: IndexedDbSessionCheckpointCasToken;
    }>
  | Readonly<{
      ok: true;
      status: "loaded";
      checkpointJson: string;
      checkpointUtf8Bytes: number;
      token: IndexedDbSessionCheckpointCasToken;
    }>
  | Readonly<{ ok: false; error: IndexedDbSessionCheckpointError }>;

export type IndexedDbSessionCheckpointSaveResult =
  | Readonly<{
      ok: true;
      status: "saved";
      token: IndexedDbSessionCheckpointCasToken;
    }>
  | Readonly<{ ok: false; error: IndexedDbSessionCheckpointError }>;

/** Exact durable identity expected at one resolved IndexedDB slot. */
export interface IndexedDbSessionCheckpointBinding {
  readonly slot: string;
  readonly schemaFingerprint: string;
  readonly checkpointFormatVersion: 1 | 2 | 3;
}

export interface IndexedDbSessionCheckpointStoreOptions {
  readonly indexedDB: IDBFactory;
  readonly crypto: Pick<SubtleCrypto, "digest">;
  /**
   * Profile-aware slot and durable checkpoint identity. When omitted, the
   * exact-base `current` V1 storage contract remains active.
   */
  readonly binding?: IndexedDbSessionCheckpointBinding;
  /** Progress callback; callback failures are contained. */
  readonly onBlocked?: () => void;
}

interface LegacyStoredRecord {
  readonly format: typeof FORMAT;
  readonly formatVersion: typeof LEGACY_RECORD_FORMAT_VERSION;
  readonly slot: typeof SESSION_CHECKPOINT_SLOT;
  readonly generation: string;
  readonly checkpointUtf8Bytes: number;
  readonly checkpointSha256: string;
  readonly checkpointJson: string;
}

interface ProfileStoredRecord {
  readonly format: typeof FORMAT;
  readonly formatVersion: typeof PROFILE_RECORD_FORMAT_VERSION;
  readonly slot: string;
  readonly schemaFingerprint: string;
  readonly checkpointFormatVersion: 1 | 2 | 3;
  readonly generation: string;
  readonly checkpointUtf8Bytes: number;
  readonly checkpointSha256: string;
  readonly checkpointJson: string;
}

type StoredRecord = LegacyStoredRecord | ProfileStoredRecord;

interface LegacyStoredRecordHeader {
  readonly format: typeof FORMAT;
  readonly formatVersion: typeof LEGACY_RECORD_FORMAT_VERSION;
  readonly slot: typeof SESSION_CHECKPOINT_SLOT;
  readonly generation: unknown;
  readonly checkpointUtf8Bytes: unknown;
  readonly checkpointSha256: unknown;
  readonly checkpointJson: unknown;
}

interface ProfileStoredRecordHeader {
  readonly format: typeof FORMAT;
  readonly formatVersion: typeof PROFILE_RECORD_FORMAT_VERSION;
  readonly slot: string;
  readonly schemaFingerprint: string;
  readonly checkpointFormatVersion: 1 | 2 | 3;
  readonly generation: unknown;
  readonly checkpointUtf8Bytes: unknown;
  readonly checkpointSha256: unknown;
  readonly checkpointJson: unknown;
}

type StoredRecordHeader = LegacyStoredRecordHeader | ProfileStoredRecordHeader;

interface ResolvedBinding extends IndexedDbSessionCheckpointBinding {
  readonly legacy: boolean;
}

interface TokenState {
  readonly owner: object;
  readonly binding: ResolvedBinding;
  readonly slot: string;
  readonly expected: StoredRecord | null;
}

type ConnectionResult =
  | Readonly<{ ok: true; database: IDBDatabase }>
  | Readonly<{ ok: false; error: IndexedDbSessionCheckpointError }>;

type RawLoadResult =
  | Readonly<{ ok: true; count: number; value: unknown }>
  | Readonly<{ ok: false; error: IndexedDbSessionCheckpointError }>;

type RawSaveResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; error: IndexedDbSessionCheckpointError }>;

const TOKEN_STATES = new WeakMap<object, TokenState>();
const PROMISE_THEN = Promise.prototype.then;
const PROMISE_RESOLVE = Promise.resolve.bind(Promise);
const PROMISE_CATCH = Promise.prototype.catch;
const IGNORE_SETTLEMENT = (): undefined => undefined;
const ARRAY_BUFFER_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;

const MESSAGES: Readonly<Record<IndexedDbSessionCheckpointErrorCode, string>> = Object.freeze({
  "session_checkpoint.invalid_input": "The session checkpoint input is invalid.",
  "session_checkpoint.resource_limit":
    "The session checkpoint exceeds the storage resource limit.",
  "session_checkpoint.invalid_token": "The session checkpoint comparison token is invalid.",
  "session_checkpoint.binding_mismatch":
    "The stored session checkpoint belongs to a different profile binding.",
  "session_checkpoint.version_unsupported":
    "The session checkpoint database version is not supported.",
  "session_checkpoint.schema_mismatch":
    "The session checkpoint database schema does not match this storage profile.",
  "session_checkpoint.corrupt": "The stored session checkpoint is corrupt.",
  "session_checkpoint.conflict": "The stored session checkpoint changed after it was read.",
  "session_checkpoint.quota": "The session checkpoint could not be saved within storage quota.",
  "session_checkpoint.aborted": "The session checkpoint transaction was aborted.",
  "session_checkpoint.connection": "The session checkpoint database is unavailable.",
  "session_checkpoint.generation_exhausted":
    "The session checkpoint generation is exhausted.",
  "session_checkpoint.digest_failed":
    "The session checkpoint integrity digest could not be computed.",
});

/**
 * Atomic, slot-bound IndexedDB checkpoint owner.
 *
 * Reads use one readonly transaction. Saves precompute the UTF-8 bytes and
 * digest, then compare and replace inside one readwrite transaction. A save is
 * reported only from transaction completion.
 */
export class IndexedDbSessionCheckpointStore {
  readonly #openDatabase: (name: string, version: number) => IDBOpenDBRequest;
  readonly #digest: SubtleCrypto["digest"];
  readonly #cryptoReceiver: Pick<SubtleCrypto, "digest">;
  readonly #onBlocked: (() => void) | undefined;
  readonly #binding: ResolvedBinding;
  readonly #owner = Object.freeze({});
  #database: IDBDatabase | undefined;
  #opening: Promise<ConnectionResult> | undefined;
  #terminalError: IndexedDbSessionCheckpointError | undefined;

  constructor(options: IndexedDbSessionCheckpointStoreOptions) {
    let factory: IDBFactory;
    let cryptoReceiver: Pick<SubtleCrypto, "digest">;
    let digest: unknown;
    let open: unknown;
    let onBlocked: unknown;
    let binding: unknown;
    try {
      factory = options.indexedDB;
      cryptoReceiver = options.crypto;
      open = factory.open;
      digest = cryptoReceiver.digest;
      onBlocked = options.onBlocked;
      binding = options.binding;
    } catch {
      throw new TypeError("session checkpoint storage options are invalid");
    }
    if (
      factory === null ||
      typeof factory !== "object" ||
      typeof open !== "function" ||
      cryptoReceiver === null ||
      typeof cryptoReceiver !== "object" ||
      typeof digest !== "function" ||
      (onBlocked !== undefined && typeof onBlocked !== "function")
    ) {
      throw new TypeError("session checkpoint storage options are invalid");
    }
    this.#openDatabase = (name, version) =>
      Reflect.apply(open as IDBFactory["open"], factory, [name, version]) as IDBOpenDBRequest;
    this.#cryptoReceiver = cryptoReceiver;
    this.#digest = digest as SubtleCrypto["digest"];
    this.#onBlocked = onBlocked as (() => void) | undefined;
    const resolvedBinding = resolveBinding(binding);
    if (resolvedBinding === undefined) {
      throw new TypeError("session checkpoint storage options are invalid");
    }
    this.#binding = resolvedBinding;
  }

  get closed(): boolean {
    return this.#terminalError !== undefined;
  }

  /** Permanently closes this owner. Outstanding writes retain IndexedDB semantics. */
  close(): void {
    if (this.#terminalError === undefined) {
      this.#terminalError = error("session_checkpoint.connection");
    }
    const database = this.#database;
    this.#database = undefined;
    try {
      database?.close();
    } catch {
      // Closing is terminal even if a hostile platform object throws.
    }
  }

  /** Reads and integrity-checks the complete state at this owner's bound slot. */
  async load(): Promise<IndexedDbSessionCheckpointLoadResult> {
    const connection = await this.#connection();
    if (!connection.ok) return failure(connection.error);
    let raw: RawLoadResult;
    try {
      raw = await readSlot(connection.database, this.#binding.slot);
    } catch {
      return failure(error("session_checkpoint.connection"));
    }
    if (!raw.ok) return failure(raw.error);
    if (raw.count === 0 && raw.value === undefined) {
      if (this.closed) return failure(error("session_checkpoint.connection"));
      return Object.freeze({
        ok: true,
        status: "empty",
        token: this.#mintToken(null),
      });
    }
    if (raw.count !== 1) return failure(error("session_checkpoint.corrupt"));
    const header = parseRecordHeader(raw.value);
    if (header === undefined) return failure(error("session_checkpoint.corrupt"));
    if (!recordMatchesBinding(header, this.#binding)) {
      return failure(error("session_checkpoint.binding_mismatch"));
    }
    const record = validateStoredRecord(header);
    if (record === undefined) return failure(error("session_checkpoint.corrupt"));
    const digest = await this.#sha256(record.checkpointJson);
    if (!digest.ok) return failure(digest.error);
    if (digest.hex !== record.checkpointSha256) {
      return failure(error("session_checkpoint.corrupt"));
    }
    if (this.closed) return failure(error("session_checkpoint.connection"));
    return Object.freeze({
      ok: true,
      status: "loaded",
      checkpointJson: record.checkpointJson,
      checkpointUtf8Bytes: record.checkpointUtf8Bytes,
      token: this.#mintToken(record),
    });
  }

  /** Atomically replaces the slot only when the supplied observation still matches. */
  async save(
    token: IndexedDbSessionCheckpointCasToken,
    checkpointJson: string,
  ): Promise<IndexedDbSessionCheckpointSaveResult> {
    const tokenState = objectLike(token) ? TOKEN_STATES.get(token) : undefined;
    if (
      tokenState === undefined ||
      tokenState.owner !== this.#owner ||
      tokenState.binding !== this.#binding ||
      tokenState.slot !== this.#binding.slot
    ) {
      return failure(error("session_checkpoint.invalid_token"));
    }
    if (this.closed) return failure(error("session_checkpoint.connection"));
    const encoded = encodeCheckpoint(checkpointJson);
    if (!encoded.ok) return failure(encoded.error);
    const priorGeneration =
      tokenState.expected === null ? 0n : BigInt(tokenState.expected.generation);
    if (priorGeneration === MAX_U64) {
      return failure(error("session_checkpoint.generation_exhausted"));
    }
    const digest = await this.#sha256Bytes(encoded.bytes);
    if (!digest.ok) return failure(digest.error);
    const next = createStoredRecord(
      this.#binding,
      (priorGeneration + 1n).toString(),
      encoded.bytes.byteLength,
      digest.hex,
      checkpointJson,
    );
    const connection = await this.#connection();
    if (!connection.ok) return failure(connection.error);
    let saved: RawSaveResult;
    try {
      saved = await compareAndSwap(
        connection.database,
        this.#binding.slot,
        tokenState.expected,
        next,
      );
    } catch {
      return failure(error("session_checkpoint.connection"));
    }
    if (!saved.ok) return failure(saved.error);
    return Object.freeze({
      ok: true,
      status: "saved",
      token: this.#mintToken(next),
    });
  }

  #mintToken(expected: StoredRecord | null): IndexedDbSessionCheckpointCasToken {
    const token = Object.freeze({});
    TOKEN_STATES.set(token, {
      owner: this.#owner,
      binding: this.#binding,
      slot: this.#binding.slot,
      expected,
    });
    return token as IndexedDbSessionCheckpointCasToken;
  }

  async #sha256(
    checkpointJson: string,
  ): Promise<
    | Readonly<{ ok: true; hex: string }>
    | Readonly<{ ok: false; error: IndexedDbSessionCheckpointError }>
  > {
    const encoded = encodeCheckpoint(checkpointJson);
    if (!encoded.ok) return encoded;
    return this.#sha256Bytes(encoded.bytes);
  }

  async #sha256Bytes(
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<
    | Readonly<{ ok: true; hex: string }>
    | Readonly<{ ok: false; error: IndexedDbSessionCheckpointError }>
  > {
    try {
      const value = await Reflect.apply(this.#digest, this.#cryptoReceiver, [
        "SHA-256",
        bytes,
      ]);
      if (ARRAY_BUFFER_BYTE_LENGTH === undefined) {
        return failure(error("session_checkpoint.digest_failed"));
      }
      const byteLength = Reflect.apply(ARRAY_BUFFER_BYTE_LENGTH, value, []) as unknown;
      if (byteLength !== 32) {
        return failure(error("session_checkpoint.digest_failed"));
      }
      const hash = new Uint8Array(value as ArrayBuffer);
      let hex = "";
      for (const byte of hash) hex += byte.toString(16).padStart(2, "0");
      return Object.freeze({ ok: true, hex });
    } catch {
      return failure(error("session_checkpoint.digest_failed"));
    }
  }

  async #connection(): Promise<ConnectionResult> {
    if (this.#terminalError !== undefined) return failure(this.#terminalError);
    if (this.#database !== undefined) {
      return Object.freeze({ ok: true, database: this.#database });
    }
    const pending = this.#opening ?? this.#open();
    this.#opening = pending;
    let result: ConnectionResult;
    try {
      result = await pending;
    } catch {
      if (this.#opening === pending) this.#opening = undefined;
      return failure(error("session_checkpoint.connection"));
    }
    if (this.#opening === pending) this.#opening = undefined;
    if (!result.ok) {
      if (
        result.error.code === "session_checkpoint.version_unsupported" ||
        result.error.code === "session_checkpoint.schema_mismatch"
      ) {
        if (this.#terminalError === undefined) this.#terminalError = result.error;
      }
      return result;
    }
    if (this.#terminalError !== undefined) {
      safeClose(result.database);
      return failure(this.#terminalError);
    }
    this.#database = result.database;
    return result;
  }

  #open(): Promise<ConnectionResult> {
    return new Promise((resolve) => {
      let request: IDBOpenDBRequest;
      let upgradeError: IndexedDbSessionCheckpointError | undefined;
      let setupError: IndexedDbSessionCheckpointError | undefined;
      try {
        request = this.#openDatabase(
          SESSION_CHECKPOINT_DATABASE_NAME,
          SESSION_CHECKPOINT_DATABASE_VERSION,
        );
      } catch (cause) {
        resolve(failure(classify(cause)));
        return;
      }
      const onUpgrade = (event: Event): void => {
        try {
          if (setupError !== undefined) {
            upgradeError = setupError;
            abort(request.transaction);
            return;
          }
          const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
          if (oldVersion !== 0) {
            upgradeError = error("session_checkpoint.schema_mismatch");
            abort(request.transaction);
            return;
          }
          request.result.createObjectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME, {
            keyPath: null,
            autoIncrement: false,
          });
        } catch {
          upgradeError = error("session_checkpoint.schema_mismatch");
          abort(request.transaction);
        }
      };
      const onError = (): void => {
        try {
          resolve(failure(upgradeError ?? setupError ?? classify(request.error)));
        } catch {
          resolve(failure(error("session_checkpoint.connection")));
        }
      };
      const onSuccess = (): void => {
        let database: IDBDatabase | undefined;
        try {
          const openedDatabase = request.result;
          database = openedDatabase;
          if (setupError !== undefined) {
            safeClose(openedDatabase);
            resolve(failure(setupError));
            return;
          }
          openedDatabase.onversionchange = () => {
            this.#invalidate(openedDatabase);
            safeClose(openedDatabase);
          };
          openedDatabase.onclose = () => {
            this.#invalidate(openedDatabase);
          };
          const validation = validateSchema(openedDatabase, this.#binding.slot);
          Reflect.apply(PROMISE_THEN, validation, [
            (schemaError: IndexedDbSessionCheckpointError | undefined) => {
              try {
                if (schemaError !== undefined) {
                  safeClose(openedDatabase);
                  resolve(failure(schemaError));
                  return;
                }
                resolve(Object.freeze({ ok: true, database: openedDatabase }));
              } catch {
                safeClose(openedDatabase);
                resolve(failure(error("session_checkpoint.connection")));
              }
            },
            () => {
              safeClose(openedDatabase);
              resolve(failure(error("session_checkpoint.connection")));
            },
          ]);
        } catch {
          safeClose(database);
          resolve(failure(error("session_checkpoint.connection")));
        }
      };
      const onBlocked = (): void => {
        try {
          containAsyncRejection(this.#onBlocked?.());
        } catch {
          // A progress observer cannot affect the open request.
        }
      };

      const criticalInstalled = [
        installOpenRequestHandler(request, "onupgradeneeded", "upgradeneeded", onUpgrade),
        installOpenRequestHandler(request, "onerror", "error", onError),
        installOpenRequestHandler(request, "onsuccess", "success", onSuccess),
      ];
      if (criticalInstalled.some((installed) => !installed)) {
        setupError = error("session_checkpoint.connection");
        // With no terminal observation path, waiting would hang forever. The
        // open request itself cannot be canceled, but no database handle or CAS
        // authority has escaped, so settle this owner fail-closed immediately.
        resolve(failure(setupError));
        return;
      }
      if (!installOpenRequestHandler(request, "onblocked", "blocked", onBlocked)) {
        setupError = error("session_checkpoint.connection");
      }
    });
  }

  #invalidate(database: IDBDatabase): void {
    if (this.#database === database) this.#database = undefined;
    if (this.#terminalError === undefined) {
      this.#terminalError = error("session_checkpoint.connection");
    }
  }
}

function installOpenRequestHandler(
  request: IDBOpenDBRequest,
  property: "onupgradeneeded" | "onerror" | "onsuccess" | "onblocked",
  event: "upgradeneeded" | "error" | "success" | "blocked",
  listener: (event: Event) => void,
): boolean {
  // A hostile setter may install the property handler and then throw or report
  // failure, causing the EventTarget fallback to install the same logical
  // handler too. Keep both physical registrations harmlessly idempotent: an
  // upgrade body must never run twice and turn its own created store into a
  // spurious schema failure.
  let invoked = false;
  const once = (openEvent: Event): void => {
    if (invoked) return;
    invoked = true;
    listener(openEvent);
  };
  try {
    if (Reflect.set(request, property, once)) return true;
  } catch {
    // Fall back to the equivalent EventTarget registration below.
  }
  try {
    const addEventListener = request.addEventListener;
    if (typeof addEventListener !== "function") return false;
    Reflect.apply(addEventListener, request, [event, once]);
    return true;
  } catch {
    return false;
  }
}

function resolveBinding(value: unknown): ResolvedBinding | undefined {
  if (value === undefined) {
    return Object.freeze({
      slot: SESSION_CHECKPOINT_SLOT,
      schemaFingerprint: BASE_SCHEMA_FINGERPRINT,
      checkpointFormatVersion: 1,
      legacy: true,
    });
  }
  if (!objectLike(value) || Array.isArray(value)) return undefined;
  let descriptors: PropertyDescriptorMap;
  let keys: readonly PropertyKey[];
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
    keys = Reflect.ownKeys(value);
  } catch {
    return undefined;
  }
  if (
    keys.length !== BINDING_KEYS.length ||
    keys.some((key) => typeof key !== "string" || !BINDING_KEYS.includes(key))
  ) {
    return undefined;
  }
  const field = (name: string): unknown => {
    const descriptor = descriptors[name];
    return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
  };
  const slot = field("slot");
  const schemaFingerprint = field("schemaFingerprint");
  const checkpointFormatVersion = field("checkpointFormatVersion");
  if (
    !validSlot(slot) ||
    typeof schemaFingerprint !== "string" ||
    !SCHEMA_FINGERPRINT.test(schemaFingerprint) ||
    (checkpointFormatVersion !== 1 &&
      checkpointFormatVersion !== 2 &&
      checkpointFormatVersion !== 3) ||
    (checkpointFormatVersion === 1 &&
      schemaFingerprint !== BASE_SCHEMA_FINGERPRINT)
  ) {
    return undefined;
  }
  return Object.freeze({
    slot,
    schemaFingerprint,
    checkpointFormatVersion,
    legacy: false,
  });
}

function validSlot(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_SESSION_CHECKPOINT_SLOT_ASCII_BYTES &&
    SLOT.test(value)
  );
}

function encodeCheckpoint(
  value: unknown,
):
  | Readonly<{ ok: true; bytes: Uint8Array<ArrayBuffer> }>
  | Readonly<{ ok: false; error: IndexedDbSessionCheckpointError }> {
  if (typeof value !== "string") {
    return failure(error("session_checkpoint.invalid_input"));
  }
  if (value.length === 0 || !hasWellFormedUtf16(value)) {
    return failure(error("session_checkpoint.invalid_input"));
  }
  if (value.length > MAX_SESSION_CHECKPOINT_UTF8_BYTES) {
    return failure(error("session_checkpoint.resource_limit"));
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new TextEncoder().encode(value);
  } catch {
    return failure(error("session_checkpoint.invalid_input"));
  }
  if (bytes.byteLength > MAX_SESSION_CHECKPOINT_UTF8_BYTES) {
    return failure(error("session_checkpoint.resource_limit"));
  }
  return Object.freeze({ ok: true, bytes });
}

function hasWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function parseRecordHeader(value: unknown): StoredRecordHeader | undefined {
  if (!objectLike(value)) return undefined;
  let descriptors: PropertyDescriptorMap;
  let keys: readonly PropertyKey[];
  try {
    if (Array.isArray(value)) return undefined;
    descriptors = Object.getOwnPropertyDescriptors(value);
    keys = Reflect.ownKeys(value);
  } catch {
    return undefined;
  }
  const field = (name: string): unknown => {
    const descriptor = descriptors[name];
    return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
  };
  const format = field("format");
  const formatVersion = field("formatVersion");
  const slot = field("slot");
  const generation = field("generation");
  const checkpointUtf8Bytes = field("checkpointUtf8Bytes");
  const checkpointSha256 = field("checkpointSha256");
  const checkpointJson = field("checkpointJson");
  const expectedKeys =
    formatVersion === LEGACY_RECORD_FORMAT_VERSION
      ? LEGACY_RECORD_KEYS
      : formatVersion === PROFILE_RECORD_FORMAT_VERSION
        ? PROFILE_RECORD_KEYS
        : undefined;
  if (
    expectedKeys === undefined ||
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key)) ||
    format !== FORMAT ||
    !validSlot(slot)
  ) {
    return undefined;
  }
  if (formatVersion === LEGACY_RECORD_FORMAT_VERSION) {
    if (slot !== SESSION_CHECKPOINT_SLOT) return undefined;
    return Object.freeze({
      format,
      formatVersion,
      slot,
      generation,
      checkpointUtf8Bytes,
      checkpointSha256,
      checkpointJson,
    });
  }
  const schemaFingerprint = field("schemaFingerprint");
  const checkpointFormatVersion = field("checkpointFormatVersion");
  if (
    typeof schemaFingerprint !== "string" ||
    !SCHEMA_FINGERPRINT.test(schemaFingerprint) ||
    (checkpointFormatVersion !== 1 &&
      checkpointFormatVersion !== 2 &&
      checkpointFormatVersion !== 3)
  ) {
    return undefined;
  }
  return Object.freeze({
    format,
    formatVersion: PROFILE_RECORD_FORMAT_VERSION,
    slot,
    schemaFingerprint,
    checkpointFormatVersion: checkpointFormatVersion as 1 | 2 | 3,
    generation,
    checkpointUtf8Bytes,
    checkpointSha256,
    checkpointJson,
  });
}

function validateStoredRecord(
  header: StoredRecordHeader,
): StoredRecord | undefined {
  const {
    generation,
    checkpointUtf8Bytes,
    checkpointSha256,
    checkpointJson,
  } = header;
  if (
    typeof generation !== "string" ||
    generation.length > 20 ||
    !GENERATION.test(generation) ||
    typeof checkpointUtf8Bytes !== "number" ||
    !Number.isSafeInteger(checkpointUtf8Bytes) ||
    checkpointUtf8Bytes < 0 ||
    checkpointUtf8Bytes > MAX_SESSION_CHECKPOINT_UTF8_BYTES ||
    typeof checkpointSha256 !== "string" ||
    !SHA256.test(checkpointSha256) ||
    typeof checkpointJson !== "string"
  ) {
    return undefined;
  }
  let parsedGeneration: bigint;
  try {
    parsedGeneration = BigInt(generation);
  } catch {
    return undefined;
  }
  if (parsedGeneration === 0n || parsedGeneration > MAX_U64) return undefined;
  const encoded = encodeCheckpoint(checkpointJson);
  if (!encoded.ok || encoded.bytes.byteLength !== checkpointUtf8Bytes) {
    return undefined;
  }
  if (header.formatVersion === LEGACY_RECORD_FORMAT_VERSION) {
    return Object.freeze({
      format: header.format,
      formatVersion: header.formatVersion,
      slot: header.slot,
      generation,
      checkpointUtf8Bytes,
      checkpointSha256,
      checkpointJson,
    });
  }
  return Object.freeze({
    format: header.format,
    formatVersion: header.formatVersion,
    slot: header.slot,
    schemaFingerprint: header.schemaFingerprint,
    checkpointFormatVersion: header.checkpointFormatVersion,
    generation,
    checkpointUtf8Bytes,
    checkpointSha256,
    checkpointJson,
  });
}

function parseRecord(value: unknown): StoredRecord | undefined {
  const header = parseRecordHeader(value);
  return header === undefined ? undefined : validateStoredRecord(header);
}

function createStoredRecord(
  binding: ResolvedBinding,
  generation: string,
  checkpointUtf8Bytes: number,
  checkpointSha256: string,
  checkpointJson: string,
): StoredRecord {
  if (binding.legacy) {
    return Object.freeze({
      format: FORMAT,
      formatVersion: LEGACY_RECORD_FORMAT_VERSION,
      slot: SESSION_CHECKPOINT_SLOT,
      generation,
      checkpointUtf8Bytes,
      checkpointSha256,
      checkpointJson,
    });
  }
  return Object.freeze({
    format: FORMAT,
    formatVersion: PROFILE_RECORD_FORMAT_VERSION,
    slot: binding.slot,
    schemaFingerprint: binding.schemaFingerprint,
    checkpointFormatVersion: binding.checkpointFormatVersion,
    generation,
    checkpointUtf8Bytes,
    checkpointSha256,
    checkpointJson,
  });
}

function recordMatchesBinding(
  record: StoredRecordHeader,
  binding: ResolvedBinding,
): boolean {
  if (record.formatVersion === LEGACY_RECORD_FORMAT_VERSION) {
    return (
      record.slot === SESSION_CHECKPOINT_SLOT &&
      binding.slot === SESSION_CHECKPOINT_SLOT &&
      binding.schemaFingerprint === BASE_SCHEMA_FINGERPRINT &&
      binding.checkpointFormatVersion === 1
    );
  }
  return (
    !binding.legacy &&
    record.slot === binding.slot &&
    record.schemaFingerprint === binding.schemaFingerprint &&
    record.checkpointFormatVersion === binding.checkpointFormatVersion
  );
}

function recordsEqual(left: StoredRecord | null, right: StoredRecord | null): boolean {
  if (left === null || right === null) return left === right;
  if (
    left.format !== right.format ||
    left.formatVersion !== right.formatVersion ||
    left.slot !== right.slot ||
    left.generation !== right.generation ||
    left.checkpointUtf8Bytes !== right.checkpointUtf8Bytes ||
    left.checkpointSha256 !== right.checkpointSha256 ||
    left.checkpointJson !== right.checkpointJson
  ) {
    return false;
  }
  if (
    left.formatVersion === PROFILE_RECORD_FORMAT_VERSION &&
    right.formatVersion === PROFILE_RECORD_FORMAT_VERSION
  ) {
    return (
      left.schemaFingerprint === right.schemaFingerprint &&
      left.checkpointFormatVersion === right.checkpointFormatVersion
    );
  }
  return (
    left.formatVersion === LEGACY_RECORD_FORMAT_VERSION &&
    right.formatVersion === LEGACY_RECORD_FORMAT_VERSION
  );
}

async function validateSchema(
  database: IDBDatabase,
  slot: string,
): Promise<IndexedDbSessionCheckpointError | undefined> {
  if (
    database.version !== SESSION_CHECKPOINT_DATABASE_VERSION ||
    database.objectStoreNames.length !== 1 ||
    database.objectStoreNames.item(0) !== SESSION_CHECKPOINT_OBJECT_STORE_NAME
  ) {
    return error("session_checkpoint.schema_mismatch");
  }
  return new Promise((resolve) => {
    let transaction: IDBTransaction;
    let countRequest: IDBRequest<number>;
    let requestError: unknown;
    let requestFailed = false;
    let setupError: IndexedDbSessionCheckpointError | undefined;
    try {
      transaction = database.transaction(SESSION_CHECKPOINT_OBJECT_STORE_NAME, "readonly");
      const store = transaction.objectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME);
      if (store.keyPath !== null || store.autoIncrement || store.indexNames.length !== 0) {
        abort(transaction);
        resolve(error("session_checkpoint.schema_mismatch"));
        return;
      }
      countRequest = store.count(slot);
    } catch (cause) {
      resolve(classify(cause));
      return;
    }
    try {
      transaction.oncomplete = () => {
        resolve(
          setupError ??
            (requestFailed ? classify(requestError) : undefined),
        );
      };
      transaction.onabort = () => {
        try {
          resolve(classify(transaction.error ?? requestError ?? setupError));
        } catch {
          resolve(error("session_checkpoint.connection"));
        }
      };
      transaction.onerror = () => {};
      countRequest.onerror = () => {
        requestFailed = true;
        try {
          if (requestError === undefined) requestError = countRequest.error;
        } catch (cause) {
          requestError ??= cause;
        }
      };
    } catch (cause) {
      setupError = classify(cause);
      abort(transaction);
      // Schema attestation is readonly, so no mutation can escape after a
      // handler-installation failure. Resolve directly even when no terminal
      // callback could be installed; a later event may only repeat settlement.
      resolve(setupError);
    }
  });
}

function readSlot(database: IDBDatabase, slot: string): Promise<RawLoadResult> {
  return new Promise((resolve) => {
    let transaction: IDBTransaction;
    let countRequest: IDBRequest<number>;
    let getRequest: IDBRequest<unknown>;
    let requestError: unknown;
    let requestFailed = false;
    try {
      transaction = database.transaction(SESSION_CHECKPOINT_OBJECT_STORE_NAME, "readonly");
      const store = transaction.objectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME);
      countRequest = store.count(slot);
      getRequest = store.get(slot);
    } catch (cause) {
      resolve(failure(classify(cause)));
      return;
    }
    countRequest.onerror = () => {
      requestFailed = true;
      try {
        if (requestError === undefined) requestError = countRequest.error;
      } catch (cause) {
        requestError ??= cause;
      }
    };
    getRequest.onerror = () => {
      requestFailed = true;
      try {
        if (requestError === undefined) requestError = getRequest.error;
      } catch (cause) {
        requestError ??= cause;
      }
    };
    transaction.oncomplete = () => {
      if (requestFailed) {
        resolve(failure(classify(requestError)));
        return;
      }
      try {
        resolve(Object.freeze({ ok: true, count: countRequest.result, value: getRequest.result }));
      } catch (cause) {
        resolve(failure(classify(cause)));
      }
    };
    transaction.onabort = () => {
      try {
        resolve(failure(classify(transaction.error ?? requestError)));
      } catch {
        resolve(failure(error("session_checkpoint.connection")));
      }
    };
    transaction.onerror = () => {};
  });
}

function compareAndSwap(
  database: IDBDatabase,
  slot: string,
  expected: StoredRecord | null,
  next: StoredRecord,
): Promise<RawSaveResult> {
  return new Promise((resolve) => {
    let transaction: IDBTransaction;
    let countRequest: IDBRequest<number>;
    let getRequest: IDBRequest<unknown>;
    let requestError: unknown;
    let putError: unknown;
    let putFailed = false;
    let abortedForPutError = false;
    let semanticError: IndexedDbSessionCheckpointError | undefined;
    let wrote = false;
    try {
      transaction = strictReadwrite(database);
    } catch (cause) {
      resolve(failure(classify(cause)));
      return;
    }
    try {
      // Install terminal evidence before any request callback can enqueue a
      // write. A reported failure can therefore never hide a committed record
      // whose successor token the caller did not receive.
      transaction.oncomplete = () => {
        resolve(
          wrote && !putFailed && requestError === undefined
            ? Object.freeze({ ok: true })
            : failure(
                semanticError ??
                  (putFailed
                    ? classify(putError)
                    : error("session_checkpoint.connection")),
              ),
        );
      };
      transaction.onabort = () => {
        try {
          resolve(
            failure(
              semanticError ??
                classify(
                  abortedForPutError
                    ? putError
                    : transaction.error ?? requestError,
                ),
            ),
          );
        } catch {
          resolve(failure(error("session_checkpoint.connection")));
        }
      };
      transaction.onerror = () => {};
    } catch (cause) {
      abort(transaction);
      resolve(failure(classify(cause)));
      return;
    }
    try {
      const store = transaction.objectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME);
      countRequest = store.count(slot);
      getRequest = store.get(slot);
      countRequest.onerror = () => {
        try {
          if (requestError === undefined) requestError = countRequest.error;
        } catch (cause) {
          requestError ??= cause;
        }
      };
      getRequest.onerror = () => {
        try {
          if (requestError === undefined) requestError = getRequest.error;
        } catch (cause) {
          requestError ??= cause;
        }
      };
      getRequest.onsuccess = () => {
        try {
          if (semanticError !== undefined) {
            abort(transaction);
            return;
          }
          let current: StoredRecord | null;
          if (countRequest.result === 0 && getRequest.result === undefined) {
            current = null;
          } else if (countRequest.result === 1) {
            const parsed = parseRecord(getRequest.result);
            if (parsed === undefined) {
              semanticError = error("session_checkpoint.corrupt");
              abort(transaction);
              return;
            }
            current = parsed;
          } else {
            semanticError = error("session_checkpoint.corrupt");
            abort(transaction);
            return;
          }
          if (!recordsEqual(current, expected)) {
            semanticError = error("session_checkpoint.conflict");
            abort(transaction);
            return;
          }
          const put = transaction
            .objectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME)
            .put(next, slot);
          wrote = true;
          put.onerror = () => {
            putFailed = true;
            try {
              putError = put.error;
            } catch (cause) {
              putError = cause;
            }
            requestError ??= putError;
            // Request error events are cancelable. Abort explicitly so another
            // listener's preventDefault() cannot let an unsuccessful put reach
            // transaction completion and masquerade as a committed CAS.
            abortedForPutError = abort(transaction);
          };
        } catch (cause) {
          semanticError = classify(cause);
          abort(transaction);
        }
      };
    } catch (cause) {
      // A hostile setter may install a request callback and then throw. Keep
      // transaction ownership until its terminal event; the callback observes
      // this setup error, and completion remains success only if a write really
      // committed and therefore requires returning the successor token.
      semanticError ??= classify(cause);
      abort(transaction);
    }
  });
}

function strictReadwrite(database: IDBDatabase): IDBTransaction {
  // Old engines may reject the transaction-options overload. Only that
  // capability failure falls back; operational failures remain failures.
  try {
    return database.transaction(SESSION_CHECKPOINT_OBJECT_STORE_NAME, "readwrite", {
      durability: "strict",
    });
  } catch (cause) {
    if (exceptionName(cause) !== "TypeError" && exceptionName(cause) !== "NotSupportedError") {
      throw cause;
    }
    return database.transaction(SESSION_CHECKPOINT_OBJECT_STORE_NAME, "readwrite");
  }
}

function abort(transaction: IDBTransaction | null): boolean {
  try {
    if (transaction === null) return false;
    transaction.abort();
    return true;
  } catch {
    // The eventual transaction/request event remains authoritative.
    return false;
  }
}

function safeClose(database: IDBDatabase | undefined): void {
  try {
    database?.close();
  } catch {
    // Connection rejection remains authoritative even if cleanup throws.
  }
}

function containAsyncRejection(value: unknown): void {
  if (!objectLike(value)) return;
  try {
    const contained = PROMISE_RESOLVE(value);
    Reflect.apply(PROMISE_CATCH, contained, [IGNORE_SETTLEMENT]);
  } catch {
    // Hostile thenable inspection is itself contained.
  }
}

function classify(cause: unknown): IndexedDbSessionCheckpointError {
  switch (exceptionName(cause)) {
    case "VersionError":
      return error("session_checkpoint.version_unsupported");
    case "QuotaExceededError":
      return error("session_checkpoint.quota");
    case "AbortError":
      return error("session_checkpoint.aborted");
    default:
      return error("session_checkpoint.connection");
  }
}

function exceptionName(cause: unknown): string | undefined {
  try {
    return objectLike(cause) && typeof cause["name"] === "string"
      ? cause["name"]
      : undefined;
  } catch {
    return undefined;
  }
}

function error(code: IndexedDbSessionCheckpointErrorCode): IndexedDbSessionCheckpointError {
  return Object.freeze({ code, message: MESSAGES[code] });
}

function failure(
  storageError: IndexedDbSessionCheckpointError,
): Readonly<{ ok: false; error: IndexedDbSessionCheckpointError }> {
  return Object.freeze({ ok: false, error: storageError });
}

function objectLike(value: unknown): value is Record<PropertyKey, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
