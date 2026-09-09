# Breditor `0.1.0` scope

Status: released; the `0.1.0` scope and every required release gate are complete

Historical note: this document freezes the `0.1.0` boundary. Version `0.2.1`
supersedes the event-classification limitation below; durable entry allocation,
append ownership, physical I/O, and durability remain outside that projection.

`0.1.0` is a small, usable, local-first browser rich-text editor backed by
the Breditor Rust core. It does not mean that every storage or collaboration
contract already present in the proof kernel has a browser implementation.

## Product promise

The release lets a user edit one document in a browser with:

- the canonical Breditor document AST as the source of truth and the DOM as a
  disposable projection;
- direct-root paragraphs, plain text, and property-free strong formatting;
- caret and range selection in both directions, including selection restored
  by undo and redo;
- typing, paragraph insertion, backward and forward deletion, selection
  replacement, and atomic multiline plain-text paste;
- composition-safe IME input whose intermediate browser DOM is never mistaken
  for an independently committed Breditor state;
- copy, cut, and paste for the supported content subset, with untrusted HTML
  parsed through an explicit allowlist rather than installed as DOM;
- deterministic local linear undo and redo with explicit history boundaries;
- an accessible toolbar whose Bold, Undo, and Redo controls are derived from
  action-state contracts and can be reordered, relabeled, or grouped without
  changing the editor loop;
- reload recovery through an atomic IndexedDB session-checkpoint adapter;
- a framework-neutral TypeScript package plus a React reference integration;
  and
- documented package entry points, examples, limits, and supported-browser
  tests.

The `0.1.0` editor is single-user and local. It is expected to be useful for a
small notes or form editor, not a general document processor.

## Architecture boundary

Rust owns the validated AST, editor snapshots, action evaluation, transaction
application, history, and checkpoint codecs. A narrow synchronous
`EditorEngine` facade is the only intended command boundary for the `0.1.0` Wasm
adapter. That facade prepares and publishes an action in one call, preventing a
JavaScript host from retaining an executable preparation and applying it to a
later observation. Every command carries the exact engine-instance/state/history
observation from which the host derived it.

The TypeScript browser layer owns event timing, composition sessions,
clipboard access, focus, DOM selection observation, projection, scheduling,
and IndexedDB calls. It may request a semantic command or report a guarded
selection observation; it may not edit the Rust AST or synthesize a successful
commit. React is an adapter around this framework-neutral layer, not the editor
runtime.

The DOM is therefore not a second model:

```text
browser event -> typed adapter command -> Rust EditorEngine -> EngineEvent
                                                        |          |
                                                        v          v
                                      canonical EditorState / AST  Commit view
                                                        |
                                                        v
                                             DOM projection + selection
```

Every browser-originated selection update is bound to an
`EditorEngineObservation` containing a private identity for the live engine,
the `SnapshotId` from which its DOM was rendered, and the exact opaque history
observation. Crossing an engine instance or using stale state/history fails
without mutation. A real selection move clears a caret-only
pending-format override and closes the current merge group; an exact browser
echo preserves both.

## Why the `0.1.0` facade returns `EditorEngineEvent`

The guarded engine returns a successful mutation as a private-constructor
`EditorEngineEvent`, not an owned raw `Commit` or `LocalLogEvent`. Its kind
preserves whether action, selection, undo, redo, close-group, or clear-history
work occurred. Commit-bearing events lend the complete renderer-facing
transition, including operation, relocation, and change information, but do not
provide a consuming commit escape that could be directly relabeled. This is an
accidental-misuse guard, not an authorization or provenance boundary: a host can
copy the borrowed commit through the public codec and must not treat event
sealing as proof.

At `0.1.0`, `LocalLogEvent` was the core's separately sealed ordinary/undo/
redo/control classification, but no infallible internal projection from
`EditorEngineEvent` existed. Its checked undo/redo constructors could fail
after the session replay had already published. `LocalLogEntry` then added the
durable session/log, sequence, and replay identities needed by append. Version
`0.2.1` later added a non-lossy process-local classification projection, but it
still does not allocate those identities or coordinate append.

This is a deliberate `0.1.0` limitation, not permission to reinterpret an
engine event as an append-ready log entry. The `0.1.0` persistence promise uses
an atomic `SessionCheckpoint` save/restore path. Executable Local Log Frame V1
append, rotation, and restart reconstruction remain later work.

## Checkpoint sequence

Every checkpoint was formatted, linted, tested, documented, committed, and
annotated with its matching version tag. The dependency order remained frozen;
review could split a gate into additional patch versions, but no later gate was
claimed first.

1. `0.0.48`: guarded Rust `EditorEngine` facade over actions, selection
   observation, history replay, and history-group boundaries.
2. `0.0.49`: close the first editing gaps: forward deletion, Unicode-grapheme
   deletion behavior, a dedicated selection-delete command, and an atomic
   multiline plain-text insertion path. Complete.
3. `0.0.50`: separate Wasm crate and generated TypeScript declarations with a
   deliberately narrow, structured-error ABI. Complete.
4. `0.0.51`: deterministic AST-to-DOM projection with stable node mapping and
   renderer invalidation driven by commits. The projection path must also make
   the post-publication JSON-output-limit recovery policy explicit; the browser
   must not become irrecoverably blind to a committed state. Complete: mapping
   is exact and snapshot-local rather than a persistent node-ID promise; every
   effective Wasm mutation is checkpoint-admitted before publication.
5. `0.0.52`: guarded bidirectional DOM/Rust selection mapping, focus handling,
   and selection-loop suppression. Complete: semantic range reads and writes
   are observation-guarded and checkpoint-admitted; the browser mapping is
   snapshot/generation-bound, direction-preserving, drift-checked, and keeps
   focus separate from semantic absence.
