# Breditor selection mapping contract

Status: supported inside the public `0.1.0` runtime for the closed base schema
and extended by the supported `0.2.0` compiled-profile path; direct
mapping and controller construction remains advanced and experimental

The Rust editor state owns the semantic selection. A browser `Selection` is a
temporary presentation of that value over one exact DOM projection, and a DOM
selection reported by the browser is untrusted input that must be converted
back through the same projection before Rust may publish it.

This is Breditor's own selection contract. ProseMirror, Lexical, Tiptap, and
CKEditor are design references only; Breditor does not adopt their position,
selection, mapping, transaction, or plugin protocols.

## Authorities and correlation

Three values participate in a browser selection exchange:

1. an opaque `EditorEngineObservation`, which proves the exact live engine,
   state revision, and history stamp accepted by a guarded command;
2. a semantic projection carrying the exact snapshot lineage and revision; and
3. a current renderer handle carrying that projection and one renderer-local
   generation.

The observation is command authority. The projection supplies snapshot-local
AST coordinates. The renderer handle supplies exact DOM/AST mappings. None of
these can replace either of the others, and none is a persistent node identity.
A stale or foreign value fails before semantic mutation.

The browser must synchronously verify the complete canonical DOM shape before
every DOM-to-AST or AST-to-DOM conversion. `MutationObserver` can invalidate a
handle after asynchronous delivery, but its `current` flag alone is not proof
that no synchronous out-of-band mutation occurred.

## Semantic coordinates

The core supports an optional directional range selection. Each endpoint is
one of:

```text
Text     = text NodePath + UTF-16 offset + before/after affinity
Children = parent NodePath + child boundary + before/after affinity
```

`NodePath` values are relative to one AST snapshot. The Wasm selection view
transports the target as the deterministic preorder index from its matching
semantic projection. A browser adapter consumes that index immediately and
recovers a snapshot-local path; it must never persist or compare the index
across projections.

Core text offsets and DOM Range text offsets use the same UTF-16 code-unit
coordinate system. A boundary may equal the text length, but it must not exceed
the length or split a non-BMP Unicode scalar's surrogate pair. Combining-mark,
grapheme, word, and visual-line policies do not change this stored unit. A
selection may therefore end between grapheme components even though delete
actions separately provide grapheme-aware collapsed-caret behavior.

A range preserves anchor and focus exactly rather than sorting them. Resolution
reports `collapsed`, `forward`, or `backward` as a derived spatial order.
Affinity remains semantic sidecar data: DOM Selection has no equivalent field.

## Wasm boundary

Selection reads are guarded by an exact observation and return an owned,
one-shot result. `none` represents no semantic selection; `range` exposes only
the two endpoint kinds, target preorder indexes, checked offsets, affinities,
and derived range order. Payload-bearing debug text and serialized state do not
cross this API.

Selection writes are separate guarded commands:

- set one directional range from two typed endpoint records; or
- explicitly clear the semantic selection.

Every raw endpoint field crosses `wasm-bindgen` as an uncoerced `JsValue`.
The Rust adapter compares point-kind and affinity values to four fixed
JavaScript string literals with strict equality, without copying an untrusted
string into Wasm. It accepts only those primitive literals and primitive
JavaScript numbers for coordinates, rejecting wrapper objects and all other
values before they can trigger JavaScript conversion hooks. Numeric admission
also rejects non-finite, fractional, negative, and out-of-`u32` values before
conversion. The adapter performs a
read-only observation check before inspecting endpoint fields, and
`CheckpointedEditorEngine` repeats the authoritative check and admits the
effective candidate only after its complete session checkpoint can be encoded.
Invalid input, stale input, or checkpoint failure leaves document, selection,
pending formats, history, observation, and cached checkpoint unchanged.

An exact semantic echo is an unchanged command. A real semantic selection
change publishes a state-only selection event, clears pending typing formats,
closes the open merge group, and creates no content-history entry.

## Base-text DOM mapping

The mapper accepts only a current canonical legacy `breditor/base@1` render or
an alpha.6 base-text projection bound to one exact compiled presentation.
The renderer's exact AST-backed DOM nodes are the host, each `<p>`, and each
text node. Inline presentation wrappers and empty-paragraph `<br>` elements are
projection-only artifacts and never acquire fake AST paths.

### AST to DOM

- A text point maps to its exact DOM Text node and the same UTF-16 offset.
- A paragraph children point maps to the `<p>` and its child boundary. Each
  semantic run occupies exactly one direct DOM child, whether that child is a
  Text node or the outermost presentation wrapper.
- The sole children boundary of an empty paragraph maps canonically to offset
  zero in its `<p>`, not into the placeholder `<br>`.
- Root children points are invalid base range endpoints and are not emitted.

Programmatic installation reads the real document/selection/range through
brand-checked native realm intrinsics, ignoring own or host-local prototype
shadows. Writes are serialized per owner document and preserve anchor/focus
direction. An exact caret
whose DOM anchor and focus are the same container and offset is installed with
`Range`, `removeAllRanges`, and `addRange`; this avoids WebKit transiently
exposing new anchor/focus fields with an old `getRangeAt(0)` after an owned DOM
replacement. Every non-identical endpoint pair uses `setBaseAndExtent` when it
is available. A verified `Range` fallback is allowed for forward or collapsed
selections when it is unavailable. If the platform cannot preserve a backward
selection exactly, the write fails closed instead of silently turning it
forward. When WebKit transiently exposes an incoherent pre-write snapshot after
an owned subtree replacement, Breditor permits the non-null authoritative write
only if either the complete anchor/focus pair or the complete Range start/end
pair maps inside the current canonical projection. A mixed pair, one endpoint,
cross-host evidence, or an explicit null write is insufficient.

### DOM to AST

