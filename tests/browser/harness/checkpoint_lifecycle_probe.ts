import { IndexedDbSessionCheckpointStore } from "@breditor/browser/advanced";

/** Fresh browser context only. Exercise closure during a real Web Crypto digest. */
export async function probePrivateCheckpointLifecycle() {
  let closeDuringDigest = false;
  let digestCalls = 0;
  let publicStatusReads = 0;
  const store = new IndexedDbSessionCheckpointStore({
    indexedDB,
    crypto: { digest(algorithm, data) {
      digestCalls += 1;
      const pending = crypto.subtle.digest(algorithm, data);
      if (closeDuringDigest) store.close();
      return pending;
    } },
  });
  try {
    const empty = await store.load();
    if (!empty.ok) throw new Error(empty.error.code);
    const saved = await store.save(empty.token, "{}");
    if (!saved.ok) throw new Error(saved.error.code);
    Object.defineProperty(store, "closed", { get() {
      publicStatusReads += 1;
      return false;
    } });
    closeDuringDigest = true;
    const loaded = await store.load();
    const rejectedSave = await store.save(saved.token, "{}");
    return {
      load: loaded.ok ? loaded.status : loaded.error.code,
      save: rejectedSave.ok ? rejectedSave.status : rejectedSave.error.code,
      digestCalls,
      publicStatusReads,
    };
  } finally {
    store.close();
  }
}
