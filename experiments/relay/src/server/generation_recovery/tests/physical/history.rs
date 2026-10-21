//! Old offline native document/comment work and peer-preserving Undo/Redo after a genuine B restore.
use super::super::{
    source::{Source, TestResult, insert, send},
    workflows::merge_review_after_host,
};
use crate::{OperationalLogGenerationServerRoom, ServerLogGenerationRoomBackup};
pub(super) fn continue_history(
    operation: &mut OperationalLogGenerationServerRoom,
    origin: &ServerLogGenerationRoomBackup,
    source: &Source,
    atomic: bool,
) -> TestResult {
    let (room, assets) = operation.components_mut();
    let peer = room.register("owner")?;
    let mut peer_document = source.profile.join_frame(
        "room".into(),
        peer.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    insert(&mut peer_document, "Peer preserved ")?;
    send(room, &peer_document, "owner", &peer.lease, "0", atomic)?;
    let lease = room.resume("owner", &source.author.lease.writer, &source.author.credential)?;
    let mut author = source.profile.restore("room", &source.offline)?;
    author.receive_frame(&room.catchup("owner")?)?;
    let mut through = send(room, &author, "owner", &lease, &source.through, atomic)?;
    for redo in [false, true] {
        assert!(if redo { author.redo()? } else { author.undo()? });
        through = send(room, &author, "owner", &lease, &through, atomic)?;
        assert!(author.document_json().contains("Peer preserved "));
        assert_eq!(author.document_json().contains("Old offline "), redo);
    }
    merge_review_after_host(room, &author, &peer_document, source)?;
    assert_eq!(assets.count(), 4);
    operation.check_live_source(origin, "owner")?;
    Ok(())
}
