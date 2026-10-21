//! Deterministic small native document/raster sources; secrets and directories are genuinely fresh.
use super::super::super::Authentication;
use crate::{
    AtomicTransportProfile, OperationalLogGenerationServerRoom, RecoveryDocumentCredential,
    RecoveryRegistrationCredentials, RecoveryReviewCredential, Registration, ReviewRegistration,
    ReviewRole, Role, Room, RoomRecoveryPolicy, ServerLogGenerationOptions,
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomRecovery,
    assets::{AssetStore, asset_id, prepare_asset},
};
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewOutcome, ReviewPrincipalId,
        ReviewSession,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{Command, RichReplica, SharedRichProfile, actions::InsertText},
};
use image::{DynamicImage, ImageFormat};
use serde_json::{Value, json};
use std::{
    fs,
    io::Cursor,
    path::{Path, PathBuf},
};
pub(super) type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;
pub(super) const POLICY: RoomRecoveryPolicy = RoomRecoveryPolicy::HostReacquired;
pub(super) struct Directory(pub PathBuf);
impl Directory {
    pub fn new() -> TestResult<Self> {
        let root = std::env::temp_dir()
            .join(format!("breditor-prepared-generation-{}", crate::credentials::issue()?));
        fs::create_dir(&root)?;
        Ok(Self(root))
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
pub(super) struct Source {
    pub directory: Directory,
    pub profile: SharedRichProfile,
    pub original: ServerLogGenerationRoomBackup,
    pub credentials: RecoveryRegistrationCredentials,
    pub author: Registration,
    pub offline: String,
    pub through: String,
    pub reviewer: ReviewRegistration,
    pub review_offline: String,
    pub review_through: u64,
}
pub(super) fn authentication() -> TestResult<(Authentication, String, String)> {
    let (owner, owner_hash) = Authentication::issue_token()?;
    let (reader, reader_hash) = Authentication::issue_token()?;
    let json = json!({"format":"breditor/relay-auth","formatVersion":1,
        "accounts":[{"principal":"owner","tokenHash":owner_hash},{"principal":"reader","tokenHash":reader_hash}],
        "origins":["http://127.0.0.1:4187"]}).to_string();
    Ok((Authentication::from_json(&json)?, owner, reader))
}
fn native(
    path: &Path,
    version: u32,
    standard: bool,
    atomic: bool,
) -> TestResult<(SharedRichProfile, Room)> {
    let configuration = json!({"format":"breditor/shared-rich-profile","formatVersion":version,
        "schema":{"name":"example/prepared-generation","version":1},"extensions":[]})
    .to_string();
    let (profile, kind) = match (version, standard) {
        (1, false) => (
            SharedRichProfile::from_configuration_json(&configuration)?,
            AtomicTransportProfile::Original,
        ),
        (2, false) => (
            SharedRichProfile::from_configuration_json_v2(&configuration)?,
            AtomicTransportProfile::StructuralV2 { standard_inline_v1: false },
        ),
        (2, true) => (
            SharedRichProfile::from_standard_configuration_json_v2(&configuration)?,
            AtomicTransportProfile::StructuralV2 { standard_inline_v1: true },
        ),
        (3, false) => (
            SharedRichProfile::from_configuration_json_v3(&configuration)?,
            AtomicTransportProfile::LayoutV3 { standard_inline_v1: false },
        ),
        (3, true) => (
            SharedRichProfile::from_standard_configuration_json_v3(&configuration)?,
            AtomicTransportProfile::LayoutV3 { standard_inline_v1: true },
        ),
        _ => return Err("explicit source compiler".into()),
    };
    let document = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":"example/prepared-generation","version":1},"schemaFingerprint":profile.schema().fingerprint().to_string(),
        "root":serde_json::from_str::<Value>(include_str!(concat!(env!("CARGO_MANIFEST_DIR"),"/../../crates/breditor-core/tests/fixtures/rich-local-root.json")))?}).to_string();
    let options = ServerLogGenerationOptions { root: "root".into(), active: "one".into() };
    let room = if atomic {
        Room::create_atomic_log_generations_v2(
            path,
            &configuration,
            &document,
            "owner",
            kind,
            &options,
        )?
    } else {
        Room::create_log_generations(path, &configuration, &document, "owner", kind, &options)?
    };
    Ok((profile, room))
}
pub(super) fn insert(client: &mut RichReplica, text: &str) -> TestResult {
    client.apply(vec![Command::InsertText(InsertText {
        block: "p".into(),
        offset: 0,
        text: text.into(),
    })])?;
    Ok(())
}
pub(super) fn send(
    room: &mut Room,
    client: &RichReplica,
    principal: &str,
    lease: &crate::Lease,
    after: &str,
    atomic: bool,
) -> TestResult<String> {
    let groups: Value = serde_json::from_str(&if atomic {
        client.writer_groups_v2_guarded(&client.observe()?, after)?
    } else {
        client.writer_groups_guarded(&client.observe()?, after)?
    })?;
    for frame in groups["groups"].as_array().ok_or("groups")? {
        assert!(matches!(
            room.admit(principal, lease, frame.as_str().ok_or("frame")?)?,
            crate::Admission::Durable(_)
        ));
    }
    Ok(groups["through"].as_str().ok_or("through")?.into())
}
fn document_record(principal: &str, value: &Registration) -> RecoveryDocumentCredential {
    RecoveryDocumentCredential {
        principal: principal.into(),
        writer: value.lease.writer.clone(),
        credential: value.credential.clone(),
    }
}
fn review_record(principal: &str, value: &ReviewRegistration) -> RecoveryReviewCredential {
    RecoveryReviewCredential {
        principal: principal.into(),
        actor: value.lease.actor.as_str().into(),
        credential: value.credential.clone(),
    }
}
pub(super) fn review_policy(actor: &str) -> TestResult<ReviewActorPolicy> {
    Ok(ReviewActorPolicy {
        actor: ReviewActorId::try_new(actor)?,
        principal: ReviewPrincipalId::try_new("owner")?,
        access: ReviewAccess::Moderate,
    })
}
pub(super) fn comment(
    document: &RichReplica,
    review: &mut ReviewSession,
    text: &str,
) -> TestResult {
    use breditor_collab_feasibility::rich_replica::{ReviewAnchorTarget, selection::Selection};
    let anchor_json = document.capture_review_anchor_guarded(
        &document.observe()?,
        &ReviewAnchorTarget::Selection(Selection::Node { block: "image-block".into() }),
    )?;
    assert!(matches!(
        document.dispatch_review_guarded(
            &document.observe()?,
            review,
            &review.observe(),
            ReviewAction::CreateThread(CreateReviewThread { anchor_json, body: text.into() })
        )?,
        ReviewOutcome::Committed(_)
    ));
    Ok(())
}
impl Source {
    pub fn new(
        profile_choice: (u32, bool),
        atomic: bool,
        document: bool,
        review: bool,
    ) -> TestResult<Self> {
        let directory = Directory::new()?;
        let (profile, mut room) =
            native(&directory.0.join("source"), profile_choice.0, profile_choice.1, atomic)?;
        room.enable_review("owner")?;
        room.grant("owner", "reader", Some(Role::Reader))?;
        room.grant("owner", "revoked", Some(Role::Editor))?;
        room.grant_review("owner", "reader", Some(ReviewRole::Comment))?;
        room.grant_review("owner", "revoked", Some(ReviewRole::Comment))?;
        let author = room.register("owner")?;
        let observer = room.register_observer("reader")?;
        let revoked = room.register("revoked")?;
        let comments = room.register_review("owner", ReviewActorId::try_new("owner.comments")?)?;
        let reader_review =
            room.register_review_observer("reader", ReviewActorId::try_new("reader.comments")?)?;
        let revoked_review =
            room.register_review("revoked", ReviewActorId::try_new("revoked.comments")?)?;
        let credentials = RecoveryRegistrationCredentials {
            documents: vec![
                document_record("owner", &author),
                document_record("reader", &observer),
                document_record("revoked", &revoked),
            ],
            reviews: vec![
                review_record("owner", &comments),
                review_record("reader", &reader_review),
                review_record("revoked", &revoked_review),
            ],
        };
        let mut client = profile.join_frame(
            "room".into(),
            author.lease.writer.clone(),
            &room.catchup("owner")?,
        )?;
        insert(&mut client, "Accepted ")?;
        let through = send(&mut room, &client, "owner", &author.lease, "0", atomic)?;
        let mut review_session = client.create_review_session(review_policy("owner.comments")?)?;
        comment(&client, &mut review_session, "Accepted comment")?;
        assert!(matches!(
            room.admit_review("owner", &comments.lease, &review_session.export_frame(0)?)?,
            crate::ReviewAdmission::Durable(_)
        ));
        let review_through = review_session.local_writer_clock()?.through.parse()?;
        comment(&client, &mut review_session, "Old offline comment")?;
        let review_offline = review_session.checkpoint_json()?;
        insert(&mut client, "Old offline ")?;
        let offline = client.checkpoint()?;
        if document {
            room.enable_document_history_generations("owner", "root".into(), "one".into())?;
        }
        if review {
            room.enable_review_history_generations("owner", "root".into(), "one".into())?;
        }
        room.grant("owner", "revoked", None)?;
        room.grant_review("owner", "revoked", None)?;
        let mut assets =
            AssetStore::open(&directory.0.join("source-assets"), room.asset_binding())?;
        for (format, mime) in [
            (ImageFormat::Png, "image/png"),
            (ImageFormat::Jpeg, "image/jpeg"),
            (ImageFormat::WebP, "image/webp"),
        ] {
            let mut bytes = Cursor::new(Vec::new());
            DynamicImage::new_rgb8(2, 3).write_to(&mut bytes, format)?;
            let bytes = bytes.into_inner();
            room.put_asset("owner", &mut assets, prepare_asset(&asset_id(&bytes), mime, bytes)?)?;
        }
        let original = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, "owner")?;
        drop(room);
        drop(assets);
        Ok(Self {
            directory,
            profile,
            original,
            credentials,
            author,
            offline,
            through,
            reviewer: comments,
            review_offline,
            review_through,
        })
    }
    pub fn protected_records(&self) -> RecoveryRegistrationCredentials {
        RecoveryRegistrationCredentials {
            documents: self
                .credentials
                .documents
                .iter()
                .map(|value| RecoveryDocumentCredential {
                    principal: value.principal.clone(),
                    writer: value.writer.clone(),
                    credential: value.credential.clone(),
                })
                .collect(),
            reviews: self
                .credentials
                .reviews
                .iter()
                .map(|value| RecoveryReviewCredential {
                    principal: value.principal.clone(),
                    actor: value.actor.clone(),
                    credential: value.credential.clone(),
                })
                .collect(),
        }
    }
    pub fn operation(&self, name: &str) -> TestResult<OperationalLogGenerationServerRoom> {
        Ok(ServerLogGenerationRoomRecovery::begin(
            &self.directory.0.join(name),
            &self.original,
            &self.original.info()?.identity,
            POLICY,
        )?
        .finish(&self.original)?
        .begin_operation(
            &self.original,
            &self.original.info()?.identity,
            POLICY,
            "owner",
        )?)
    }
    pub fn original_copy(&self) -> TestResult<ServerLogGenerationRoomBackup> {
        Ok(ServerLogGenerationRoomBackup::from_owned_bytes(self.original.to_bytes()?)?)
    }
}
