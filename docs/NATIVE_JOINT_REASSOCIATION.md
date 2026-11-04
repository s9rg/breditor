# Client association after a Native service restart

This opt-in SDK component continues one independently selected joint transition
when its Native service restarts. It keeps the original joint descriptor, Native
intent, source histories and metadata journals immutable. Its own descriptor,
Native intent and metadata destinations use new, distinct namespaces. Ordinary
protocol formats, public-root exports and normal Wasm remain unchanged.

The implementation is isolated in `native_room_joint_reassociation/`. It is not
a V1 readiness claim. Full functional and independently installed qualification
must accompany integration; constructor/type checks and stored phases cannot
prove a complete handoff.

## Contract and boundaries

A new association includes the complete original choice, fresh activation and
publication selections, a new Native-intent choice with the identical graph and
Blob pins, new metadata destination names, and exact earlier metadata evidence.
A linear predecessor list pins every earlier association and preserves its
original selection and observations without recursively duplicating the room
plan. All namespace collisions and predecessor hashes are checked.

The selected Native document/server/participant cut must remain the original
complete cut. Reopening a pending checkpoint uses the same planned epoch with a
new control instance. Reopening a committed checkpoint uses its direct child
epoch. The publication listener stays the original logical endpoint. A changed
cut, skipped epoch or changed listener needs a separately selected checkpoint or
migration; this operation does not guess a replacement for an old choice.

Earlier metadata destinations are admitted under the actual target witness and
both original journal leases. A finite read retains the complete canonical
before/current journal text, including revisions and acknowledgements. It holds
all existing destinations and reserves missing ones too. The recognized stages
are absent, intent only, preparation, partial review, and complete metadata.
Review facts can advance by lane; metadata records advance together in one CAS.
Unexpected later facts require reconciliation rather than an older replacement.

An unstarted destination set has an explicit absence observation. It does not
invent an old HTTP control or continuation choice. If any declared destination
already exists, this absence action refuses without initializing or deleting it.
Every read guard expires before its leases are released.

## Owner actions

`JointRoomReassociationAttempt.begin` takes the original joint choice and the
existing cold-execution options. `resume` additionally takes an independently
retained restart choice. Construction performs no database/network operation.
The owner keeps recovered clients private through these separate actions:

1. `recoverReplacement` acquires fresh actors and reconstructs/promotes the
   selected targets. Saved run rows cannot supply those actors.
2. `prepare` captures and independently retains the complete new association,
   then creates the new Native intent and association descriptor, absent only.
3. `resumePreparation` completes interrupted DATA writes from the exact retained
   choice. It deliberately takes no retired HTTP requester. A further service
   restart cannot make copying verified original data require a dead control.
   It still supplies no Native receipt or readiness.
4. `confirmNative` re-inspects complete Native/provider/packet/raster facts before
   and after a fresh decision, then contacts the genuine selected requester.
   An uncertain successful request must be confirmed by a fresh actual response.
5. `continueMetadata` creates new destinations; `resumeMetadata` explicitly
   continues partial ones. Earlier evidence stays held and byte-exact. All
   original acknowledged and pending facts are retained.
6. `publish` repeats the current metadata admission and requires its own fresh
   approval plus an authenticated Native publication response. The full new
   association digest binds this publication. The private fixture observer only
   observes actual serving custody.
7. `publishedMetadata` returns DATA from the last successful publication, since
   retries can advance journals beyond an earlier capture. `takeOwner` becomes
   available only after all actual barriers have succeeded.

Each action has its own implementation file. Close cancels finite borrowers,
drains actual work and closes the cold executor. Partial/committed DATA is not
erased on a failed write, cancelled approval, unknown reply or shutdown.

## Verification scope and remaining work

The metadata evidence workset exercises seven real participant families, three
local metadata lanes, real Native receipts and failures at every destination
stage. It checks no destination writes during reads, all namespace leases,
unchanged original data and future document/comment Undo/Redo.

The association storage workset checks pending/committed epochs, a repeated
linear lineage, namespace exclusions, original/predecessor hashes, corruption,
transaction cancellation, reader competition and versionchange. Its synthetic
control/receipt declarations are DATA tests, never Native ownership proof.

The complete functional workset is being qualified separately. Its assertions
require killing the actual committed Native process,
selecting fresh child controls, reconstructing seven cold clients with fourteen
pending lanes, interrupting descriptor creation, completing it without requesters,
confirming real lost replies, continuing metadata, publishing and delivering through
the original protocols before checking future histories and selected asset
fields. Physical browser durability and accessibility remain separate gates.

Resource limits remain explicit: descriptors use the existing 32 MiB budget;
lineage entry, namespace-custody and archive limits can refuse further work.
The implementation keeps earlier facts instead of deleting them to pass a
budget. Compaction/storage-resource qualification and all V1 release gates
remain open. No historical WebKit or archive short-read repair is claimed here.
