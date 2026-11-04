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

## Reproducing the worksets

Use the pinned Node/dependency lock and the separately built
`native_joint_process_recovery_functional` fixture with its recorded build
report. The ordinary Wasm remains the independently qualified input; these
commands never rebuild or substitute it.

- `npm run check:generated-sdk` re-emits TypeScript to disposable directories.
  It requires exact emitted file names/bytes and leaves runtime inputs intact.
  Stale output files cause refusal before a new installed qualification.
- `npm run test:collaboration:joint-reassociation` runs all 17 reader,
  descriptor-storage, admission and complete committed-restart cases.
- `npm run test:collaboration:joint-reassociation:installed` packs the three
  packages, installs them offline without workspace links, checks declarations
  and replays those exact assertions with reversible module-location changes.
  Its watchdog owns only its detached test child's process group.

The complete owner test currently selects an already committed Native checkpoint
with no earlier metadata destinations. The reader separately checks existing
metadata prefix stages and descriptor tests separately check pending/repeated
lineages. A combined pending checkpoint, existing-metadata ownership cycle and
repeated complete service restart still need their own functional qualification.

A separate repeated-restart case is staged with
`npm run test:collaboration:joint-reassociation:repeated`. It closes the first
private owner after complete metadata continuation, kills the actual service
again, constructs another fresh cold owner, pins the prior association and all
four earlier metadata destinations, then requires new confirmation/continuation
and final publication/delivery. It checks earlier metadata bytes through final
delivery. This additional case is not yet qualified. The original complete
workload assertions were extracted unchanged into a shared test helper before
adding this explicit variant; the currently running frozen worksets remain
untouched.

The explicit pending-then-committed variant uses
`npm run test:collaboration:joint-reassociation:pending-repeated` and its separate
`:installed` command. Its first crash occurs with the genuine original Native
intent still prepared and no activation request sent. Explicit terminal cleanup
checkpoints/closes the actual source owner; a pending reopen must retain the
exact planned epoch and checkpoint bytes with fresh controls. The later crash
occurs after complete metadata continuation and requires the committed direct
child rule. Final assertions require two actual deaths, four unchanged earlier
metadata destinations, all fourteen deliveries and exact future histories. This
case remains unqualified until both worksets finish. The default installed
workset still always runs its original seventeen cases.
