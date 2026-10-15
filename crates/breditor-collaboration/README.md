# Breditor optional collaboration core

The canonical Rust implementation of Breditor's original shared rich editor.
It owns causal text and structure, typed formats, selections, selective history,
exact recovery, clipboard, presence and writer transport. JavaScript never owns
a second replicated document.

This private `0.3.0-alpha.22` candidate is a separate workspace and lockfile.
Selecting it does not add replication dependencies to the default editor/Wasm
workspace. Native application builds use `anchor` and `rich_replica`; begin with
`rich_replica::SharedRichProfile` to compile an original V1 configuration or bind
an already compiled core schema. The standard factory explicitly composes the
same standard inline V1 manifest as the local rich editor.

## Native ownership

A compiled profile owns no room, writer, history, storage or transport. Its
`create`, `join_frame` and `restore` methods return independent `RichReplica`
owners. Acquire the exclusive causal writer lease before constructing one and
retain it until the owner stops. A new participant uses a new writer; a recovered
participant restores its exact journal rather than importing a JSON AST as a
substitute for history. Freeing the profile does not invalidate existing owners.

Use current `SharedObservation` values for guarded authoring. Observations are
process-local capabilities, not serialized revisions or authentication tokens.
Local UI state, shared updates, durable journals, server acknowledgements and
asset bytes remain separate contracts. Every failed staged mutation preserves
the published owner. Existing document, command, history and engine budgets
still apply.

This promotion does not change Document V2, the original configuration/frame
families, ABI 1, model 11, journal 12 or the pinned deterministic-history engine
tag. It does not migrate or reinterpret old data. Local rich checkpoints remain
different from selective shared journals.

## Application Wasm surface

The default Wasm build exports `SharedRichProfile`, `SharedEditorOwner` and
`SharedObservation`, plus generated initialization. Native constructors are
private in the generated types. Create owners through the profile, obtain their
opaque observations and transfer exclusive ownership to the browser coordinator.
The application boundary omits fixed-fixture constructors, probe sessions,
exercise functions and unguarded research authoring methods. It retains the
complete guarded editor, clipboard, selection, formatting, presence and writer
transport capabilities.

`node scripts/build-collaboration-runtime.mjs` builds with explicit
`--no-default-features`, generates paired bindings and checks the actual JS,
declaration and Wasm exports before copying anything into the application
archive. Do not edit generated glue or manually construct generated objects.

## Compatibility qualification

The `research` feature enables the original probe schemas and fixture exports.
`experiments/collaboration/Cargo.toml` intentionally compiles this same source
under the old crate identity with that feature enabled. The original research
Wasm names and qualification commands remain available; there is no copied
second implementation. Fourteen shared conformance files live here and are
also compiled through small adapters by the legacy manifest. Legacy-only
session/engine tests remain in the experiment.

The canonical browser source is in `packages/breditor-collaboration/src`.
The old browser package compiles that same source into its compatibility output.
The application package is `@breditor/collaboration`; its Wasm module is not the
legacy package's probe module. Both are private candidates, not published APIs.

The pinned engine source and its ordering patch are retained under `vendor`.
Promotion preserves every tracked engine byte and locked dependency version.
See [patch provenance](vendor/BREDITOR_PATCH.md). Public dependency/license,
performance, reliability and release qualification are still separate work.

Both the public engine facade and internal engine are explicit path dependencies
inside the source candidate. A downstream application needs no root override:
[Cargo ignores dependency-local patch sections](https://doc.rust-lang.org/cargo/reference/overriding-dependencies.html#the-patch-section).
The public facade retains its upstream Rust sources; its manifest alone points
to the existing patched internal source. Neither engine version nor algorithm
changes. Native consumption is currently qualified from a complete source/Git
candidate, not a rewritten registry `.crate` publication; registry packaging and
fork identities require separate release review before publication is enabled.

## Verification

```sh
cargo test --manifest-path crates/breditor-collaboration/Cargo.toml --locked --no-default-features --offline
cargo test --manifest-path experiments/collaboration/Cargo.toml --locked --offline
node scripts/check-collaboration-native-consumer.mjs
node scripts/check-editor-package.mjs
node_modules/.bin/playwright test --config experiments/editor-browser/playwright.config.mjs
node_modules/.bin/playwright test --config experiments/shared-browser/application-network.config.mjs
```

The browser network checks also require the existing native relay/vector setup;
run `node scripts/check-shared-browser.mjs` to build and qualify that legacy path.
The broader first-two-workstream goal remains open, including durable shared
React ownership and the remaining editing/interchange features.