The mapper accepts exactly one DOM Range whose anchor and focus both belong to
the current rendered host. It normalizes only the following canonical browser
positions:

- a mapped Text node and a checked UTF-16 scalar boundary map to a text point;
- a `<p>` child boundary maps to that paragraph's children boundary;
- offset zero or one around the sole `<br>` in an empty paragraph maps to the
  single semantic children boundary;
- offset zero or one in any wrapper of a canonical presentation chain maps
  respectively to the start or end of its sole mapped Text descendant;
- offset zero in the host maps to the start of the first paragraph, and the
  final host offset maps to the end of the last paragraph, so browser
  select-all can be represented without legalizing root endpoints; and
- an endpoint directly inside the empty `<br>` at its only boundary maps to the
  empty paragraph boundary.

An internal host boundary is ambiguous because it can denote either side of a
paragraph boundary and is rejected. Nodes outside the host, multiple ranges,
noncanonical wrappers, unexpected attributes or children, invalid offsets,
split surrogate pairs, and DOM drift are rejected. The mapper never repairs or
parses arbitrary DOM into document content.

DOM cannot report affinity. For a genuinely new DOM position, the browser
adapter assigns a deterministic boundary affinity: a start boundary uses
`after`, an end boundary uses `before`, and an interior boundary uses `after`.
When a DOM selection is the spatial echo of the semantic selection just
installed, loop suppression preserves the existing affinities by suppressing
the write rather than reconstructing a lossy value.

## Focus and blur

Browser focus is UI state, not part of the Rust AST, snapshot identity, or
history. Blurring the editor preserves the last semantic selection by default;
it does not implicitly call the clear-selection command. Likewise, mapping a
semantic selection does not implicitly focus the host.

A host integration may request focus and selection installation together under
an explicit focus policy. Focus failure is a browser-layer failure and cannot
be relabeled as a Rust commit. Explicit semantic clearing remains available for
workflows that require no retained selection.

The bridge clears a DOM range only when it can prove that the range belongs to
its current host. It never clears another editor's or another page region's
selection.

## Loop suppression and ordering

Browser `selectionchange` is asynchronous and may be emitted for a
programmatically installed selection. Suppression is not a boolean. The bridge
records the renderer generation and a complete spatial signature containing
anchor container/path, anchor offset, focus container/path, and focus offset.
It suppresses exactly one matching echo while that generation is current.

Any generation change, spatial mismatch, DOM drift, failed installation, or
unrelated selection invalidates the marker. A real user selection must never be
dropped merely because a previous programmatic write was pending. Repeated or
coalesced browser events are safe because an exact Rust semantic echo is also a
no-op at the guarded engine boundary.

Selection conversion and command dispatch are synchronous within one queued
browser event. Version `0.0.53` adds the bounded non-recursive FIFO and exact
event-delivery contract in
[`BROWSER_EVENT_PIPELINE.md`](BROWSER_EVENT_PIPELINE.md); `0.0.52` by itself did
not authorize direct recursive dispatch from a DOM callback.

## Complexity and resource limits

The selected base document is already bounded by projection limits. A semantic
selection adds exactly zero or two endpoints, each with a path depth capped by
the core. Selection construction therefore adds no unbounded collection.

The first Wasm read locates endpoint preorder indexes by walking the bounded
document, and the browser mapper verifies the complete DOM projection before
each conversion. Both are currently linear in document size. This is an
explicit correctness-first limitation for `0.0.52`; later cached indexes may
reduce cost only if they preserve snapshot/generation correlation and fail
closed on synchronous DOM drift.

Strings copied by the projection, checkpoint encoding after an effective
selection change, and DOM traversal all run synchronously. Allocation failure
inside Wasm can still trap because Rust cannot reliably recover from process
out-of-memory.

## Known limits

- Only the base-text directional range exists. Node, grid, table, multi-range,
  remote-cursor, and collaborative selections remain outside alpha.6.
- Only a single DOM Range inside one light-DOM host is accepted. Cross-host,
  cross-shadow-root, and browser-specific multi-range selections fail closed.
- Affinity has no native DOM representation; only deterministic reconstruction
  and exact-echo preservation are promised.
- Root-internal paragraph boundaries are intentionally ambiguous. Only the two
  exterior host boundaries used by select-all are normalized.
- The bridge does not define keyboard movement or word/line navigation.
  Non-composition event ordering is the separate `0.0.53` contract, composition
  ownership arrived in `0.0.54`, and guarded base-subset clipboard policy
  arrived in `0.0.55`; see [`BROWSER_EVENT_PIPELINE.md`](BROWSER_EVENT_PIPELINE.md)
  and [`CLIPBOARD.md`](CLIPBOARD.md).
- A platform without an API capable of preserving backward anchor/focus cannot
  receive a backward programmatic selection from this adapter.

## Acceptance laws

The release tests must establish at least these laws:

1. forward, backward, and collapsed selections retain anchor/focus direction;
2. text boundaries before and after a non-BMP scalar round-trip, while the
   surrogate midpoint rejects without mutation;
3. unformatted, legacy strong, and arbitrarily nested compiled-format wrapper
   endpoints map to the exact same semantic point shapes;
4. empty paragraph, paragraph children, and select-all exterior host positions
   normalize deterministically;
5. stale observations, stale renderer generations, foreign handles, multiple
   ranges, outside-host endpoints, and synchronous DOM drift fail closed;
6. programmatic backward installation is verified and never silently reversed;
7. only the matching generation-bound spatial echo is suppressed;
8. blur preserves semantic selection and mapping does not steal focus;
9. an exact echo preserves revision and pending formats, while a real move
   produces one selection event and an admitted checkpoint; and
10. malformed numeric Wasm input cannot be coerced to a different endpoint or
    partially publish state.
