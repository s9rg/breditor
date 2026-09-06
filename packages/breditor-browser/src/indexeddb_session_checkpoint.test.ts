import {
  IDBDatabase as FakeIDBDatabase,
  IDBFactory,
  forceCloseDatabase,
} from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";

import {
  IndexedDbSessionCheckpointStore,
  MAX_SESSION_CHECKPOINT_UTF8_BYTES,
  SESSION_CHECKPOINT_DATABASE_NAME,
  SESSION_CHECKPOINT_DATABASE_VERSION,
  SESSION_CHECKPOINT_OBJECT_STORE_NAME,
  SESSION_CHECKPOINT_SLOT,
  type IndexedDbSessionCheckpointCasToken,
} from "./indexeddb_session_checkpoint.js";

interface DigestFixture {
  readonly crypto: Pick<SubtleCrypto, "digest">;
  readonly algorithms: string[];
  readonly calls: number;
}

function digestFixture(options: { fail?: boolean; invalidLength?: boolean } = {}): DigestFixture {
  const algorithms: string[] = [];
  let calls = 0;
  const digest: SubtleCrypto["digest"] = async (algorithm, data) => {
    calls += 1;
    algorithms.push(typeof algorithm === "string" ? algorithm : algorithm.name);
    if (options.fail === true) throw new DOMException("private payload", "OperationError");
    const source = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
    const output = new Uint8Array(options.invalidLength === true ? 31 : 32);
    for (let index = 0; index < source.length; index += 1) {
      const slot = index % output.length;
      output[slot] = (output[slot] ?? 0) ^ (source[index] ?? 0) ^ (index & 0xff);
    }
    return output.buffer;
  };
  return {
    crypto: { digest },
    algorithms,
    get calls() {
      return calls;
    },
  };
}

function createStore(
  factory = new IDBFactory(),
  digest = digestFixture(),
  onBlocked?: () => void,
): {
  readonly factory: IDBFactory;
  readonly digest: DigestFixture;
  readonly store: IndexedDbSessionCheckpointStore;
} {
  return {
    factory,
    digest,
    store: new IndexedDbSessionCheckpointStore({
      indexedDB: factory,
      crypto: digest.crypto,
      ...(onBlocked === undefined ? {} : { onBlocked }),
    }),
  };
}

async function openDatabase(
  factory: IDBFactory,
  version = SESSION_CHECKPOINT_DATABASE_VERSION,
  upgrade?: (database: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(SESSION_CHECKPOINT_DATABASE_NAME, version);
    request.onupgradeneeded = () => {
      upgrade?.(request.result);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => {};
  });
}

