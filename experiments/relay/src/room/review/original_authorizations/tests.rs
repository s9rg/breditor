//! Genuine native acceptance across role changes, overlap, cold replay and both storage families.
use super::*;
use crate::{
    AtomicTransportProfile, Error, ReviewAdmission, ReviewRole, Role, Room,
    ServerLogGenerationOptions,
};
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewPrincipalId, ReviewSession,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{ReviewAnchorTarget, RichReplica, SharedRichProfile},
};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
struct Directory(PathBuf);
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
struct Fixture {
    directory: Directory,
    path: PathBuf,
    room: Room,
    document: RichReplica,
    review: ReviewSession,
    binding: String,
    physical: bool,
}
fn test_room(
    path: &std::path::Path,
    configuration: &str,
    document: &str,
    selected: (u32, bool),
    atomic: bool,
    physical: bool,
) -> TestResult<Room> {
    let (version, standard) = selected;
    let compiler = match version {
        1 => AtomicTransportProfile::Original,
        2 => AtomicTransportProfile::StructuralV2 { standard_inline_v1: standard },
        _ => AtomicTransportProfile::LayoutV3 { standard_inline_v1: standard },
    };
    let room = if physical {
        let options =
            ServerLogGenerationOptions { root: "wal-root".into(), active: "wal-one".into() };
        if atomic {
            Room::create_atomic_log_generations_v2(
                path,
                configuration,
                document,
                "owner",
                compiler,
                &options,
            )?
        } else {
            Room::create_log_generations(
                path,
                configuration,
                document,
                "owner",
                compiler,
                &options,
            )?
        }
    } else if atomic {
        Room::create_atomic_transport_v2(path, configuration, document, "owner", compiler)?
    } else {
        match (version, standard) {
            (1, false) => Room::create(path, configuration, document, "owner")?,
            (2, false) => Room::create_structural_v2(path, configuration, document, "owner")?,
            (2, true) => {
                Room::create_standard_structural_v2(path, configuration, document, "owner")?
            }
            (3, false) => Room::create_layout_v3(path, configuration, document, "owner")?,
            _ => Room::create_standard_layout_v3(path, configuration, document, "owner")?,
        }
    };
    Ok(room)
}
impl Fixture {
    fn new(
        selected: (u32, bool),
        atomic: bool,
        physical: bool,
        histories: (bool, bool),
    ) -> TestResult<Self> {
        let (version, standard) = selected;
        let (docs, comments) = histories;
        let nonce = crate::credentials::issue()?;
        let temporary = std::env::temp_dir().join(format!("breditor-original-rights-{nonce}"));
        fs::create_dir(&temporary)?;
        // Only successful absent-directory creation grants test cleanup ownership.
        let directory = Directory(temporary);
        let path = directory.0.join("room");
        let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":version,"schema":{"name":"example/original-rights","version":1},"extensions":[]}).to_string();
        let profile = match (version, standard) {
            (1, false) => SharedRichProfile::from_configuration_json(&configuration)?,
            (2, false) => SharedRichProfile::from_configuration_json_v2(&configuration)?,
            (2, true) => SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
            (3, false) => SharedRichProfile::from_configuration_json_v3(&configuration)?,
            (3, true) => SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
            _ => return Err("profile".into()),
        };
        let tree: Value = serde_json::from_str(include_str!(
            "../../../../../../crates/breditor-core/tests/fixtures/rich-local-root.json"
        ))?;
        let document = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/original-rights","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),"root":tree}).to_string();
        let mut room =
            test_room(&path, &configuration, &document, (version, standard), atomic, physical)?;
        if docs {
            room.enable_document_history_generations(
                "owner",
                "document-root".into(),
                "document-one".into(),
            )?;
        }
        room.enable_review("owner")?;
        if comments {
            room.enable_review_history_generations(
                "owner",
                "review-root".into(),
                "review-one".into(),
            )?;
        }
        room.grant("owner", "alice", Some(Role::Reader))?;
        room.grant_review("owner", "alice", Some(ReviewRole::Comment))?;
        let registration =
            room.register_review("alice", ReviewActorId::try_new("alice.comments")?)?;
        let document = profile.join_frame("room".into(), "900".into(), &room.catchup("alice")?)?;
        let mut review = document.create_review_session(ReviewActorPolicy {
            actor: registration.lease.actor.clone(),
            principal: ReviewPrincipalId::try_new("alice")?,
            access: ReviewAccess::Comment,
        })?;
        Self::comment(&document, &mut review, "first comment")?;
        Self::comment(&document, &mut review, "second comment in the same batch")?;
        assert!(matches!(
            room.admit_review("alice", &registration.lease, &review.export_frame(0)?)?,
            ReviewAdmission::Durable(_)
        ));
        if comments {
            room.seal_review_history_generation("owner", "review-two".into())?;
        }
        room.grant_review("owner", "alice", Some(ReviewRole::Moderator))?;
        let upgraded =
            room.resume_review("alice", &registration.lease.actor, &registration.credential)?;
        review.set_access(&review.observe(), ReviewAccess::Moderate)?;
        Self::comment(&document, &mut review, "third event accepted as moderator")?;
        Self::comment(&document, &mut review, "fourth event in overlapping batch")?;
        // The new batch includes events 1/2 again under a later stronger grant.
        assert!(matches!(
            room.admit_review("alice", &upgraded, &review.export_frame(0)?)?,
            ReviewAdmission::Durable(_)
        ));
        if physical {
            room.rotate_log_generation("owner", "wal-two")?;
        }
        room.grant_review("owner", "alice", None)?;
        let binding = room.review_descriptor("owner")?.binding;
        Ok(Self { directory, path, room, document, review, binding, physical })
    }
    fn comment(document: &RichReplica, review: &mut ReviewSession, body: &str) -> TestResult {
        let action = ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: document.capture_review_anchor_guarded(
                &document.observe()?,
                &ReviewAnchorTarget::Document,
            )?,
            body: body.into(),
        });
        let observed = review.observe();
        document.dispatch_review_guarded(&document.observe()?, review, &observed, action)?;
        Ok(())
    }
    fn range(from: &str, through: &str) -> TestResult<ReviewOriginalAuthorizationRange> {
        Ok(ReviewOriginalAuthorizationRange {
            actor: ReviewActorId::try_new("alice.comments")?,
            principal: ReviewPrincipalId::try_new("alice")?,
            from: from.into(),
            through: through.into(),
        })
    }
    fn cut(&mut self) -> TestResult<String> {
        if self.physical {
            Ok(serde_json::to_string(
                &self.room.export_log_generation_backup("owner")?.info().identity,
            )?)
        } else {
            Ok(serde_json::to_string(&self.room.backup_identity()?)?)
        }
    }
}
fn matrix(docs: bool, comments: bool) -> TestResult {
    for (version, standard) in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            for physical in [false, true] {
                let mut f = Fixture::new((version, standard), atomic, physical, (docs, comments))?;
                let cut = f.cut()?;
                let ranges = vec![Fixture::range("1", "1")?, Fixture::range("2", "4")?];
                let read = f.room.review_original_authorizations("alice", &f.binding, &ranges)?;
                assert_eq!(read.kind, ReviewOriginalAuthorizationStatus::Covered);
                assert!(read.pending.is_empty());
                assert_eq!(read.windows.len(), 3);
                assert_eq!(
                    (&read.windows[0].from, &read.windows[0].through, read.windows[0].source.role),
                    (&"1".into(), &"1".into(), ReviewRole::Comment)
                );
                assert_eq!(
                    (&read.windows[1].from, &read.windows[1].through, read.windows[1].source.role),
                    (&"2".into(), &"2".into(), ReviewRole::Comment)
                );
                assert_eq!(
                    (&read.windows[2].from, &read.windows[2].through, read.windows[2].source.role),
                    (&"3".into(), &"4".into(), ReviewRole::Moderator)
                );
                for window in &read.windows {
                    assert_eq!(
                        window.prefix_digest,
                        f.review
                            .writer_clock_at(
                                &window.source.actor,
                                &window.source.principal,
                                window.through.parse()?
                            )?
                            .prefix_digest
                    );
                }
                assert_eq!(f.room.review_permissions("alice")?, None);
                assert_eq!(f.cut()?, cut);
                let Fixture { directory, path, room, document, review, binding, physical } = f;
                drop(room);
                let (mut reopened, _) =
                    if physical { Room::open_log_generations(&path)? } else { Room::open(&path)? };
                assert_eq!(
                    reopened.review_original_authorizations("owner", &binding, &ranges)?,
                    read
                );
                let after = if physical {
                    serde_json::to_string(
                        &reopened.export_log_generation_backup("owner")?.info().identity,
                    )?
                } else {
                    serde_json::to_string(&reopened.backup_identity()?)?
                };
                assert_eq!(after, cut);
                drop((reopened, document, review, directory));
            }
        }
    }
    Ok(())
}
#[test]
fn original_rights_keep_both_original_histories() -> TestResult {
    matrix(false, false)
}
#[test]
fn original_rights_keep_independent_comment_generations() -> TestResult {
    matrix(false, true)
}
#[test]
fn original_rights_keep_independent_document_generations() -> TestResult {
    matrix(true, false)
}
#[test]
fn original_rights_keep_both_segmented_histories() -> TestResult {
    matrix(true, true)
}
#[test]
fn unknown_offline_ranges_and_observers_never_publish_partial_windows() -> TestResult {
    let mut f = Fixture::new((3, true), true, true, (true, true))?;
    let observer = ReviewActorId::try_new("observer")?;
    f.room.register_review_observer("alice", observer.clone())?;
    let known = Fixture::range("1", "2")?;
    let unaccepted = Fixture::range("3", "18446744073709551615")?;
    let unknown = ReviewOriginalAuthorizationRange {
        actor: ReviewActorId::try_new("unknown")?,
        ..known.clone()
    };
    let observing = ReviewOriginalAuthorizationRange { actor: observer, ..known.clone() };
    let cut = f.cut()?;
    for (ranges, reason) in [
        (vec![known.clone(), unaccepted], ReviewOriginalAuthorizationPendingReason::Unaccepted),
        (vec![known.clone(), unknown], ReviewOriginalAuthorizationPendingReason::UnknownActor),
        (vec![known.clone(), observing], ReviewOriginalAuthorizationPendingReason::Observer),
    ] {
        let read = f.room.review_original_authorizations("owner", &f.binding, &ranges)?;
        assert_eq!(read.kind, ReviewOriginalAuthorizationStatus::Pending);
        assert!(read.windows.is_empty());
        assert_eq!(read.pending.len(), 1);
        assert_eq!(read.pending[0].reason, reason);
        assert_eq!(f.cut()?, cut);
    }
    Ok(())
}
#[test]
fn wrong_account_access_namespace_ranges_and_bounds_refuse_without_mutation() -> TestResult {
    let mut f = Fixture::new((3, true), true, false, (false, true))?;
    let cut = f.cut()?;
    let range = Fixture::range("1", "4")?;
    let wrong = ReviewOriginalAuthorizationRange {
        principal: ReviewPrincipalId::try_new("impostor")?,
        ..range.clone()
    };
    assert!(matches!(
        f.room.review_original_authorizations("owner", &f.binding, &[wrong]),
        Err(Error::Permission)
    ));
    assert!(
        f.room
            .review_original_authorizations("foreign", &f.binding, std::slice::from_ref(&range))
            .is_err()
    );
    assert!(
        f.room
            .review_original_authorizations("owner", &"0".repeat(64), std::slice::from_ref(&range))
            .is_err()
    );
    let empty = f.room.review_original_authorizations("owner", &f.binding, &[])?;
    assert_eq!(empty.kind, ReviewOriginalAuthorizationStatus::Covered);
    assert!(empty.windows.is_empty());
    assert!(empty.pending.is_empty());
    assert_eq!(f.cut()?, cut);
    // Primitive bounds must win over aggregate encoding: a native caller already owns
    // these strings, but validation must not copy their unbounded contents into JSON.
    for oversized in [
        Fixture::range(&"0".repeat(64 * 1024 + 1), "1")?,
        Fixture::range("1", &"0".repeat(64 * 1024 + 1))?,
    ] {
        assert!(matches!(
            f.room.review_original_authorizations("owner", &f.binding, &[oversized]),
            Err(Error::Contract("original role counter length"))
        ));
        assert_eq!(f.cut()?, cut);
    }
    for ranges in [
        vec![range.clone(), range.clone()],
        vec![Fixture::range("2", "4")?, Fixture::range("1", "1")?],
        vec![Fixture::range("0", "1")?],
        vec![Fixture::range("01", "1")?],
        vec![Fixture::range("1", "18446744073709551616")?],
        vec![range; 1025],
    ] {
        assert!(f.room.review_original_authorizations("owner", &f.binding, &ranges).is_err());
        assert_eq!(f.cut()?, cut);
    }
    Ok(())
}
