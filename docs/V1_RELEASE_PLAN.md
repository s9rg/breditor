# Breditor V1 release preparation

Breditor has a functional tables, images and offline collaboration implementation,
but it is not ready for a V1 release or a feature-parity claim. The next milestone
is a coherent installable editor: everyday formatting, structural editing and
interchange must work with the same rich Rust owner, not merely in separate demos.

The comparison baseline is Tiptap 3.x and current CKEditor 5, the modern editor in
the FCKeditor lineage. CKEditor 4 reached ordinary EOL in June 2023; its
[extended support model](https://ckeditor.com/docs/ckeditor4/latest/support/licensing/extended-support-model.html)
is not the modern feature baseline. Breditor remains an independent implementation:
no ProseMirror, Tiptap or CKEditor document, operation or plugin protocol is adopted.

## Current checkpoint

The audit baseline is
[`85b21d1`](https://github.com/s9rg/breditor/commit/85b21d1b21187dfc999decf2754686bab8d05eef),
pushed to [s9rg/breditor](https://github.com/s9rg/breditor) on October 15, 2026.
Source packages remain `0.3.0-alpha.22`; no registry publication, release tag or
public deployment is part of this preparation.

The combined editor implements nested lists, tables with rich cell bodies and
grid operations, block raster images, durable offline journals/uploads,
selective Undo/Redo, authenticated peer presence and a reference relay. Its
functional checkpoint passed 651 browser test runs across Chromium, Firefox and
WebKit, plus Rust/Wasm, relay, package and type checks. These are overlapping
suite executions, not 651 unique capabilities, and were run before this planning
change. See [the exact functional boundary](RICH_CONTENT_AND_COLLABORATION.md).

The default browser/Wasm packages and opt-in rich/shared packages remain distinct.
The latter are private and still need a generated module from the isolated
collaboration workspace. Successful installation tests do not make that module a
supported application distribution.

## What parity means

Parity is equivalent supported user workflows, extensibility and integration
quality, not identical APIs or serialized bytes. It includes selection,
history, paste, recovery and collaboration for each feature, not just a toolbar
button or a format declaration.

The [machine-readable audit](v1-readiness.json) groups the compared capabilities
and links local evidence, a remaining acceptance condition and primary sources.
`implemented` means the stated functional slice exists; `partial` means a
foundation or narrower path exists; `missing` means the integrated capability
is not present. None of these labels alone means release-qualified. Missing
assessments come from the inspected grammar, public surfaces and controllers,
not from a single unsuccessful keyword search.

The audit is grouped, not an exhaustive line-by-line certification of either
ecosystem. Finish the catalog-coverage gate before asserting full parity. Do not
calculate a completion percentage from these unequal groups.

The full parity target remains open. Comments, suggestions, document conversion,
pagination and other advanced workflows are tracked rather than silently excluded
because competitors sell them separately. A smaller first V1 can be proposed,
but changing the requested target requires an explicit scope decision.

[Tiptap's extension catalog](https://tiptap.dev/docs/editor/extensions/overview)
mixes open-source editor capabilities and plan-labelled additions.
[CKEditor's feature digest](https://ckeditor.com/docs/ckeditor5/latest/features/feature-digest.html)
also distinguishes premium features. Their commercial packaging does not determine
what Breditor must charge for or how Breditor should license its original code.
Recheck these mutable catalogs before freezing the RC baseline.

## Source review findings

The inspected [Tiptap StarterKit assembly](https://raw.githubusercontent.com/ueberdosis/tiptap/main/packages/starter-kit/src/starter-kit.ts)
registers optional features separately. The useful lesson is a complete, tested
starter profile with explicit additions, not reproducing its extension protocol.
Breditor is missing common structural blocks and has not integrated every default
format into the rich/shared editor.

The inspected [Tiptap table implementation](https://raw.githubusercontent.com/ueberdosis/tiptap/main/packages/extension-table/src/table/table.ts)
keeps commands, selection/navigation plugins and data conversion as distinct
responsibilities. Breditor's tested geometry is a strong functional slice, but
numeric width commands do not establish resize-handle, rich-paste or export parity.

The inspected [CKEditor clipboard pipeline](https://raw.githubusercontent.com/ckeditor/ckeditor5/master/packages/ckeditor5-clipboard/src/clipboardpipeline.ts)
separates input transformation, model insertion and output transformation.
Breditor likewise needs explicit foreign-content adapters. Its internal rich JSON
clipboard and default safe HTML copy/plain-text admission are not Office paste.
No competitor implementation was copied into Breditor.

## Most important integration gaps

1. **One rich formatting path.** Default Link, color, text-size and richer toolbar
   policies do not automatically work in the shared editor. Its current renderer
   hook admits only `span`, `strong`, `em` and `code`; it has no safe anchor or
   typed color/size recipe. Promote checked presentation and observable control
   state into that path before advertising those features together.
2. **Complete editing grammar.** Add blockquotes, code blocks, horizontal rules,
   task lists and an explicit hard-break policy. Finish general selections across
   container boundaries and natural typing history groups. Unsupported ranges
   currently reject; arbitrary flattening is not an acceptable shortcut.
3. **Interchange.** Add sanitized rich HTML and Markdown adapters, then realistic
   Office/Docs/Excel paste. Deterministic JSON remains canonical; foreign import
   needs declared losses, fresh IDs and one guarded transaction.
4. **Product UI and host contracts.** Add genuine read-only mode, contextual
   controls, accessible resize interaction, search and coherent application
   integration. Relay Reader authority alone does not disable local editing.
5. **Extension and advanced document contracts.** Typed inline extensions do not
   constitute arbitrary custom-node support. Review comments, suggestions,
   versions, pagination and conversion as distinct features with their own
   persistence and concurrency semantics.

The [Tiptap StarterKit baseline](https://tiptap.dev/docs/editor/extensions/functionality/starterkit),
[CKEditor basic styles](https://ckeditor.com/docs/ckeditor5/latest/features/basic-styles.html),
[Office paste](https://ckeditor.com/docs/ckeditor5/latest/features/pasting/paste-from-office.html)
and [Markdown output](https://ckeditor.com/docs/ckeditor5/latest/features/markdown.html)
give concrete comparison cases. Breditor's richer asset/relay implementation must
also retain its own strengths: the [Tiptap Image extension](https://tiptap.dev/docs/editor/extensions/nodes/image)
does not itself supply an upload server, so compare complete workflows without
pretending either core extension alone solves every hosting concern.

## Implementation order and reproducible exits

### First checkpoint unify the distributed editor

Promote the existing shared Rust owner and matching Wasm factory out of the
feasibility-only distribution, preserving default package compatibility. Keep
collaboration and relay optional; applications should not need a relay merely
to edit local tables and images. Agree on public package ownership and profile
construction before freezing names or marking packages publishable.

Add a complete safe inline presentation/control contract to the rich path,
including links and mixed property values. Reuse existing semantics where
appropriate; do not create a second TypeScript document model. Integrate the
ordinary formatting set and a framework-neutral/React reference using only
package-root imports.

Exit: a clean external consumer installs the built archives and edits headings,
nested lists, a formatted table cell and a linked image caption, then reloads
exact history. Two independent consumers demonstrate offline edits, asset upload,
reconnect and selective Undo without workspace links or manual `target` files.
Existing default consumers and ABI checks still pass.

### Second checkpoint close everyday editor gaps

Add the missing Rust node/action contracts, task lists, selection coverage,
typing groups, read-only enforcement and safe block properties. Each action
gets its own properly named and documented file. Define shared conflict and
history policy before exposing each control. Add context controls and keyboard
equivalents alongside commands rather than after them.

Exit: user-facing tests cover create, modify, selection, clipboard, Undo/Redo,
reload and simultaneous edits for every new feature. Unsupported combinations
fail atomically and preserve content. No unrelated wire format changes meaning.

### Third checkpoint implement external interchange

Introduce separate bounded HTML and Markdown import/export adapters with
schema/version binding, safe URL/asset policies and explicit loss reports.
Keep editing DOM, canonical AST and external data representations separate.
Then add real Office/Docs/Excel fixtures rather than equating plain text with
format-preserving paste.

Exit: round-trip fixtures cover Unicode, formatting, lists, tables/merges,
captions, links and image references. Unsupported structures have visible loss
or rejection behavior; paste is one history group and never executes input markup.

### Fourth checkpoint complete advanced parity contracts

Build durable annotations/comments, accept/reject suggestions and user-facing
versions before conversion and paginated document workflows. Follow with the
tracked widget, template, utility and extension gaps. These are not solved by
renaming existing provenance annotations or replay journals.

Exit: each selected catalog item has an acceptance case and installation,
serialization, recovery and collaboration coverage. Product-scope exceptions,
including arbitrary HTML or nested tables, need explicit approval and honest
documentation. No unapproved exception counts as parity.

### Final checkpoint qualify the release candidate

All entries in the audit's `gates` array must close on the exact RC artifacts.
This includes package promotion, migration/API promises, CI, historical WebKit
reliability, native clipboard, physical IME/accessibility, supported mobile,
measured size/latency/memory, public deployment hardening, storage lifecycle,
dependency notices, support documentation and a real application pilot.

The earlier decision to defer IME and accessibility allowed functional feature
work to finish; it did not waive those V1 gates. Per-file WebKit isolation keeps
test coverage but does not demonstrate a repair of the historical fault.

Before publishing a collaboration-capable product, address bounded journal
lifetime and backup/compaction, resource-limited imports and image decoding, and
real identity/TLS/tenant integration. Do not expose the local demo bootstrap or
reinterpret content hashes as authentication.

Exit: immutable candidate archives and binaries pass the complete automated and
native matrix, clean install/upgrade/rollback drills and the pilot with documented
limits. Publication and public deployment remain separate authorized actions.

## Run the preparation checks

```sh
npm run audit:v1
npm run audit:v1 -- --json
npm run check:v1
node --test scripts/check-v1-readiness.test.mjs
```

The audit validates references and prints remaining work. `check:v1` deliberately
fails while any feature or gate is open. It is a reviewed-ledger guard, not a
behavioral test runner or automatic certification; marking JSON entries complete
does not manufacture evidence. `npm run verify:release` still covers only the
default packages, not the full rich/shared V1 target.

Reproduce the existing functional implementation separately:

```sh
node scripts/check-shared-browser.mjs
node scripts/check-collaboration-feasibility.mjs
node scripts/check-rich-browser.mjs
```

These build and test opt-in artifacts and may take substantial time. Run them
against an owned test room, not the live developer room. The release candidate
must combine their coverage with the default release gate and final native
qualification; do not infer a V1 pass from any single suite.

## Preparation verification

The October 15 preparation adds documentation and a read-only audit command;
it does not change editor, Rust, Wasm, relay or wire behavior. All 25 new audit
tests pass. The complete standalone script suite passes 323 tests with zero
failures and three existing opt-in browser tests skipped because their explicit
environment flags were not enabled. The new readiness command exits with status
1 as intended: feature gaps and release gates remain open. The 651-run editor
matrix above was not rerun for this documentation/tooling change.
