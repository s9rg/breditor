//! Cold relay inspection command. Credentials arrive over stdin and never enter the evidence.
mod destination;
mod evidence;
mod request;

use breditor_collab_relay::{
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    server::{Authentication, SealedNativeRestartBootstrap},
};
use destination::Destination;
use evidence::Observation;
use request::{Request, read_regular};
use std::{
    io,
    path::{Path, PathBuf},
};

type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

pub(super) async fn run(request: &Path, auth: &Path, output: &Path) -> Result {
    let request = Request::read(request)?;
    let auth = read_regular(auth, 256 * 1024)?;
    let auth = Authentication::from_json(std::str::from_utf8(&auth)?)
        .map_err(|_| "invalid relay authentication configuration")?;
    let token = request::read_token(io::stdin().lock())?;
    let bootstrap = request.bootstrap()?;
    let protected = [
        &bootstrap.source_root,
        &bootstrap.checkpoint_root,
        &bootstrap.authority_root,
        &bootstrap.operational_root,
    ];
    let destination = Destination::select(output, &protected)?;
    let floor = load_floor(request.minimum_archive.as_deref(), &bootstrap, &protected)?;
    let observation = Box::pin(Observation::capture(
        request.mode,
        bootstrap,
        floor,
        auth,
        &request.principal,
        &token,
    ))
    .await?;
    observation.retain(destination)?;
    println!("retained sealed room inspection");
    Ok(())
}

fn load_floor(
    path: Option<&Path>,
    bootstrap: &SealedNativeRestartBootstrap,
    protected: &[&PathBuf],
) -> Result<Option<ServerLogGenerationRoomBackup>> {
    let Some(path) = path else {
        if &bootstrap.expected_current != bootstrap.expected_checkpoint.current() {
            return Err("later inspection floor requires its exact retained archive".into());
        }
        return Ok(None);
    };
    let canonical = path.canonicalize()?;
    if protected.iter().any(|root| canonical.starts_with(root)) {
        return Err(
            "minimum archive must be retained outside the selected relay directories".into()
        );
    }
    let bytes =
        read_regular(path, breditor_collab_relay::MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES)?;
    let expected: &ServerLogGenerationRoomBackupIdentity = &bootstrap.expected_current.server;
    let archive = ServerLogGenerationRoomBackup::from_owned_bytes(bytes)?;
    if &archive.info()?.identity != expected {
        return Err("minimum archive differs from the retained inspection floor".into());
    }
    Ok(Some(archive))
}
