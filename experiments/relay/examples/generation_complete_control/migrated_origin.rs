//! Use a genuine original WAL and raster store as the oldest selectable generation cut.
use super::{Result, source};
use breditor_collab_relay::{
    Role, Room, RoomRecoveryPolicy, ServerLogGenerationOptions, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomRecovery, ServerRoomBackup, ServerRoomBackupIdentity,
    assets::AssetStore,
};
use std::{fs, path::Path};

pub struct LegacyInputs {
    pub archive: Vec<u8>,
    pub wal: Vec<u8>,
    pub selection: ServerRoomBackupIdentity,
}
pub struct Cuts {
    pub older: ServerLogGenerationRoomBackup,
    pub local: ServerLogGenerationRoomBackup,
    pub legacy: Option<LegacyInputs>,
}

pub fn create(directory: &Path, spec: source::Spec, asset: Option<&str>) -> Result<source::Source> {
    if !spec.atomic {
        return Err("migrated provider fixture selects atomic writer transport".into());
    }
    source::create_with(spec, asset, |configuration, document, transport| {
        Ok(Room::create_atomic_transport_v2(
            &directory.join("legacy-native"),
            configuration,
            document,
            "owner",
            transport,
        )?)
    })
}

pub fn capture(directory: &Path, mut room: Room, mut assets: AssetStore) -> Result<Cuts> {
    let source = ServerRoomBackup::capture(&mut room, &mut assets)?;
    let selection = source.info().identity;
    let archive = source.to_bytes()?;
    let wal_path = directory.join("legacy-native");
    let wal = fs::read(&wal_path)?;
    let older = source.prepare_generation_migration(
        &selection,
        &ServerLogGenerationOptions { root: "legacy".into(), active: "first".into() },
    )?;
    let expected = older.info()?.identity;
    drop(room);
    drop(assets);
    let mut migrated = ServerLogGenerationRoomRecovery::begin(
        &directory.join("migrated-origin"),
        &older,
        &expected,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&older)?;
    let (room, assets) = migrated.components_mut();
    if ServerLogGenerationRoomBackup::capture(room, assets, "owner")?.info()?.identity != expected
        || fs::read(wal_path)? != wal
    {
        return Err(
            "exact migrated origin differs from the independently selected legacy input".into()
        );
    }
    room.grant("owner", "control-local-reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "control-local-origin")?;
    let local = ServerLogGenerationRoomBackup::capture(room, assets, "owner")?;
    Ok(Cuts { older, local, legacy: Some(LegacyInputs { archive, wal, selection }) })
}
