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

A focused reproduction identified the absent local run journal before the first
Native commit. The new explicit `beginPrepared` route is documented in
[COLD_PREPARED_EXECUTION.md](COLD_PREPARED_EXECUTION.md). Its seven-family local
recovery/future-history source case passes; the full pending Native workflow
still needs composed qualification. The old pre-fix pending workload was
intentionally stopped after the focused reproduction established its missing
start path. Its partial log/result remain retained and are not a passing
functional result. The initial independent full workset also observed an actual
short Blob read in `ownedLineagePayload` during graph reconstruction before
Native preparation. That refusal remains unresolved and cannot be counted as a
successful client association.

Follow-up diagnostics preserve the original short-read refusal and attach only
immutable numerical observations: requested offset/length and buffer length
before/after authority checks. They never retry or accept a short read; even a
frozen original error remains the original error. Nine payload storage cases
pass, including short-read injection, authority detachment and frozen errors.
This is diagnostic qualification, not a repair of the observed intermittent
fault. Future worksets retain the complete selected archive after known-version
materialization and after a successful current capture before preparation, with
exact hash/size/read-back checks. A real 7,956,095-byte prior Native fixture
archive passes the retention smoke. These filesystem copies flatten physical
Blob construction and cannot alone reproduce that runtime condition. The
currently running frozen worksets are unchanged by these additional diagnostics.

## Preparation evidence fixture boundary

The pending/repeated source run at `1eadf3cb` stopped after retaining the genuine
8,261,282-byte after-version-materialization archive. Its next evidence helper
mistakenly received `retained.current`: `session.retain()` already returns the
`SelectedRoomCurrentFile` directly, whereas the separate scope `retainCurrent()`
API adds a `{current, integrity}` wrapper. This is a test-instrumentation error;
the case did not reach a pending Native restart or demonstrate a short read.
Its terminal log SHA-256 is
`e6d0f2e1ac192156a94239a8a2ab8c17ffe2b7c1266cc3924f287a4e70d1524b`.

The preparation fixture now passes the direct file. A focused regression invokes
that actual preparation entrypoint, checks exact persisted evidence bytes, then
intentionally stops at the downstream archive-reader boundary. It fails with
the original TypeError before this correction and passes afterward. The same
case passes through fresh independently installed packages, exact generated
output and strict private types. Run it separately with
`node scripts/check-joint-reassociation-installed.mjs --input-retention`.
This separate one-case workset does not change or qualify the default 17-case
Native workset. Full pending/repeated reconstruction must still run on a fresh
frozen snapshot; no product or archive-fault repair is claimed by this fixture fix.

## Immutable cold capture repair

The clean committed-process source run at `5878e67e` restored all fourteen actors
and seven private targets after a real committed Native process death, then
refused before the intended descriptor-write interruption. The test's generic
rejection assertion concealed that earlier error. Its original terminal log is
retained (SHA-256
`f9296a49df38f7bedd95b6b1dc964312ffebb3af647f77d388f27608b124d5cb`).

The saved complete intent independently reproduces a mandatory failure in the
next path: the decoder's `fields()` call created a new, unfrozen top-level
projection, and the encoder correctly refuses unfrozen capture data. All nested
tagged values were already immutable. Freezing the detached root restores that
contract; no graph fields, objects, identities, limits or encoder validation are
changed. The actual saved 13-object, 15,927,052-byte capture now re-encodes with
identical graph/payload pins under its real reopened Native selection.

The focused regression fails before the fix. The corrected intent suite passes
12 cases, including both direct and durable cold-store decode/re-encode; the
retention source/independently installed worksets pass 15 cases. The broader
association/admission/retention/intent source workset passes 27 cases. A separate
bounded ten-process diagnostic sample passes the same 15 checks each time.
An earlier final-source run had one unexpected archive-integrity refusal in an
existing occupied-data case. That original failure remains retained; the later
passes do not repair the intermittent archive-read fault. Unexpected refusal
logging now preserves its finite read diagnostics, and interruption assertions
rethrow the actual earlier failure if the intended write was never reached.

The frozen pending run at `b09c2aa7` was deliberately stopped after this mandatory
decode/encode refusal was reproduced; its original observations and stop record
remain intact. Complete corrected committed and pending/repeated workflows still
need qualification before the client owner can be integrated.

## Explicit saved DATA replay

`probe-selected-current-data.mjs` reads an explicitly selected saved archive
using only the bounded native digest capability. It exposes no actor factory,
storage writer or external requester. Selection JSON and runtime directory are
separate inputs; `--fixture-raster` explicitly selects the controlled test raster
decoder. The retained 8,261,282-byte input passes with all seven participant
payloads and nine original input files readable. This checks the saved bytes,
not the physical Blob construction or a live room.