function withCanceledQuotaCount(transaction: IDBTransaction): IDBTransaction {
  return new Proxy(transaction, {
    get(target, property) {
      if (property === "objectStore") {
        return (name: string) => {
          const objectStore = target.objectStore(name);
          return new Proxy(objectStore, {
            get(storeTarget, storeProperty) {
              if (storeProperty === "count") {
                return () => {
                  const request = (
                    target as IDBTransaction & {
                      _execRequestAsync(input: {
                        operation: () => number;
                        source: IDBObjectStore;
                      }): IDBRequest<number>;
                    }
                  )._execRequestAsync({
                    operation: () => {
                      throw new DOMException(
                        "private quota payload",
                        "QuotaExceededError",
                      );
                    },
                    source: storeTarget,
                  });
                  request.addEventListener("error", (event) => {
                    event.preventDefault();
                  });
                  return request;
                };
              }
              const value = Reflect.get(storeTarget, storeProperty, storeTarget);
              return typeof value === "function" ? value.bind(storeTarget) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
  });
}

async function rawCurrent(factory: IDBFactory): Promise<unknown> {
  const database = await openDatabase(factory);
  const transaction = database.transaction(SESSION_CHECKPOINT_OBJECT_STORE_NAME, "readonly");
  const request = transaction.objectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME).get(
    SESSION_CHECKPOINT_SLOT,
  );
  await transactionComplete(transaction);
  database.close();
  return request.result;
}

async function pseudoSha256(
  fixture: DigestFixture,
  value: string,
): Promise<string> {
  const result = await fixture.crypto.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(result)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function seed(
  factory: IDBFactory,
  fixture: DigestFixture,
  overrides: Readonly<Record<string, unknown>> = {},
  key: IDBValidKey = SESSION_CHECKPOINT_SLOT,
): Promise<void> {
  const database = await openDatabase(factory, 1, (created) => {
    created.createObjectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME, {
      keyPath: null,
      autoIncrement: false,
    });
  });
  const checkpointJson = "{}";
  const record = {
    format: "breditor/indexeddb-session-checkpoint",
    formatVersion: 1,
    slot: "current",
    generation: "1",
    checkpointUtf8Bytes: 2,
    checkpointSha256: await pseudoSha256(fixture, checkpointJson),
    checkpointJson,
    ...overrides,
  };
  const transaction = database.transaction(SESSION_CHECKPOINT_OBJECT_STORE_NAME, "readwrite");
  transaction.objectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME).put(record, key);
  await transactionComplete(transaction);
  database.close();
}

describe("IndexedDbSessionCheckpointStore", () => {
  it("creates only the exact out-of-line single-store schema and loads an empty token", async () => {
    const { factory, store } = createStore();
    const loaded = await store.load();

    expect(loaded.ok && loaded.status).toBe("empty");
    expect(loaded.ok && Object.isFrozen(loaded.token)).toBe(true);

    const database = await openDatabase(factory);
    expect(database.version).toBe(1);
    expect([...database.objectStoreNames]).toEqual(["checkpoints"]);
    const transaction = database.transaction("checkpoints", "readonly");
    const objectStore = transaction.objectStore("checkpoints");
    expect(objectStore.keyPath).toBeNull();
    expect(objectStore.autoIncrement).toBe(false);
    expect([...objectStore.indexNames]).toEqual([]);
    await transactionComplete(transaction);
    database.close();
    store.close();
  });

  it("round-trips Unicode bytes and advances with the returned token", async () => {
    const { factory, digest, store } = createStore();
    const initial = await store.load();
    if (!initial.ok) throw new Error(initial.error.code);

    const first = await store.save(initial.token, '{"text":"é"}');
    expect(first.ok && first.status).toBe("saved");
    if (!first.ok) throw new Error(first.error.code);
    const second = await store.save(first.token, '{"text":"two"}');
    expect(second.ok).toBe(true);

    const loaded = await store.load();
    expect(loaded).toMatchObject({
      ok: true,
      status: "loaded",
      checkpointJson: '{"text":"two"}',
      checkpointUtf8Bytes: 14,
    });
    const raw = (await rawCurrent(factory)) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual([
      "checkpointJson",
      "checkpointSha256",
      "checkpointUtf8Bytes",
      "format",
      "formatVersion",
      "generation",
      "slot",
    ]);
    expect(raw["generation"]).toBe("2");
    expect(raw["checkpointSha256"]).toMatch(/^[0-9a-f]{64}$/u);
    expect(digest.algorithms.every((algorithm) => algorithm === "SHA-256")).toBe(true);
    store.close();
  });

  it("serializes competing saves and returns one conflict without overwriting the winner", async () => {
    const { store } = createStore();
    const initial = await store.load();
    if (!initial.ok) throw new Error(initial.error.code);
    const results = await Promise.all([
      store.save(initial.token, '{"winner":1}'),
      store.save(initial.token, '{"winner":2}'),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok).map((result) => result.error.code)).toEqual([
      "session_checkpoint.conflict",
    ]);
    const loaded = await store.load();
    expect(loaded.ok && loaded.status).toBe("loaded");
    store.close();
  });

  it("serializes competing saves across independent store connections", async () => {
    const factory = new IDBFactory();
    const digest = digestFixture();
    const first = createStore(factory, digest).store;
    const second = createStore(factory, digest).store;
    const [firstLoad, secondLoad] = await Promise.all([first.load(), second.load()]);
    if (!firstLoad.ok) throw new Error(firstLoad.error.code);
    if (!secondLoad.ok) throw new Error(secondLoad.error.code);

    const results = await Promise.all([
      first.save(firstLoad.token, '{"writer":"first"}'),
      second.save(secondLoad.token, '{"writer":"second"}'),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok).map((result) => result.error.code)).toEqual([
      "session_checkpoint.conflict",
    ]);
    expect(await rawCurrent(factory)).toMatchObject({ generation: "1" });
    first.close();
    second.close();
  });

  it("rejects forged and foreign-store tokens before opening a transaction", async () => {
    const factory = new IDBFactory();
    const first = createStore(factory);
    const second = createStore(factory);
    const loaded = await first.store.load();
    if (!loaded.ok) throw new Error(loaded.error.code);

    await expect(
      second.store.save(loaded.token, "{}"),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.invalid_token" },
    });
    await expect(
      first.store.save({} as IndexedDbSessionCheckpointCasToken, "{}"),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.invalid_token" },
    });
    first.store.close();
    second.store.close();
  });

  it("rejects oversize input before digesting and redacts invalid runtime input", async () => {
    const { digest, store } = createStore();
    const loaded = await store.load();
    if (!loaded.ok) throw new Error(loaded.error.code);
    const priorCalls = digest.calls;
    const oversized = "x".repeat(MAX_SESSION_CHECKPOINT_UTF8_BYTES + 1);
    const limited = await store.save(loaded.token, oversized);
    expect(limited).toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.resource_limit" },
    });
    expect(digest.calls).toBe(priorCalls);
    const invalid = await store.save(loaded.token, 42 as unknown as string);
    expect(invalid).toEqual({
      ok: false,
      error: {
        code: "session_checkpoint.invalid_input",
        message: "The session checkpoint input is invalid.",
      },
    });
    await expect(store.save(loaded.token, "")).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.invalid_input" },
    });
    await expect(store.save(loaded.token, "\ud800")).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.invalid_input" },
    });
    expect(digest.calls).toBe(priorCalls);
    store.close();
  });

  it("distinguishes digest capability failure from stored digest corruption", async () => {
    const failing = createStore(new IDBFactory(), digestFixture({ fail: true }));
    const empty = await failing.store.load();
    if (!empty.ok) throw new Error(empty.error.code);
    await expect(failing.store.save(empty.token, "secret payload")).resolves.toMatchObject({
      ok: false,
      error: {
        code: "session_checkpoint.digest_failed",
        message: "The session checkpoint integrity digest could not be computed.",
      },
    });
    failing.store.close();

    const factory = new IDBFactory();
    const digest = digestFixture();
    await seed(factory, digest, { checkpointSha256: "0".repeat(64) });
    const corrupt = createStore(factory, digest);
    await expect(corrupt.store.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.corrupt" },
    });
    corrupt.store.close();
  });

  it("rejects an invalid SHA-256 capability result length", async () => {
    const { store } = createStore(new IDBFactory(), digestFixture({ invalidLength: true }));
    const loaded = await store.load();
    if (!loaded.ok) throw new Error(loaded.error.code);

    await expect(store.save(loaded.token, "{}")).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.digest_failed" },
    });
    store.close();
  });

  it("rejects an object that spoofs an ArrayBuffer digest result", async () => {
    const factory = new IDBFactory();
    const spoof = Object.freeze({
      byteLength: 32,
      [Symbol.toStringTag]: "ArrayBuffer",
    });
    const store = new IndexedDbSessionCheckpointStore({
      indexedDB: factory,
      crypto: {
        digest: (async () => spoof as unknown as ArrayBuffer) as SubtleCrypto["digest"],
      },
    });
    const loaded = await store.load();
    if (!loaded.ok) throw new Error(loaded.error.code);

    await expect(store.save(loaded.token, "{}")).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.digest_failed" },
    });
    store.close();
  });

  it.each([
    [{ generation: "0" }, "zero generation"],
    [{ generation: "01" }, "noncanonical generation"],
    [{ generation: "9".repeat(1_000_000) }, "oversized generation text"],
    [{ checkpointUtf8Bytes: 3 }, "wrong byte count"],
    [{ extra: true }, "extra field"],
    [{ formatVersion: 2 }, "wrong record version"],
  ] as const)("rejects a corrupt closed record: %s", async (overrides, _label) => {
    const factory = new IDBFactory();
    const digest = digestFixture();
    await seed(factory, digest, overrides);
    const { store } = createStore(factory, digest);
    await expect(store.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.corrupt" },
    });
    store.close();
  });

  it("contains a revoked object returned as a stored record", async () => {
    const factory = new IDBFactory();
    const digest = digestFixture();
    await seed(factory, digest);
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const original = FakeIDBDatabase.prototype.transaction;
    let readonlyTransactions = 0;
    const spy = vi
      .spyOn(FakeIDBDatabase.prototype, "transaction")
      .mockImplementation(function (
        this: IDBDatabase,
        storeNames: string | Iterable<string>,
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) {
        const transaction = Reflect.apply(original, this, [storeNames, mode, options]);
        if (mode !== "readonly") return transaction;
        readonlyTransactions += 1;
        if (readonlyTransactions !== 2) return transaction;
        return new Proxy(transaction, {
          get(target, property) {
            if (property === "objectStore") {
              return (name: string) => {
                const objectStore = target.objectStore(name);
                return new Proxy(objectStore, {
                  get(storeTarget, storeProperty) {
                    if (storeProperty === "get") {
                      return (key: IDBValidKey) => {
                        const request = storeTarget.get(key);
                        return new Proxy(request, {
                          get(requestTarget, requestProperty) {
                            if (
                              requestProperty === "result" &&
                              requestTarget.readyState === "done"
                            ) {
                              return revoked.proxy;
                            }
                            const value = Reflect.get(
                              requestTarget,
                              requestProperty,
                              requestTarget,
                            );
                            return typeof value === "function"
                              ? value.bind(requestTarget)
                              : value;
                          },
                          set(requestTarget, requestProperty, value) {
                            return Reflect.set(
                              requestTarget,
                              requestProperty,
                              value,
                              requestTarget,
                            );
                          },
                        });
                      };
                    }
                    const value = Reflect.get(storeTarget, storeProperty, storeTarget);
                    return typeof value === "function" ? value.bind(storeTarget) : value;
                  },
                });
              };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
          set(target, property, value) {
            return Reflect.set(target, property, value, target);
          },
        });
      });
    const { store } = createStore(factory, digest);
    try {
      await expect(store.load()).resolves.toMatchObject({
        ok: false,
        error: { code: "session_checkpoint.corrupt" },
      });
    } finally {
      spy.mockRestore();
      store.close();
    }
  });

  it("rejects any additional key in the nominal object store", async () => {
    const factory = new IDBFactory();
    const digest = digestFixture();
    await seed(factory, digest);
    await seed(factory, digest, {}, "extra");
    const { store } = createStore(factory, digest);
    await expect(store.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.corrupt" },
    });
    store.close();
  });

  it("reports generation exhaustion without entering a write transaction", async () => {
    const factory = new IDBFactory();
    const digest = digestFixture();
    await seed(factory, digest, { generation: "18446744073709551615" });
    const { store } = createStore(factory, digest);
    const loaded = await store.load();
    if (!loaded.ok) throw new Error(loaded.error.code);
    await expect(store.save(loaded.token, '{"next":true}')).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.generation_exhausted" },
    });
    store.close();
  });

  it("distinguishes a newer database version and a wrong version-one schema", async () => {
    const newerFactory = new IDBFactory();
    const newer = await openDatabase(newerFactory, 2, (database) => {
      database.createObjectStore("checkpoints");
    });
    newer.close();
    const newerStore = createStore(newerFactory).store;
    await expect(newerStore.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.version_unsupported" },
    });

    const wrongFactory = new IDBFactory();
    const wrong = await openDatabase(wrongFactory, 1, (database) => {
      database.createObjectStore("wrong");
    });
    wrong.close();
    const wrongStore = createStore(wrongFactory).store;
    await expect(wrongStore.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.schema_mismatch" },
    });
  });

  it("rejects version-one stores with extra topology, key generation, or indexes", async () => {
    const extraFactory = new IDBFactory();
    const extra = await openDatabase(extraFactory, 1, (database) => {
      database.createObjectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME);
      database.createObjectStore("extra");
    });
    extra.close();
    const extraStore = createStore(extraFactory).store;
    await expect(extraStore.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.schema_mismatch" },
    });

    const incrementFactory = new IDBFactory();
    const incremented = await openDatabase(incrementFactory, 1, (database) => {
      database.createObjectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME, {
        autoIncrement: true,
      });
    });
    incremented.close();
    const incrementStore = createStore(incrementFactory).store;
    await expect(incrementStore.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.schema_mismatch" },
    });

    const inlineFactory = new IDBFactory();
    const inline = await openDatabase(inlineFactory, 1, (database) => {
      database.createObjectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME, {
        keyPath: "slot",
      });
    });
    inline.close();
    const inlineStore = createStore(inlineFactory).store;
    await expect(inlineStore.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.schema_mismatch" },
    });

    const indexedFactory = new IDBFactory();
    const indexed = await openDatabase(indexedFactory, 1, (database) => {
      const objectStore = database.createObjectStore(
        SESSION_CHECKPOINT_OBJECT_STORE_NAME,
      );
      objectStore.createIndex("bySlot", "slot");
    });
    indexed.close();
    const indexedStore = createStore(indexedFactory).store;
    await expect(indexedStore.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.schema_mismatch" },
    });
  });

  it("falls back only when strict durability options are unsupported", async () => {
    const original = FakeIDBDatabase.prototype.transaction;
    let strictAttempts = 0;
    const spy = vi
      .spyOn(FakeIDBDatabase.prototype, "transaction")
      .mockImplementation(function (
        this: IDBDatabase,
        storeNames: string | Iterable<string>,
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) {
        if (mode === "readwrite" && options?.durability === "strict") {
          strictAttempts += 1;
          throw new TypeError("unsupported private platform detail");
        }
        return Reflect.apply(original, this, [storeNames, mode, options]);
      });
    const { store } = createStore();
    const loaded = await store.load();
    if (!loaded.ok) throw new Error(loaded.error.code);
    expect((await store.save(loaded.token, "{}")).ok).toBe(true);
    expect(strictAttempts).toBe(1);
    spy.mockRestore();
    store.close();
  });

  it("becomes terminal on versionchange, abnormal close, and explicit close", async () => {
    const versionFactory = new IDBFactory();
    const versionStore = createStore(versionFactory).store;
    expect((await versionStore.load()).ok).toBe(true);
    const upgrade = await openDatabase(versionFactory, 2);
    expect(versionStore.closed).toBe(true);
    await expect(versionStore.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.connection" },
    });
    upgrade.close();

    let captured: IDBDatabase | undefined;
    const closeFactory = new IDBFactory();
    const proxy = new Proxy(closeFactory, {
      get(target, property, receiver) {
        if (property !== "open") return Reflect.get(target, property, receiver);
        return (name: string, version?: number) => {
          const request =
            version === undefined ? target.open(name) : target.open(name, version);
          request.addEventListener("success", () => {
            captured = request.result;
          });
          return request;
        };
      },
    });
    const abnormal = createStore(proxy).store;
    expect((await abnormal.load()).ok).toBe(true);
    if (captured === undefined) throw new Error("database was not captured");
    (forceCloseDatabase as unknown as (database: IDBDatabase) => void)(captured);
    expect(abnormal.closed).toBe(true);

    const explicit = createStore().store;
    explicit.close();
    expect(explicit.closed).toBe(true);
    await expect(explicit.load()).resolves.toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.connection" },
    });
  });

  it("prefers a causal transaction quota error over induced request aborts", async () => {
    let captured: IDBDatabase | undefined;
    const factory = new IDBFactory();
    const proxy = new Proxy(factory, {
      get(target, property, receiver) {
        if (property !== "open") return Reflect.get(target, property, receiver);
        return (name: string, version?: number) => {
          const request =
            version === undefined ? target.open(name) : target.open(name, version);
          request.addEventListener("success", () => {
            captured = request.result;
          });
          return request;
        };
      },
    });
    const { store } = createStore(proxy);
    expect((await store.load()).ok).toBe(true);
    if (captured === undefined) throw new Error("database was not captured");

    const database = captured;
    const original = FakeIDBDatabase.prototype.transaction;
    const spy = vi
      .spyOn(FakeIDBDatabase.prototype, "transaction")
      .mockImplementation(function (
        this: IDBDatabase,
        storeNames: string | Iterable<string>,
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) {
        const transaction = Reflect.apply(original, this, [storeNames, mode, options]);
        if (this === database && mode === "readonly") {
          queueMicrotask(() => {
            (
              transaction as IDBTransaction & {
                _abort(errorName: string): void;
              }
            )._abort("QuotaExceededError");
          });
        }
        return transaction;
      });
    try {
      await expect(store.load()).resolves.toMatchObject({
        ok: false,
        error: { code: "session_checkpoint.quota" },
      });
    } finally {
      spy.mockRestore();
      store.close();
    }
  });

  it("keeps an operational schema-validation abort retriable", async () => {
    const factory = new IDBFactory();
    const original = FakeIDBDatabase.prototype.transaction;
    let abortValidation = true;
    const spy = vi
      .spyOn(FakeIDBDatabase.prototype, "transaction")
      .mockImplementation(function (
        this: IDBDatabase,
        storeNames: string | Iterable<string>,
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) {
        const transaction = Reflect.apply(original, this, [storeNames, mode, options]);
        if (mode === "readonly" && abortValidation) {
          abortValidation = false;
          queueMicrotask(() => {
            (
              transaction as IDBTransaction & {
                _abort(errorName: string): void;
              }
            )._abort("QuotaExceededError");
          });
        }
        return transaction;
      });
    const { store } = createStore(factory);
    try {
      await expect(store.load()).resolves.toMatchObject({
        ok: false,
        error: { code: "session_checkpoint.quota" },
      });
      expect(store.closed).toBe(false);
      await expect(store.load()).resolves.toMatchObject({
        ok: true,
        status: "empty",
      });
    } finally {
      spy.mockRestore();
      store.close();
    }
  });

  it("rejects schema attestation when a canceled count request fails", async () => {
    const factory = new IDBFactory();
    const original = FakeIDBDatabase.prototype.transaction;
    let poisonValidation = true;
    const spy = vi
      .spyOn(FakeIDBDatabase.prototype, "transaction")
      .mockImplementation(function (
        this: IDBDatabase,
        storeNames: string | Iterable<string>,
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) {
        const transaction = Reflect.apply(original, this, [storeNames, mode, options]);
        if (mode !== "readonly" || !poisonValidation) return transaction;
        poisonValidation = false;
        return withCanceledQuotaCount(transaction);
      });
    const { store } = createStore(factory);
    try {
      await expect(store.load()).resolves.toMatchObject({
        ok: false,
        error: { code: "session_checkpoint.quota" },
      });
      expect(store.closed).toBe(false);
      await expect(store.load()).resolves.toMatchObject({
        ok: true,
        status: "empty",
      });
    } finally {
      spy.mockRestore();
      store.close();
    }
  });

  it("retains a canceled readonly request's causal failure", async () => {
    const factory = new IDBFactory();
    const original = FakeIDBDatabase.prototype.transaction;
    let readonlyTransactions = 0;
    const spy = vi
      .spyOn(FakeIDBDatabase.prototype, "transaction")
      .mockImplementation(function (
        this: IDBDatabase,
        storeNames: string | Iterable<string>,
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) {
        const transaction = Reflect.apply(original, this, [storeNames, mode, options]);
        if (mode !== "readonly") return transaction;
        readonlyTransactions += 1;
        return readonlyTransactions === 2
          ? withCanceledQuotaCount(transaction)
          : transaction;
      });
    const { store } = createStore(factory);
    try {
      await expect(store.load()).resolves.toMatchObject({
        ok: false,
        error: { code: "session_checkpoint.quota" },
      });
      expect(store.closed).toBe(false);
      await expect(store.load()).resolves.toMatchObject({
        ok: true,
        status: "empty",
      });
    } finally {
      spy.mockRestore();
      store.close();
    }
  });

  it("settles when schema-validation terminal handlers cannot be installed", async () => {
    const factory = new IDBFactory();
    const original = FakeIDBDatabase.prototype.transaction;
    let poisonValidation = true;
    const spy = vi
      .spyOn(FakeIDBDatabase.prototype, "transaction")
      .mockImplementation(function (
        this: IDBDatabase,
        storeNames: string | Iterable<string>,
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) {
        const transaction = Reflect.apply(original, this, [storeNames, mode, options]);
        if (mode !== "readonly" || !poisonValidation) return transaction;
        poisonValidation = false;
        return new Proxy(transaction, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
          set(target, property, value) {
            if (property === "oncomplete") {
              throw new Error("private validation handler payload");
            }
            return Reflect.set(target, property, value, target);
          },
        });
      });
    const { store } = createStore(factory);
    try {
      const first = await Promise.race([
        store.load(),
        new Promise<"timeout">((resolve) => {
          globalThis.setTimeout(() => resolve("timeout"), 100);
        }),
      ]);
      expect(first).toMatchObject({
        ok: false,
        error: { code: "session_checkpoint.connection" },
      });
      expect(store.closed).toBe(false);
      await expect(store.load()).resolves.toMatchObject({
        ok: true,
        status: "empty",
      });
    } finally {
      spy.mockRestore();
      store.close();
    }
  });

  it("cannot enqueue a write before transaction terminal handlers are installed", async () => {
    const factory = new IDBFactory();
    const { store } = createStore(factory);
    const loaded = await store.load();
    if (!loaded.ok) throw new Error(loaded.error.code);

    const original = FakeIDBDatabase.prototype.transaction;
    const spy = vi
      .spyOn(FakeIDBDatabase.prototype, "transaction")
      .mockImplementation(function (
        this: IDBDatabase,
        storeNames: string | Iterable<string>,
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) {
        const transaction = Reflect.apply(original, this, [storeNames, mode, options]);
        if (mode !== "readwrite") return transaction;
        return new Proxy(transaction, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
          set(target, property, value) {
            if (property === "oncomplete") {
              throw new Error("private terminal-handler setter payload");
            }
            return Reflect.set(target, property, value, target);
          },
        });
      });
    try {
      await expect(store.save(loaded.token, '{"mustNotCommit":true}')).resolves.toMatchObject({
        ok: false,
        error: { code: "session_checkpoint.connection" },
      });
      expect(await rawCurrent(factory)).toBeUndefined();
    } finally {
      spy.mockRestore();
      store.close();
    }
  });

  it("retains transaction ownership when a success-handler setter installs then throws", async () => {
    const factory = new IDBFactory();
    const { store } = createStore(factory);
    const loaded = await store.load();
    if (!loaded.ok) throw new Error(loaded.error.code);

    const original = FakeIDBDatabase.prototype.transaction;
    const spy = vi
      .spyOn(FakeIDBDatabase.prototype, "transaction")
      .mockImplementation(function (
        this: IDBDatabase,
        storeNames: string | Iterable<string>,
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) {
        const transaction = Reflect.apply(original, this, [storeNames, mode, options]);
        if (mode !== "readwrite") return transaction;
        return new Proxy(transaction, {
          get(target, property) {
            if (property === "abort") {
              return () => {
                throw new Error("private abort failure payload");
              };
            }
            if (property === "objectStore") {
              return (name: string) => {
                const objectStore = target.objectStore(name);
                return new Proxy(objectStore, {
                  get(storeTarget, storeProperty) {
                    if (storeProperty === "get") {
                      return (key: IDBValidKey) => {
                        const request = storeTarget.get(key);
                        return new Proxy(request, {
                          get(requestTarget, requestProperty) {
                            const value = Reflect.get(
                              requestTarget,
                              requestProperty,
                              requestTarget,
                            );
                            return typeof value === "function"
                              ? value.bind(requestTarget)
                              : value;
                          },
                          set(requestTarget, requestProperty, value) {
                            const installed = Reflect.set(
                              requestTarget,
                              requestProperty,
                              value,
                              requestTarget,
                            );
                            if (requestProperty === "onsuccess") {
                              throw new Error("private set-then-throw payload");
                            }
                            return installed;
                          },
                        });
                      };
                    }
                    const value = Reflect.get(storeTarget, storeProperty, storeTarget);
                    return typeof value === "function" ? value.bind(storeTarget) : value;
                  },
                });
              };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
          set(target, property, value) {
            return Reflect.set(target, property, value, target);
          },
        });
      });
    try {
      await expect(store.save(loaded.token, '{"mustNotCommit":true}')).resolves.toMatchObject({
        ok: false,
        error: { code: "session_checkpoint.connection" },
      });
      expect(await rawCurrent(factory)).toBeUndefined();
    } finally {
      spy.mockRestore();
      store.close();
    }
  });

  it("does not report a canceled put error as a committed compare-and-swap", async () => {
    const factory = new IDBFactory();
    const { store } = createStore(factory);
    const empty = await store.load();
    if (!empty.ok) throw new Error(empty.error.code);
    const first = await store.save(empty.token, '{"revision":1}');
    if (!first.ok) throw new Error(first.error.code);

    const original = FakeIDBDatabase.prototype.transaction;
    const spy = vi
      .spyOn(FakeIDBDatabase.prototype, "transaction")
      .mockImplementation(function (
        this: IDBDatabase,
        storeNames: string | Iterable<string>,
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ) {
        const transaction = Reflect.apply(original, this, [storeNames, mode, options]);
        if (mode !== "readwrite") return transaction;
        return new Proxy(transaction, {
          get(target, property) {
            if (property === "objectStore") {
              return (name: string) => {
                const objectStore = target.objectStore(name);
                return new Proxy(objectStore, {
                  get(storeTarget, storeProperty) {
                    if (storeProperty === "put") {
                      return (value: unknown, key: IDBValidKey) => {
                        const request = storeTarget.add(value, key);
                        request.addEventListener("error", (event) => {
                          event.preventDefault();
                        });
                        return new Proxy(request, {
                          get(requestTarget, requestProperty) {
                            if (requestProperty === "error") {
                              return new DOMException(
                                "private quota payload",
                                "QuotaExceededError",
                              );
                            }
                            const value = Reflect.get(
                              requestTarget,
                              requestProperty,
                              requestTarget,
                            );
                            return typeof value === "function"
                              ? value.bind(requestTarget)
                              : value;
                          },
                          set(requestTarget, requestProperty, value) {
                            return Reflect.set(
                              requestTarget,
                              requestProperty,
                              value,
                              requestTarget,
                            );
                          },
                        });
                      };
                    }
                    const value = Reflect.get(storeTarget, storeProperty, storeTarget);
                    return typeof value === "function" ? value.bind(storeTarget) : value;
                  },
                });
              };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
          set(target, property, value) {
            return Reflect.set(target, property, value, target);
          },
        });
      });
    try {
      await expect(store.save(first.token, '{"revision":2}')).resolves.toMatchObject({
        ok: false,
        error: { code: "session_checkpoint.quota" },
      });
    } finally {
      spy.mockRestore();
    }
    expect(await rawCurrent(factory)).toMatchObject({
      generation: "1",
      checkpointJson: '{"revision":1}',
    });
    store.close();
  });

  it("runs an open handler once when its property setter installs then throws", async () => {
    const factory = new IDBFactory();
    const proxy = new Proxy(factory, {
      get(target, property, receiver) {
        if (property !== "open") return Reflect.get(target, property, receiver);
        return (name: string, version?: number) => {
          const request =
            version === undefined ? target.open(name) : target.open(name, version);
          return new Proxy(request, {
            get(openRequest, key) {
              const value = Reflect.get(openRequest, key, openRequest);
              return typeof value === "function" ? value.bind(openRequest) : value;
            },
            set(openRequest, key, value) {
              const installed = Reflect.set(openRequest, key, value, openRequest);
              if (key === "onupgradeneeded") {
                throw new Error("private set-then-throw payload");
              }
              return installed;
            },
          });
        };
      },
    });
    const { store } = createStore(proxy);

    await expect(store.load()).resolves.toMatchObject({
      ok: true,
      status: "empty",
    });
    expect(store.closed).toBe(false);
    store.close();
  });

  it("settles when a mandatory open handler has no installation path", async () => {
    const factory = new IDBFactory();
    const seeded = await openDatabase(factory, 1, (database) => {
      database.createObjectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME);
    });
    seeded.close();
    let poisonSuccess = true;
    const proxy = new Proxy(factory, {
      get(target, property, receiver) {
        if (property !== "open") return Reflect.get(target, property, receiver);
        return (name: string, version?: number) => {
          const request =
            version === undefined ? target.open(name) : target.open(name, version);
          if (!poisonSuccess) return request;
          poisonSuccess = false;
          return new Proxy(request, {
            get(openRequest, key) {
              const value = Reflect.get(openRequest, key, openRequest);
              if (key !== "addEventListener" || typeof value !== "function") {
                return value;
              }
              return (event: string, ...args: unknown[]) => {
                if (event === "success") {
                  throw new Error("private success-listener payload");
                }
                return Reflect.apply(value, openRequest, [event, ...args]);
              };
            },
            set(openRequest, key, value) {
              if (key === "onsuccess") {
                throw new Error("private success-handler payload");
              }
              return Reflect.set(openRequest, key, value, openRequest);
            },
          });
        };
      },
    });
    const { store } = createStore(proxy);

    const first = await Promise.race([
      store.load(),
      new Promise<"timeout">((resolve) => {
        globalThis.setTimeout(() => resolve("timeout"), 100);
      }),
    ]);
    expect(first).toMatchObject({
      ok: false,
      error: { code: "session_checkpoint.connection" },
    });
    expect(store.closed).toBe(false);
    await expect(store.load()).resolves.toMatchObject({
      ok: true,
      status: "empty",
    });
    store.close();
  });

  it("reports blocked progress without allowing asynchronous callback failure to affect opening", async () => {
    const factory = new IDBFactory();
    const blocked = vi.fn(async () => {
      throw new Error("observer failure");
    });
    const proxy = new Proxy(factory, {
      get(target, property, receiver) {
        if (property !== "open") return Reflect.get(target, property, receiver);
        return (name: string, version?: number) => {
          const request =
            version === undefined ? target.open(name) : target.open(name, version);
          queueMicrotask(() =>
            request.onblocked?.(new Event("blocked") as IDBVersionChangeEvent),
          );
          return request;
        };
      },
    });
    const { store } = createStore(proxy, digestFixture(), blocked);
    expect((await store.load()).ok).toBe(true);
    expect(blocked).toHaveBeenCalledOnce();
    store.close();
  });

  it("redacts a hostile open-request handler installation failure", async () => {
    const factory = new IDBFactory();
    const proxy = new Proxy(factory, {
      get(target, property, receiver) {
        if (property !== "open") return Reflect.get(target, property, receiver);
        return (name: string, version?: number) => {
          const request =
            version === undefined ? target.open(name) : target.open(name, version);
          return new Proxy(request, {
            get(openRequest, property) {
              const value = Reflect.get(openRequest, property, openRequest);
              if (property !== "addEventListener" || typeof value !== "function") {
                return value;
              }
              return (event: string, ...args: unknown[]) => {
                if (event === "blocked") {
                  throw new Error("private blocked listener payload");
                }
                return Reflect.apply(value, openRequest, [event, ...args]);
              };
            },
            set(openRequest, handler, value, openReceiver) {
              if (handler === "onblocked") {
                throw new Error("private handler setter payload");
              }
              return Reflect.set(openRequest, handler, value, openReceiver);
            },
          });
        };
      },
    });
    const { store } = createStore(proxy);

    await expect(store.load()).resolves.toEqual({
      ok: false,
      error: {
        code: "session_checkpoint.connection",
        message: "The session checkpoint database is unavailable.",
      },
    });
    store.close();

    const verifier = createStore(factory).store;
    await expect(verifier.load()).resolves.toMatchObject({
      ok: true,
      status: "empty",
    });
    verifier.close();
  });

  it("falls back when mandatory open-request handler setters throw", async () => {
    const factory = new IDBFactory();
    const proxy = new Proxy(factory, {
      get(target, property, receiver) {
        if (property !== "open") return Reflect.get(target, property, receiver);
        return (name: string, version?: number) => {
          const request =
            version === undefined ? target.open(name) : target.open(name, version);
          return new Proxy(request, {
            get(openRequest, key) {
              const value = Reflect.get(openRequest, key, openRequest);
              return typeof value === "function" ? value.bind(openRequest) : value;
            },
            set(openRequest, handler, value) {
              if (
                handler === "onupgradeneeded" ||
                handler === "onerror" ||
                handler === "onsuccess"
              ) {
                throw new Error("private mandatory handler setter payload");
              }
              return Reflect.set(openRequest, handler, value, openRequest);
            },
          });
        };
      },
    });
    const { store } = createStore(proxy);

    await expect(store.load()).resolves.toMatchObject({
      ok: true,
      status: "empty",
    });
    store.close();
    const upgraded = await openDatabase(factory, 2);
    upgraded.close();
  });
});
