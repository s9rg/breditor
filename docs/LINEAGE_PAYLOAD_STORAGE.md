# Lineage payload storage

Repeated reconstruction kept Blob slices of earlier composite archives. The
logical graph stayed flat and its bytes stayed fixed, while the physical Blob
view chain grew. A reduction using only standard Blob operations fails at cycle
492 on Node 22.14, with a constant 153,327-byte file. Rust and Wasm are unnecessary
for that failure. The production graph probe also failed without debugging.

Both lineage encoders now use `ownedLineagePayload` to capture each output
payload into fresh byte-backed Blob chunks. Copy reads are at most 1 MiB, check
the caller's currentness before and after asynchronous work, and refuse short
reads without retrying. The copied payload must match its original requested
checksum. Canonical headers, ordering, hashes and existing budgets are unchanged.

The unchanged production probe now completes 512 reconstructions and 8,704
payload checks. The output remains byte-identical to the retained public graph.
Source and independently installed packages each pass all 64 selected tests:
seven new regression cases and 57 existing codec, recovery, identity, asset and
lifetime cases. Real Native round trips preserve future document/comment Undo
and Redo across all four original/segmented history combinations. Main passes
the seven new cases and its six affected compiled modules match the consumer.

The output now owns fresh Blob storage for each payload. This can increase peak
retained bytes until old inputs are released. The existing checksum still reads
a whole part within its original budget; only the copy reads are chunked.
Large-archive memory behavior remains a separate qualification.

See the [qualification](qualification/2026-11-03-lineage-payload-storage.json)
and its retained source/package/runtime proof. This repair does not establish
the cause of the older intermittent archive refusal or fix the historical
WebKit/startup fault. Whole joint publication and all V1 release gates remain open.
