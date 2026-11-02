# Whole-room history read grants

A complete history read owns seven real participant readers. Its physical parent
previously passed a permission callback that checked that same complete child
again. Each child already checks every held participant around permission calls;
calling the full child from its parent duplicated the complete cohort traversal.
The upload composition added another repeated traversal. This was observable work,
not a permission result that could safely be cached.

The physical parent now supplies a root grant. It checks its actual coordinator,
intent, leases, retained catalog ownership and cancellation before and after the
fresh host permission call. The complete child still checks all held participant
readers before and after that grant. The upload wrapper separately checks its
actual whole-upload custody and closing state around parent permission, including
custody donated to a retained Native reader. Outer reads continue checking both
the root and complete child around their own work.

This preserves the layers' separate responsibilities. No successful permission,
parent state, child state or provider result is memoized. Native admission,
committed-file verification, stale state, callback reentry, late cancellation,
read-only policy, close and cleanup checks remain active. Rust implementation,
normal Wasm, original protocol meanings/defaults and package versions are unchanged.

## Reproduction and verification

`physical-operation-v3-history-grant-cost.test.mjs` exercises real seven-family
`readHistory` and `captureRecordCut` calls with the old writer job expired. It
counts actual ownership-field inspections instead of host-dependent wall time,
requires fresh grants, and verifies that every committed store remains unchanged.
Both checks fail on the preceding implementation: 13,792,333 and 19,623,644
inspections exceed the respective 8,000,000 and 12,000,000 limits. Both pass on the
repair. The instrumentation is restored in a `finally` block.

A separate actual Native workload measured 13,970,770 to 5,154,774 inspections for
history and 19,859,837 to 8,424,803 for record capture. Permission calls remained
4,014 and 5,282 respectively, with unchanged committed storage and unused expired
writer grants. These counters demonstrate the eliminated duplicate work; they are
not a production latency or memory qualification.

The complete cumulative history domain contains 1,249 cases. Qualification covers
source, freshly installed archives and an actual production bundle with strict
public types. Actual Native fixtures cover ten profile/wire combinations, seven
registered document writers and seven comment actors, with 50 verified public
files. The [qualification record](qualification/2026-11-01-history-read-grants.json)
retains exact executed source, compiled SDK/package comparison, regressions and
read-back-verified proof.

## Cumulative workload accounting

Two owned-snapshot regressions were already added in `fe0f66d5`; the retained
storage file has 30 cases, while older cumulative runners still expected 28.
The original source and installed runs passed all 1,247 bodies and then failed
that obsolete total. Those failures remain preserved. This repair retains every
body and derives descendant totals from their actual parent domains. The two new
traversal regressions bring the complete domain to 1,249. Declaration-count and
release-plan checks cover the full inherited file membership; larger descendant
workloads are not claimed fully executed by this history qualification.

Whole-room authenticated activation, portable cold Native/SDK restart integration,
complete release profiles and all thirteen V1/parity gates remain open. The earlier
controlled restart proof remains a separate functional checkpoint.
