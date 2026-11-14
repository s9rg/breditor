//! The streamed producer must match the existing envelope and cooperate with
//! archived files, short writes and the actual append cursor.
use super::{TestResult, setup};
use crate::{Error, Role, Room, ServerLogGenerationBackup};
use std::io::{self, Write};

struct ShortWriter {
    data: Vec<u8>,
    max_chunk: usize,
    remaining: usize,
}
impl Write for ShortWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let count = bytes.len().min(self.max_chunk).min(self.remaining);
        self.data.extend_from_slice(&bytes[..count]);
        self.remaining -= count;
        Ok(count)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[test]
fn streamed_backup_keeps_the_exact_archive_and_room_after_a_destination_error() -> TestResult {
    let (files, mut room, _) = setup()?;
    room.grant("owner", "reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "two")?;
    let checkpoint = room.materialize_relay_checkpoint("owner")?;
    assert!(room.pack_sealed_wal("owner", "root")?.packed);
    room.archive_sealed_wal("owner", &checkpoint, "root")?;
    room.grant("owner", "other-reader", Some(Role::Reader))?;
    let expected = room.export_log_generation_backup("owner")?;
    let at = expected.to_bytes();
    assert!(matches!(
        room.write_log_generation_backup("reader", &mut io::sink()),
        Err(Error::Permission)
    ));
    for limit in [1, at.len() - 1] {
        let mut writer = ShortWriter { data: Vec::new(), max_chunk: 17, remaining: limit };
        assert!(matches!(
            room.write_log_generation_backup("owner", &mut writer),
            Err(Error::Io(error)) if error.kind() == io::ErrorKind::WriteZero
        ));
        assert_eq!(writer.data, at[..limit]);
    }
    let mut writer = ShortWriter { data: Vec::new(), max_chunk: 17, remaining: usize::MAX };
    let info = room.write_log_generation_backup("owner", &mut writer)?;
    assert_eq!(info, expected.info());
    assert_eq!(writer.data, at);
    ServerLogGenerationBackup::from_owned_bytes(writer.data)?.check_live(&mut room, "owner")?;
    room.grant("owner", "reader-after-output-failure", Some(Role::Reader))?;
    let mut later = Vec::new();
    let selected = room.write_log_generation_backup("owner", &mut later)?;
    drop(room);
    let (mut room, recovery) = Room::open_log_generations(&files.room())?;
    assert_eq!(recovery.truncated_bytes, 0);
    assert_eq!(room.export_log_generation_backup("owner")?.info(), selected);
    assert_eq!(room.export_log_generation_backup("owner")?.to_bytes(), later);
    Ok(())
}
