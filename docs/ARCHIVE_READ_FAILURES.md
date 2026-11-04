# Exact archive-read failure observations

`SharedArchiveIntegrityError` retains its existing codes, messages and two-argument
constructor. A measured read-length refusal can additionally carry an immutable
`readFailure` value. It contains only the following numerical observations:

- `kind`: `read-length`;
- `offset`: requested byte offset within the measured Blob;
- `expectedBytes`: requested byte count;
- `observedBeforeAuthorityBytes`: returned buffer length before the synchronous
  post-read authority check;
- `actualBytes`: returned buffer length after that authority check.

The read still refuses when its returned length differs from the request. It does
not clip, retry, acknowledge work or accept partial bytes. The observation has no
archive content, file name, asset identifier or path. Non-numerical observations
are not copied into the error. Ordinary IO exceptions keep `archive_io`; other
integrity errors keep their original shape. Genuine Native digest ownership is
released on all these refusals.

The observations distinguish an already incorrect read from a buffer that changes
while authority is checked. They do not identify a root cause or confer any
current permission. Offsets belong to the measured Blob, which may be an archive
component rather than the complete outer file.

Applications can inspect `error.readFailure` after narrowing to
`SharedArchiveIntegrityError`. Node's default test reporter omits custom error
properties. The recovery test helper therefore emits an explicit
`ARCHIVE_READ_LENGTH_FAILURE` record with validated numbers and rethrows the same
error. Failure to log never replaces the original exception.

## Captures and recovery

The full metadata-capture path retains its existing failure law: a failed parent
capture retires that attempt. Keep persisted data and all cleanup obligations,
close the failed owner, and use deliberate recovery under fresh policy. A saved
read observation is data, not a writer or activation grant. Do not resume a retired
coordinator just because the observation can be read.

## Recorded unresolved occurrence

The earlier source workset passed fourteen cases; the independently installed
workset passed thirteen and failed its original reference-only compatibility case
at the exact-length read check. Its actual lengths were not retained. The full
failure, exact source, Native/client/packet/raster data and successful component
results are preserved in a read-back-verified failure proof.

Subsequent sequential, paired, instrumented and debugger observations did not
reproduce that occurrence. Six new deliberate transport-fault checks verify the
numerical diagnostics and Native cleanup; a separate simulated short read verifies
the debugger observer. Those injected faults do not reproduce the original bug.
This change adds observability. It does not establish a repair of the recorded
intermittent failure or close any V1 release gate.


## November 4: ordinary source and installed failures

The frozen combined reassociation candidate passes 57 source/component cases,
but two complete ordinary workflows fail in an existing archive read before the
new restart association is reached. The committed-source case receives zero
bytes for a requested 158,571-byte JSON record. The independently installed
pending/repeated case receives zero for 672,377 bytes. In both, the buffer was
already empty before the post-read authority callback. Both exit with failure;
source and fixed runtime inputs remain unchanged. The larger coordinator has
not been integrated into Main.

The exact prior complete archives still pass direct digest-only DATA replay.
Rebuilt framing tests make 840 exact target reads across 30 recipes, including
nested/empty/chunked Blob parts and wrap depths up to 128, without reproducing
it. A separate uninstrumented SDK loop performs 64 selected-current read/encode
round trips with exact byte pins and 117,696 authority checks, also without the
fault. These are negative observations: their Blob graphs differ from the
original failed physical objects. Matching-length entries in the prior archives
do not by themselves identify those failed objects.

The [investigation record](qualification/2026-11-04-paired-archive-read-failures.json)
retains both actual failures, complete prior data, independently packed modules,
fixed source/runtime inputs, and the bounded replay scripts/results in a
read-back-verified compressed proof. The existing
[separate Blob witness](BLOB_READ_WITNESS.md) is being used in an instrumented
process to retain the first incomplete physical Blob. That diagnostic cannot
change either original failed result or supply ordinary qualification.

No upstream Node cause, connection to the historical WebKit fault, or repair is
established. The already qualified Main capture/snapshot fixes remain valid;
these failures do not qualify the larger coordinator or close any V1 gate.


## Archive errors hidden by assertions

Node's failed `assert.rejects` validator retains the original error in its
`actual` property, but ordinary TAP output can omit that error's stack and
numerical read observations. A separate forensic run reached this case while
expecting an uncertain activation response. It failed with an archive error
inside the assertion and retained no incomplete Blob witness. That outcome is
not established to be the same zero-byte failure as the two ordinary runs.

`scripts/diagnostics/archive-error-chain.mjs` now provides bounded post-error
reporting through `actual`, `cause` and aggregate members. It reads owned data
properties, skips application getters, supports Node's native lazy stack getter,
and rethrows the exact original error. It changes no reader or SDK command and
performs no retry. Reports include validated measurements, error codes and up
to eight stack frames, omitting the message line.

The [six focused checks](qualification/2026-11-04-archive-error-chain-observer.json)
cover a real failed Node assertion, cycles/duplicates, getters, logger failure,
successful results, malformed observations and the original archive stack.
An additional ordinary full attempt uses this reporting around the unchanged
functional workflow; its host read methods remain unchanged. That attempt and
the separate Native callback trace are incomplete. Neither constitutes a repair.
