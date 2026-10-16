# Native structural V2 replay compatibility

This fixture captures real model 12/journal 13 state with an older implementation
and verifies byte-exact recovery and 16 subsequent history/edit states with a
newer one. It exercises ordinary list preparation in a V2 document, offline text,
independent code kind/language, task completion, and future Undo/Redo.

Run from the repository root. Rust and cached dependencies are required. The
first native V2 implementation is `8ac39ed039655885164d8dc59ab8b90d6e366a81`.
The fixture itself uses only APIs available at that checkpoint.

```sh
mkdir -p target/shared-structural-v2-actions-qualification
task_snapshot=$(mktemp -d "$PWD/target/shared-v2-native-before-XXXXXX")
git archive 8ac39ed039655885164d8dc59ab8b90d6e366a81 Cargo.toml crates/breditor-core crates/breditor-wasm/Cargo.toml crates/breditor-wasm/src crates/breditor-collaboration | tar -x -C "$task_snapshot"
mkdir -p "$task_snapshot/scripts/fixtures"
cp -R scripts/fixtures/shared-structural-v2-compat "$task_snapshot/scripts/fixtures/"
CARGO_TARGET_DIR="$PWD/target/shared-v2-native-compat-before" cargo run --offline --manifest-path "$task_snapshot/scripts/fixtures/shared-structural-v2-compat/Cargo.toml" -- capture "$PWD/target/shared-structural-v2-actions-qualification/native-v2-before.json"
CARGO_TARGET_DIR="$PWD/target/shared-v2-native-compat-current" cargo run --offline --manifest-path scripts/fixtures/shared-structural-v2-compat/Cargo.toml -- verify "$PWD/target/shared-structural-v2-actions-qualification/native-v2-before.json"
```

Keep both target directories separate from each other and from canonical tests,
Clippy and Wasm builds. The collaboration crate produces an unhashed
`libbreditor_collaboration.rlib` alongside its dynamic artifact. Sharing an output
directory across these independent workspace graphs produced incompatible cached
core type identities during qualification. Dedicated outputs prevent that harness
collision; do not change library APIs or weaken the conformance assertions to
make the mixed-cache build pass.

The snapshot and capture are retained test artifacts. Nothing is published or
deployed. This compatibility fixture is not proof of the full command family,
browser support or a repair for an unexplained replay failure.
