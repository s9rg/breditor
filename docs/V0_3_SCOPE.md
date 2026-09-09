# Breditor `0.3.0` scope

Status: `0.3.0-alpha.1` implements the Rust-only typed inline-format property
contract. Browser construction, rendering, toolbar behavior, and property-aware
editing are deliberately deferred.

`0.3.0` starts the path from property-free formatting to useful semantic
formats such as links, mentions, text colors, and annotations. The first
checkpoint defines and validates their data language before adding mutation or
presentation behavior.

This remains an original Breditor design. ProseMirror, Lexical, Tiptap, and
CKEditor are research references only. Breditor does not adopt their document,
step, transaction, selection, command, plugin, or serialization protocols.

## Alpha.1 decision

A typed property contract is an optional adjunct to one manifest-owned
`InlineFormatSpecV1`. Absence means the format is property-free, preserving the
`0.2.x` meaning. Presence means every format instance is checked against one
closed, nonempty, canonical property declaration set.

Property contracts are part of the compiled document language. They are not
toolbar metadata, renderer configuration, or executable extension code. This
placement makes document admission deterministic and puts every meaning-bearing
field in the schema fingerprint.

Each `InlineFormatPropertySpecV1` contains:

- one qualified property name;
- `Required` or `Optional` presence; and
- exactly one `InlineFormatPropertyTypeV1` scalar domain.

The first scalar domains are:

- `Boolean`;
- a JavaScript-safe integer with optional inclusive minimum and maximum; or
- a Unicode string with inclusive minimum and maximum UTF-8 byte lengths.

Explicit integer bounds equal to the global JavaScript-safe endpoints are
canonicalized to absent bounds. Semantically identical integer domains
therefore have one value and one fingerprint encoding.

The contract intentionally excludes null, floating-point numbers, arrays,
objects, unions, enums, patterns, default values, coercion, normalization,
cross-property rules, and executable validators. Required means the key must be
present; it does not make JSON null valid. Optional means the key may be absent;
when present, it must match its declared scalar domain.

## Canonical construction and ownership

`PropertyMap::try_from_sorted` is the public checked constructor for exact
format property instances. Input must already be in strictly ascending
qualified-name order. Duplicate and out-of-order input is rejected; the
constructor never sorts caller input or applies last-wins behavior.

`InlineFormatPropertyContractV1::try_new` sorts declaration input into its
canonical order, rejects duplicate names, rejects `breditor/*` property names,
requires at least one declaration, and accepts at most 32 declarations.

`ExtensionManifest::try_new_with_inline_format_declarations` is the complete
manifest constructor. A contract must target a format owned by the same
manifest, each target can have at most one contract, and a manifest can carry
at most 255 contracts. Older manifest constructors remain exact shorthands for
an empty contract set.

Property contracts are immutable data. They contain no callback, function
pointer, dynamic dispatch, script, host object, URL policy, CSS policy, or
renderer authority.

## Compiled schema and durable identity

The compiler attaches each admitted contract to its exact inline-format kind.
`CompiledSchema::inline_format_property_contract` exposes that immutable
language rule. `CompiledProfileInlineFormatDescriptor` retains the same owned
contract on the Rust descriptor.

Property-free schemas retain compiler-contract version 1 and their exact
canonical fingerprint bytes. In particular, the locked `breditor/base@1`
fingerprint remains unchanged. A schema containing any typed format uses
compiler-contract version 2. The canonical bytes include, in order:

- the format's contract-presence bit;
- property-contract grammar version 1;
- the declaration count;
- each sorted qualified property name;
- required or optional presence;
- scalar type; and
- the canonical integer or UTF-8 byte bounds.

The locked first typed fixture is schema `example/link-profile@1`, format
`example/link@1`, with required `example/href` string bytes `1..=2048`. Its
fingerprint is:

```text
sha256:3903989dedf6015c4f81b16fdaaddafb4a7a100f1b7f61bfacef694b5141c9ef
```

Tests lock both its 356 canonical bytes and digest. A separate matrix proves
that changing a property name, presence, scalar type, integer bound, or string
bound changes the fingerprint, while declaration input order does not.

Host resource limits remain outside the fingerprint. They restrict what one
process is willing to admit; they do not redefine the portable content
language. A host may therefore choose limits tighter than a contract and make
some or all values of that schema unusable on that host.

## Document validation and limits

Document V2 can admit and round-trip typed format instances when the receiving
compiled schema and fingerprint match. Validation rejects:

- undeclared keys;
- missing required keys;
- null or another wrong value variant;
- integers outside inclusive bounds; and
- strings outside inclusive UTF-8 byte bounds.

Diagnostics carry stable codes and structured subjects. Integer range failures
retain only the declared bounds and whether the payload crossed the lower or
upper bound; the rejected integer is not retained. String failures retain the
byte length, not the string payload.

