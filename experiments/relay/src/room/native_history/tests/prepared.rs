//! Exact cut selection, WAL accounting, stale refusal and read-only cold receipt recovery.
use super::*;

#[test]
fn selected_boundaries_stage_without_writes_and_refuse_a_changed_cut() -> TestResult {
    let files = Files::new()?;
    let (_, mut room) = start(&files, 3, true, true)?;
    room.enable_review("owner")?;
    let path = files.path("source.log");
    let bytes = fs::read(&path)?;
    let intent = |lane| NativeHistoryBoundary::Enable {
        root: format!("{lane}-root"),
        active: format!("{lane}-active"),
    };
    assert!(matches!(
        room.prepare_native_history_boundary("reader", Lane::Document, intent("doc")),
        Err(Error::Permission)
    ));
    let document = room.prepare_native_history_boundary("owner", Lane::Document, intent("doc"))?;
    let review = room.prepare_native_history_boundary("owner", Lane::Review, intent("review"))?;
    assert_eq!(document.selection.source, room.backup_identity()?);
    assert_eq!(document.selection.source, review.selection.source);
    assert_eq!(document.capacity_before, room.native_history_capacity("owner")?);
    assert_eq!(fs::read(&path)?, bytes);
    assert_eq!(room.resolve_native_history_boundary("owner", &document.selection)?, None);

    let mut changed = document.selection.clone();
    changed.append.framed_bytes += 1;
    assert!(matches!(
        room.apply_prepared_native_history_boundary("owner", changed),
        Err(Error::Contract("native history selection append differs"))
    ));
    let mut changed = document.selection.clone();
    changed.after[0] ^= 1;
    assert!(matches!(
        room.apply_prepared_native_history_boundary("owner", changed),
        Err(Error::Contract("native history selection cut differs"))
    ));
    assert_eq!(fs::read(&path)?, bytes);

    let selection = serde_json::from_slice(&serde_json::to_vec(&document.selection)?)?;
    let receipt = room.apply_prepared_native_history_boundary("owner", selection)?;
    assert_eq!(receipt.sequence, document.selection.source.records.to_string());
    assert_eq!(
        (receipt.before, receipt.after),
        (document.selection.before, document.selection.after)
    );
    assert_eq!(room.native_history_capacity("owner")?, document.capacity_after);
    assert_eq!(
        fs::metadata(&path)?.len(),
        u64::try_from(bytes.len())? + document.selection.append.framed_bytes
    );

    let after = fs::read(&path)?;
    for stale in [review.selection, document.selection.clone()] {
        assert!(matches!(
            room.apply_prepared_native_history_boundary("owner", stale),
            Err(Error::Contract("native history selection is stale"))
        ));
    }
    assert_eq!(fs::read(&path)?, after);
    let review = room.prepare_native_history_boundary("owner", Lane::Review, intent("review"))?;
    drop(room);
    let (mut room, _) = Room::open(&path)?;
    room.apply_prepared_native_history_boundary("owner", review.selection)?;
    let conflicting = {
        let mut changed = document.selection.clone();
        changed.source.records += 1;
        changed
    };
    let after_review = fs::read(&path)?;
    assert!(matches!(
        room.resolve_native_history_boundary("owner", &conflicting),
        Err(Error::Contract("durable native history receipt differs from selection"))
    ));
    assert!(matches!(
        room.resolve_native_history_boundary("reader", &document.selection),
        Err(Error::Permission)
    ));
    assert_eq!(
        room.resolve_native_history_boundary("owner", &document.selection)?,
        Some(crate::ServerNativeHistoryReceipt { duplicate: true, ..receipt })
    );
    assert_eq!(fs::read(&path)?, after_review);
    Ok(())
}
