# One immutable room-cut request

The private room-cut encoder now prepares all JSON records, ordered descriptors,
literal input files and complete uploads synchronously, before its first authority
callback or awaited digest. Hashing consumes that prepared request. Later caller
changes cannot combine values from different moments into one returned archive.

This addresses a reproduced input-lifetime defect. On the old implementation,
changing an opaque Native checkpoint string during the first awaited hash changed
the resulting archive, which the cold DATA reader accepted. The original actual
seven-family cut was 5,911,674 bytes. The changed cut gained one byte. With the
repair, the same reproduction retains the exact original byte pin and checkpoint.
No corrupted live-owner publication or production data loss is established by
this DATA reproduction.

`physical_room_record_cut/prepare_capture.ts` owns bounded synchronous preparation;
`capture.ts` owns asynchronous hashes and final framing. Dense own-data descriptors
are required. Source objects stay caller owned. The helpers remain private package
implementation details. Trusted matching runtime and ordinary JavaScript execution
remain assumptions; this is not a sandbox against application prototype changes.

The existing format, entry order, MIME values, byte/hash budgets and Native strings
stay unchanged for valid unmodified requests. Actual source reservations, authority
checks, digest cleanup and final root/source re-admission remain required. Preparing
DATA does not grant an owner, authenticate a writer, restore storage or activate a
room. JSON and Blob preparation now happen before the first authority callback;
failed authority still prevents every hash and prevents a returned file.

The focused test needs an independently selected complete seven-family cut at
`target/record-cut-snapshot-fixture/cut.archive` and its `selection.json`, or the
directory selected by `BREDITOR_RECORD_CUT_SNAPSHOT_FIXTURE`. Missing inputs fail.
The retained qualification proof supplies the actual input and its origin record.

```sh
node --test scripts/record-cut-snapshot.test.mjs
node scripts/check-record-cut-snapshot-installed.mjs
```

The 17 new cases cover exact cold bytes for all seven families, ten replacements
during hashing, the first authority callback, immediate caller mutations, failed
hashes/authority, rejected getters/descriptor arrays and private exports. The
installed checker additionally runs the existing framing/storage and activation
wire/intent laws, strict consumer types and exact package-output comparisons.
Its fixture is copied into an independent consumer; no workspace package link
supplies its SDK.

This repair is separate from the unresolved intermittent archive-read failure and
the older WebKit observation. It does not qualify full restart association or close
a V1 gate. The larger recovery coordinator remains isolated.
