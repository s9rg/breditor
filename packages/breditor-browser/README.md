# `@breditor/browser`

`@breditor/browser` is Breditor's framework-neutral browser editing layer.
Version `0.0.53` renders the validated base-schema AST into disposable DOM,
maps one directional selection, and serializes non-composition browser intent
into guarded semantic commands without making the DOM an editor model.

The package is private while the pre-`0.1` package boundary is still moving.
Its public entry point is nevertheless compiled and declaration-checked so a
later publish step does not have to invent the renderer contract.

## Boundary

The Rust/Wasm adapter supplies a flattened, typed semantic projection. The
browser package consumes that view into a branded, deeply frozen
`BaseDocumentProjection`; it never parses document, editor-state, or commit
JSON. The adapter is structural and has no import-time dependency on generated
Wasm classes. Consumed Wasm projection and update handles are deterministically
freed on success and failure.

The accepted semantic shape is deliberately closed:

- schema `breditor/base`, version `1`;
- one or more direct-root `breditor/paragraph` elements;
- non-empty text leaves with either no format or one property-free
  `breditor/strong` format; and
- exact snapshot identity with a portable lineage and canonical decimal `u64`
  revision.

Projection construction rechecks the base-schema shape, canonical adjacent-run
law, Unicode scalar validity, and the Rust default node/text limits. It clones
and freezes all accepted arrays and records.

## DOM contract

`BreditorDomRenderer` receives an application-owned HTML host. Below that host
it creates only:

- one `<p>` for each direct-root paragraph;
- one `<strong>` around a strong text leaf;
- one `<br>` placeholder inside an empty paragraph; and
- DOM text nodes created with `createTextNode`.

The renderer never calls `innerHTML`, installs untrusted markup, or stores AST
paths in `data-*` attributes. It does not modify the host's own attributes.
Host, paragraph, and text nodes are the exact AST-backed mappings. Formatting
wrappers and empty-paragraph placeholders are projection artifacts and are not
reported as AST nodes.

Each successful render returns an opaque `RenderedProjection` with a renderer
generation and two private indexes: `WeakMap<Node, AstPath>` for DOM-to-AST
lookups and `Map<AstPathKey, Node>` for AST-to-DOM lookups. Paths are meaningful
only for that handle's exact snapshot. A handle returns `null` after another
renderer generation owns the host, after `release`, or after a mutation observer
detects out-of-band projection changes.

## Incremental invalidation

`BaseProjectionUpdate.create` accepts branded base/result projections only. It
requires the same lineage and the exact non-overflowing `u64` successor
revision. It then verifies the claimed semantic impact before the renderer can
reuse any DOM:

- `none` proves every paragraph equal and advances the generation without
  replacing its DOM;
- `textContainers` proves every unnamed paragraph equal, retains every
  paragraph `<p>` identity, and refreshes only the named paragraphs' contents;
- `rootSplice` proves exact unchanged prefix and suffix ranges, retains those
  paragraph elements, and rebinds shifted suffix paths; and
- `root`, `multipleOperations`, and `untrusted` deliberately perform a full
  safe projection.

A false narrow-impact claim is rejected before mutation. If a paragraph marked
for retention no longer has the exact DOM shape previously rendered, the
renderer discards the fast path and installs a full projection. This makes the
incremental hints an optimization, never a correctness requirement.

## Post-publication recovery

The semantic projection view is intentionally separate from bounded JSON
encoding. After Rust has published a command, an oversized state/checkpoint
JSON result must not leave the browser unable to render that state. The adapter
must request the result's typed semantic projection directly. If an incremental
update is missing, consumed, malformed, or conservatively classified, the host
can obtain a complete typed projection and call `render`.

## Selection contract

`BaseRangeSelection` owns a deeply frozen anchor/focus pair tied to one exact
`BaseDocumentProjection`. Text offsets are UTF-16 code units shared with DOM
Range and Rust points, but a boundary inside a surrogate pair is rejected.
Children points address only paragraph boundaries. Direction is derived without
sorting the stored endpoints, and before/after affinity remains explicit even
though DOM has no native affinity field.

`consumeSemanticSelection` consumes and frees the one-shot Wasm view, verifies
its snapshot, preorder node kinds/indexes, offsets, affinities, and duplicated
range order, then produces a branded browser selection or explicit semantic
absence. `semanticRangeSelectionScalars` performs the inverse path-to-preorder
conversion for the guarded Wasm set command. The adapter has no import-time
dependency on generated Wasm classes.

