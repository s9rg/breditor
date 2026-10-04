# Schema fingerprint contract

Status: compiler identity, strict public parser, durable binding, the complete
Rust-core V2 record graph, the sealed base-text extension compiler, and the
profile-aware browser persistence selector are implemented in `0.2.0`.
`0.3.0-alpha.1` adds the typed inline-format property projection and compiler-
contract version 2 while preserving exact version-1 bytes for every property-
free schema. The unpublished alpha.3 ABI-4/browser bridge exposes and validates
that same digest-bound property contract; it does not change fingerprint bytes.
Alpha.4's closed browser-owned safe-Link presentation also remains outside the
fingerprint and changes no fingerprint bytes. Alpha.5's separate private
paragraph-structure capability and property-preserving structural execution do
not change the declared content language, compiler-contract bytes, or either
locked fingerprint vector.
Alpha.11's browser-only keyboard shortcut declarations target existing
action-state descriptors and likewise do not enter fingerprint bytes.
Immutable compiled semantic profiles keep action/intent/state
and browser-presentation declarations outside this digest; their separate
runtime generation crosses the engine/Wasm/browser boundary without being
serialized.

`SchemaFingerprint` is the durable identity of one complete compiled content
language. It lets Breditor distinguish schemas that share a human-readable
`SchemaId` but enforce different document meaning. The public text form is
always `sha256:` followed by 64 lowercase hexadecimal digits.

The fingerprint is not an extension identity, package signature,
authorization token, provenance record, migration instruction, or
process-local validation proof. The public Rust type parses only the exact
71-byte text form through `FromStr`/`TryFrom`; it deliberately has no public
Serde contract. Every independent Rust V2 JSON envelope stores that canonical
text beside `SchemaId` and requires both identities to match the receiving
compiled schema. Alpha.3 introduced
`CompiledSchema::try_compile_base_text_profile`: callers provide a
non-`breditor/*` schema selector and a resolved extension set whose manifests
may add inline formats. In `0.2.x` those formats are property-free;
`0.3.0-alpha.1` lets the Rust manifest attach one closed typed property contract
to a format. Alpha.4 adds `CompiledEditorProfile`,
which co-owns that schema with generated action, intent, binding, and
action-state components under a fresh process-local generation. Those semantic
components do not widen the fingerprint input. A general node/property schema
compiler remains staged.

The October 2 private structural grammar slice adds compiler-contract version
3 for child alternatives and ordered groups. No public structural profile is
admitted yet; element-property contracts and structural editing remain staged.
Existing base/text/typed-format schema fingerprints are unchanged.
Compiler-contract version 3 is a fingerprint-encoding discriminator, not a new
document wire version or permission to admit structural documents publicly.

The optional `experimental-structural-properties` Rust feature adds version 4
for closed required-integer element contracts. It likewise adds no public
structural profile and no document wire version. Without any element contract,
the exact version 1–3 fingerprints remain unchanged even with this feature on.

The experimental flat-list schema selects compiler-contract version 5 for a
required integer which also bounds the final direct-child ordinal. Without that
rule, version 1–4 encodings remain byte-for-byte unchanged. This is not a new
document/session wire version and does not grant list editing capabilities.

## Canonical byte encoding

The SHA-256 input starts with the exact ASCII/UTF-8 domain bytes
`breditor/schema-fingerprint`, followed by one zero byte. All remaining fields
appear exactly once in the order below. Every field starts with its one-byte
tag.

1. `0x01`: canonical-encoding version as a big-endian `u32` (`1`).
2. `0x02`: schema value-model version as a big-endian `u32` (`1`).
3. `0x03`: compiler-contract version as a big-endian `u32`. It is `1` when all
   child constraints are single-kind repeats and all formats are property-free;
   `2` when those child constraints remain single-kind repeats but any format
   has a typed property contract; `3` when any element uses multiple alternatives
   or ordered child groups, whether or not typed format properties are present;
   `4` takes precedence when any element has a required-integer property contract;
   `5` takes precedence when such a contract additionally constrains child ordinals.
4. `0x10`: qualified schema name.
5. `0x11`: nonzero `SchemaVersion` as a big-endian `u32`.
6. `0x12`: qualified root element kind.
7. `0x13`: qualified paragraph-role element kind.
8. `0x14`: qualified strong-role inline-format kind.
9. `0x20`: non-empty-text constraint.
10. `0x21`: canonical-format-order constraint.
11. `0x22`: unique-format-kind constraint.
12. `0x23`: merge-adjacent-equal-text constraint.
13. `0x24`: globally-unique-entity-ID constraint.
14. `0x30`: element count as a big-endian `u32`.
15. Zero or more element entries, sorted by qualified kind bytes.
16. `0x40`: inline-format count as a big-endian `u32`.
17. Zero or more inline-format entries, sorted by qualified kind bytes.

Each element entry contains, in order:

