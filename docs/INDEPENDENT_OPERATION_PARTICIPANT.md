# Independent operational participant ownership

The private `OperationalIndependentDeliveryParticipant` joins a genuine completed
delivery recovery, the [source save journal](INDEPENDENT_OPERATION_JOURNAL.md), a
new live native source and the actual whole-upload store. It supports cold resume
and a checked final handoff. Its live source now supports separate
[portable capture and reading](INDEPENDENT_OPERATION_PORTABLE.md); portable
operation restore and room adoption remain required. It is not exported from the
package root.

## Explicit selection and unchanged formats

The host selects the original complete participant identity, completed recovery
database, original source/upload destinations, new journal and new source names.
All five names must be distinct. Current native factories, read/write and comment
policy, synchronous authority, limits, cancellation and writer-recovery
acknowledgement remain explicit host inputs. They are captured before awaiting
and never discovered from retained bytes or a phase marker.

The new journal and source use their existing separate operation schemas. The
original recovery stores, original source, native protocols, upload format and
public defaults are not upgraded or overwritten. The recovery source becomes an
immutable retired source; edits continue only in the new source database.

## Genuine first handoff

`begin` runs inside the genuine recovered owner's private transfer. That transfer
checks the old native/source and whole-upload owners again after its callback.
The new original/current/pending journal is therefore prepared while the old
native owner and upload custody are still held. The old native source is not
closed inside that callback.

After genuine transfer succeeds, the parent settles the old source and its
author leases. Only then can it open the separately selected operational source.
The actual upload store and its exclusive recovery custody remain held across
this interval. Both native histories replay through the new journal's genuine
origin under the newly selected host policy.

Failure before transfer leaves the original recovered owner retryable.
`resumeRecovered` can finish an already-created journal while that genuine owner
is still held. Failure after transfer retains the journal/original and databases,
closes actual transient owners, and can be resumed cold without inventing another
recovered-owner marker. Failed opening cleanup is tracked through the existing
runtime opening-custody ledger.

## Cold resume and actual data checks

`resume` acquires the selected cooperative namespaces, reads the journal's actual
retained original, verifies the independently selected hash and builds fresh
prepared recovery under current host policy. It verifies the actual completed
first-stage recovery and exact retired source before opening the new live source.
Missing or changed completed recovery is not silently reconstructed.

The journal then admits the exact acknowledged/pending source cut and cold native
replay. It owns its prepared original and native origin for the whole new source
lifetime. Disposing the retired parent backup during final handoff must not free
those new source-owned resources.

Whole-upload verification reads a complete actual archive under held custody.
Every original row must remain with the same content identity, MIME type, byte
count and dimensions. Epochs and attempt counters cannot decrease. A previously
uploaded row retains uploaded status and its exact acknowledged storage
reference. Legitimate retries and new rows are allowed; no operation merges,
drops, resurrects or repairs upload rows automatically. A valid empty store is
supported, including source rasters resolved separately from that store.

## Final handoff and close

`intoParts` verifies the genuine new source/journal, native ancestry, retained
versions, actual upload store and unchanged source stamp. Upload custody stays
held while coordinator lease callbacks finish. A final synchronous current-policy
and source barrier runs after retired-backup cleanup and before closing the
recovery read handle and releasing upload custody. There is no asynchronous gap
after that barrier. Returned source and upload
handles are immediately usable; the source still owns its journal and origin.

A failed final barrier retains the actual recovery read handle and original
backup, so the same parent can retry. An actual earlier implementation closed
that handle before the last check: revocation during release reproduced
`InvalidStateError` on retry. The retained unchanged assertions pass after moving
disposal to the final synchronous barrier. This is a development regression,
not a claim about an older released package.

Retired archive cleanup itself can call a replaced inner archive facade. A
separate reproduced law changes current policy there; the final post-cleanup
guard refuses handoff and leaves the recovery handle retryable. Disposing the
retired original does not dispose the source's independently owned original.

Ordinary close saves the real source first. Failed saves retain custody for
retry. Explicit discard closes without saving unsaved memory but does not delete
durable original, current, pending or upload data. Cleanup waits for actual upload
custody callbacks before releasing parent coordinator leases. Lost write
authority does not hide owned readable source data; that raw data is not a
complete portable operational export.

## Required verification and remaining scope

Both candidate profiles require 28 focused owner laws, a strict public type fence
and full source/fresh-installed 640-case native-policy probes. The probe uses all
existing grammar/standard profiles, selection scopes, typing/search/owned-review
combinations, independent native history pairs and supported transports. Each
case performs genuine recovery, three operational handoffs, two cold resumes,
interrupted-save replay, changed upload status and exact future document/comment
Undo/Redo comparisons. The actual Rust/Wasm runtime is normal; IndexedDB, locks
and raster presentation are controlled fixtures.

Each complete matrix case has its own fixture storage/lock context. Its cold
reopens share the same retained databases; only after every owner and callback
settles is that case's context released. An initial run rooted every case in one
fake factory's durable database map and exhausted Node's ordinary heap. Isolation
keeps the full 640 cases and every assertion without increasing the heap limit
or deleting the retained stores being tested. This harness repair is not a
production memory or performance qualification.

Portable operation capture now retains original, acknowledged, pending and newer
readable work with whole uploads and native/packet raster references. Its restore
coordinator must still adopt those states durably under fresh host policy.
Whole-room adoption, historical-copy decisions, complete provider/client closure,
independent comment/server-log generations and fresh authenticated activation
remain separate architectural work. Native lifetime ceilings, quota, memory,
performance and physical crash durability remain unqualified. Cooperative locks
are not cross-device author fencing. All thirteen V1 gates remain open.

The [selected functional qualification](qualification/2026-10-22-independent-operation-participant.json)
passes 19 checks from the 262-check plan. Source and fresh installed packages
each pass all 28 owner laws and the full 640-case matrix, including 1,920 genuine
handoffs, 1,280 cold resumes and 1,920 future native history comparisons. Four
fresh consumers pin matching archives. Workspace/diagnostic checks pass 2,647,
editor integration passes 385, and scripts pass 2,032 with three existing opt-in
skips. The evidence retains both handoff regressions and the initial matrix heap
failures; product memory/performance and the whole candidate plan remain
unqualified.
