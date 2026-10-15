# Breditor collaboration application candidate

Optional shared editing for the original Breditor rich editor. This private
`0.3.0-alpha.22` package contains the browser coordinators and their matching
application-only Rust/Wasm module. It has no dependency on the experimental
probe package and does not require a relay for local editing.

Use `@breditor/editor/collaboration` for lazy initialization and the default
standard profile, or use this lower-level package with an explicitly selected
original shared V1 configuration. Install the exact matching candidate archives;
there is no registry release or V1 API freeze yet.

```js
import init, * as wasm from '@breditor/collaboration/wasm';
import {compileStandardSharedProfileV1} from '@breditor/collaboration';

await init();
const profile = compileStandardSharedProfileV1(wasm, {
  format: 'breditor/shared-rich-profile', formatVersion: 1,
  schema: {name: 'example/shared-editor', version: 1}, extensions: []
});
// Acquire the exclusive writer lease before using profile.create/join_frame/restore.
// Transfer each returned writer to SharedRichEditor or SharedPersistentSession.
// Free the profile after those callbacks finish; writers retain their codec.
```

Use a bundler that supports generated `new URL` Wasm assets. Node consumers may
initialize with bytes from the `./wasm-binary` export. Ordinary package-root
types compile with `ES2022,DOM`; advanced generated-binding types additionally
use `ESNext.Disposable`.

## Ownership and host responsibilities

The generated module exposes configured `SharedRichProfile` factories,
`SharedEditorOwner`, opaque `SharedObservation` values and initialization only.
Its generated types have no public constructors for those classes. Fixed-schema
probe constructors, exercise functions, raw engine import/export and unguarded
research authoring methods are excluded from the application build. Use the
factories rather than manually constructing generated objects.

The root exports `SharedRichEditor`, `SharedPersistentSession`, DOM/toolbar
coordinators, relay sync, presence and asset providers. `view()` is a detached
publication; mutations use the owner's current opaque Rust observation. An
optional exact revision rejects asynchronous work prepared from an older view.
Remote publications can be held across input/composition and remain bounded.
Callback failures cannot rewind content already committed by Rust.

Original shared V1 configuration declares a schema name/version, an extension
array and optional tightened document limits. Extensions declare exact IDs,
dependencies, conflicts and typed inline formats. Properties have required or
optional presence and bounded Boolean, integer or UTF-8 string domains. Rust
computes the complete fingerprint; a caller-provided fingerprint is not a schema
declaration. Typed inline extension support does not admit arbitrary block kinds,
callbacks, HTML or CSS. The explicit standard V1 factory adds the same bounded
twelve-format manifest as the local owner, without changing ordinary factories.
Configured factories prove schema admission; they do not authenticate a user,
lease a writer or persist data automatically. A host still supplies identity,
durability, asset-byte storage and optional transport.

Keep the writer lease while a failed local flush is retried. Do not treat a
failed session close as successful disposal or discard unsaved state during a
framework unmount. A durable shared React lifecycle remains subsequent SDK work.
Server acknowledgement and uploaded assets are not the local journal save state.

## Source and compatibility

Rust source is canonical in `crates/breditor-collaboration`; browser source is
canonical in this package. The legacy feasibility manifest and experimental npm
package compile the same source with their original research surface. They are
compatibility/testing paths, not dependencies of this application package.

Configuration V1, ABI 1, model 11, journal 12, deterministic engine tag and
existing serialized meanings are unchanged. A local rich checkpoint is not a
shared journal. The default editor/Wasm graph remains independent of replication.

Run `node scripts/check-editor-package.mjs` for clean minimal/full SDK installs
and production Vite pages. The application-network browser matrix uses the same
strict assertions as the legacy installed matrix, but with this package's own
runtime and coordinators. Native IME, accessibility, historical WebKit fault,
performance budgets and public deployment remain separate qualification gates.
