# Native owner lifetime

An exact native Rust object transfers to one shared editor in one SDK module
instance. Transfer is reserved before constructor option or native callbacks run,
not after a successful first observation. Successful and failed construction both
consume that transfer permanently. Disposing the editor cannot make the object
transferable again. This is an in-memory lifetime rule, not a stored permission,
cross-module authority or a replacement for native checkpoint validation.

Read-only initialization temporarily reserves an unclaimed object while its
synchronous native policy callback runs. Reentrant initialization, constructor
adoption and factory cleanup cannot consume it during that scope. The reservation
is released on success or failure; the caller still owns an untransferred result.
No live policy setter or checkpoint rewrite substitutes for initial policy.

Factory failure cleanup frees only an unclaimed result. It marks that result
consumed before calling its free callback, preventing reentrant or repeated
release. If a factory returns an object already transferred elsewhere, refusal
must not initialize, edit or free the other editor's object. A genuine owning
editor still releases its own object through its normal disposal/failure path.

An asynchronous source-open scope retains its raw result through policy and
option preparation until constructor transfer. If preparation fails, the raw
object is still available for cleanup. If construction already consumed it, the
same cleanup is a no-op. Database and writer-lease release is in a separate
finally scope so a native cleanup error cannot strand those owners.

The original reusable-factory regression destroyed an unrelated live editor on
refusal. A second actual regression leaked a fresh result when late editor-option
preparation threw. Both have retained failing runs and unchanged passing
assertions. The focused suite has 32 laws, repeated in a fresh offline installed
consumer with reversible module/fixture locations only. It includes all ten
existing session families, cold restore, actual pending-factory IndexedDB version
changes and lineage read failure. Synthetic storage/locks do not qualify physical
durability, browsers, arbitrary host wrappers or separately bundled SDK copies.

The private helpers are not public API or authority grants. Document/review
protocols, checkpoint bytes, default policies and normal Rust/Wasm remain
unchanged. Complete portable operation restore, whole-room reconciliation and
authenticated activation are separate architectural work. No V1 gate is closed
by this lifetime repair.

The [selected functional qualification](qualification/2026-10-22-native-owner-lifetime.json)
records 32 passing checks, all five 640-case matrices in source and installed
packages, seven matching installed archive reports and both retained
failing/repaired assertions. An initial stale native-fixture refusal is retained;
fixtures were regenerated and every selected fast stage rerun against unchanged
source. Bounded storage admission and complete portable writable restore remain
separate work.
