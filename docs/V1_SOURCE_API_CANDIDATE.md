# V1 source API review inventory

The [installed source inventory](../scripts/fixtures/editor-consumer/source-boundary.json)
records the `@breditor/browser` and `@breditor/editor` package routes, their
declared resolution conditions, runtime export names, and TypeScript-only
export names. It is a candidate review baseline. The [compatibility
policy](COMPATIBILITY.md) defines existing release promises. A V1 decision must
approve the intended support surface and the change policy for each included
route.

- `@breditor/browser` is the existing framework-neutral application entry.
  Its advanced, presentation and autosave subpaths appear separately in the
  inventory. The historical policy specifies which APIs have a support promise.
- `@breditor/editor` is the candidate local rich editor. Its `/react`,
  `/static`, `/autosave`, `/collaboration` and `/collaboration/react` entries
  are explicitly selected. React and collaboration keep their documented peer
  requirements.
- The generated Wasm transport, native bindings, rich-runtime implementation,
  direct build paths and other packages have separate admission contracts.
- The separate [interchange inventory](../scripts/fixtures/interchange-consumer/interchange-source-boundary.json)
  records the adapter root and its explicit `/docx`, `/xml`, `/portable-html`,
  and `/portable-html-import` routes for review.

[The installed SDK check](../scripts/check-editor-package.mjs) verifies the
inventory against its independent consumer after packing and installing the
candidate archives. It checks the JavaScript namespace using each bare
specifier, compares the declarations’ value names, and compiles representative
opening, checkpoint, autosave, close, React recovery and static rendering
signatures with strict TypeScript. It also enumerates declaration exports using
the locked TypeScript checker and the same bare specifiers, so an exported
interface or alias can require review even when the JavaScript namespace is
unchanged. Three intentionally private paths must be refused by package
resolution. The report records these checks with the archive digests.

The same check exercises the direct `@breditor/collaboration` package and its
explicit Wasm entry and binary. The shared-only consumer imports the direct
package and editor facade without React and verifies the stock V1 through V4
schema fingerprints, original journal versions, exact native restores, and
refusals across languages. The local React consumer renders the local entry
without collaboration and verifies that the shared entry requires its peer.
These observations qualify the current matching archive set and document the
separate shared profile and optional peer boundaries.

The [installed interchange check](../scripts/check-interchange-package.mjs)
uses the same inventory verifier in two independent installs. With the rich
runtime peer installed it verifies all five routes, including type-only exports.
The interchange-only install verifies the root, DOCX and XML routes and
confirms that both portable raster imports require the rich runtime peer. The
existing native conversion and selected strict type checks also run. To print
the adapter inventory, run
`node interchange-source-boundary.mjs /absolute/path/to/typescript/bin/tsc --print`
from the installed fixture with the rich runtime peer.

Edits affecting this inventory require review of the corresponding application
entry. In a fresh installed fixture, run
`node source-boundary.mjs /absolute/path/to/typescript/bin/tsc --print` to print
the observed routes and names. Verification compares to the checked-in
baseline and compiles the consumer contract. Changes to the shape of an
individual type still require review. ABI pairing, schema and journal
compatibility, raster backup acceptance, optional peer isolation and complete
V1 type and behavior review retain their own evidence.
