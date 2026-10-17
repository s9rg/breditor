//! A valid log checksum cannot replace semantic replay of grants and native receipts.
use super::*;
use crate::{
    Role,
    log::{Event, Log},
};
use breditor_collab_feasibility::{
    review::{
        ReviewAccess,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{ReviewAnchorTarget, SharedRichProfile},
};
use serde_json::{Value, json};
use std::{fs, io::Write};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

#[test]
fn checksum_valid_wrong_grants_or_receipts_reject_before_truncating_a_torn_tail() -> TestResult {
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
    let directory =
        std::env::temp_dir().join(format!("breditor-review-replay-{}-{nonce}", std::process::id()));
    fs::create_dir(&directory)?;
    let original = directory.join("original.log");
    let configuration=json!({"format":"breditor/shared-rich-profile","formatVersion":1,"schema":{"name":"example/review-replay","version":1},"extensions":[]}).to_string();
    let profile = SharedRichProfile::from_configuration_json(&configuration)?;
    let tree: Value = serde_json::from_str(include_str!(
        "../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document=json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/review-replay","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree}).to_string();
    let mut room = Room::create(&original, &configuration, &document, "owner")?;
    room.enable_review("owner")?;
    room.grant("owner", "alice", Some(Role::Reader))?;
    room.grant_review("owner", "alice", Some(ReviewRole::Comment))?;
    let registration = room.register_review("alice", ReviewActorId::try_new("alice.comments")?)?;
    let doc = profile.join_frame("room".into(), "900".into(), &room.catchup("alice")?)?;
    let mut metadata = doc.create_review_session(ReviewActorPolicy {
        actor: ReviewActorId::try_new("alice.comments")?,
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::Comment,
    })?;
    let action = ReviewAction::CreateThread(CreateReviewThread {
        anchor_json: doc
            .capture_review_anchor_guarded(&doc.observe()?, &ReviewAnchorTarget::Document)?,
        body: "Replay under actual original rights".into(),
    });
    let observed = metadata.observe();
    doc.dispatch_review_guarded(&doc.observe()?, &mut metadata, &observed, action)?;
    assert!(matches!(
        room.admit_review("alice", &registration.lease, &metadata.export_frame(0)?)?,
        ReviewAdmission::Durable(_)
    ));
    drop(room);
    for variant in 0..2 {
        let (source, mut records, _) = Log::open(&original)?;
        drop(source);
        let path = directory.join(format!("wrong-{variant}.log"));
        let seed = records.remove(0).event;
        let mut log = Log::create(&path, seed)?;
        for record in records {
            let mut event = record.event;
            if let Event::CommitReviewV1 { source, receipt, .. } = &mut event {
                if variant == 0 {
                    source.role = ReviewRole::Moderator;
                } else {
                    receipt.prefix_digest =
                        "sha256:0000000000000000000000000000000000000000000000000000000000000000"
                            .into();
                }
            }
            log.append(event)?;
        }
        drop(log);
        let mut file = fs::OpenOptions::new().append(true).open(&path)?;
        file.write_all(&[0, 1, 2])?;
        file.sync_all()?;
        drop(file);
        let before = fs::read(&path)?;
        assert!(Room::open(&path).is_err());
        assert_eq!(fs::read(&path)?, before);
        fs::remove_file(&path)?;
    }
    fs::remove_file(&original)?;
    fs::remove_dir(&directory)?;
    Ok(())
}