`BreditorDomSelectionBridge` synchronously validates the complete canonical DOM
before every read and write. It maps exact text and paragraph nodes, normalizes
the fixed `<strong>` and empty `<br>` artifacts, and maps only the host's two
exterior select-all boundaries. It preserves anchor/focus direction, refuses to
silently reverse a backward range, and assigns the fixed boundary-derived
affinity policy to genuinely new DOM input.

A programmatic write records one renderer-generation-bound spatial signature;
exactly one matching `selectionchange` echo can reuse the original semantic
affinities. Focus is observed separately. The bridge never calls `focus()` or
`blur()`, and clearing semantic selection does not erase a DOM selection wholly
outside this host.

## Event and command contract

`BreditorBrowserEventController` snapshots `beforeinput`, `keydown`, `input`,
and actual clipboard-event fields synchronously. It accepts only events owned by
the exact connected light-DOM host, maps the current DOM selection through the
same bridge used by the command adapter, normalizes at most one target range,
and discards every native object before queue admission.

Controller construction also requires the opaque `deliveryAuthority` exposed
by that adapter. The package exports `EditorDeliveryToken` only as an opaque
type, not as a constructible value. Foreign, stale, forged, or spent tokens are
rejected before cancellation and cannot consume keyboard or clipboard receipts.

The recognized non-composition set covers text and multiline text insertion,
paragraph insertion, backward/forward/selection deletion, strong formatting,
undo, and redo. Unknown edit intents are blocked instead of approximated.
Keyboard input never supplies text; an explicit host policy selects
`beforeinput`-primary behavior or the narrow Backspace/Delete/Enter fallback.
AltGraph, dead keys, key code 229, and active composition remain native.

`BreditorCommandQueue` is a bounded synchronous, non-recursive FIFO. Reentrant
delivery appends. An executor or observer throw permanently quarantines the
queue because the head may already have published; no item is retried.
Generation-bound one-use receipts suppress matching keydown and clipboard event
echoes, while `input` is only a postcondition and never executes a second
command.

`BreditorWasmCommandAdapter` owns the exact observation, browser projection,
renderer handle, selection bridge, and private one-use delivery epoch. One
engine request synchronizes its already captured semantic selection, optionally
closes a history group, executes one action/undo/redo, validates the exact
successor and projection update, updates the DOM, restores the resulting core
selection, and frees all generated handles before returning a handle-free
outcome. A valid semantic successor whose DOM publication fails is retained for
explicit full-render recovery; malformed or stale results fault the adapter.

Copy, cut, and paste are staged in this version. Cut contains no eager delete,
and paste contains no payload until the actual clipboard capability is handled
by the `0.0.55` integration. See
[`BROWSER_EVENT_PIPELINE.md`](../../docs/BROWSER_EVENT_PIPELINE.md) for the full
contract, exact-once laws, and recovery model.

## Current limitations

- Composition settlement, clipboard serialization/parsing and final mutation,
  toolbar delivery, persistence, and React integration belong to later
  checkpoints.
- No arbitrary elements, formats, properties, entity IDs, nested blocks, or
  extension DOM renderers are accepted yet.
- DOM APIs do not provide an atomic transaction across several retained
  paragraphs. The renderer prepares and validates all replacement nodes first
  and attempts best-effort rollback if a DOM write unexpectedly throws. It then
  invalidates the old handle because the host is conservatively considered
  uncertain; the caller must perform a full render from the canonical semantic
  projection.
- Mutation observers deliver asynchronously. A synchronous consumer should not
  treat the DOM as authoritative; retained subtrees are checked again before an
  update fast path is used.
- The renderer does not set `contenteditable`, focus, ARIA, or presentation
  styles on the application-owned host.
- Selection mapping supports one light-DOM range only. Cross-host,
  cross-shadow-root, browser multi-range, and ambiguous internal host-boundary
  positions fail closed. DOM mapping and validation are currently linear in the
  bounded document.
- Command execution is synchronous. Selection synchronization or a history
  boundary can publish before a later command error; queue fail-stop and
  canonical reconciliation are provided, but cross-stage rollback is not.

## Development

From the repository root:

```sh
npm run typecheck
npm test
npm run build
```

The workspace pins TypeScript, Vitest, and jsdom exactly in
`package-lock.json`. Tests cover strict projection admission, hostile text,
mapping lifetime, text-container identity retention, shifted root-splice
rebinding, stale/foreign guards, DOM-drift fallback, broad-impact full renders,
Wasm-view consumption/disposal, directional and Unicode selection mapping,
focus separation, select-all, outside-host protection, exact target-range
normalization, bounded command admission, non-recursive FIFO ordering,
translation policy, and one-shot event-echo suppression.
