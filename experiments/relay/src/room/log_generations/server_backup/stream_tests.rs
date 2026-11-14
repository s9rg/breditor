//! Roundtrip the joined writer and guard destination and held raster failures.
use super::{super::server_recovery::tests::source, ServerLogGenerationRoomBackup};
use crate::{Error, Role, Room, RoomRecoveryPolicy, ServerLogGenerationRoomRecovery};
use std::{
    fs,
    io::{self, Write},
    path::PathBuf,
};

type TestResult = Result<(), Box<dyn std::error::Error>>;

#[test]
fn streamed_joined_backup_matches_the_existing_envelope_and_restores() -> TestResult {
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let buffered = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let mut streamed = Vec::new();
    assert!(matches!(
        ServerLogGenerationRoomBackup::capture_to(&mut room, &assets, "reader", &mut streamed),
        Err(Error::Permission)
    ));
    assert!(streamed.is_empty());
    let info =
        ServerLogGenerationRoomBackup::capture_to(&mut room, &assets, "owner", &mut streamed)?;
    assert_eq!(streamed, buffered.to_bytes()?);
    assert_eq!(info, buffered.info()?);
    let admitted = ServerLogGenerationRoomBackup::from_owned_bytes(streamed)?;
    let mut restored = ServerLogGenerationRoomRecovery::begin(
        &files.recovery(),
        &admitted,
        &info.identity,
        RoomRecoveryPolicy::HostReacquired,
    )?
    .finish(&admitted)?;
    restored.check_live_source(&admitted, "owner")?;
    assert_eq!(restored.room().catchup("owner")?, room.catchup("owner")?);
    Ok(())
}

struct InterruptOutput {
    remaining: usize,
}

impl Write for InterruptOutput {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let count = bytes.len().min(self.remaining);
        self.remaining -= count;
        Ok(count)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[test]
fn streamed_joined_output_errors_at_each_component_leave_the_room_available() -> TestResult {
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let expected = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let count = usize::try_from(expected.encoded_len()?)?;
    let rasters = usize::try_from(expected.header.rasters.bytes)?;
    let native = usize::try_from(expected.header.log.bytes)?;
    let prefix = count - native - rasters;
    for remaining in [1, prefix + native / 2, prefix + native + rasters / 2] {
        assert!(matches!(
            ServerLogGenerationRoomBackup::capture_to(
                &mut room, &assets, "owner", &mut InterruptOutput { remaining },
            ),
            Err(Error::Io(error)) if error.kind() == io::ErrorKind::WriteZero
        ));
        expected.check_live(&mut room, &assets, "owner")?;
    }
    room.grant("owner", "reader-after-output-error", Some(Role::Reader))?;
    let later = room.catchup("owner")?;
    drop(room);
    let (room, recovery) = Room::open_log_generations(&files.room())?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.catchup("owner")?, later);
    Ok(())
}

struct ChangeRaster(PathBuf);

impl Write for ChangeRaster {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        fs::remove_file(&self.0)
    }
}

#[test]
fn streamed_joined_backup_yields_no_identity_when_a_final_raster_recheck_fails() -> TestResult {
    let (files, mut room, mut assets, _) = source(3, true, true)?;
    let expected = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
    let record = expected.assets.info().assets.into_iter().next().ok_or("fixture image")?;
    let path = files
        .recovery()
        .with_file_name("source-assets")
        .join(format!("{}.asset", &record.asset[7..]));
    assert!(
        ServerLogGenerationRoomBackup::capture_to(
            &mut room,
            &assets,
            "owner",
            &mut ChangeRaster(path),
        )
        .is_err()
    );
    room.catchup("owner")?;
    Ok(())
}
