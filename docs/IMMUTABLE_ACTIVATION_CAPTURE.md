# Immutable decoded activation captures

A cold intent read could not be encoded again for a separately selected Native
restart association. The decoder rebuilt immutable tagged values, then passed
its root through `fields()`. That helper produces a new closed projection whose
properties are non-writable but whose object is still extensible. The encoder
correctly requires an immutable capture, so it refused this decoded root before
creating the new association descriptor.

The decoder now freezes that detached root. Nested values were already frozen.
No encoder check is relaxed; no stored graph, payload, identity, wire format,
default, limit, source journal, package version or Native control is changed.
The result remains inert DATA and grants no actor, storage or serving authority.

The new regression fails against the previous decoder in 649 ms. It checks
literal marker-shaped arrays, `undefined`, negative zero, Unicode, `__proto__`
data and different Blob MIME types, then requires exact encode/decode/re-encode
bytes and pins. It also encodes the decoded capture under an explicitly new
control instance/namespace. An existing durable cold-store test now verifies
that its returned capture supports the same exact graph re-encoding.

The intent suite passes all 12 cases. Both checked-in activation-retention
commands pass the complete 15-case workset, with strict private types and 2,879
matching independently installed distribution files. Fresh TypeScript output
matches all three producer packages exactly. The broader SDK activation plan
now expects 47 cases because this regression is included; that full Native plan
was not rerun for this component repair.

The complete retained Native capture from the failed committed-restart case
also reproduces the unfrozen-root refusal directly. After the fix, its 13 objects
and 15,927,052 total bytes re-encode with identical graph and object identities
under the actual reopened Native selection. This is a DATA-only reproduction,
not a fresh authenticated commit or a complete client restart qualification.

The original committed-restart run had restored fourteen actors and seven
private targets before failing ahead of its planned interrupted-write test.
Its assertion hid the earlier error. The isolated workflow now rethrows an
unexpected earlier refusal whenever the intended write was never reached.
Corrected committed and pending/repeated workflows run separately on frozen
source; the full client owner remains isolated until those and its independent
installation complete.

An earlier source retention run had one unexpected archive-integrity refusal
in an existing occupied-data test. Its logs are retained. Ten subsequent bounded
diagnostic runs each passed all 15 checks, and the final independent installation
passes, but these do not identify or repair that intermittent failure. Unexpected
refusals now print the finite archive read diagnostics when available. The
historical archive-read and WebKit faults remain open.

Run `node scripts/check-activation-retention-source.mjs` and
`node scripts/check-activation-retention-installed.mjs` for the source and
independently packed/offline-installed component checks. They use the explicitly
retained `target/activation-retainer-actual-input` fixture; the fixture's immutable
index and object pins are checked before use.

[The qualification record](qualification/2026-11-04-immutable-activation-capture.json)
identifies the exact executed source, original failures, actual Native capture,
installed archives and logs. Its local immutable proof index is
`d06520c8f3ddcd8d0e56b2225f23aa05a71e4d19e335d85b0ed962a72ea6c18b`:
123 references, 109 deduplicated/read-back-verified objects, 34,880,843 compressed
bytes, and a complete 8,311-file source archive whose contents were checked.
All thirteen V1 gates remain open.

Main integration separately passes the complete 15-case source and installed
worksets, exact generated output and the same actual 13-object Native DATA
replay. All five integrated code/test/plan files match the isolated qualification.
The default Wasm and protected Native fixtures retain their original hashes.
