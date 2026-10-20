# Observe shared documents across native history generations

Permanent observers can now use the explicit generation-aware relay session.
They retain pending suggestions and immutable revisions across native history
seals and cold recovery, import accepted document edits, and remain unable to
author document operations or execute Accept. Current server grants still decide
whether a reader may propose or Reject.

## Select the observer transport

Open the [retained session](SEGMENTED_RETAINED_RECOVERY.md) with `readOnly: true`,
atomic-V2 document transport, the exact registered observer document writer and
matching nonsecret bindings. Supply an owner joined under that observer writer,
not an owner that created the document. The actual native authored prefix must
be zero; changing a previously authored owner to read-only does not qualify it.

```ts
const observer = createSharedSegmentedSuggestionObserverRelay(session, {
  identity: protectedObserverIdentity,
  getToken: getCurrentAccountToken,
  autoConnect: false,
  suggestionRevisions: {binding: pinnedRevisionBinding},
});
const queue = await session.openSuggestionQueue();
const revisions = await session.openSuggestionRevisions({transport: observer});
const suggestions = new SharedSuggestionSync(queue, observer, {
  autoStart: false,
});

await observer.connect();
await revisions.connect();
await suggestions.connect();

// Once received history makes the active segment nonempty:
await session.sealObserverGeneration(crypto.randomUUID());
```

The factory requires the actual opened session. Detached recovery metadata,
copied options, an author credential or replacement storage callbacks cannot
select the observer path. The original `SharedSuggestionObserverRelay`
constructor retains its original-family contract and still refuses generation
sources. The new factory adopts its borrowed transport before automatic
connection can start; the session stops it during retirement. Dispose separately
created `SharedSuggestionSync` adapters and views when their host is finished.

## Keep readiness separate from recovered state

Opening a saved session does not restore a live connection, account grant or
observer credential. Connection authenticates the current account, checks the
room descriptors, resumes the original observer lease and verifies the native
zero clock. It imports and durably saves received content and the zero-clock
metadata before reporting ready. The saved document receipt stays null.

A failed save leaves readiness false and preserves recoverable input. Overriding
the session's public `save()` or `flush()` cannot manufacture a persistence
acknowledgement. Retry the actual source before reconnecting. Existing pending
proposals and revisions remain outside accepted document content.

Observers always use `resumeObserver`; they do not register or resume a document
author or submit document groups. A later Editor grant does not promote this
transport: its Accept permission remains false and direct Accept is refused.
Changing the live native owner to writable immediately fails the observer.

The zero clock concerns this observer's authored lane. It does not prove that
every unrelated room operation, provider state or client participant has been
recovered. Whole-room activation remains a separate contract.

## Seal received history without enabling editing

`sealObserverGeneration()` calls the separately versioned native
`seal-observer-history-segment/v1` operation. Its guarded preconditions require
both live read-only policy and a zero native authored prefix. The operation
retains causal content, UI state, pending work and history, then commits the
result through the selected durable session. It never temporarily unlocks
editing.

The original `sealGeneration()` and native `seal-history-segment/v1` retain their
writable-owner contract and still refuse read-only owners. The new optional
native marker is `observer_history_sealing_version()`. A runtime without that
separate capability still has its original generation support; the new observer
sealing method fails explicitly rather than falling back to editing or an AST
reimport.

`core.sealObserverHistoryGeneration()` is only a native publication.
`session.sealObserverGeneration()` additionally awaits local persistence. Native
checkpoints do not grant read-only policy: hosts must supply the current policy
when reopening or restoring the session.

## Functional qualification and release boundaries

The [functional qualification](qualification/2026-10-19-segmented-observer-recovery.json)
passes 54 selected checks, 653 fresh shared Rust tests, 216 relay tests, 385 editor
tests and 824 script tests, with three existing opt-in script checks skipped.
Source and fresh installed archives each pass six selection/history configurations,
12 Reader instances, 24 cold reopens, 12 observer seals and six native-server
restarts. Cases include exact pending revision recovery, imported accepted edits,
save failure before readiness and permanent Accept refusal after an Editor grant.
The native tests cover all 144 language, inline, selection and history-policy
combinations, plus stale, foreign, empty, reused-generation, writable and
previously authored refusals.

The generation, journal, packet, queue and retained-head bounds remain unchanged.
There is no automatic rollover, eviction, history reset or unlimited document
lifetime. Storage and Web Locks in these probes are synthetic, not browser
power-loss certification. Generation-aware assets and operational participant
bindings, independent comment/server generations, provider closure and
authenticated whole-room activation remain V1 work.