6. `0.0.53`: `beforeinput`, keyboard fallback, and supported clipboard command
   translation outside composition. Complete: exact semantic selection and
   target-range capture, one-use observation/render delivery, non-recursive
   bounded FIFO ordering, key/clipboard echo receipts, `input`-as-postcondition,
   and handle-owning Wasm execution/reconciliation are explicit; clipboard
   mutation remains deliberately staged for `0.0.55`.
7. `0.0.54`: composition/IME ownership, cancellation, and browser
   reconciliation. Complete: an exact adapter-bound queue lease excludes
   ordinary work; one light-DOM range can temporarily yield one paragraph to
   native IME mutation; strict text/strong reconciliation restores the
   authoritative projection before one guarded Rust insert, delete, or
   cancellation history boundary; and stale settlement falls back to
   canonical recovery without a Wasm call or treating native DOM as the model.
   The integration was controller-only at this checkpoint; cross-browser
   validation was deferred to `0.0.59`, and this checkpoint made no broader
   device claim.
8. `0.0.55`: sanitized supported-subset HTML copy/paste plus atomic multiline
   paste integration. Complete: semantic selections serialize to bounded plain
   text and escaped base-subset HTML; HTML-only paste uses a strict parse5 tree
   allowlist and reduces to plain text; a same-executor queue lease
   guards synchronous clipboard capability access, cancellation, one final Rust
   delete/insert, and operation-bound echo receipts. Clipboard/core work is not
   rollback-atomic, and the async Clipboard API, rich mixed-format paste, and
   cross-browser matrix were outside this checkpoint.
9. `0.0.56`: extensible accessible toolbar and action-state refresh/delivery
   layer. Complete: the guarded Wasm engine owns the base Bold/Undo/Redo state
   catalog and cache; the browser consumes its disposable complete snapshots
   into a last-good synchronous store; real `selectionchange` work uses the
   shared queue while toolbar focus explicitly preserves semantic selection;
   and a bounded callback-free manifest drives native buttons with roving focus
   and pressed/mixed state. JavaScript action registration, dynamic plugin
   lifecycle, styling, and real assistive-technology claims remain outside this
   checkpoint.
10. `0.0.57`: atomic IndexedDB `SessionCheckpoint` autosave, reload restore,
    corruption handling, and schema/version rejection. Complete: one exact
    digest-verified record is replaced through store-bound compare-and-swap;
    adopted core commits drive bounded autosave with explicit paused status;
    and generated Wasm, a fresh IndexedDB connection, strict Rust restoration,
    edited document state, selection, undo, and redo pass one cross-layer reload
    contract.
11. `0.0.58`: framework-neutral package hardening and React reference editor.
    Complete: the public browser owner assembles Wasm bootstrap, canonical DOM,
    selection, one FIFO, one event router, toolbar, action-state correlation,
    and optional autosave behind an all-or-nothing factory; root and advanced
    package entry points install with complete licenses and generated Wasm; and
    the React reference serializes bounded flush-before-dispose retirement,
    handles stale startup, and exposes controlled-navigation flushing without
    treating React or DOM state as the editor model.
12. `0.0.59`: browser matrix, accessibility, content egress, packaging, size,
    documentation, and release-candidate audit. Complete: guarded canonical
    Document V1 and semantic plain-text exports; a public-package Playwright
    matrix for Chromium, Firefox, and WebKit; a tarball-only
    import/typecheck/bundle/browser smoke path; exact third-party notices; and
    explicit artifact-size ceilings all pass the full release command set and
    independent audits.
13. `0.1.0`: no new feature; only the final shippability gates and honest
    release notes. Complete: the version and compatibility freeze, full release
    command set, package-consumer proof, documentation review, and independent
    audits passed without widening the feature scope.

## Release gates (passed)

The `0.1.0` release satisfies all of these gates:

- the full native Rust format, lint, unit, integration, compile-fail doctest,
  rustdoc, Wasm-target, and package checks pass;
- Wasm bindings have real-browser tests in the lockfile-pinned Playwright
  Chromium, Firefox, and WebKit/Safari-class engines, including Unicode,
  directional selection,
  composition, undo/redo, clipboard, and reload cases;
- a clean consumer project can install, type-check, bundle, and run the package
  without repository-only paths;
- keyboard-only toolbar use, focus visibility, labels, and pressed/mixed state
  pass the cross-browser assertions, and the mounted fixture has no
  axe-detectable violations; a representative Safari/macOS accessibility-tree
  audit also confirms native roles, names, values, and state transitions; full
  WCAG conformance and actual screen-reader or other assistive-technology
  certification are not claimed by these gates;
- malformed documents, stale snapshots, unsupported pasted content, corrupt
  checkpoints, and failed persistence return controlled errors without
  installing partial state; and
- every effective mutation is published only after its complete canonical
  checkpoint fits the shared 16 MiB JSON budget; an oversized candidate fails
  before publication, leaving the prior committed state renderable and
  checkpointable; and
- the documentation distinguishes implemented behavior, experimental formats,
  host-trusted evidence, and future work.

## Explicitly outside `0.1.0`

The `0.1.0` release does not promise headings, lists, links, images, tables,
arbitrary node kinds, generic marks or attributes, a third-party Wasm plugin
ABI, dynamic plugin unload, collaboration, remote cursors, CRDT/OT rebasing,
selective undo, production-scale documents, cryptographic authenticity,
rollback protection, or an executable durable local-log append/rotation
adapter. The proof contracts for some later storage work may remain exported,
but they are not part of the `0.1.0` browser-product guarantee.

No ProseMirror, Lexical, Tiptap, or CKEditor protocol is adopted. Those projects
remain design references; Breditor's AST, positions, actions, transactions,
history, extension surface, and persistence contracts are its own.
