# Run the Breditor pilot

The first-party pilot is a release handoff workspace built with the installed
Breditor SDK and the native relay. Two participants edit the same document in
separate browser profiles or private sessions. The workspace has a mixed-content
handoff document, writer-local history, peer presence, local save state, server
acknowledgments, and image uploads.

## Prepare the workspace

Start from the candidate checkout you want to try. The SDK setup uses the
repository's pinned Node, Rust, and wasm-bindgen toolchain.

```sh
npm ci
node scripts/prepare-candidate-npm-cache.mjs
npm run build --workspace @breditor/browser
node scripts/check-editor-package.mjs

mkdir -p target/collaboration-feasibility-web
cargo run --manifest-path experiments/collaboration/Cargo.toml --locked --example export_vector -- \
  "$PWD/target/collaboration-feasibility-web/native-vector.json"
cargo build --manifest-path experiments/relay/Cargo.toml --locked --features server \
  --target-dir target/relay-native --example network_demo
cargo run --manifest-path experiments/relay/Cargo.toml --locked \
  --target-dir target/relay-native --example raster_fixtures -- "$PWD/target/relay-raster-fixtures.json"

npm run demo:pilot
```

The operator opens `http://127.0.0.1:49783/pilot`. The relay listens on
`127.0.0.1:49784`. The launcher writes separate Alice and Bob participant codes
to the private `target/pilot-model11-journal12-v1/accounts.json`. Send each
participant only their own code through the team's private channel. The browser
needs the code again after a reload. It retains the writer, journal, and a
one-way check for the code on that browser profile.
Close a participant's editor before opening the same participant in another
tab in that profile. The second tab reopens the same writer and history.
New journals, image bytes and upload state belong to the current pilot relay,
participant and code. An older saved writer can still open its legacy journal
when one saved workspace owns that journal identity. If several workspaces
share the legacy journal identity, keep the browser data and consult the
pilot operator before continuing. A writer who reopens an older journal can
choose **Recover legacy images** to copy missing image bytes named in that
writer's native history into the active pilot as pending uploads. The older
image store stays intact. Use **Upload or retry pending images** to send the
recovered images to the current pilot.

On the same workstation, use independent browser profiles. On separate
workstations, keep both services bound to loopback and forward both ports
through an authenticated private path. For example, participants with approved
SSH access to the host can use the same loopback URLs through these forwards:

```sh
ssh -N -L 49783:127.0.0.1:49783 -L 49784:127.0.0.1:49784 user@private-pilot-host
```

The pilot uses test documents and accounts. Retain the private relay state
directory and each participant's browser profile throughout the run. Keep
checkpoint downloads private because they include Undo history.
The launcher checks that its five JSON state files are regular files and have
owner-only permissions on POSIX systems. Keep the generated files in the
private pilot directory.

On narrow screens, wide tables have their own scrolling region and labeled
scroll buttons. The skip link takes keyboard focus to the pilot workspace.
On touch screens, the pilot's sign-in and session controls have tap targets
that are at least 44 by 44 CSS pixels.

## Exercise the handoff

1. Give each participant a part of the handoff to own. Exercise ordinary writing
   and formatting, table changes, and an image from each participant.
2. Pause one writer with **Go offline** while the other continues editing. Have
   the paused writer make an edit and use **Save and reload**. Re-enter that
   writer's code and check that their local content and paused state survived.
   The tab remembers this choice for the current pilot relay and participant.
   An older pause setting identified only the participant. The first saved
   writer opened after upgrade adopts that setting once.
3. Use **Reconnect** and **Upload or retry pending images** as needed. Compare
   the rendered document and image statuses in both profiles. Exercise Undo and
   Redo on each writer and confirm the other participant's work survives.
4. Choose **Download checkpoint** and record the displayed SHA-256. Select
   the file under **Rehearse checkpoint recovery** while that writer is offline.
   Compare the digest, recovered text, and Undo/Redo counts. This rehearses
   the document checkpoint in a temporary read-only owner. The recovered view
   preserves document structure, including table headers and cell order. Image
   bytes and relay state use their separate backup contracts.
5. Repeat an edit during a real relay restart. Start the launcher again on
   the same host and keep the same browser profiles. Record reconnect behavior
   and any pending edits or uploads as the participant sees them.

If the local journal is retired by a browser storage upgrade or the local save
for **Save and reload** fails, the workspace stays visible with **Download
checkpoint** available. Editing, reconnect, and upload controls are disabled.
Focus moves to the checkpoint action when sign-in opens a retired writer, the
focused save action fails, or retirement disables the focused control. The
separate recovery picker stays focused if it was already in use.
If storage changes while opening a saved writer, the pilot stops the initial
relay connection and opens the same checkpoint recovery controls.

Record the tested source commit, installed archive hashes from
`target/editor-installed-consumer.json`, browser versions, workflow, incidents,
data integrity observations, and the document, history, and image sizes
actually exercised. **Download session report** collects observations from this
participant's browser tab and its reloads for the current pilot, including
action counts, browser identification, and the last downloaded and verified
checkpoint hashes. The report identifies the verified SDK archives, the pilot
relay executable, and the frontend bytes buffered by the host. A candidate
change starts a fresh observation record. The report omits local paths,
participant codes, and checkpoint bytes. Include each participant's
observations and recorded incidents. The automated
two-context rehearsal is a repeatable check of this app. The pilot gate records
the sustained participant run and its observed operating limits.
