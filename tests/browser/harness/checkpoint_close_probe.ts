import {
  IndexedDbSessionCheckpointStore,
  SESSION_CHECKPOINT_DATABASE_NAME,
  SESSION_CHECKPOINT_OBJECT_STORE_NAME,
} from "@breditor/browser/advanced";

/** Run only in a fresh test browser context: creates and deletes its own database. */
export async function probeBlockedCheckpointClose() {
  const blocker = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(SESSION_CHECKPOINT_DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SESSION_CHECKPOINT_OBJECT_STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const deletion = indexedDB.deleteDatabase(SESSION_CHECKPOINT_DATABASE_NAME);
  const deleted = new Promise<void>((resolve, reject) => {
    deletion.onsuccess = () => resolve();
    deletion.onerror = () => reject(deletion.error);
  });
  // Deliberately retain the first connection, blocking deletion and any open
  // queued behind it. This uses real browser IndexedDB scheduling, not timers.
  await new Promise<void>((resolve) => { deletion.onblocked = () => resolve(); });
  let nativeCompletion: Promise<string> = Promise.resolve("not opened");
  let lateDatabase: IDBDatabase | undefined;
  const factory = new Proxy(indexedDB, {
    get(target, property, receiver) {
      if (property !== "open") return Reflect.get(target, property, receiver);
      return (name: string, version: number) => {
        const request = target.open(name, version);
        nativeCompletion = new Promise((resolve) => {
          request.addEventListener("success", () => {
            lateDatabase = request.result;
            resolve("success");
          });
          request.addEventListener("error", () => resolve(request.error?.name ?? "error"));
        });
        return request;
      };
    },
  });
  const store = new IndexedDbSessionCheckpointStore({ indexedDB: factory, crypto: crypto.subtle });
  const loads = Promise.all([store.load(), store.load()]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settledBeforeUnblock = false;
  let errors: string[] = [];
  try {
    store.close();
    const results = await Promise.race([
      loads,
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), 1_000); }),
    ]);
    settledBeforeUnblock = results !== undefined;
    errors = results?.map((result) => result.ok ? result.status : result.error.code) ?? [];
  } finally {
    clearTimeout(timer);
    blocker.close();
    await deleted;
    await nativeCompletion;
    await loads;
    lateDatabase?.close();
    store.close();
  }
  return { settledBeforeUnblock, errors, nativeCompletion: await nativeCompletion, closed: store.closed };
}
