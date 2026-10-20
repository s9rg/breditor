# Recover queued review and version publication across generations

The explicitly selected retained-session profile saves pending suggestions,
immutable revisions and shared version-publication state in the same atomic cut
as native document generations, comments and relay receipts. Cold recovery keeps
exact packet bytes, retry choices, final decisions, accepted versions and native
Undo and Redo. Pending proposals still do not change accepted document content;
the authenticated server remains responsible for ordering final decisions.

This profile uses `SharedSegmentedRelaySession.openRetained()`. It does not extend
or automatically upgrade an old queue, cache, local generation head or relay-only
head. Native packet formats, wire versions, old defaults and nested store limits
remain unchanged.

## Select the complete retained binding

Supply the [relay source options](SEGMENTED_RELAY_RECOVERY.md), plus a closed
`retained` binding with `suggestions`, `revisions` and `versions` keys. Use null
for an unselected store. Revision retention requires its base suggestion queue.
Every selected identity must match the source's endpoint, room, principal,
document writer and transport. Owned suggestions also require the source's exact
reviewed-history identity and effect writer.

```ts
const session = await SharedSegmentedRelaySession.openRetained({
  ...sourceOptions,
  retained: {
    suggestions: {
      identity: pinnedSuggestionIdentity,
      ownedHistory: 'reviewed-v1',
    },
    revisions: {binding: pinnedRevisionBinding},
    versions: pinnedVersionIdentity,
  },
});

const queue = await session.openSuggestionQueue();
const document = createSharedSegmentedRelaySync(session, {
  identity: protectedDocumentIdentity,
  getToken: getCurrentAccountToken,
  autoConnect: false,
  suggestions: pinnedSuggestionLane,
  suggestionRevisions: {binding: pinnedRevisionBinding},
});
const revisions = await session.openSuggestionRevisions({transport: document});
const versions = await session.openVersionCatalog({
  getToken: getCurrentAccountToken,
});

// Factories adopt their resources before any connection starts.
await revisions.connect();
await versions.connect();
await session.sealGeneration(crypto.randomUUID());
```

The existing `SharedSuggestionSync` can borrow this queue and document adapter
for discovery, publication and decisions. The paired comment factory is also
unchanged. Version-only profiles support both original and atomic-V2 transports;
suggestion queues require atomic V2. New revision and version factories start
disconnected and refuse automatic-start overrides. Call `connect()` after the
factory returns. Original constructors retain their original startup behavior.

Store identity, database and source custody come from the selected session.
They cannot be replaced in the component factories. Credentials and token
callbacks remain outside portable data; stored roles and receipts do not grant
current permission or cross-device writer authority.

## Keep pending and durable cuts distinct

The new closed `breditor/shared-relay-generation-retained-head` version-one
record wraps the existing relay head and exact original retained-store records.
One transaction commits immutable native files, the active segment, paired
comments, named versions, relay delivery progress and all selected records.
There are no separate queue/cache database writes in this profile.

Each accepted local queue change enters recoverable memory synchronously.
`exportRetainedRecovery()` includes those pending records even if a prerequisite
queue save fails. `retainedRecords()` exposes only the last confirmed atomic
cut. Component `localSaved` status stays conservative until its save completes.
An older physical write never replaces newer recoverable intent. Uncertain
commits reconcile the exact earlier attempt before later captures, without
overwriting foreign heads or repairing changed immutable files.

The session binds component persistence to its actual private native source and
storage path. Replacing a public `save()` or `flush()` method cannot manufacture
a local acknowledgement. Cold opening validates original record schemas and
then verifies retained packets, effects and owned decisions against the actual
native owner. Visible text equality is not a substitute for those checks.

## Retire and restore the complete session

Close stops borrowed networking and retires native edits before draining the
retained stores and final native cut. Failed persistence keeps recovery inputs
and native writer leases available. `retry()` can finish local persistence after
the old transport is disposed; it does not resume that transport. Explicit
discard waits for in-flight writes and component openings before releasing the
source. A temporary component reservation may refuse release and be retried.
Storage version change stops networking and leaves the complete recovery readable.
Dispose user-created views and `SharedSuggestionSync` adapters when they are no
longer needed; they are borrowed consumers, not owned by the session.

Use the separate `breditor/shared-relay-generation-retained-recovery`
version-one envelope with
`SharedSegmentedRelaySession.restoreRetainedRecovery()`. Supply the exact original
bindings, current editing/review policies, the native restore factory and
`writerRecovery: 'host-reacquired'`. The destination head must be absent. Host
reacquisition is a required external action, not a permission reconstructed from
JSON. The older `exportRecovery()` refuses this profile rather than silently
omitting its queues. Individual component exports remain dependent records,
not complete source backups.

Archives retain historical and deleted content. Protect them as document data.
They contain neither resume credentials nor uploaded asset bytes or provider
acknowledgements.

## Bounds and remaining release work

Each nested suggestion, revision and version store retains its original 32 MiB
budget and entry/packet limits. The original native, relay-metadata, comment,
version and Undo limits also remain unchanged. The new combined head has its own
224 MiB plus 64 KiB ceiling. Sealing remains explicit; there is no automatic
eviction, history reset, compaction or unlimited document lifetime.

Functional tests cover source and installed packages, exact offline packet
recovery, authenticated revision supersession and Accept, version publication,
server restart, saved Redo and failed receipt saves. Storage fixtures also cover
lost acknowledgements, concurrent drafts, retirement, family refusal and large
native writer IDs. Synthetic storage is not browser power-loss certification.

The [functional qualification](qualification/2026-10-19-segmented-retained-recovery.json)
passes 46 selected checks. Source and fresh installed archives each pass six
author-side delivery configurations, 12 cold reopens, six native server restarts
and 18 future selective-history steps. The storage suite adds 28 contracts,
including version-only sources on both wire families and exact large writer IDs.

The new profile currently connects document authors. Permanent observation-only
readers need a separate generation-aware transport; their original constructors
still refuse segmented sources. Passing the original reader workflows preserves
compatibility but does not provide that new connection path.

Generation-aware observer, upload/source and operational participant/room bindings,
independent comment and server-log generations, full provider/client closure,
protected credential handoff and authenticated whole-room activation remain
separate V1 work. All 13 release gates remain open.
