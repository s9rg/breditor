# Initial shared editor read only policy

`initializeSharedReadOnly` applies a fresh host-selected document policy to an
unobserved native owner. It preserves the exact checkpoint, publication counter,
causal history, selection, Undo and Redo. Recovery can therefore verify the
original selected backup while document authoring is already blocked.

The opt-in collaboration package requires the matching native Wasm capability.
Existing constructors still start writable unless the host explicitly initializes
them. No permission is recovered from a journal, saved role or inventory file.

## Initialize before adopting the native owner

```ts
import {initializeSharedReadOnly} from '@breditor/collaboration';

function restoreLockedDocument(checkpoint: string) {
  // Other history/scope families require their explicitly selected factory.
  const raw = profile.restore(room, checkpoint);
  try {
    return initializeSharedReadOnly(raw, true);
  } catch (error) {
    raw.free();
    throw error;
  }
}
```

Supply this factory to the original participant recovery coordinator. Its existing
native admission, source-byte checks, leases and attempt markers remain strict.
For paired sessions, also pass a fresh `review` policy with `access: 'read_only'`
while inactive. Document read-only mode does not independently restrict comments.
The review actor, original account, relay namespace and transport remain unchanged.

The helper returns the same raw owner, retaining its type. It neither observes
nor frees it. On failure the caller retains ownership and must close it. Only
Boolean modes are accepted. There is no fallback to the live setter or to a
JavaScript-only write flag when the native capability is missing.

Initialize an already configured recovery family. Locking a fresh original owner
does not enable optional scope/history modes; their later setup may require a
writable owner. Configure those modes before taking the source checkpoint, then
select their matching restore factory rather than locking and upgrading afterward.

## Enforce the one shot boundary

The native owner exposes the independent `initial_read_only_version` capability
at version 1 and `initialize_read_only`. Successful initialization permanently
consumes it, including an explicit `false`. Issuing either `observe` or
`observe_document` also permanently seals it, even if that observation is freed.
SDK adoption observes the owner, so initialization must precede adoption.

The gate is local to the native wrapper, not a mutable SDK flag or persisted
field. The counter-free initializer is crate-private on the Rust side and cannot
be used as a public native live-policy setter. Initial locking does not add a
`readOnlyRevision` or rewrite checkpoint fields. The host must initialize policy
again on every new restore; saved bytes alone never grant or restore permission.

After observation, use the existing guarded `setReadOnly`. A genuine change
still advances the original publication counter and invalidates prior native
observations and source captures. A repeated live value remains a no-op. A host
must not reuse a covered backup report as current authority after unlocking.

Read-only mode is not a snapshot freeze. Selection changes and authorized incoming
updates can still publish and invalidate source captures. Do not mount inactive
owners in the UI or start synchronization before exact cut verification finishes.

## Recovery and activation remain separate

The functional probe covers six profile constructors and 108 explicit
scope/history combinations, with native write refusals, permanent observation
sealing, exact restart bytes and future Undo/Redo comparisons. Twenty participant
recoveries and same-attempt reopens retain locked document and review policy while
matching all registered prefixes across ten native server inventory fixtures.
The storage and lock adapters in these checks are Node fixtures.

This capability does not authenticate a host, recover protected resume credentials,
discover undeclared stores, fence another device, resolve provider assets or
durably activate a room. Those responsibilities remain in the room-wide recovery
workflow. Cross-generation Undo/Redo and offline-edit bridging also remain open.
