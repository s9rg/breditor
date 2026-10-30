# Retained catalog liveness during native delivery

An original version catalog excludes ordinary edits, record capture and recovery
while a native delivery loan is active. That exclusion must not make its own
retained room source look closed to the delivery context checking its authority.

The catalog registers a constructor-owned liveness check bound to its exact core.
Only its real native factory marks the finite borrow. Retained checks still
require live catalog/store bindings, the actual store lease, a live source and
held parent recovery leases; closing, retirement and cold replacement refuse.
Copied catalog data cannot supply those checks. The original parent's retained
callback uses this path for versions while checking all other owners normally.
Ordinary editing and recovery handoff keep their original exclusion rules.

The failure was reproduced at both the child catalog and complete parent check.
Their actual native publication regressions now pass. A separate real seven-family
room test borrows the original catalog, confirms ordinary writes remain blocked,
releases the loan, retains the complete current cut, and exercises future native
document/comment Undo and Redo on every participant.

The [qualification](qualification/2026-10-30-retained-catalog-parent.json) records
75 passing native tests, a clean collaboration build and read-back-verified source,
compiled modules, failure logs and actual native records. This repairs one ownership
boundary. Complete provider/client/metadata reconciliation and authenticated
whole-room activation remain; all thirteen V1/parity gates are still open.
