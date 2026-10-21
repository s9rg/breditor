# Capture bound native history reads

Recovery must distinguish the native document history from the native comment
history. Each lane can use `original` or `segmented-v1`; the document family does
not imply the comment family. A detached archive, revision number or reader-shaped
object cannot establish which actual owner supplies those histories.

The internal borrowed reader registers only through genuine original, generation
and independent source captures. Original and generation inventory/operational
coverage now consume these explicit lanes. Independent local captures supply both
native families through the same read boundary; independent relay and whole-room
adoption still require their own storage, identity and activation contracts.

## Select each lane explicitly

The document lane exposes its selected family, exact native checkpoint,
descriptor, writer clocks and groups. Original and atomic-v2 transport reads
remain distinct; neither falls back to the other's digest meaning.

The comment selection has four states:

- `absent`: this owner had no native comment lane at capture.
- `unselected`: native comments exist, but this capture did not select them. The
  native family is identified, without exposing checkpoint or clock reads.
- `original`: selected original comments, with their original native checkpoint.
- `segmented-v1`: selected independent comment generations, with their complete
  native generation checkpoint.

Capture registration compares the expected document/comment strings with actual
canonical native reads. No checkpoint is flattened or relabeled. The old
`SharedCapturedRecoveryRead`, `capturedRecoveryRead`, and
`capturedGenerationRecoveryRead` retain their original meanings; in particular,
their original `reviewCheckpoint` never starts accepting segmented comments.

## Keep live reads separate from custody and status

Each native read checks capture registration, native lifetime, actual families
and private live publication identities before and after the synchronous call.
The enclosing `check()` additionally validates the complete selected source,
including retained stores. Recovery algorithms must call it before and after
multi-store work and after async gaps. Document changes invalidate every read;
selected comment changes also invalidate document reads of that paired cut.
An unselected comment edit does not add those comments to a document-only capture.

Private publication identities update before subscriber callbacks, using the
existing document publication change and comment revision change. A real typing
boundary invalidates the changed history; an exact no-op does not. Private native
checks do not serialize complete checkpoints or materialize comment views.
Full checks retain the original source's exact-record validation, which can
serialize complete original records; this is not repeated for every prefix read.
They are not persisted, exported or treated as proof that storage committed.

Retirement preserves native reads without restoring authoring. Native disposal,
source disposal or a changed selected native cut invalidates every borrowed read.
Changed retained queues/catalogs invalidate full `check()`, but native-only reads
cannot certify those stores and may still read the unchanged native cut.
Disposing the capture releases its registry references, not the
session, native owner or writer leases. Saved read closures resolve through that
registry and cannot keep reading a disposed capture's core.

The reader contains no raw owner, editor, edit/receive method, transport, storage,
close/dispose method or activation capability. Frozen objects, opaque types and
private identity registration refuse copied reader objects and metadata. Native
reads use captured facade intrinsics and the original private core binding, not
replacement public read methods. The host must still supply a trusted matching
native module; these checks do not sandbox arbitrary application JavaScript.

## Preserve recovery and release boundaries

The package root exports no reader registration, live publication identity or
private native capability. Installed implementation laws load those private
modules explicitly from fresh archives; public consumers continue using genuine
public capture, inventory and recovery APIs.

Functional checks cover ten existing persistence families, five grammar/inline
profiles, three selection/range scopes, explicit and typing/search/reviewed
policies, offline peer input, both wire reads, cold reopen and future native
document/comment Undo/Redo. Focused laws cover selected/unselected comments,
generation and typing boundaries, source/native disposal, retired reads,
public overrides and lightweight repeated guards.

The [qualification record](qualification/2026-10-21-captured-native-histories.json)
passes all 34 selected checks against one frozen source. Source and fresh installed
packages each repeat 300 native cases, 300 cold pairs, 900 future history comparisons
and 47 focused laws. The script suite passes 1,719 tests with three existing skips.
Seven installed regression reports use the same package archive hashes. This is a
subset of the 234-check functional plan, not whole-plan approval.

This is a read boundary, not new writable custody, independent relay/outbox
integration, client authorization, physical crash durability or authenticated
whole-room activation. The existing native 1,000-item Undo cap and bounded-resource
limits remain unchanged. All 13 V1 gates remain open.
