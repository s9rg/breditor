# Cancellable retention of an activation choice

Before creating a durable activation intent, the SDK asks a host to retain the
independent immutable choice. That callback receives inert DATA. It supplies no
source, actor, approval, native requester or resource borrower.

A reproduced deadlock occurs when the retention callback awaits owner shutdown
and shutdown waits for the preparation containing that callback. The new private
`retainActivationChoice` action observes the supplied owner lifetime and ends only
this DATA-hook wait on cancellation. Both late outcomes remain observed. No intent
is written after cancellation. A successful hook still finishes before absent-only
creation and does not bypass a fresh source or Native check.

Commit approval also receives the immutable choice. If the owner closes
while approval is pending, the commit releases the intent with its phase
still `prepared`. A late approval cannot start the request. A later commit
can reopen the intent and must inspect the current recovery state before
and after its own approval. The commit checks custody of the retained intent
throughout these steps. Revocation during approval reports intent closure before
the second inspection or recording a request attempt.

HTTP operations, transactions, resource borrowers and unknown Native outcomes
retain their existing ownership and draining rules. This change does not detach
those operations. Provisioning hooks and full joint-owner cancellation require
separate qualification.

The mandatory commands are `node scripts/check-activation-retention-source.mjs`
and `node scripts/check-activation-retention-installed.mjs`. Each runs five
callback lifetime and ordering cases using a retained actual Native-intent corpus
and twelve intent encoding and storage cases, with normal Rust hashing and
controlled browser storage/locks. The corpus is independently copied into the
consumer and grants no runtime authority. Rust, normal Wasm, original formats,
wire meanings, public root exports and package versions remain unchanged.

The original source and installed runs passed three retention cases and all eleven
existing intent laws. Strict private declarations pass, with all 2,829 installed
distribution files matching and no workspace links. The exact executed source,
package archives, complete actual corpus and unchanged original failure are
retained in the local read-back-verified compressed proof referenced by
`qualification/2026-11-03-activation-choice-retention.json`.

The executed source hash is
`9724352b1a36d0fba4e10e25e16bd6cdeb9fcc598c96e31ae729a70be2d81154`;
subsequent qualification documentation is outside that test snapshot. Actual
Native requests, service publication, complete joint-owner callback cancellation
and host provisioning lifetime are not qualified by these DATA tests.
