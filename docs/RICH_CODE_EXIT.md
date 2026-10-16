# Code block exit

Explicit structural V2 local and shared editors can enter a new paragraph after
a code block without converting or splitting its source. Use the stock **Exit
code** control or Ctrl+Enter / Command+Enter with a collapsed code caret. The
shortcut also works with an empty or custom toolbar. Ordinary Enter and
Shift+Enter continue to insert LF inside code.

## Placement and history

The caret may be at any scalar-aligned UTF-16 boundary, including an empty code
block. Rust inserts a fresh empty paragraph immediately after the entire block, before
its original next sibling, in the same document, table cell, blockquote, list
item or task body. Code text, CR/LF, tabs, language and surrounding identities
are unchanged. The new caret is paragraph offset zero and pending formats
derive afresh. A selected range is not replaced by this command.

One existing flow-insertion history recipe owns the paragraph and exact
before/after selection. Natural input before the exit, the exit itself and input
in the new paragraph form separate history groups. Undo hides the creator's
paragraph; it does not erase another writer's causal text inside it. Redo
restores that text, including after exact checkpoint recovery. This is the
existing shared creation policy, not a new conflict rule.

## Native contract and capabilities

`RichLocalSession::exit_code_block` and
`RichReplica::exit_code_block_guarded` each live in a named documented file.
Both check the exact observation and writable policy before planning. They
require a collapsed code caret, a fresh valid paragraph ID and an admitted flow
parent. Invalid selections, duplicate IDs and late resource-limit failures
publish no document, selection, history or causal change.

The local Wasm command is
`{kind:"exitCodeBlock",data:{paragraph:"fresh-id"}}`; its data object rejects
unknown, duplicate and incorrectly typed fields. Local instances expose
`codeExitVersion() === "1"`. Shared instances expose
`code_exit_version() === "1"` and guarded `exit_code_block`. SDK controls require
the exact capability. There is no JavaScript flow-planning fallback for an older
runtime. Composition and focused native widgets retain their keys; read-only
owners reject authoring.

Persisted local actions and shared commands remain the original `InsertBlocks`
family. Document, checkpoint, journal, model and frame versions are unchanged.
Old matching V2 runtimes can restore new code-exit histories and continue exact
Undo/Redo and editing, although they cannot execute the new convenience command.
V1 grammar and factory defaults remain unchanged.

## Reproduction

Native fixtures cover six positions: root with a following sibling, cell,
blockquote, list body, checked task body and a trailing empty code block.

```sh
cargo test --offline --workspace --features breditor-wasm/experimental-rich-content
cargo test --offline --manifest-path crates/breditor-collaboration/Cargo.toml --test code_exit_contracts
node scripts/check-editor-browser.mjs
```

`experiments/editor-browser/code-exit.spec.mjs` exercises installed local/shared
archives in Chromium, Firefox and WebKit: both platform shortcuts, toolbar,
ordinary Enter, range/read-only/widget guards, custom toolbars, natural groups,
durable reload, concurrent exits and selective history. The native collaboration
suite separately checks peer text inside the exit-created paragraph. Actual
old/current Wasm interoperability uses
`scripts/probe-code-exit-compatibility.mjs`; see the linked
[qualification record](qualification/2026-10-16-code-exit.json) for exact builds.

The multi-page installed consumer retains a dynamic collaboration import.
With pinned Vite 8.2.2, strict entry signatures alone allowed that import to
execute the unrelated network page and request `/relay-bootstrap.json`.
`rolldownOptions.output.strictExecutionOrder: true` preserves module execution
boundaries; each browser case rejects that unexpected request. This is test-host
bundling configuration, not a Rust schema change or a production SDK workaround.

General atomic-block arrows, gap selections, deletion rules and cross-container
selection remain separate unfinished contracts. This feature does not qualify
the historical intermittent WebKit fault, old replay/cancellation observations,
shared input latency or V1 release readiness.
