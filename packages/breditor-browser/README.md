# `@breditor/browser`

`@breditor/browser` is Breditor's framework-neutral browser projection layer.
Version `0.0.51` renders the validated base-schema AST into disposable DOM; it
does not make the DOM an editor model.

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

## Current limitations

- Selection mapping, input translation, composition, clipboard handling,
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
and Wasm-view consumption and disposal.
