//! Apply the exact approved repair and retain its verified complete selection.
mod action;
mod bundle;

use super::{
    Result,
    destination::{Destination, FilePin, open_regular},
    evidence::Observation,
    read_authentication,
    request::{Mode, Request},
    selection::{PendingWrites, Selection},
};
use breditor_collab_relay::server::ServerLogGenerationRecoveryStateIdentity;
use std::{
    io::{self, Read},
    path::Path,
};

pub(crate) async fn repair(
    request: &Path,
    auth: &Path,
    evidence: &Path,
    selection_sha256: &str,
    output: &Path,
) -> Result {
    let request = Request::read(request)?;
    if request.minimum_archive.is_some() {
        return Err("repair uses the approved bundle archive as its exact selection".into());
    }
    let (auth, token) = read_authentication(auth)?;
    let bootstrap = request.bootstrap()?;
    let evidence = evidence.canonicalize()?;
    let protected = [
        &bootstrap.source_root,
        &bootstrap.checkpoint_root,
        &bootstrap.authority_root,
        &bootstrap.operational_root,
    ];
    if protected.iter().any(|root| evidence.starts_with(root) || root.starts_with(&evidence)) {
        return Err("repair evidence must be separate from the selected relay directories".into());
    }
    let destination = Destination::select(
        output,
        &[protected[0], protected[1], protected[2], protected[3], &evidence],
    )?;
    let bundle = bundle::Bundle::open(
        &evidence,
        selection_sha256,
        request.mode,
        &bootstrap.expected_current,
    )?;
    let planned_manifest = bundle.action.planned_manifest();
    if let Some(state) =
        Box::pin(bundle.action.apply(bootstrap, auth, &request.principal, &token)).await?
    {
        check_result(&bundle.selection.current, &state.identity()?, planned_manifest)?;
        Observation::Complete(state).retain(destination)?;
    } else {
        retain_tail_result(bundle.selection, &evidence, destination)?;
    }
    println!("repaired sealed room and retained complete selection");
    Ok(())
}

fn check_result(
    before: &ServerLogGenerationRecoveryStateIdentity,
    after: &ServerLogGenerationRecoveryStateIdentity,
    planned_manifest: Option<[u8; 32]>,
) -> Result {
    let exact = if let Some(manifest) = planned_manifest {
        after.origin == before.origin
            && after.server.native.source == before.server.native.source
            && after.server.native.manifest == manifest
            && after.server.assets == before.server.assets
            && after.participants.source == after.server.native
    } else {
        before == after
    };
    if !exact {
        return Err("repair returned a different complete selection".into());
    }
    Ok(())
}

fn retain_tail_result(
    mut selection: Selection,
    evidence: &Path,
    destination: Destination,
) -> Result {
    // The tail API checks and synchronizes this exact complete cut under held custody.
    // Copying its checked files avoids a second reopen that could observe a newer cut.
    let output = destination.create()?;
    for (pin, name) in
        [(&selection.archive, "room.backup"), (&selection.participants, "participants.json")]
    {
        let FilePin { bytes, sha256, .. } = *pin;
        output.write(name, bytes, sha256, |file| {
            io::copy(&mut open_regular(&evidence.join(name))?.take(bytes + 1), file)?;
            Ok(())
        })?;
    }
    selection.mode = Mode::Complete;
    selection.pending = PendingWrites::default();
    output.finish(&serde_json::to_vec(&selection)?)
}
