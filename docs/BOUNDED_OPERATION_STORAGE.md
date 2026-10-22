# Bounded operation storage admission

Operational journal and dedicated source reads now count each store before
cloning its keys or values. Counts and bounded requests run in the same existing
transaction; a save's final compare-and-write callback stays inside that active
transaction. Overfull stores refuse before their values are loaded. No valid row
is truncated, evicted or silently ignored.

The previous limits remain unchanged: one journal intent, one original archive,
at most two current/pending cuts, one source head and at most 126 sealed native
files. Existing exact schema, key, canonical byte, native-history and cut-identity
checks still run. This is earlier enforcement of existing cardinality contracts,
not a new storage family, public API, permission or migration.

Five actual tiny overfull fixture namespaces previously reached `getAll` before
refusing. The same assertion program passes with the bounded reader. Eighteen
additional laws cover empty/exact/full stores, explicit request bounds, invalid
limits, transaction-local writes and complete rollback on callback refusal. Fresh
offline installed packages repeat all 23 laws; source locations are the only
permitted changes to the helper assertions, and namespace assertions are identical.

This does not bound the byte size of one stored value, total admitted memory,
latency or physical durability. Existing per-file byte and generation limits
remain separate. Complete portable writable restore, source-owned input
provenance, whole-room reconciliation and authenticated activation still need
implementation. All thirteen V1 gates remain open.

The [selected functional qualification](qualification/2026-10-22-bounded-operation-storage.json)
pins 20 passing checks, both complete 640-case journal matrices, matching installed
archives and the original five failing/passing reproductions. It does not rerun
all earlier SDK matrices or execute the full 274-check release plan.
