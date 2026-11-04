# Finished-transaction memory in the Node test backend

Breditor's test-only `fake-indexeddb` dependency is pinned to 6.2.6. Version
6.2.5 retained finished transactions in its internal database transaction list.
Those transactions could retain callbacks, obsolete results and rollback data.
The upstream repair removes finished transactions after the required event
ordering, for both commit and abort. See the
[upstream fix](https://github.com/dumbmatter/fakeIndexedDB/pull/171) and
[6.2.6 release](https://github.com/dumbmatter/fakeIndexedDB/releases/tag/v6.2.6).

This dependency runs the Node storage tests. It is not Breditor's browser
IndexedDB implementation or part of the shipped editor runtime.

## Reproduction

The same small fixture performs 96 transactions against one current row. Every
commit result or rollback is checked through a public IndexedDB read. It then
drains asynchronous completion and explicitly collects garbage in a separate
Node process limited to a 128 MiB JavaScript heap. Retained obsolete data must
stay below 4 MiB.

On 6.2.5, the commit sequence retained 38,490,104 bytes and the abort sequence
retained 25,919,928 bytes. Both failed. The unchanged fixture on 6.2.6 retained
398,968 and 276,032 bytes respectively; both passed. The independently installed
consumer produced the same passing measurements. These figures describe this
controlled Node fixture, rather than a browser memory guarantee.

```sh
node --test scripts/indexeddb-finished-transaction-memory.test.mjs
```

The wrapper enables explicit garbage collection only for its two short child
probes. It does not change the SDK, application heap, native test limits, stored
data, callback ordering or ordinary test behavior. The fixture supports an
optional module URL for reproducing the old dependency in a separate directory.

The package manifest, registry lock and independent-consumer pins move together.
The exact registry integrity for 6.2.6 is retained with the qualification, along
with both dependency archives, original failures and passing source/installed
logs. No dependency implementation is monkey-patched.

## Scope

One earlier complete cold workflow exhausted Node's approximately 4 GiB default
JavaScript heap. That failure exposed the need to inspect the test backend; the
short fixture directly proves the retained-transaction leak. Older full runs on
6.2.5 were explicitly canceled when replaced and are recorded as canceled.
Their completed generic metadata source30/installed30 checks remain separate
evidence from the new complete workflow runs.

The isolated source focused workset passes all 42 cases. Its separate Native
compatibility workset passes all 22 cases (twelve joint-intent store laws and
ten original protocol profiles). The independently installed focused workset
passes five cases, including both memory cases and all three registry-lock
laws. Strict private declarations pass. Complete joint-owner qualification
continues separately. This checkpoint makes no full-workflow readiness claim.

The editor's Rust core, normal Wasm, public SDK exports, document formats and
wire protocols do not change for this dependency repair. Physical storage,
large-document resource limits, the historical archive short-read investigation
and the historical intermittent WebKit fault remain separate qualification.
