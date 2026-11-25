# Integrate the Breditor editor candidate

Use the matching archive set from a single candidate build. The three local
archives provide the production browser entry, its rich Wasm runtime and the
SDK. Collaboration and React each add a separate import and dependency.
The registry release and supported V1 API decisions are tracked in the
[V1 readiness ledger](v1-readiness.json). The
[candidate source API inventory](V1_SOURCE_API_CANDIDATE.md) records the
installed browser and editor routes for that review.

## Install from the candidate archives

Start in your application or a new npm project. Set `archive_dir` to the
directory containing the reviewed `0.3.0-alpha.22` tarballs. Check each
archive's SHA-256 against the matching candidate evidence.

```sh
archive_dir=/absolute/path/to/candidate-archives
npm install --ignore-scripts \
  "$archive_dir/breditor-browser-0.3.0-alpha.22.tgz" \
  "$archive_dir/breditor-experimental-rich-content-0.3.0-alpha.22.tgz" \
  "$archive_dir/breditor-editor-0.3.0-alpha.22.tgz"
```

Keep the resulting lockfile with the application. For a connected install,
npm obtains the other locked dependencies from your registry. For an offline
install, prepare that registry cache first and add `--offline`.

The producing checkout can generate and qualify the set with the repository's
pinned Node, Rust and wasm-bindgen toolchain:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node scripts/prepare-candidate-npm-cache.mjs
npm run build --workspace @breditor/browser
node scripts/check-editor-package.mjs
```

The last command prints the temporary directory retained by the proof. Its
`archives/` directory contains the package set. The repository's
`target/editor-installed-consumer.json` records the archive hashes. The
consumer installs the tarballs directly and loads the paired binary through
the generated package entry. Rust is required in the producing checkout.
An application that installs the archives builds its assets with its normal
JavaScript bundler.

## Open an editor

Provide an element with ID `editor` and load the following as a browser module
through a bundler that supports `new URL(..., import.meta.url)` assets.
The archive qualification uses Vite production builds.

```js
import { openLocalEditor } from "@breditor/editor";

const host = document.querySelector("#editor");
if (!host) throw new Error("Missing editor host");

const editor = await openLocalEditor({
  host,
  initial: { kind: "empty" },
  label: "Document",
  onError(error) {
    console.error(error);
  },
});

window.addEventListener("pagehide", event => {
  if (!event.persisted) editor.dispose();
});
```

Save the exact string from `editor.checkpointJson()` in your application
storage. Dispose the editor when your application removes its host. On
reopen, pass `initial: { kind: "checkpoint", checkpointJson }` and the same
`richLanguage` and history options. To keep the default behavior, omit
`richLanguage` and use language 1.

## Choose the entry point

- **Local browser editor** uses `@breditor/editor`, which includes the original
  Rust-backed rich editor with headings, lists, tables, images and exact local
  undo history. Select the frozen [rich language](RICH_LANGUAGE_V4.md)
  explicitly for later grammars.
- **React editor** uses `@breditor/editor/react`. Use the React 19 peer and see
  the [installed SDK examples](../packages/breditor-editor/README.md).
- **Shared editor** uses `@breditor/editor/collaboration` or its `/react` entry.
  Install `breditor-collaboration-0.3.0-alpha.22.tgz` from the same
  set. Use a compatible room and provision each writer independently.
- **Static publishing** uses `@breditor/editor/static`. It renders canonical
  documents to HTML in a server or build process without starting an editor.
- **HTML, Markdown and DOCX** use the [separate interchange
  archive](../packages/breditor-interchange/README.md). Exported documents
  represent content. Use native backups to retain checkpoints and redo.

The qualification evidence covers the bundled Playwright Chromium, Firefox
and WebKit matrix where recorded in the candidate run. See the
[physical browser and input evidence](BROWSER_SUPPORT_AND_ACCESSIBILITY.md)
for native check scope.

## Host storage and connectivity

The application owns persistence, access policy and asset resolution. Save
native checkpoint strings with their language, transport and history choices.
A complete application backup can also need the image store, shared writer
journals, transport state and review metadata. Select the matching
[session](SESSION_BACKUPS.md), [shared session](SHARED_SESSION_BACKUPS.md),
and [asset](RICH_ASSET_BACKUPS.md) contracts for your host.

For images, provide `resolveAsset` and retain original bytes for all reachable
history. A shared application supplies its identity, authentication, writer
registration, deployment and retention policy. The
[reference relay](../experiments/relay/README.md) provides controlled test
and integration surfaces. The readiness ledger records public deployment
qualification separately.

## Troubleshoot and upgrade

- **Startup or a Wasm asset request fails.** Check the installed versions and
  the deployed generated asset URL. Publish the JavaScript chunks and their
  matching Wasm files together.
- **A saved document or journal is refused.** Keep the bytes and recover the
  producer commit, language, profile and history policy. Open an isolated copy
  with the matching reader. Follow only documented
  [compatibility and migration routes](COMPATIBILITY.md).
- **Preparing an upgrade.** Keep the old lockfile and paired archives. Export
  the applicable native backups and test restore, Undo, Redo and reconnect in
  an isolated environment before switching a live application. Keep the
  original writer credentials with their owner.
- **Support and contributions.** Send ordinary integration issues through
  [GitHub Issues](https://github.com/s9rg/breditor/issues) with the tested
  versions and a synthetic example. Follow [the contribution
  guide](../CONTRIBUTING.md) for changes and [the private reporting
  policy](../SECURITY.md) for vulnerabilities.
