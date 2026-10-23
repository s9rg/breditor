# Repeatable flat local recovery

The private `flat-local-v1` family captures and restores an actual editable local
source repeatedly without nesting each previous archive inside the next one.
It preserves both native histories, outstanding offline edits, ordered versions,
whole uploads and pixels retained only by earlier inputs. The family uses the
production shared journal kernel and genuine four-name ownership machinery;
the earlier development owner overlays are not part of this implementation.

This is a separate private contract, not a public API promotion or room activation.
The fixed source and fresh installed-consumer domains are mandatory candidate
checks. Their qualification is separate from the earlier
[development proofs](FLAT_LOCAL_OPERATION_PROVENANCE.md).

## Literal files and native history

The MIME is `application/vnd.breditor.flat-local-operation-backup`, the magic is
`BREDITOR-FLAT-LOCAL-OPERATION1\n`, and the format is
`breditor/shared-flat-local-operation-backup`, version 1. These are distinct from
the development format and the existing snapshot format. A caller explicitly
selects the flat family; imported magic or a saved readiness field cannot select
an executable owner.

The payload table stores each distinct raw byte sequence once, identified by
its byte length and SHA-256. Recipe zero reconstructs the literal incoming
snapshot from its exact prefix and parts and retains that snapshot's existing
whole-file SHA rule. Each later recipe stores only table-prefix counts, the
previous root index, literal length and canonical manifest digest. Deterministic
framing reconstructs each previous flat file byte for byte without retaining its
cumulative header as an opaque payload. A flat aggregate is not materialized
for an aggregate-file hash. Individual bounded payloads and the original
snapshot still use their existing literal hashes.

Each state declares precisely its CURRENT, PENDING, LIVE, upload and image
payloads in writer order. Exact role, count, size and declared-use validation
precedes native factory execution. Framing integrity is not native validity:
fresh read-only runtimes must replay every chronological document/review pair,
verify continuation from the preceding LIVE and conserve unique ordered
versions. Document and review native digest spellings retain their distinct
existing meanings.

Capture appends to the source's actual incoming file. An earlier exported file
that was never imported cannot be substituted as its input. Capture does not
flush edits, retry uploads or contact a server. Missing pixels return Pending.
Historical bindings, pixel identity/dimensions, upload rows, attempts/epochs and
completed storage receipts must survive. Native data is not rebuilt from an AST.

## Publication and ownership

The plan, head, intent and parent records have distinct flat-local tags and hash
domains. The journal uses `flat_local_input_intent`,
`flat_local_input_incoming` and `flat_local_input_cuts`; the parent uses
`flat_local_participant_state` and `flat_local_participant_input`. Existing
snapshot schemas, defaults, public-root exports and physical native save rules
are unchanged.

The complete parent reserves the journal, source, parent and upload database
names before authority callbacks. Genuine, family-bound child tickets delegate
the native pair and upload subset. Preparing, prepared and operational phases
record progress but grant no ownership. First publication selects input LIVE
once through prepare, native save and acknowledgement. Abort and lost-completion
recovery inspect the actual retained predecessor; missing acknowledged input,
source or uploads refuse rather than being initialized empty.

The live source owns its genuine journal, literal input and original-only pixel
provider independently of its retired parent. Whole uploads are restored as an
actual store with exclusive custody. No native pointer crosses Wasm instances.
A new read scope can select fresh read-only factories after the writer grant,
signal or execution factory retires.

Native/upload witnesses remain valid through namespace release, retained-file
verification, temporary input disposal and parent-handle closure. All returned
wrappers are prepared before the final native comparison and deny access until
transfer commits. No authority callback, wrapper construction or await follows
that comparison. Cleanup retries the same actual owners; a failed handoff does
not recreate a disposed editor. Source selection-policy types survive handoff.

## Resource contract

The new provenance envelope permits at most 128 state/recipe rows. Its header
and per-state JSON bounds derive from the existing local backup header bound.
The total file bound is twice the existing local backup file bound; every raw
payload remains bounded by the existing local backup bound. The payload count
is explicitly derived from historical raster references, native cut files and
the existing source-record limit. Role-specific native, upload and image limits
still apply independently. Persisted files must retain the canonical MIME and
bounded length before native admission.

These are refusal bounds for the distinct new format, not large-file or
long-session performance approval. Deduplication does not make growing native
checkpoints constant-size. Reaching a bound does not prune history, reset an
origin or overwrite user data. The shared native 1,000-entry Undo and
64-generation ceilings remain unresolved.

## Required qualification

`flat-local-participant-contracts` exercises actual source modules, malformed
but correctly rehashed inputs, exact literal reconstruction, callback-safe
ownership and three successive editable/cold generations in all four native
history combinations. Synthetic codec rounds are not editor recoveries.

`flat-local-participant-type-fence` retains exact family/intent types, nominal
owners and source selection policies. `flat-local-participant` and
`installed-flat-local-participant` require the fixed 480-case domain: five
native compiler profiles, three selection scopes, eight capability masks and
four history combinations, with twelve first-publication interruption
boundaries. Installed assertions differ only by reversible module, fixture and
runtime locations and use fresh offline archives, not workspace links.

Room catalog adoption, full historical/provider/client reconciliation,
authenticated whole-room activation and sustainable retained history remain
required architectural work. The historical WebKit fault and all thirteen V1
release gates remain open. No version, push, tag, publication or deployment is
authorized by this checkpoint.

## Selected qualification

The [retained qualification](qualification/2026-10-22-flat-local-operation-participant.json) passes 35 selected checks from the
335-check functional plan. The source contract group passes 67 tests, including
one plan law; the fresh installed consumer passes the same 66 functional tests.
Each full 480-case flat-family domain completes 1,440 handoffs, 1,440 cold resumes,
1,440 exact future native pairs and twelve interruption boundaries 40 times each.
The repeated-generation unit domain separately covers twelve editable imports,
twelve cold resumes and 36 future native pairs across four history combinations.

Full source/installed snapshot-parent and standalone-journal regressions pass
freshly. Five consumers have matching offline archives, actual production module
checks and strict type fences. Workspace/diagnostic tests pass 2,647, editor tests
385 and scripts 2,811, with three existing browser opt-in skips. Other legacy full
matrices are carried under exact unchanged inputs/archive bytes, not called fresh.
All 2,857 native source/manifest inputs and twelve normal runtime files remain
unchanged; complete Rust suites are not freshly rerun.

The unchanged integration controls demonstrate the fixes to the new reader's
native review-digest spelling and late declared-payload-use validation. The
invalid undeclared payload was always rejected; native factory calls fall from
seven to zero when that validation moves into preflight. Separate native fork
diagnostics preserve existing refusal of different histories with equal accepted
documents and counters. None of these results qualifies room activation,
sustainable native history, large-file performance, physical durability or V1.

## Remaining architectural risks

An unchanged incoming backup may precede later LIVE edits. Eight additional
native diagnostic cases, outside the selected plan stages, preserve that
distinction in both local input families and all four history combinations.
Room adoption must verify both histories and ordered versions as prefixes; a
same-point export equality check would refuse these legitimate later sources.
Neither relationship grants native writer custody or authenticated activation.

The separate three-generation work-count diagnostic covers all four history
combinations. With freshly selected read factories, journal snapshot reads invoke
three native restore factories at each observed generation; complete backup
capture invokes 22, 26 and 30. These bounded observations identify repeated prefix
admission during capture, not a latency or supported-resource envelope. Any
future immutable admission reuse must remain bound to genuine held input owners,
fresh read policy and exact native/version/upload conservation. Independent
admission of untrusted files still requires the complete validation chain.
