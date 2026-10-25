# Accepted native recovery transfer

The opt-in physical recovery controller can transfer the selected server's
accepted document operations and ordered comment batches. Recipients import
the original native payloads through their existing Rust-backed admission APIs;
the server never substitutes another client's offline frame. Transfer does not
acknowledge pending work, adopt local comments or activate a generation.

## Explicit request choices

`SharedPhysicalRoomRecoveryHost.readAcceptedNative(input, signal)` uses the same
independently configured operator, exact selected room and fresh provider checks
as the host's other recovery reads. The new POST endpoint is
`/recovery/physical/v1/accepted/read`. Its closed request family is
`breditor/physical-room-recovery-accepted-native-request`, version 1. The caller
must choose `document: 'include'` or `'omit'`, and one review request:

- `{kind: 'start'}` reads the first bounded page of an enabled server lane.
- `{kind: 'after', cursor}` continues that same lane using its original cursor.
- `{kind: 'absent'}` requires that the selected server has no review lane.

An enabled lane cannot be silently skipped by declaring it absent. An explicit
document omission supports subsequent review pages without repeatedly sending
the full document. It does not assert that a recipient already has that document.
Choices are detached under the host's actual busy reservation before permission
or token callbacks. Accessors refuse without execution, and proxy re-entry cannot
start another host request during inspection.

## Original payloads at the selected cut

Rust captures the payload under the real native transaction, asset owner and
generation custody. It rechecks the selected ancestor, physical source and
participant inventory before and after capture. The document comes from the
server's existing accepted catchup frame. Review pages come from the existing
ordered catchup implementation, retaining each original authenticated source and
receipt. A fresh provider and native check follows capture before publication;
a callback that changes the native or raster source invalidates the read.

The closed response family is
`breditor/physical-room-recovery-accepted-native-read`, version 1, with scope
`selected-server-accepted-native-page`. It pins the full selection and SHA-256 of
the exact request bytes. `documentFrame` and `review` are present, including null
when explicitly omitted or genuinely absent. The SDK checks canonical spelling,
the requested choices, source policies, ordered counters, cursors and existing
frame budgets, and returns deeply frozen data. Only native import and retained
receipt verification can establish that a recipient actually admitted a batch.
Persisting a response cursor alone is not an acknowledgement.

`review.currentRole` describes the server-side reader. It must never overwrite a
recipient's current document or comment permissions. Historical batch policies
authorize those batches only; they do not grant future local editing rights.

## Bounds and ownership

The request retains the 64 KiB control limit. This new response has a separate
16 MiB limit, allowing the existing 5 MiB document envelope after outer escaping
and one existing 4 MiB review page. It does not widen the original continuity
or asset response limits. The existing operator Origin, authentication,
cancellation, deadline and shared request quota apply. A body awaiting completion
does not keep native history custody after its controller is dropped.

A stale editor with an unknown own-writer suffix still refuses native import.
Recovery must not bypass that check or fabricate Undo history. Longer genuine
local suffixes survive imports of accepted foreign operations. Unbound local
review lanes remain separate until an explicit adoption operation is available.

## Functional verification and remaining work

The native HTTP tests cover all ten profile and transport combinations, original
review source admission, selected-source changes, closed requests, authentication
and real custody release. SDK scenarios apply actual server payloads to seven
native client families, reduce missing accepted history to zero, preserve local
suffixes and future document/comment Undo, and retain read-only permissions.
Source, offline installed packages and the actual production bundle run the same
focused assertions. The existing cumulative reconciliation workload remains a
separate unchanged candidate stage; focused success is not full V1 qualification.

The next recovery operation must durably coordinate imports across the entire
selected cohort, exclude re-entrant local edits, retain exact recovery inputs and
per-client progress, and recover after interruption without losing source records.
Explicit local-comment adoption and authenticated whole-room activation follow.
Sustainable history retention, extension parity and final release gates remain
part of the full V1 goal. No package version or original protocol meaning changes
in this additive transfer contract.
