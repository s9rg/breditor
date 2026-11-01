# Current native publication scalars

Repeated currentness checks must preserve the actual native lifetime without
materializing the complete public editor view on every call. The private scalar
reader returns the current document revision and read-only flag from the exact
SDK-owned native publication. It grants no editing, recovery, authentication,
receipt or room-activation authority.

The facade lazily derives one frozen scalar pair from its own view string. A
changed publication invalidates it synchronously before subscriber callbacks.
Each private read still checks the actual live native owner. Disposal refuses;
readable retirement retains the same meaning as before. Public `view()` continues
to return a fresh independent full view. Full origin/checkpoint/lineage admission,
managed bindings, cancellation and host-authority checks remain in place.

Four held-origin/portable-replay sentinels use this scalar read alongside their
existing native document/comment stamps and archive identity checks. Managed
retained revisions and the facade's stale-publication/read-only fences use the
same constructor-owned scalars. There is no serialized protocol or default-policy
change, Rust change, Wasm rebuild or package version change.

## Reproduction and verification

A ten-second live SDK CPU sample attributed roughly 1.97 seconds to public view
parsing and 0.69 seconds to retained-revision parsing. Currentness traversal as a
whole accounted for roughly 6.9 seconds; these overlapping sample categories are
not additive. The unchanged 8,342,751-byte archive separately read-admitted seven
participants in about 319 ms with 901 authority checks under controlled Node
raster presentation. This isolates one source of avoidable guard work; it is not
an end-to-end recovery benchmark.

Against the preceding implementation, all eight original/segmented local and
delivery origin cases reproduce 1,000 view parses for 1,000 held-current checks.
The repaired implementation performs no full-view parses on those repeated reads.
Portable replay checks also perform no repeated full-view parses and reject a
real transition out of read-only state. Disposal, host revocation, out-of-band
native mutation and original full admission retain their existing refusal laws.

Run the fixed complete matrix with:

```sh
node scripts/check-publication-state-sdk.mjs
node scripts/check-publication-state-installed.mjs
```

Each runs the same 150 checks and strict public type compilation. The installed
run packs fresh offline archives, verifies registry lock identities and reversible
module-location-only test rewrites, rejects workspace links, and compares all
2,743 compiled SDK files with the producer. Both full and functional candidate
plans require these qualifications. The qualification record is
[2026-11-01-native-publication-state.json](qualification/2026-11-01-native-publication-state.json).

## Remaining work

The earlier combined client/server cold-recovery timeout remains unresolved.
The sampled diagnostic attempt subsequently hit a debugger-cleanup dynamic-import
error and was intentionally terminated after collecting the profile; it is
explicitly not a functional pass. The temporary debugger was closed. Fresh
end-to-end recovery, complete provider/client custody, authenticated whole-room
activation and full release profiles still need qualification. All thirteen
V1/parity gates remain open.
