# Changelog

This file records user-visible Breditor changes. Breditor uses semantic
versions for the supported browser package surface and explicit versions for
its durable formats and Wasm transport.

## 0.1.0 - 2026-09-06

The first shippable repository checkpoint is a deliberately small, local-first
rich-text editor. The npm package manifests and reproducible tarball gates are
prepared for `@breditor/browser` and `@breditor/wasm`; publishing those packages
is a separate operation and has not been performed. The Rust crates remain
repository implementation artifacts with `publish = false`.

### Product and architecture

- Added a framework-neutral browser editor whose canonical state is a validated
  immutable Rust AST. The editable DOM is a disposable projection and is never
  accepted as an independent document model.
- Added a synchronous Rust `EditorEngine` boundary with exact
  engine/state/history observations. Prepared work cannot be retained and
  applied to a later observation, and every effective mutation is admitted by a
  complete canonical session checkpoint before publication.
- Added the generated `@breditor/wasm` transport package and a high-level
  `@breditor/browser` owner. JavaScript owns browser event timing, DOM mapping,
  focus, native composition intervals, clipboard capabilities, scheduling, and
  IndexedDB I/O; Rust owns documents, selections, action evaluation,
  transactions, history, and checkpoint validation.
- Added a bounded non-recursive browser command FIFO. Reentrant work is ordered,
  exclusive composition and clipboard leases provide backpressure, and an
  uncertain executor or observer failure quarantines the queue instead of
  retrying a command that might already have committed.
- Kept Breditor's AST, points, actions, transaction records, history, extension
  surface, and persistence contracts original. ProseMirror, Lexical, Tiptap,
  and CKEditor are design references only; Breditor implements none of their
  protocols.

### Editing, selection, and history

- Added direct-root paragraphs, non-empty text leaves, and property-free strong
  formatting under the versioned `breditor/base@1` schema.
- Added typed and atomic multiline plain-text insertion, paragraph breaks,
  selection replacement, forward deletion, Unicode-grapheme-aware backward and
  forward deletion, and strong-format toggling.
- Added snapshot-bound UTF-16-safe caret and directional range selections,
  guarded DOM-to-AST and AST-to-DOM mapping, select-all boundaries, exact
  selection-echo suppression, and selection restoration through history.
- Hardened post-render collapsed-caret restoration against WebKit's transient
  `Selection`/`Range` disagreement while preserving exact backward direction
  for non-collapsed selections.
- Added paragraph-local native composition ownership. Intermediate IME DOM is
  treated as temporary evidence, reconciled to one guarded Rust operation, and
  replaced by the canonical projection on success, cancellation, or recovery.
- Added bounded deterministic linear undo and redo, explicit history-group
  boundaries, typing merge groups, exact inverse operations, and replay-proved
  checkpoint restoration.

### Actions and toolbar

- Added a namespaced immutable action registry, semantic intent routing, exact
  prepared capabilities, coherent action-state observations, and conservative
  invalidation.
- Added one public toolbar extension surface based on bounded immutable data,
  not callbacks or mutable plugin objects. The default manifest exposes Bold,
  Undo, and Redo; custom manifests can reorder, relabel, and group controls, or
  bind controls to matching state/command bindings already exposed by the
  injected engine. The official `0.1.0` engine exposes only the Bold, Undo, and
  Redo bindings.
- Added native-button semantics, accessible names, enabled state,
  pressed/mixed state, roving focus, and Home/End/arrow-key navigation. Toolbar
  commands preserve the semantic selection and use the same command FIFO as
  keyboard and browser input.

### Clipboard, persistence, and content egress

- Added semantic copy and cut plus atomic plain-text paste. Supported-subset HTML
  is escaped on copy; HTML-only paste is parsed without creating browser DOM,
  checked against a closed paragraph/strong allowlist, and flattened to plain
  text before it reaches Rust.
- Added the one-slot `breditor/indexeddb-session-checkpoint@1` profile with
  strict schema attestation, exact UTF-8 sizing, SHA-256 alteration detection,
  opaque compare-and-swap tokens, atomic replacement, explicit conflict and
  corruption outcomes, bounded autosave, flush, and paused-state retry.
- Added strict canonical `breditor/document@1` export and semantic plain-text
  export. Both are synchronously correlated to one live Rust snapshot and never
  read mutable DOM text, expose history, or leak Wasm handles.
- Added strict Session Checkpoint V1 encode/decode and replay validation for the
  current document, selection, pending formats, undo/redo position, history
  capacity, and merge continuity.

### Packaging, security, and verification

- Added reproducible generated Wasm checks, reviewed TypeScript declarations,
  transport ABI `2`, exact browser/Wasm version pairing, clean tarball install
  and provenance checks, external type-check and production bundle checks, and
  a real-browser consumer smoke test.
- Added MIT OR Apache-2.0 package licensing plus deterministic third-party
  notices and license payloads for the statically linked Wasm dependency graph.
- Added bounded decoding, projection, action-state, clipboard, queue, history,
  checkpoint, and export limits. Untrusted HTML uses a closed parse5-backed tree
  policy; untrusted documents and checkpoints are strictly decoded and fail
  without installing partial state.
- Hardened editing and toolbar host admission, generated-control dispatch,
  focus, and cleanup with native, brand-checked DOM reads and mutations, so
  shadowed tag, connectedness, child/parent topology, owner-document, role,
  tab-index, editable-ancestry properties, or own
  `setAttribute`/`append`/`remove`/`focus` methods cannot masquerade as, corrupt,
  dispatch through, or prevent cleanup of a supported mount or control.
- Added native Rust format, lint, test, property, security, compile-fail,
  rustdoc, Wasm-target, direct wasm-bindgen browser-runner, package, audit, and
  artifact-size gates.
- Added public-package Playwright coverage in lockfile-pinned Chromium, Firefox,
  and WebKit for editing, Unicode, directional selection, composition, toolbar,
  clipboard, IndexedDB reload, content export, undo, redo, and axe-detectable
  accessibility issues. A representative Safari/macOS accessibility-tree audit
  also checked native roles, names, values, and state changes.

### Deliberate limitations

- The base product supports paragraphs, text, and strong formatting only. It has
  no headings, lists, links, images, tables, nested blocks, arbitrary marks or
  properties, extension renderers, or dynamic action/plugin registration.
- Editing is single-user and local. There is no collaboration, CRDT/OT rebase,
  remote cursor, selective undo, cross-device synchronization, or multi-document
  registry.
- Selection is one light-DOM range. Composition is one range in one paragraph,
  and the automated composition scenarios are synthetic; real operating-system
  IMEs and mobile browsers are not certified.
- Clipboard support uses synchronous event `clipboardData`. There is no async
  Clipboard API, custom internal MIME type, file/image transfer, or rich
  mixed-format paste.
- Persistence is one best-effort same-origin checkpoint slot. Its digest is not
  authentication, and there is no rollback protection, cryptographic origin,
  executable append log, crash-tail recovery, or storage-generation publication
  adapter.
- The supported high-level browser content-egress API is Document V1 or plain
  text only. It exposes no HTML, editor-state, history, or session-checkpoint
  export operation.
- Commands are synchronous, and clipboard/DOM/core work is not one rollback
  transaction. Fail-stop behavior and canonical reconciliation contain an
  uncertain later stage but cannot undo an earlier external side effect.
- Browser automation, axe, and one Safari accessibility-tree inspection do not
  establish real-IME or mobile support, screen-reader behavior, or WCAG
  conformance. The supported and excluded compatibility surfaces are defined in
  [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).
