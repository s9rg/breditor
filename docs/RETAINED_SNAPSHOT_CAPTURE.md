# Retained snapshot capture

Retained relay companions own normalized records, including nested values.
Capture always obtains fresh parent relay bytes. If those bytes and the private
record object are unchanged, it reuses the exact serialized DATA string. Load,
propose and release invalidate it; release drops its references. Confirming an
older successful save updates durable records without replacing newer current
records. Caller inputs and exported records cannot mutate the private snapshot.

Custody, cancellation, native admission, current source and host policy checks
still execute. No permission or previous guard result is cached. Existing capture
and stored-head bytes, original protocols and public exports remain unchanged.

The [qualification](qualification/2026-10-30-retained-snapshot-cache.json) passes
30 Native storage checks, 75 Native publication/ownership/history checks and 113
independently installed checks with strict consumer types; 77 candidate/plan checks
pass. A serialization-only benchmark over 22780 actual record bytes returned
identical output with a median speedup of about 46 times. This is not a whole-room
throughput or memory qualification.

Post-ACK cold recovery remains unqualified. One run exhausted the default Node
heap; a later run refused a Blob read with an unexpected byte length. Their
original logs and source identities are retained. Exact current server metadata
containment, coordinated activation and all 13 V1/parity gates remain open.
