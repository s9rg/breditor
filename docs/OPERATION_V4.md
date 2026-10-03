# Experimental operation V4

Status: singular Rust operation codec, behind `experimental-structural-properties`.
Not enabled in the shipped Wasm package. A separate experimental
[transaction V4 codec](TRANSACTION_V4.md) now groups these payloads with snapshot,
selection and metadata contracts. A separate [session checkpoint V4](SESSION_CHECKPOINT_V4.md)
preserves complete retained undo/redo history. Commit, local-log and browser
heading support remain pending.

## Version and binding

`OperationJsonCodecV4` accepts only `breditor/operation`, `formatVersion: 4`.
Every envelope carries the existing exact schema selector and complete schema
fingerprint. Selector admission precedes fingerprint admission; both precede
owned operation reconstruction. Equal schema names alone do not authorize
structural operations. The compiler must grant the text-block capability.

The four paragraph-operation payloads retain their V3 byte shapes, but require
the new outer version when used with this codec. V4 does not auto-upgrade V1–V3
inputs, and old codecs reject V4. The new payload generation is internal V3;
the public **envelope** is V4. No prior tagged union is expanded.

## Heading-change payload

The exact fields are `kind`, `start`, `expected`, and `replacement`:

```json
{
  "kind": "textBlockKindChange",
  "start": 0,
  "expected": {
    "kind": "element",
    "type": "breditor/document",
    "entityId": null,
    "properties": {},
    "children": [
      {
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": null,
        "properties": {},
        "children": []
      }
    ]
  },
  "replacement": [{ "kind": "heading", "level": 2 }]
}
```

This example is the payload, not a complete envelope. The codec supplies the
outer version and schema binding.

`start` is an exact nonnegative JSON integer fitting `u32`; adding the nonempty
guard count must not overflow and must fit the context's root-child budget.
`expected` uses the existing document-node language under a synthetic root,
whose children are **only the selected source blocks**. It is not a snapshot
of the entire document. Their kinds, rank properties, text, inline formats and
typed properties are complete optimistic guards. A changed unselected sibling
does not invalidate this primitive; a changed selected block does.

There is exactly one replacement per source block, in the same order:

- `{ "kind": "paragraph" }`, with no level field, including no null level.
- `{ "kind": "heading", "level": 1 }`, with a required exact integer 1–6.

Unknown fields/kinds, duplicate fields, fractions, exponent notation for integer
fields, strings, Booleans and null are rejected. There is no default rank,
coercion, flattening, missing-field repair or list payload.

## Admission and resource limits

The outer UTF-8 byte limit applies before parsing. The source guard reuses the
document preflight and checked tree construction, including property ordering,
duplicate detection, canonical runs, node/depth/text/property limits and exact
schema validation. Replacement records stay borrowed until their known fields
are checked; their array is bounded by the validated source count, not by its
JSON size hint. Even an excess array item is rejected before owned target
reconstruction. Missing and null rank remain distinct.

Static operation validation proves both the source fragment and its derived
replacement fragment. Decode **does not** prove applicability to a live document,
or account for unselected retained content. Transaction application still checks
the source guards and validates the entire resulting document before publishing.
A late failure preserves the document, revision and both history branches.

Encoding validates the operation and uses the canonical node serializer for its
source guard. Guard text/property data are borrowed, not copied into an owned
record tree. A counting pass enforces the same JSON budget used by decode before
allocating the output string. The synthetic root and its child references have
bounded allocation. The byte counter and full-document validation are not a
claim of incremental or zero-allocation editing.

## Replay and remaining work

A V4 record can be decoded under an independently constructed, identically bound
context and applied to a separately decoded document. Runtime-derived inverse
operations can themselves round-trip through V4 and restore exact source kinds,
text and typed formatting. Selection and pending formats are not serialized in
this singular primitive; they remain transaction/session concerns. Existing
runtime undo/redo behavior is unchanged.

V1–V3 transaction, commit and session codecs still reject heading operations on
either history branch. Do not save only the document and call that preserved
heading history. Transaction V4 supplies the atomic request layer; Session
Checkpoint V4 adds aggregate history/byte budgets, cursor and revision checks,
bidirectional replay proof, retained redo and exact selection/pending-format
restoration. Commit and local-log formats remain separate follow-up work.

## Reproduction

The [October 3 qualification record](qualification/2026-10-03-heading-operation-v4.json)
records 18 focused tests, 10,000 seeded cases, 1,634 Rust workspace/doc tests,
697 default-feature unit tests and all 17 release gates passing. The 165 browser
and 39 demo cases ran with zero retries; production sizes are unchanged from
the prior block-kind checkpoint.

`cargo test -p breditor-core --lib --all-features --locked operation_json_v4`
runs the dedicated codec tests. Prefix with
`PROPTEST_CASES=10000 PROPTEST_RNG_SEED=20261003` for the larger fixed-seed mixed
kind, guarded-span and inverse round-trip run. `npm run verify:release` checks
the wider Rust, Wasm, package and browser regression boundary.
