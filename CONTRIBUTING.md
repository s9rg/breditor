# Contributing to Breditor

The Rust core treats names, module boundaries, and documentation as part of the
correctness contract.

## Action and operation files

Every semantic action must live in its own lower-snake-case source file under
`src/action/`. Every primitive operation must do the same under `src/operation/`.
For example, `InsertText` belongs in `action/insert_text.rs`, while `TextSplice`
belongs in `operation/text_splice.rs`.

`mod.rs` files may declare modules, define a closed routing enum, and curate
re-exports. They must not contain action or operation behavior. Avoid catch-all
files such as `types.rs`, `utils.rs`, `helpers.rs`, or `misc.rs`.

Each action file must document:

1. its stable namespaced action ID and version;
2. payload validation and structural preconditions;
3. the standard operations it plans;
4. selection and pending-format behavior;
5. expected undo-history boundaries;
6. stale-input and replay behavior;
7. structured failure diagnostics;
8. laws and representative examples.

Actions plan standard operations. They never edit the tree directly, perform
I/O, inspect the DOM, read time or randomness, or recursively dispatch another
action. No action modules are scaffolded until the operation contract exists;
empty architecture stubs would make this policy harder to audit, not easier.

## Core rules

- Runtime document values have private fields and expose no mutable node access.
- Untrusted data enters through strict versioned records and complete validation.
- IDs, time, and randomness are caller-supplied inputs to deterministic work.
- A malformed document, point, or future operation returns a typed error; it must
  not panic or partially mutate state.
- New dependencies require a concrete core need and a license review.