`DocumentLimits` now separately bounds one property string and aggregate
property-string bytes. The defaults are 65,536 bytes per string and 1 MiB per
document. JSON preflight measures decoded UTF-8 bytes before owned document
construction. `DocumentSummary` caches the exact aggregate for validated
documents.

One `ValidationReport` retains at most 1,024 issues: up to 1,023 deterministic
detailed issues plus one truncation issue. Both JSON
reconstruction and semantic traversal stop collecting after saturation.

Session Checkpoint V2 also accounts for property-string bytes across every
retained document boundary. Its default aggregate ceiling is 64 MiB, with a
distinct `PropertyStringBytes` failure. Exact-boundary encode/decode succeeds;
the first excess fails.

## Editing, selections, history, and replay

Alpha.1 establishes a safe read/admission foundation, not property-aware
editing. The existing four operation variants do not carry a general typed
property mutation contract. To prevent silent property loss or incorrect
inheritance, admitting even one property-bearing format makes
`supports_base_text_operations()` false for the entire compiled schema.

Consequently `TextSplice`, `ParagraphSplit`, `ParagraphJoin`, and
`RootTextReplace` fail before capture, static validation, codec admission, or
transaction application under that schema. Transactions remain atomic on this
failure. Since all current content actions compile to those operations, content
editing is globally disabled for the typed schema in alpha.1, even when a
particular document or selection does not currently use the typed format.

Property-bearing formats are also rejected from the existing V1 pending-format
state. A link, for example, needs an explicit property-bearing creation/update
command; a no-input toggle cannot invent a required `href`. Profile compilation
therefore rejects generated no-input toggles targeting typed formats.

This gate does not make every state feature invalid. A valid typed Document V2
can still be held in an `EditorState`; ordinary selections with no typed pending
format can be represented; state-only changes can be evaluated where their
specific contract permits it; and an empty-history Session Checkpoint V2 can be
encoded and restored. No alpha.1 claim is made for content-changing history or
operation replay under a typed schema.

## Rust, Wasm, browser, and toolbar boundary

The contract is implemented in the deterministic Rust core first because Rust
is useful here for memory safety, checked construction, exhaustive error
handling, compact immutable values, and one source of truth shared by native
and future Wasm hosts. Rust is not expected to make ordinary typing magically
faster than optimized JavaScript. Its main performance value is predictable
validation and replay work without garbage-collector pauses; crossing the Wasm
boundary for tiny commands has a cost and should remain coarse-grained.

Alpha.1 does not widen Wasm ABI 3. The current Wasm bootstrap cannot declare a
property contract, its browser-facing descriptor does not expose one, and the
browser cannot construct, render, edit, copy, paste, persist through its
supported factory, or contribute a toolbar control for typed formats. These
paths remain limited to property-free profiles. The Rust descriptor addition
is not a browser compatibility promise.

Typed scalar validation is not sanitization. A string that satisfies a Link
contract is not automatically a safe URL; a color string is not automatically
safe CSS. URL schemes, renderer attribute allowlists, CSS grammar, HTML import,
and clipboard policy require separate explicit contracts before browser use.

## Deliberate alpha.1 limitations

- Typed contracts apply only to inline formats, not elements or node kinds.
- One text leaf can contain at most one instance of a given format kind, so two
  independently overlapping links of the same kind are not representable.
- Keys are closed and exact; there is no unknown-property preservation.
- Only Boolean, JavaScript-safe integer, and bounded string domains exist.
- There is no property patch, set-format-with-properties, or change-link-target
  operation.
- Every content operation is globally disabled when any typed format is
  admitted.
- Pending typed formats and generated no-input typed toggles are unsupported.
- Wasm, browser projection, DOM rendering, toolbar input, HTML/clipboard
  conversion, and the reference package remain property-free.
- No migration, schema negotiation, unknown typed-format preservation, or
  collaboration transform is introduced.
- Host limits can make a portable schema uninhabitable on that host.

## Next checkpoints

`0.3.0-alpha.2` should add the first property-aware mutation contract, centered
on a Link proof. It must define an atomic operation or transaction recipe for
creating, changing, and removing one exact typed format instance; explicit
action input; selection and pending-typing behavior; inverse generation;
undo/redo and checkpoint replay; resource limits; and hostile-input tests. The
coarse global operation gate should be removed only for paths whose preservation
laws are proved.

After the Rust mutation language is stable, a later checkpoint can extend the
Wasm bootstrap and descriptor, then add callback-free browser rendering and a
typed toolbar/control input contract with explicit URL sanitization. Rich HTML
paste, mentions, colors, and collaboration remain separate decisions rather
than implied consequences of Link support.
