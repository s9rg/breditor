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
