//! Exercise recovery ordering through sealed, packed, and active source files.
use super::{TestResult, setup, snapshot, torn_header};
use crate::{Error, Role, Room, log::Event};

#[test]
fn replaying_an_invalid_sealed_record_preserves_the_later_torn_tail() -> TestResult {
    let (files, mut room, _) = setup()?;
    room.grant("owner", "earlier-reader", Some(Role::Reader))?;
    room.rotate_log_generation("owner", "two")?;
    for i in 0..16 {
        room.grant("owner", &format!("reader-before-invalid-{i}"), Some(Role::Reader))?;
    }
    room.log.append(Event::Grant {
        actor: "not-owner".into(),
        principal: "unapproved-reader".into(),
        role: Some(Role::Reader),
    })?;
    room.rotate_log_generation("owner", "three")?;
    assert!(room.pack_sealed_wal("owner", "root")?.packed);
    assert!(room.pack_sealed_wal("owner", "two")?.packed);
    drop(room);
    torn_header(&files)?;
    let before = snapshot(&files)?;
    for _ in 0..2 {
        assert!(matches!(Room::open_log_generations(&files.room()), Err(Error::Permission)));
        assert_eq!(snapshot(&files)?, before);
    }
    Ok(())
}
