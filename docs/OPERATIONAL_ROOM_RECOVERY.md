# Operational room recovery

`SharedRoomOperationalRecovery` transfers a genuinely staged room catalog into
durable operational custody. It retains the original server file, inventory and
every supplied participant copy while allowing selected participants to reopen
later native history, pending review/version stores and complete upload queues.
It does not authenticate or activate a recovered room.

## Begin from a genuinely staged catalog

```ts
import {SharedRoomOperationalRecovery} from '@breditor/collaboration';

// Retain expected independently. The existing catalog has already staged the
// original explicit participantRequests and still owns their native editors.
const attempt = await SharedRoomOperationalRecovery.begin({
  database: 'room-operation-1',
  catalog,
  expected,
  participants: [
    {id: 'alice', operationDatabase: 'alice-operation-1'},
    {id: 'observer', operationDatabase: 'observer-operation-1'},
  ],
  checkAuthority: () => host.checkFencedRoomRecovery(trustedRoom),
});

const progress = await attempt.finish();
await attempt.check();
const parts = await attempt.intoParts();
```

The authority check must synchronously return no value or throw. A Boolean or
Promise is not an authorization result. Establish current host authority and
cross-device fences before beginning; keep the selected targets inactive during
the attempt. All new parent/child operation names must be dedicated and distinct
from the original catalog, every child coordinator and all component databases.
Candidate IDs exactly match the original staged selection.

Begin first commits the complete original file set and a prepared parent record
atomically in a new `operation`/`files` database. It pins the original checked
catalog record, staging plan, original catalog database and explicit mapping from
selected participant IDs to child-operation databases. It writes no original
catalog marker or participant journal. Functions, current permissions, account
tokens and original resume credentials are not serialized.

Only after retained-source checks and fresh final cancellation/authority checks
does begin consume the genuine catalog's private custody. Original native and
coordinator leases stay held. Every ready participant is rebound atomically to
the new attempt's guard and cancellation scope without changing its original
backup, plan, checkpoint or native owner. Closing or canceling the old catalog
after successful transfer does not close the new attempt. Keep the original
factory/runtime ports valid while the new attempt owns them; disposing a
separate borrowed archive is safe.

Begin returns a held attempt before any child handoff. `finish()` advances
ordered `reserved`, `started` and `complete` child intents, retaining successful
private owners if a later child or marker transaction fails. Children use the
existing [operational participant contract](OPERATIONAL_PARTICIPANT_RECOVERY.md),
including native origin continuity, strict existing stores and whole-upload
admission. Initial transferred editors remain read-only.

## Reopen with explicit factories and current policy

```ts
const attempt = await SharedRoomOperationalRecovery.resume({
  database: 'room-operation-1',
  catalogDatabase: originalCatalogDatabase,
  expected,
  participants: participantRequests.map(request => ({
    id: request.id,
    operationDatabase: operationNames[request.id],
    recovery: request.recovery, // Original explicit factories and destinations.
    currentPolicy: host.currentParticipantPolicy(request.id),
  })),
  checkAuthority: () => host.checkFencedRoomRecovery(trustedRoom),
});

await attempt.finish();
const parts = await attempt.intoParts();
```

Resume requires the original plan and complete original catalog/file set, plus
fresh explicit `documentReadOnly` and `reviewAccess` policy for every selected
participant. Document-only participants use `reviewAccess: null`. Historical
review options still identify the original plan; current permissions are not
inferred from them. Factories must return matching exclusive, unobserved and
uninitialized native owners. The existing SDK staging adapter preserves the
snapshot receiver and raw-factory binding so each independent replay applies
its own initial policy exactly once.

Resume initially holds only parent storage. `finish()` inspects and opens every
actual child. Existing child operations reopen current native history through
their retained origin checks. A started child with no operation database may
reopen its original exact ready coordinator. A completed child with missing
operation storage refuses; it is never silently recreated. Foreign schemas,
extra keys, changed original files and different plans refuse without repair or
overwrite. Missing inspection leaves no placeholder database.

A prepared parent can publish `operational` only when all actual children still
match their original exact cuts, including complete uploads. A later append
under an unpublished parent intent refuses and remains stored for explicit host
recovery. After operational publication, genuine later edits, selective
Undo/Redo, packet changes and new valid upload records may survive cold reopen.
The old exact catalog coordinator is never reused against those later journals.

## Resolve interrupted commits and release failures

A rejected promise does not prove that a transaction failed to commit. The
parent resolves pending marker acknowledgements by reading actual original
state. If a child operation committed before acknowledgement loss while its
original ready owner remains held, retry admits that child against the same
genuine owner; it does not release and reacquire the author. Closing the attempt
and resuming later likewise inspects actual durable child state.

An initial parent commit can succeed before begin is canceled or loses its
acknowledgement. If begin did not transfer custody, explicitly close the still
owned old catalog before resuming the retained parent intent. The implementation
does not delete the intent to make a retry appear new.

`intoParts()` first verifies every genuine child and the retained parent data.
It keeps all child handles busy through one aggregate coordinator release. A
failed release consumes no child handle and closes no coordinator database;
native author leases stay held for retry even if some cooperative leases have
already released. Once all releases succeed, ordinary native session, queue,
version and upload owners transfer together. The caller closes revisions,
suggestions and versions before each session and upload owner.

`close()` waits for an in-flight finish, gracefully closes private owners and
supports retry after a save or release failure. `discardAndClose()` explicitly
abandons private unsaved state but deletes no committed journal, upload, file or
operation record. Different simultaneous cleanup modes and cleanup during other
busy inspections/transfers refuse. Version-change fences begin before parent
record/file reads and remain active through awaited native factories.

## Interpret progress without granting authority

`progress()` returns past durable phases only. `check()` and `intoParts()` require
finished, actual held native owners and recheck current retained data. Neither a
detached progress object nor a forged constructor can create that custody.
`selection()`, `metadata()` and file accessors describe the original retained
source, not current server state or permission.

Every unselected historic or duplicate file remains retained and listed in
`unreconciledParticipants`, including after later operational reopens. An
operational storage phase does not resolve those copies or turn original
registered-stream coverage into global readiness. This API starts no network
delivery, upload, proposal decision or account-token request.

An original staging result can also be pending for missing registered streams.
The file-ID list is not an exhaustive inventory-coverage report; an empty list
does not establish room readiness.

Current owner/account authentication, native server currentness, cross-device
writer fencing, protected original credentials, complete provider reference
closure and reconciliation of every retained offline copy remain prerequisites
for activation. The approved cross-generation Undo/Redo and outstanding
offline-edit bridge remains required; no history reset or limit increase is a
substitute.

## Qualification boundaries

The [operational room qualification](qualification/2026-10-19-operational-room-recovery.json)
records the 33 selected checks, frozen source, native regressions and fresh
installed-package evidence. It is a functional recovery checkpoint, not V1
release approval.

The functional suite exercises ten original native compilers/transports, twenty
participants, thirty cold room reopens, saved Redo, pending suggestions/versions
and all original files including unselected copies. Both transports have native
interruption, last-moment cancellation/source-close, same-owner retry, release,
upgrade and close-race regressions. Storage and public-type contracts are
separate from those actual Rust/Wasm workflows.

IndexedDB, lock and raster harnesses are explicit Node fixtures. Browser,
process/power-loss durability, quota/eviction and large-room memory/performance
still need qualification. Existing catalog/component bounds and original
protocol meanings remain unchanged. All original files remain required; this is
not streaming replay or compaction. All thirteen V1 gates remain open, and the
historical WebKit fault is not confirmed fixed.
