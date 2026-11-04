# Separate Node Blob-read experiment

The ordinary recovery qualification must use its unchanged host methods. A
separate opt-in experiment can retain the actual Blob involved in the first
incomplete `arrayBuffer()` result. Saved filesystem bytes flatten that Blob's
construction and have not reproduced the intermittent archive-read refusal.

Run from an isolated checkout with its own generated packages and Native fixture:

```sh
node --import ./scripts/fixtures/preload-blob-read-witness.mjs \
  --test --test-concurrency=1 scripts/joint-reassociation-complete-native.test.mjs
```

The preload must precede SDK imports because the SDK captures host methods. This
changes instrumentation: **this run is diagnostic, not release qualification**.
No default runner or production module imports it.

The observer calls the host reader once and returns its exact buffer or error.
It retains the first failing Blob handle without flattening it or attempting a
second product read. At orderly process exit it writes
`target/blob-read-witness-PID.json`. An explicit, separate worker then reads the
retained Blob four times, with a 1 MiB input and ten-second time bound. A worker
success cannot change the original result or test exit code. The worker disables
inherited preload options; it shares no editor, Wasm or storage owner.

Compare the original declared/actual sizes with the worker's sizes and hashes.
A repeatable short worker read would give a smaller host-only reproducer. Four
complete worker reads would narrow the failure to an earlier context, without
proving a cause or repair. A killed process may not reach the orderly-exit hook.

`node --test scripts/blob-read-witness.test.mjs` verifies complete/short/oversized
reads, exact error identity, single-read behavior, host descriptor restoration,
other patch ownership, the independent worker and the unchanged failing child
exit status. Injected faults qualify this diagnostic only, not a product repair.


## Separate Native callback boundary on Node 22.14.0

A complementary observer is available at
`scripts/diagnostics/node22-blob-boundary/`. It records the byte counts delivered
by Node's Native Blob reader before JavaScript assembles the final ArrayBuffer.
It returns the exact original `arrayBuffer()` Promise, adds no Promise
continuation, and keeps no Blob, Native handle or result buffer in its records.
This provides a different timing/retention tradeoff from the first-Blob witness.

It explicitly requires Node 22.14.0 because it observes private implementation
methods of that version. It is opt-in; product modules and default runners do
not import it. The original callbacks, values and errors still reach their
callers. No alternate reader, clipping or retry is introduced. At orderly exit
it writes `target/native-blob-boundary-PID.json`, with counts and up to 32 recent
completed reads. `firstIncomplete` records an EOF before/after the declared byte
count; an empty Blob whose declared size is zero is valid.

```sh
node --test scripts/diagnostics/node22-blob-boundary/observer.test.mjs
node --import ./scripts/diagnostics/node22-blob-boundary/preload.mjs \
  --test scripts/room-native-activation-intent.test.mjs
```

The four observer laws pass, including a deliberately incomplete test callback
that remains incomplete. The instrumented SDK smoke passes twelve cases and
records 634 complete Native reads. See the
[observer qualification](qualification/2026-11-04-native-blob-boundary-observer.json)
for the exact tested script hashes and retained logs. These results qualify the
diagnostic, not an archive-reader repair. A separate full run is being used to
compare Native callback counts with any subsequent SDK length refusal. Neither
complete callback counts nor an incomplete EOF alone identifies the root cause.
