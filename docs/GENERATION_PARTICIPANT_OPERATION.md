# Continue a recovered generation participant

`OperationalSharedGenerationParticipant` lets a recovered local, relay or retained
participant keep editing and later reopen its current stores. Document Undo and
Redo, paired comments, local versions, pending review packets, relay receipts and
upload retries can advance beyond the original backup. The original backup and
exact recovery record stay retained separately.

This is a per-participant lifecycle, not room activation. The host still supplies
current authority, native factories, editing policy and authenticated transports.
No credentials or permission grants come from the backup, and no connection or
upload starts automatically.

## Transfer completed recovery custody

First complete [generation participant recovery](GENERATION_ASSET_RECOVERY.md).
Pass the genuine completed owner directly to `begin()`, before calling that
owner's `intoParts()`. An archive, parsed identity or detached session cannot
replace completed recovery custody.

```ts
const recovered = await attempt.finish();
const operation = await OperationalSharedGenerationParticipant.begin({
  database: operationDatabase,
  recovered,
  expected: independentlyRetainedSelection,
  checkAuthority: assertCurrentPrincipalAndReacquiredWriterLease,
});
await operation.check();
const {source, uploads} = await operation.intoParts();
// Continue through source.session and uploads. Connect transports explicitly.
```

Use four distinct, dedicated database names: operation intent, original recovery,
current source and current uploads. The operation database first retains the
original file and prepared intent. After checking the original recovery marker
and the actual native and upload owners, it publishes operational intent and
transfers custody. The source retains its native writer and optional comment
leases; the operation's coordination leases are released during handoff.

The operation owner holds its own original-file handle. Disposing a caller's
backup does not remove that retained file. `file()` and `origin()` expose the
original cut, not a new backup of the current document. Save another participant
backup when a current complete cut is needed.

## Reopen actual current stores

Close the ordinary session and upload store before reopening. Reapply current
read-only and comment-access policy, and supply the matching native factory.
Keep the same independently retained selection and destination names.

```ts
await source.session.close();
uploads.close();

const current = await OperationalSharedGenerationParticipant.resume({
  database: operationDatabase,
  recoveryDatabase,
  destinations: {source: sourceDatabase, uploads: uploadDatabase},
  expected: independentlyRetainedSelection,
  session: {kind: 'retained', options: currentNativeAndRetainedSourceOptions},
  checkAuthority: assertCurrentPrincipalAndReacquiredWriterLease,
});
await current.check();
const parts = await current.intoParts();
// Attach fresh authenticated adapters to parts.source.session when permitted.
```

Resume opens existing stores only. Missing databases, files, heads, schemas or
upload entries refuse; it does not create an empty document, repair acknowledged
state or restore the old backup over current content. Native ancestry is checked
before source construction can autosave. Both document and paired review history
must extend the actual original native histories, including generation ancestry.
Equal visible text or a matching AST is insufficient.

All original local version packets and acknowledged relay progress remain
required. Each original upload keeps its immutable bytes, dimensions and type;
epochs and attempts can advance through ordinary retry/cancel operations, and an
acknowledged provider receipt stays exact. New entries and native generations are
allowed. The original explicit stop-retrying and cache-forget operations remain
usable; the coordinator does not require an evicted shared packet forever.

Current policy is independent of saved intent. A previously writable participant
can reopen read-only without losing its saved Redo branches. Restoring write or
review access later still requires a fresh host decision. Native permanent
observer and zero-authored-prefix rules remain unchanged.

## Retry failures without losing the original

If publication fails while the genuine recovered owner remains held, call
`resumeRecovered()` with the same begin options. If the owner was closed, use
`resume()` with the original recovery database and current factories. A prepared
intent requires the exact original source and uploads; an operational intent
admits valid current descendants. A committed publication whose acknowledgement
was lost can be resumed without overwriting data.

Concurrent operations on one owner refuse reentrancy. Failed coordination-lease
release remains retryable. Current authority and source custody are checked
again after awaited release, before returning editable owners. A retired source
remains readable for backup but cannot be handed out as a managed session. If
authority fails after release, the original file remains readable until explicit
`close()` or `discardAndClose()`; the released owner cannot hand off again.

## Supported boundaries

The original file families, policy meanings, transport protocols and storage
limits are unchanged. There is no automatic rollover, history compaction, garbage
collection or unlimited lifetime. Paired review history and server logs still
have their existing independent ceilings.

The native origin check proves continuity from the independently selected
original cut. It is not a global monotonic checkpoint service and does not prove
that an entire valid store was never rolled back to a later descendant. Fresh
authenticated server-prefix checks remain the transport's responsibility.

Participant and room catalog integration, complete provider/client closure,
protected credential handoff, independent comment/server generations and
authenticated whole-room generation activation remain separate work. All 13 V1
gates remain open.

## Functional verification

The [2026-10-20 qualification](qualification/2026-10-20-generation-participant-operation.json)
passes 62 selected checks, 1,155 script tests and 385 editor tests, with three
existing opt-in skips. The same 329 recovery assertions pass against source and
fresh offline public archives. They retain all 86 earlier assertions and add
216 policy combinations, six operational round trips and 21 failure/policy
cases. The two generation handoff defects reproduce against the preserved old
archive and pass after repair: a retired source cannot be handed out, and
authority revoked during release cannot yield editable owners.

Six author-side authenticated workflows each recover the complete participant,
continue native document/review history and uploads, reconnect pending work,
restart the server and preserve future selective Undo/Redo. Source and installed
archives each pass 18 operational cold reopens, 24 handoffs and six host restarts.
The original observer network workflow separately retains its 24 cold reopens
and zero document submissions; the new operation's read-only matrix does not
claim a new observer-side server workflow.

The Wasm pair is reused after hash verification against 2,747 unchanged native
inputs. The previous 653 shared and 216 relay Rust tests are carried evidence,
not a fresh full native suite. The installed consumer still compiles and runs its
ten-case native inventory fixture normally. Actual Wasm and native server
processes run with synthetic IndexedDB, locks and raster decoding; this is not
physical browser durability, accessibility or release qualification.
