# Shared native input journal machinery

The private native-input journal kernel shares publication, persistence and read
custody without sharing wire semantics. The existing snapshot facade still
selects only its original format, actual input owner, head/intent parsers and
parent opening. A second closed
[flat-local family](FLAT_LOCAL_OPERATION_PARTICIPANT.md) now selects its own
framing, input admission, literal verification, schemas and facade.

## Intrinsic families

Family identities have private slots and a closed constructor. Options, imported
files, plugins, structural descriptors and prototype-only copies cannot register
a family or replace its validators. The registry captures concrete input,
database, parser and facade intrinsics; it is not an extension registry.

The kernel captures the storage context before policy getters run. Each family
snapshots its own current factories, names, permission and cancellation policy.
Actual input admission remains with that family's genuine codec owner. Literal
file verification belongs to the family too; the kernel does not parse one
format's plan to decide another format's file identity.

The existing snapshot head/intent/schema tags and native physical storage
primitive remain unchanged. No old reader learns a new format through a flag.
This machinery does not select a relay, authenticate a writer or activate a room.

## Construction and exposure

A kernel has one actual facade. Construction advances from idle to ready, claims
the constructor bridge once, then attaches that exact facade. The claim is
consumed before facade construction can invoke a reentrant callback. An early
constructor callback or a second bridge call cannot create an alias.

The facade remains unavailable during initial journal admission and opening
completion. Reads, cleanup and source binding reject until the actual opener
exposes it. No callback or await follows that exposure transition. Constructor
bridges validate the real kernel and intrinsic family; they do not accept a saved
completion record or ready-shaped object.

The native driver identifies the facade, not an implementation object. A source
reservation must claim that exact facade and native identity. Another facade,
family or delivery companion cannot borrow its journal rights.

## Native publication and read lifetime

The original prepare/native-save/acknowledge ordering is preserved. The selected
LIVE is published once; earlier imported cuts remain provenance. Missing
acknowledged storage refuses rather than creating an empty source. Both native
histories and ordered immutable versions must continue the admitted input LIVE.

The source owns its input and readonly ancestry independently of a retired
parent. Bounded read scopes reserve capacity before factory getters and current
authority callbacks. A fresh matching reader reconstructs its own anchor in its
runtime; old native pointers and writer grants do not become read credentials.
Temporary owners are disposed before the final fresh permission check.

Cleanup waits for held scopes and retries the same actual database, lease,
native and input owners. A rejected cleanup does not justify reconstructing a
disposed editor or abandoning the namespace reservation.

## Type and qualification contracts

Concrete input, intent and facade types remain attached to their intrinsic
family. Caller options cannot widen its inferred input kind. Snapshot read
results retain the exact intent format literal, while the existing parent
preserves its source selection-policy type through handoff.

Source, fresh installed-package and actual production-bundle tests cover
structural-family refusal, constructor reentry, one-use facade creation,
unreturned-owner refusal and old-kind isolation. Full standalone-journal and
complete-parent native source/installed domains remain separate mandatory
checks. The flat family has its own mandatory source/installed qualification;
passing snapshot assertions cannot substitute for it. Room adoption, sustainable
Undo, physical durability and V1 readiness require separate work.

## Shared complete ownership

The flat family also uses actual shared opening, upload and final-witness
machinery. Four-name custody and delegated child tickets retain the intrinsic
family identity; no imported phase or caller descriptor can grant ownership.
Constructor callbacks cannot read, close or transfer an unreturned owner.
Prepared handoff wrappers remain gated until the last native/upload comparison
commits. Fresh read factories and source-owned literal input survive retirement
of the temporary parent input wrapper. The existing snapshot opening retains
its original private brand and entry points.

## Selected qualification

The [2026-10-22 record](qualification/2026-10-22-native-input-journal.json)
retains 31 passing checks from the 331-check functional plan, with exact frozen
source and packaged archive hashes. Both the existing standalone journal and
complete parent freshly pass all 480 cases in source and installed packages.
Their 33/37 focused laws and old strict type fences also pass. Four clean
installed consumers pin matching archives; the six new family/constructor laws
pass against both installed files and their actual production bundle.

The same two constructor-reentry assertions fail before their development repair
and pass unchanged afterward. This is not a published-package or historical
WebKit repair claim. Other legacy full matrices remain carried under exact
unchanged source/archive bytes. Normal runtimes and Rust inputs are unchanged;
the full Rust suites are not freshly rerun. That selected record qualifies the
snapshot extraction; it predates the separate flat-family implementation and
does not qualify it. All thirteen V1 gates remain open.

The later [flat-family qualification](qualification/2026-10-22-flat-local-operation-participant.json) covers the actual
second family, four-name opening/upload/final-witness machinery and repeatable
native capture/restore. All 35 selected stages pass, including fresh existing
snapshot standalone/parent source/installed domains and 67/66 source/installed
flat-family laws. It retains the original snapshot protocol meanings and does
not promote room adoption, sustainable history or V1 readiness.
