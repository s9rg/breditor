//! Genuine receiver/client histories, durable bytes, receipt retries and replay of explicit cuts.
use super::{
    NativeHistoryBoundary, ServerNativeHistoryFamily as Family, ServerNativeHistoryLane as Lane,
};
use crate::{
    Admission, AtomicTransportProfile, DurableReceipt, DurableReviewReceipt, Error, Lease,
    Result as RelayResult, ReviewAdmission, ReviewLease, ReviewRole, Role, Room,
};
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewOutcome, ReviewPrincipalId,
        ReviewSession,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{
        Command, ReviewAnchorTarget, RichReplica, SharedRichProfile, actions::InsertText,
        selection::Selection,
    },
};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
mod capacity;
mod continued;
mod durability;
mod effects;
mod owned_effects;
mod workflows;

type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Files(PathBuf);
impl Files {
    fn new() -> TestResult<Self> {
        let path = std::env::temp_dir()
            .join(format!("breditor-native-room-history-{}", crate::credentials::issue()?));
        fs::create_dir(&path)?;
        Ok(Self(path))
    }
    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}
impl Drop for Files {
    fn drop(&mut self) {
        if let Ok(entries) = fs::read_dir(&self.0) {
            for entry in entries.flatten() {
                // Only this test's fresh directory; no recursive or existing-user-data removal.
                let _ = fs::remove_file(entry.path());
            }
        }
        let _ = fs::remove_dir(&self.0);
    }
}

fn start(
    files: &Files,
    version: u32,
    standard: bool,
    atomic: bool,
) -> TestResult<(SharedRichProfile, Room)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/server-native-history","version":1},"extensions":[]}).to_string();
    let profile = match (version, standard) {
        (1, false) => SharedRichProfile::from_configuration_json(&configuration)?,
        (2, false) => SharedRichProfile::from_configuration_json_v2(&configuration)?,
        (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
        (3, false) => SharedRichProfile::from_configuration_json_v3(&configuration)?,
        (3, true) => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
        _ => return Err("unsupported room fixture".into()),
    };
    let tree: Value = serde_json::from_str(include_str!(
        "../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
    ))?;
    let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/server-native-history","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree}).to_string();
    let path = files.path("source.log");
    let room = if atomic {
        let selected = match version {
            1 => AtomicTransportProfile::Original,
            2 => AtomicTransportProfile::StructuralV2 { standard_inline_v1: standard },
            _ => AtomicTransportProfile::LayoutV3 { standard_inline_v1: standard },
        };
        Room::create_atomic_transport_v2(&path, &configuration, &document, "owner", selected)?
    } else {
        match (version, standard) {
            (1, false) => Room::create(&path, &configuration, &document, "owner")?,
            (2, false) => Room::create_structural_v2(&path, &configuration, &document, "owner")?,
            (2, true) => {
                Room::create_standard_structural_v2(&path, &configuration, &document, "owner")?
            }
            (3, false) => Room::create_layout_v3(&path, &configuration, &document, "owner")?,
            _ => Room::create_standard_layout_v3(&path, &configuration, &document, "owner")?,
        }
    };
    Ok((profile, room))
}
fn insert(owner: &mut RichReplica, text: &str) -> TestResult {
    owner.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: text.into(),
    })])?;
    Ok(())
}
fn send_document(
    room: &mut Room,
    principal: &str,
    owner: &RichReplica,
    lease: &Lease,
    after: &str,
    atomic: bool,
) -> TestResult<(String, String, DurableReceipt)> {
    let value: Value = serde_json::from_str(&if atomic {
        owner.writer_groups_v2_guarded(&owner.observe()?, after)?
    } else {
        owner.writer_groups_guarded(&owner.observe()?, after)?
    })?;
    assert_eq!(value["hasMore"], false);
    let mut last = None;
    for frame in value["groups"].as_array().ok_or("groups")? {
        let frame = frame.as_str().ok_or("frame")?;
        let Admission::Durable(receipt) = room.admit(principal, lease, frame)? else {
            return Err("expected durable group".into());
        };
        last = Some((value["through"].as_str().ok_or("through")?.into(), frame.into(), receipt));
    }
    last.ok_or("no authored groups".into())
}
fn policy(actor: &str, principal: &str) -> TestResult<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new(actor)?,
        principal: ReviewPrincipalId::try_new(principal)?,
        access: ReviewAccess::Moderate,
    })
}
fn comment(doc: &RichReplica, review: &mut ReviewSession, body: &str) -> TestResult {
    assert!(matches!(
        doc.dispatch_review_guarded(
            &doc.observe()?,
            review,
            &review.observe(),
            ReviewAction::CreateThread(CreateReviewThread {
                anchor_json: doc.capture_review_anchor_guarded(
                    &doc.observe()?,
                    &ReviewAnchorTarget::Selection(Selection::Node { block: "image-block".into() })
                )?,
                body: body.into()
            })
        )?,
        ReviewOutcome::Committed(_)
    ));
    Ok(())
}
fn send_review(
    room: &mut Room,
    principal: &str,
    review: &ReviewSession,
    lease: &ReviewLease,
    after: u64,
) -> TestResult<(String, DurableReviewReceipt)> {
    let frame = review.export_frame(after)?;
    let ReviewAdmission::Durable(receipt) = room.admit_review(principal, lease, &frame)? else {
        return Err("expected durable comments".into());
    };
    Ok((frame, receipt))
}
fn enable(room: &mut Room, lane: Lane) -> RelayResult<()> {
    let result = match lane {
        Lane::Document => {
            room.enable_document_history_generations("owner", "root".into(), "active".into())
        }
        Lane::Review => {
            room.enable_review_history_generations("owner", "root".into(), "active".into())
        }
    };
    result.map(|_| ())
}
fn seal(room: &mut Room, lane: Lane, next: &str) -> RelayResult<()> {
    let result = match lane {
        Lane::Document => room.seal_document_history_generation("owner", next.into()),
        Lane::Review => room.seal_review_history_generation("owner", next.into()),
    };
    result.map(|_| ())
}
