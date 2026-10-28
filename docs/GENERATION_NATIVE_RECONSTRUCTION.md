# Generation recovery from older disk sources

Generation native reconstruction preserves retained offline work when actual
source databases reopen at an older state. It builds a separate complete recovery
file and an ordinary whole-room execution file. Native replacement still uses
the existing executor and real actor ownership; neither file activates a room.

The route is SDK-private and requires the genuine generation recovery host.
Physical-host recovery, generation input journals, native source formats and
default package exports keep their existing meanings.

## Failure and recovery boundary

The reproducible case begins with failed native source saves in all seven source
families. Live edits and comment histories enter a durable generation execution
before-cut, while the source databases remain older. Reopening those sources
cannot satisfy ordinary resume: current native state does not extend the retained
before-cut. Weakening resume would silently permit loss of retained work.

Reconstruction instead proves that current state fits inside the retained output,
preserves the original databases and journal, and constructs fresh source
namespaces. A local-operation snapshot becomes a concrete flat local operation
through its existing native reconstruction recipe. It is not relabelled in place.
Incomparable native branches or uncontained packet decisions require a separate
explicit merge; this route must refuse rather than select one silently.

## Complete immutable recovery file

The revision-one generation-room-reconstruction family has a separate magic,
MIME type, manifest, selection, choice and intent store. A file contains the full
original accepted input, every saved native cut, every diagnostic evidence payload
and the complete ordinary room execution file. It never substitutes a final read
marker or a list of hashes for the original bytes.

Admission verifies canonical framing, contiguous lengths, payload hashes, exact
journal event chaining and the original execution identity. Every distinct saved
cut and the original input before-state must fit inside the retained native
output. Document and comment histories, per-family packets, original uploads and
selected uploads are checked. Equal rendered content is not proof of ancestry.

Complete files are limited to one GiB and headers to sixteen MiB. The original
4,096-event journal bound remains. Overflow refuses without truncating evidence.
The separate stored recovery file is immutable and absent-only. Existing-only
opening leaves no placeholder when absent; corrupt existing bytes are never
repaired or overwritten. Decoded journal data cannot append to the original
journal because it has no genuine store-owned append witness.

## Fresh preparation and materialization

Inspection reserves the genuine selected owner and its native aliases before
reflecting incoming options or readers. Read factories are detached and bounded
by the actual job lifetime. Caller cancellation, asset cancellation and owner
closure stop pending readonly native restores; late unclaimed native results are
freed once. A pending durable open is not abandoned by racing the entire visitor:
its actual cleanup must settle before the native exclusion releases.

Inspection reauthenticates each original accepted page against the pinned live
generation host and builds all concrete participant recipes and both explicit
asset-queue decisions. It creates no database or native target. Missing asset
bytes produce pending data, not a reduced file.

Preparation rebuilds the exact inspected file, obtains a fresh affirmative
decision and rechecks the original journal head, authentication and actual source
selection before and after persistence. The recovery, execution, preparation,
participant and selected-upload names must be disjoint from original namespaces.
A completion lost after commit leaves a readable complete recovery record.

Materialization requires a second fresh decision binding the saved recovery
choice and the actual current source selection. The current source must still be
contained in the admitted output, including save-slot and packet semantics. The
original generation journal head must remain unchanged. Materialization creates
only the ordinary immutable execution file, or reads an exact existing file;
it does not construct a target or retire the old owner.

## Native replacement and subsequent imports

The ordinary warm executor performs actual old-owner retirement and target
construction under fresh participant policies. Its existing cold continuation
can acquire actors independently after an interrupted run and actual old closure.
No saved reconstruction phase supplies an actor, source lease or writer grant.
Local promotion transfers native, packet, selected-asset and actor ownership.

The resulting sources have new namespaces and may have a different concrete
family. They must not resume the old generation execution under a relabelled
identity. Subsequent accepted-page imports require a fresh generation input,
before-cut, execution journal and current approval. The old complete journal
remains recovery evidence.

## Remaining V1 requirements

This route is local reconstruction at the original authenticated server cut.
Cross-cut provider reconciliation, incomparable branch unions, historical packet
settlement, explicit local-comment adoption, authenticated old-serving exclusion
and a durable whole-room activation decision remain separate required work.
All thirteen V1 release gates and the full feature-parity goal remain open.

Functional tests use actual Rust native histories, authenticated standalone
controls and concrete participant constructors with controlled Node storage,
locks and raster presentation. These tests do not certify physical crash
durability, browser behavior or remote serving activation.

## Functional checkpoint

The [exact-source qualification](qualification/2026-10-28-generation-native-reconstruction.json)
records 107 passing source, 107 freshly installed and 107 actual production-bundle
tests, without failures, skips or cancellations. Each path retains the previous
91 generation/physical execution laws and six cold-execution laws, and adds ten
reconstruction laws. Sixty-three genuine native fixture hosts, 180 control tests,
180 candidate-plan tests and six strict consumer type fixtures qualify this
checkpoint. The normal shared Wasm and production Rust are unchanged; the prior
310-test release-native baseline is carried, not counted as a new Rust run. An
optional debug-native diagnostic was cancelled and is not a passing suite.

A separate real fault reproduction shows why this is not complete mixed-state
recovery: one client saves after native import while six reopen older, and the
per-client journal append fails. Neither whole-room cut contains the other. A
data-only prototype selects newer complete records using actual native ancestry
and verifies all packets and uploads from both inputs. It has not been integrated
into a durable recovery or target-activation route; the qualified V1 reader must
still refuse that mixed frontier. The earlier parallel native shutdown failure
and all thirteen V1 release gates remain open.

## Additive mixed-component route

The later [mixed-component contract](GENERATION_COMPONENT_RECONSTRUCTION.md)
now productionizes the conservative native/packet/upload component join, durable
framing, cold target replacement and subsequent authenticated import. It has its
own family and approval choices; the retained-tail-only reader above still must
refuse mixed whole-room cuts. No old format, journal meaning or resume default is
loosened. Genuine forks and incomparable packet/upload inventories still refuse
with both inputs preserved; complete reconciliation and room activation remain
open. See its separate 119-law-per-consumer qualification for the tested domain.