1. `0x31`: entry marker with no payload.
2. `0x32`: qualified element kind.
3. `0x33`: nonzero persisted type revision as a big-endian `u32`.
4. `0x34`: whether properties are allowed.
5. `0x35`: whether an entity ID is allowed.
6. Exactly one child-kind field: `0x36` with no payload for text, or `0x37`
   with a qualified child element kind.
7. `0x38`: minimum child count as a big-endian `u32`.
8. `0x39`: optional maximum child count.

For a multi-alternative or multi-group element, replace fields 6–8 with:

1. `0x50`: number of ordered groups as a big-endian `u32` (1–8).
2. For each group in semantic order:

   - `0x51`: alternative count as a big-endian `u32` (1–16).
   - Each alternative: `0x36` for text or `0x37` with an exact qualified
     element name. Text sorts first, then element names in lexical order.
   - `0x38`: this group's minimum count as a big-endian `u32`.
   - `0x39`: this group's optional maximum count.

Every alternative must be unique across all groups of the element. The
compiler rejects empty groups, excessive declaration counts, invalid ranges,
unknown element references and aggregate minimum overflow. It does not sort
groups: changing their order changes the language and fingerprint. Within a
version-3 schema, single-kind-repeat elements still use fields 6–8 above.
Typed format entries below remain fully encoded under version 3.

The private `example/structural-shape-test@1` fixture in
`schema/structural_grammar_tests.rs` has a 707-byte canonical input and digest
`sha256:06fd7accf6565539dd4343137facc535dc40fde232cee5d7ada72ce572a08716`.
Its independent encoding was checked with Node big-endian Buffer writes and
SHA-256. This is a shape-only test vector, **not** an admitted editor profile:
heading rank and ordered-list properties are intentionally absent.

In versions 4 and 5, immediately after **every** element's `0x35` entity-ID field,
insert `0x52` plus a Boolean indicating whether it has an integer contract.
When true, append `0x53` plus the qualified property name, `0x54` plus the
inclusive minimum as a signed big-endian `i64`, and `0x55` plus the inclusive
maximum as a signed big-endian `i64`. Version 4 defines this contract as exactly
one required integer and no other properties; it does not imply defaults or
coercion. Bounds must be JavaScript-safe and ordered, and the existing `0x34`
property permission must be true. Child and inline-format encoding is otherwise
unchanged. Version 1–3 elements receive **no** `0x52` marker.

Version 5 additionally appends `0x56` and a Boolean immediately after `0x55` for
each present integer contract. False retains ordinary inclusive-range semantics.
True requires a positive minimum and, for a nonempty child sequence, checked
`value + child_count - 1 <= maximum`. Empty-child rejection remains the grammar's
responsibility. Arithmetic never wraps, saturates or defaults numbering. Version
4 receives no `0x56` field. All other encoding rules remain unchanged.

The flat-list fixture `example/flat-list-test@1`, including its required string
Link format, has a 798-byte input and independently cross-checked digest
`sha256:9399b646002ba442c8af3d8e8a6fd7bb6e6eb599943691a9591c62d35bcddd95`.

The separate `example/structural-properties-test@1` fixture has a 798-byte
canonical encoding and fingerprint
`sha256:cbd1ac563a51c1f924f525c049e6e0967f0d61a788c6437c062bbd3926bf589c`,
independently checked with Node big-endian Buffer writes and SHA-256. It adds
required `breditor/level` (`1..=6`) and `breditor/start` (`1..=2147483647`) to the
heading and ordered-list fixtures. These are internal test fixtures, not
production schema selectors. A future richer element contract needs its own
explicitly encoded semantics rather than reinterpretation of these bytes.

Each inline-format entry contains, in order:

1. `0x41`: entry marker with no payload.
2. `0x42`: qualified inline-format kind.
3. `0x43`: nonzero persisted type revision as a big-endian `u32`.
4. `0x44`: whether a typed property contract is present.

For compiler-contract version 2, an inline-format entry whose `0x44` value is
`1` continues with:

1. `0x45`: property-contract grammar version as a big-endian `u32` (`1`).
2. `0x46`: property declaration count as a big-endian `u32`.
3. One or more property entries, exactly matching the declared nonempty count
   and sorted by qualified property-name bytes.

Each property entry contains, in order:

1. `0x47`: entry marker with no payload.
2. `0x48`: qualified property name.
3. `0x49`: one-byte presence (`0` required, `1` optional).
4. `0x4a`: one-byte scalar type (`0` Boolean, `1` integer, `2` string).
5. For integer, `0x4b` optional inclusive minimum and `0x4c` optional inclusive
   maximum. Each optional signed `i64` is one presence byte followed, when
   present, by eight big-endian two's-complement bytes.
6. For string, `0x4d` inclusive minimum UTF-8 bytes and `0x4e` inclusive
   maximum UTF-8 bytes, each as a big-endian `u32`.

