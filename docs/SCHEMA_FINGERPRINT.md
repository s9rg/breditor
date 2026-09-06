# Schema fingerprint contract

Status: implemented for the private `0.2.0-alpha.1` base-schema compiler.

`SchemaFingerprint` is the durable identity of one complete compiled content
language. It lets Breditor distinguish schemas that share a human-readable
`SchemaId` but enforce different document meaning. The public text form is
always `sha256:` followed by 64 lowercase hexadecimal digits.

The fingerprint is not an extension identity, package signature,
authorization token, provenance record, migration instruction, or
process-local validation proof. `0.2.0-alpha.1` exposes the fingerprint of the
built-in schema, but does not yet put it into a durable record or expose a
general schema compiler. Those admission and wire-format changes are staged
for `0.2.0-alpha.2`.

## Canonical byte encoding

The SHA-256 input starts with the exact ASCII/UTF-8 domain bytes
`breditor/schema-fingerprint`, followed by one zero byte. All remaining fields
appear exactly once in the order below. Every field starts with its one-byte
tag.

1. `0x01`: canonical-encoding version as a big-endian `u32` (`1`).
2. `0x02`: schema value-model version as a big-endian `u32` (`1`).
3. `0x03`: compiler-contract version as a big-endian `u32` (`1`).
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

Each inline-format entry contains, in order:

1. `0x41`: entry marker with no payload.
2. `0x42`: qualified inline-format kind.
3. `0x43`: nonzero persisted type revision as a big-endian `u32`.
4. `0x44`: whether properties are allowed.

A qualified name is its canonical UTF-8 byte length as a big-endian `u32`,
followed by those bytes. A Boolean is exactly one byte: `0` or `1`. An optional
`u32` is one presence byte (`0` or `1`), followed by the big-endian value only
when present. Counts and lengths never use platform-sized integers. No Serde,
Rust `Debug`, map iteration order, allocation identity, or host endianness is
part of the encoding.

## Included and excluded meaning

The digest includes every compiled input that changes the accepted canonical
document language: schema selector, compiler and value-model contract versions,
role assignments, registered element and format kinds, their persisted type
revisions, property/entity capability, child grammar, and global canonicality
constraints.

The digest deliberately excludes extension owner and extension version,
actions, intents, state declarations, labels, icons, CSS, toolbar placement,
package paths and versions, process data, clocks, and randomness. Host resource
policy is also excluded: `DocumentLimits`, JSON byte ceilings,
transaction-operation ceilings, and similar memory or work budgets can reject
content on one host, but do not define a different content language.

Host policy is still part of runtime proof reuse. A value can take a validated
fast path only when its private compiled proof and relevant validation policy
match exactly. An independently created compiled-schema instance can have the
same durable fingerprint while owning a different process-local proof; an
explicit state construction boundary must fully validate before rebinding it.
A different fingerprint fails closed and is never silently admitted or
migrated.

## Locked base vector

The canonical `breditor/base@1` input is exactly 282 bytes and hashes to:

```text
sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173
```

This vector is locked by Rust tests. Changing it requires an intentional review
of content meaning or the versioned compiler contract. It must not drift because
of registration order, refactoring, dependency updates, or host policy.

## Security and compatibility limits

SHA-256 makes accidental or adversarial identity collision impractical, but it
does not authenticate who supplied a schema or whether code is trustworthy.
Callers must not parse the display string as a durable record in this
checkpoint: no fingerprint-bearing wire generation exists yet. Legacy V1
records remain byte-for-byte unchanged and bound to the exact built-in base
definition.
