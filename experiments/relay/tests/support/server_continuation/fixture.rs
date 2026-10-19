//! Real original restore, later native edit/registrations and fresh host account authentication.
use super::super::{
    live::authentication,
    support::{Directory, Result, fill, flush, insert, source},
};
use breditor_collab_feasibility::review::ReviewActorId;
use breditor_collab_relay::{
    RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential, Room,
    RoomParticipantInventory, RoomRecoveryPolicy, ServerRoomBackup, ServerRoomRecovery,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        Authentication, ServerBackupHandle, ServerRecoveryContinuationCoverage,
        ServerRecoveryContinuationIdentity, VerifiedServerRecoveryContinuation,
        router_with_server_backups,
    },
};
use image::{DynamicImage, ImageFormat};
use std::{collections::BTreeMap, fs, io::Cursor, path::Path};

pub struct Fixture {
    pub router: Option<axum::Router>,
    pub handle: Option<ServerBackupHandle>,
    pub directory: Directory,
    pub expected: ServerRecoveryContinuationIdentity,
    pub original_file: Vec<u8>,
    pub inventory_json: String,
    pub credentials: RecoveryRegistrationCredentials,
    pub owner: String,
    pub reader: String,
}
pub fn copy_credentials(
    input: &RecoveryRegistrationCredentials,
) -> RecoveryRegistrationCredentials {
    RecoveryRegistrationCredentials {
        documents: input
            .documents
            .iter()
            .map(|r| RecoveryDocumentCredential {
                principal: r.principal.clone(),
                writer: r.writer.clone(),
                credential: r.credential.clone(),
            })
            .collect(),
        reviews: input
            .reviews
            .iter()
            .map(|r| RecoveryReviewCredential {
                principal: r.principal.clone(),
                actor: r.actor.clone(),
                credential: r.credential.clone(),
            })
            .collect(),
    }
}
pub fn image(width: u32, height: u32) -> Result<Vec<u8>> {
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(width, height).write_to(&mut bytes, ImageFormat::Png)?;
    Ok(bytes.into_inner())
}
impl Fixture {
    pub async fn new() -> Result<Self> {
        let directory = Directory::new()?;
        let (profile, mut room, mut assets) = source(&directory)?;
        fill(&room, &mut assets)?;
        room.enable_review("owner")?;
        let author = room.register("owner")?;
        let observer = room.register_observer("reader")?;
        let review = room.register_review("owner", ReviewActorId::try_new("owner.original")?)?;
        let readonly =
            room.register_review_observer("reader", ReviewActorId::try_new("reader.original")?)?;
        let mut credentials = RecoveryRegistrationCredentials {
            documents: [&author, &observer]
                .into_iter()
                .zip(["owner", "reader"])
                .map(|(r, p)| RecoveryDocumentCredential {
                    principal: p.into(),
                    writer: r.lease.writer.clone(),
                    credential: r.credential.clone(),
                })
                .collect(),
            reviews: [&review, &readonly]
                .into_iter()
                .zip(["owner", "reader"])
                .map(|(r, p)| RecoveryReviewCredential {
                    principal: p.into(),
                    actor: r.lease.actor.as_str().into(),
                    credential: r.credential.clone(),
                })
                .collect(),
        };
        let (auth, token, _) = authentication()?;
        let (router, handle) = router_with_server_backups(room, auth, assets)?;
        let original = handle.capture_recovery_state("owner", &token).await?;
        let selected = original.identity();
        let (original, _) = original.into_parts();
        let original_file = original.to_bytes()?;
        drop(router);
        drop(handle);
        let recovered = ServerRoomRecovery::begin(
            &directory.0.join("restored"),
            &original,
            &selected.server,
            RoomRecoveryPolicy::HostReacquired,
        )?
        .finish(&original)?;
        let (mut room, mut assets) = recovered
            .begin_operation(&original, &selected.server, RoomRecoveryPolicy::HostReacquired)?
            .into_parts();
        let lease = room.resume("owner", &author.lease.writer, &author.credential)?;
        let mut client =
            profile.join_frame("room".into(), lease.writer.clone(), &room.catchup("owner")?)?;
        insert(&mut client, "p", "Continued native history ")?;
        flush(&mut room, &client, "owner", &lease, "0")?;
        room.grant("owner", "reader", None)?;
        let late = room.register("owner")?;
        let late_review = room.register_review("owner", ReviewActorId::try_new("owner.later")?)?;
        credentials.documents.push(RecoveryDocumentCredential {
            principal: "owner".into(),
            writer: late.lease.writer,
            credential: late.credential,
        });
        credentials.reviews.push(RecoveryReviewCredential {
            principal: "owner".into(),
            actor: late_review.lease.actor.as_str().into(),
            credential: late_review.credential,
        });
        let bytes = image(5, 7)?;
        room.put_asset(
            "owner",
            &mut assets,
            prepare_asset(&asset_id(&bytes), "image/png", bytes)?,
        )?;
        let (auth, owner, reader) = authentication()?;
        let (router, handle) = router_with_server_backups(room, auth, assets)?;
        let current = handle.capture_recovery_state("owner", &owner).await?;
        let expected = ServerRecoveryContinuationIdentity {
            origin: selected.server,
            current: current.identity(),
        };
        let (_, inventory) = current.into_parts();
        Ok(Self {
            router: Some(router),
            handle: Some(handle),
            directory,
            expected,
            original_file,
            inventory_json: inventory.to_json().into(),
            credentials,
            owner,
            reader,
        })
    }
    pub fn handle(&self) -> &ServerBackupHandle {
        self.handle.as_ref().expect("live continuation fixture")
    }
    pub fn original(&self) -> Result<ServerRoomBackup> {
        Ok(ServerRoomBackup::from_bytes(&self.original_file)?)
    }
    pub fn inventory(&self) -> Result<RoomParticipantInventory> {
        Ok(RoomParticipantInventory::from_json(
            &self.inventory_json,
            &self.expected.current.participants,
        )?)
    }
    pub async fn proof(&self) -> Result<VerifiedServerRecoveryContinuation> {
        let ServerRecoveryContinuationCoverage::Verified(proof) = self
            .handle()
            .verify_continued_recovery_state(
                "owner",
                &self.owner,
                self.original()?,
                self.expected.clone(),
                self.inventory()?,
                copy_credentials(&self.credentials),
            )
            .await?
        else {
            return Err("complete native continuation expected".into());
        };
        Ok(proof)
    }
    pub fn stop(&mut self) {
        self.router.take();
        self.handle.take();
    }
    pub fn bind(
        &mut self,
        room: Room,
        assets: AssetStore,
        auth: Authentication,
        owner: String,
        reader: String,
    ) -> Result {
        let (router, handle) = router_with_server_backups(room, auth, assets)?;
        self.router = Some(router);
        self.handle = Some(handle);
        self.owner = owner;
        self.reader = reader;
        Ok(())
    }
    pub async fn refresh(&mut self) -> Result {
        let current = self.handle().capture_recovery_state("owner", &self.owner).await?;
        self.expected.current = current.identity();
        let (_, inventory) = current.into_parts();
        self.inventory_json = inventory.to_json().into();
        Ok(())
    }
    pub fn snapshot(&self) -> Result<BTreeMap<String, Vec<u8>>> {
        fn walk(root: &Path, base: &Path, out: &mut BTreeMap<String, Vec<u8>>) -> Result {
            for entry in fs::read_dir(root)? {
                let entry = entry?;
                let path = entry.path();
                if entry.file_type()?.is_dir() {
                    walk(&path, base, out)?;
                } else {
                    out.insert(
                        path.strip_prefix(base)?.to_string_lossy().into_owned(),
                        fs::read(path)?,
                    );
                }
            }
            Ok(())
        }
        let mut out = BTreeMap::new();
        let root = self.directory.0.join("restored");
        walk(&root, &root, &mut out)?;
        Ok(out)
    }
}