A qualified name is its canonical UTF-8 byte length as a big-endian `u32`,
followed by those bytes. A Boolean is exactly one byte: `0` or `1`. An optional
`u32` or `i64` is one presence byte (`0` or `1`), followed by the big-endian
value only when present. Counts and lengths never use platform-sized integers. No Serde,
Rust `Debug`, map iteration order, allocation identity, or host endianness is
part of the encoding.

## Included and excluded meaning

The digest includes every compiled input that changes the accepted canonical
document language: schema selector, compiler and value-model contract versions,
role assignments, registered element and format kinds, their persisted type
revisions, typed property names/presence/scalar domains, element
property/entity capability, child grammar, and global canonicality constraints.

The digest deliberately excludes extension owner and extension version,
toggle action IDs, intent IDs, binding IDs, action-state IDs, all other action
and routing declarations, process-local profile generation, labels, icons, CSS,
toolbar placement, package paths and versions, process data, clocks, and
randomness. Host resource policy is also excluded: `DocumentLimits`, JSON byte ceilings,
transaction-operation ceilings, and similar memory or work budgets can reject
content on one host, but do not define a different content language.

Host policy is still part of runtime proof reuse. A value can take a validated
fast path only when its private compiled proof and relevant validation policy
match exactly. An independently created compiled-schema instance can have the
same durable fingerprint while owning a different process-local proof; an
explicit state construction boundary must fully validate before rebinding it.
A different fingerprint fails closed and is never silently admitted or
migrated.

For a sealed base-text profile, each contributed qualified format kind and its
nonzero persisted type revision enter the sorted inline-format projection.
Changing only manifest order, the owning `ExtensionId`, or its
`ExtensionVersion` therefore preserves the fingerprint. Changing the caller-
owned profile `SchemaId`, a format kind, or its persisted revision changes the
fingerprint. `breditor/base@1` is never used as an extension profile selector;
it remains the locked strong-only vector below.

At `0.3.0-alpha.1`, changing a typed property name, required/optional presence,
scalar type, inclusive integer bound, or inclusive string-byte bound changes
the fingerprint. Contract declarations are sorted, so caller declaration order
does not. Explicit JavaScript-safe global integer endpoints canonicalize to
absent bounds and therefore do not create a second digest for the same domain.

Likewise, adding, removing, or renaming only an alpha.4 toggle bundle while
leaving the admitted schema projection unchanged preserves the fingerprint.
It produces a different compiled semantic profile and fresh process-local
generation, not a different durable content language.

## Locked base vector

The canonical `breditor/base@1` input is exactly 282 bytes and hashes to:

```text
sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173
```

This vector is locked by Rust tests. Changing it requires an intentional review
of content meaning or the versioned compiler contract. It must not drift because
of registration order, refactoring, dependency updates, or host policy.

## Locked typed-property vector

The compiler-contract version-2 fixture for `example/link-profile@1` adds
`example/link@1` with required string property `example/href`, inclusive UTF-8
byte bounds `1..=2048`. Its canonical input is exactly 356 bytes and hashes to:

```text
sha256:3903989dedf6015c4f81b16fdaaddafb4a7a100f1b7f61bfacef694b5141c9ef
```

Both bytes and digest are locked by Rust tests. This vector defines Breditor's
own contract; it does not encode another editor's mark or schema protocol.

## Security and compatibility limits

SHA-256 makes accidental or adversarial identity collision impractical, but it
does not authenticate who supplied a schema or whether code is trustworthy.
The parser rejects uppercase, whitespace, other prefixes, non-hex bytes, and
short or long text without retaining the supplied payload in its typed error.
`DocumentJsonCodecV2` is the explicit fingerprint-bearing document generation;
it never widens the existing V1 codec or silently migrates content. The other
Rust-core durable families likewise use separate V2 codec types with
generation-locked nesting, as specified by the
[durable schema binding contract](DURABLE_SCHEMA_BINDING.md). Legacy V1 records
remain byte-for-byte unchanged and bound to the exact built-in base definition.
Wasm ABI 3 historically exposed explicit property-free profile factories that
consume and emit V2. ABI 4 preserves those factories and adds explicit Profile
Bootstrap V2, whose descriptor exposes the exact sorted property contracts
already committed to compiler-contract fingerprint version 2. The explicit V3
engine factories consume Document V2 and emit Session/State/Commit V3; those
outer generations do not add fingerprint inputs. The browser's alpha.3 mode
validates the same selector, digest, format revisions, property names,
presence/types/bounds, and projected values before restore, export, or autosave.
Legacy built-in Wasm factories and unprofiled browser persistence remain V1;
Bootstrap V1 remains profile-aware V2. Every V1 record stays exact-
`breditor/base@1`-only, and the runtime profile generation never enters this
digest or any wire record. Set action/intent IDs, Bootstrap envelope bytes,
renderer recipes, toolbar declarations, and property values remain excluded
from the fingerprint except insofar as the compiled property contract itself
defines the admitted document language.
