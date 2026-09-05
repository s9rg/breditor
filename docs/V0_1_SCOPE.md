# Breditor `0.1.0` scope

Status: frozen product target; implementation completed through `0.0.50`

`0.1.0` means a small, usable, local-first browser rich-text editor backed by
the Breditor Rust core. It does not mean that every storage or collaboration
contract already present in the proof kernel has a browser implementation.

## Product promise

The release must let a user edit one document in a browser with:

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
- an accessible toolbar whose controls are derived from action-state contracts
  and whose command surface can be extended without changing the editor loop;
- reload recovery through an atomic IndexedDB session-checkpoint adapter;
- a framework-neutral TypeScript package plus a React reference integration;
  and
- documented package entry points, examples, limits, and supported-browser
  tests.

The `0.1.0` editor is single-user and local. It is expected to be useful for a
small notes or form editor, not yet as a general document processor.

## Architecture boundary

Rust owns the validated AST, editor snapshots, action evaluation, transaction
application, history, and checkpoint codecs. A narrow synchronous
`EditorEngine` facade is the only intended command boundary for the first Wasm
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

## Why the first facade returns `EditorEngineEvent`

The guarded engine returns a successful mutation as a private-constructor
`EditorEngineEvent`, not an owned raw `Commit` or `LocalLogEvent`. Its kind
preserves whether action, selection, undo, redo, close-group, or clear-history
work occurred. Commit-bearing events lend the complete renderer-facing
transition, including operation, relocation, and change information, but do not
provide a consuming commit escape that could be directly relabeled. This is an
accidental-misuse guard, not an authorization or provenance boundary: a host can
copy the borrowed commit through the public codec and must not treat event
sealing as proof.

`LocalLogEvent` is the core's separately sealed ordinary/undo/redo/control
classification, but no infallible internal mapping from `EditorEngineEvent` to
that value exists yet. Its checked undo/redo constructors consume a commit and
can fail after the session replay that produced the engine event has already
published. `LocalLogEntry` then adds the durable session/generation, sequence,
and retry identities needed by append. An append coordinator must reserve those
identities and close conversion before mutation; inventing them in a UI facade
would be untrustworthy and would couple every command to one storage policy.

This is a deliberate pre-`0.1` limitation, not permission to reinterpret an
engine event as an append-ready log entry. The `0.1.0` persistence promise uses an atomic
`SessionCheckpoint` save/restore path. Executable Local Log Frame V1 append,
rotation, and restart reconstruction remain later work.

## Checkpoint sequence

Every completed checkpoint must be formatted, linted, tested, documented,
committed, and annotated with its matching version tag. The dependency order is
frozen; a gate may be split into additional patch versions when review exposes
a smaller safe boundary, but a later gate must not be claimed first.

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
   must not become irrecoverably blind to a committed state.
5. `0.0.52`: guarded bidirectional DOM/Rust selection mapping, focus handling,
   and selection-loop suppression.
6. `0.0.53`: `beforeinput`, keyboard fallback, and supported clipboard command
   translation outside composition.
7. `0.0.54`: composition/IME ownership, cancellation, and browser reconciliation.
8. `0.0.55`: sanitized supported-subset HTML copy/paste plus atomic multiline
   paste integration.
9. `0.0.56`: extensible accessible toolbar and action-state refresh/delivery
   layer.
10. `0.0.57`: atomic IndexedDB `SessionCheckpoint` autosave, reload restore,
    corruption handling, and schema/version rejection.
11. `0.0.58`: framework-neutral package hardening and React reference editor.
12. `0.0.59`: browser matrix, accessibility, packaging, size, documentation,
    and release-candidate audit.
13. `0.1.0`: no new feature; only the final shippability gates and honest
    release notes.

## Release gates

`0.1.0` is shippable only when all of these hold:

- the full native Rust format, lint, unit, integration, compile-fail doctest,
  rustdoc, Wasm-target, and package checks pass;
- Wasm bindings have real-browser tests in current Chromium, Firefox, and
  WebKit/Safari-class engines, including Unicode, directional selection,
  composition, undo/redo, clipboard, and reload cases;
- a clean consumer project can install, type-check, bundle, and run the package
  without repository-only paths;
- keyboard-only toolbar use, focus visibility, labels, pressed/mixed state, and
  screen-reader semantics pass an accessibility audit;
- malformed documents, stale snapshots, unsupported pasted content, corrupt
  checkpoints, and failed persistence return controlled errors without
  installing partial state; and
- every committed state remains renderable and recoverably checkpointable even
  when escaped JSON would exceed a codec output budget; and
- the documentation distinguishes implemented behavior, experimental formats,
  host-trusted evidence, and future work.

## Explicitly outside `0.1.0`

The first release does not promise headings, lists, links, images, tables,
arbitrary node kinds, generic marks or attributes, a third-party Wasm plugin
ABI, dynamic plugin unload, collaboration, remote cursors, CRDT/OT rebasing,
selective undo, production-scale documents, cryptographic authenticity,
rollback protection, or an executable durable local-log append/rotation
adapter. The proof contracts for some later storage work may remain exported,
but they are not part of the `0.1.0` browser-product guarantee.

No ProseMirror, Lexical, Tiptap, or CKEditor protocol is adopted. Those projects
remain design references; Breditor's AST, positions, actions, transactions,
history, extension surface, and persistence contracts are its own.
