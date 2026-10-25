# Native author prefix reads

The Rust collaboration owner can read the exact applied prefix of any document
author at an explicit counter. Room reconciliation needs this when a client has
later offline operations or has already received more of another author's work
than the independently selected server cut.

This is a pure causal-history read. It does not import operations, change the
document or selection, publish a revision, flush pending work, acquire an author
lease or alter either Undo/Redo stack. It is not a server acknowledgement, a
semantic action boundary, permission to reconnect or proof that a room can be
activated.

## Native contract

`RichReplica::writer_clock_at(writer, through)` uses the existing original
transport digest. `writer_clock_at_v2` uses the existing packing-independent
V2 digest. Both return the existing `WriterClock` shape. The counter is canonical
decimal text and denotes the exclusive end of the selected author's applied
operations. Authors remain canonical nonreserved 64-bit decimal identities;
counters retain the existing native limit. An unknown author admits only its
empty prefix. A counter beyond applied state refuses without mutation.

The implementation reads the existing native operation lineage. It does not
fork a document at a possibly intermediate operation, reconstruct an AST,
recompute causal history in JavaScript or reinterpret one digest family as the
other. Existing head clocks, local group export, wire frames, saved checkpoints,
model revisions and journal revisions keep their meanings. Intermediate causal
counters are not necessarily valid delivery-group boundaries.

## SDK and Wasm capability

The additive Wasm capability is complete only when
`writer_prefix_read_version()` returns `"1"` and both `writer_clock_at` and
`writer_clock_at_v2` exist. The normal application surface checks all three.
It exposes no research constructor or mutation shortcut.

`SharedRichEditor.supportsWriterPrefixRead()` checks the complete capability.
`writerClockAt(writer, through, version = 1)` returns native read data; select
version `2` explicitly for V2. Older runtimes remain usable for their existing
features, but this new method returns `writer_prefix_unavailable`. Genuine
captured-history readers keep their existing capture-lifetime checks. Private
retained-source reads also require their enclosing full-source verification;
core liveness alone does not certify a stored cut. A disposed capture cannot
retain a usable registered native-history reader.

## Wrong author repair

The old SDK helper could answer a historical foreign-author question by asking
for the local author's next exported group at the same numeric counter. Those
two independent authors can have equal counters and different digests. The
helper then returned the wrong author's preceding digest. This could reject
valid recovery or misstate the evidence used by a reconciliation caller.

The helper now validates the requested author, counter, digest family and native
clock response. Current heads retain their direct read. Older prefixes use the
complete native capability when available. The legacy group fallback admits
only the actual local author, an exact group start and a group naming that same
author. Historical foreign queries without the new capability refuse; they
never borrow a local author's receipt.

## Functional verification

The focused native tests exercise all six compiler profiles, original and
segmented document histories and both existing digest families. Peer and server
authors have later applied operations beyond the selected cut. Reads preserve
exact native checkpoints and observations, including read-only owners; cold
restores preserve future selective Undo/Redo. Malformed and future cuts refuse
without losing future Redo.

`scripts/probe-writer-prefix.mjs` exercises the actual Wasm and SDK, genuine
captured readers and retained-source readers. Its unchanged wrong-author control
reproduces the old error in all 24 profile/history/digest combinations. The
current runtime performs 648 successful prefix assertions; the retained older
runtime separately verifies explicit refusal and the valid local fallback.

`scripts/check-writer-prefix-installed.mjs` packs the built local candidates,
installs them offline without workspace links, checks public types and the
Wasm-bound notice inventory, then runs the same public native-read laws through
the installed SDK and its actual production bundle. Each path covers twelve
profile/history cases, 120 successful reads, twelve cold restores and 24 future
history steps. The original V1 runtime comparison separately checks 49 exact
checkpoints, two cross-version restores and twelve future history steps.

The new canonical shared runtime has different bytes because the capability is
additive. Historical cumulative recovery qualifications remain bound to their
recorded older runtime and source; the focused new-runtime proof does not renew
them or approve dependency licenses. The full current-runtime regression remains
a release obligation.

## Remaining architecture in risk order

1. Complete client reconciliation must compare every selected client's actual
   native document against all accepted peer and server-author prefixes, not
   merely its own registration. Bound comment streams need equivalent coverage.
   Local comment lanes must remain unbound until an explicit compatible adoption
   contract exists. A missing cut stays pending; a different prefix refuses.
2. Join that native coverage to complete source, packet, journal and whole-upload
   reads at one independently pinned, freshly authenticated server/provider cut.
   Detached reports, cached inventories and rendered document equality are not
   substitutes for the genuine selected resources or current credentials.
3. Activate a replacement only under exclusive final-cut protection with a
   durable authenticated decision and the separate native serving fence. A pure
   read or matching room identity cannot grant a serving epoch.
4. Make long-lived history sustainable without dropping Undo/Redo, offline
   operations, undecided review packets or retained uploads. Existing bounded
   client and relay lifetimes remain enforced rather than silently raised.
5. Finish the extension/custom-node platform and remaining feature parity on top
   of those integrity contracts. Browser polish and accessibility qualification
   follow the functional architecture work.

All thirteen V1 gates remain open. This prerequisite does not complete room
reconciliation, activation, sustainable history or feature parity.
