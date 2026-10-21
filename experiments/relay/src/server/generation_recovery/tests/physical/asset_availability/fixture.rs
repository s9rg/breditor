//! Real continued B-origin native host, later peer image history and all seven protected streams.
use super::super::super::source::{TestResult, authentication, send};
use super::super::fixture::PhysicalSource;
use crate::{
    OperationalLogGenerationServerRoom, RecoveryDocumentCredential,
    RecoveryRegistrationCredentials, Registration,
    assets::asset_id,
    server::{
        PhysicalServerRoomRecoveryCoverage, PhysicalServerRoomRecoveryStateIdentity,
        PreparedLogGenerationRecoveryHost, PreparedPhysicalRoomRecoveryHost,
        VerifiedPhysicalServerRoomRecoveryState, prepare_log_generation_recovery_host,
        prepare_physical_room_recovery_host,
    },
};
use breditor_collab_feasibility::rich_replica::{Command, actions::ReplaceImage};
use std::{io::Cursor, path::PathBuf, sync::Arc};

pub(super) fn raster(format: image::ImageFormat) -> TestResult<Vec<u8>> {
    let mut bytes = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3).write_to(&mut bytes, format)?;
    Ok(bytes.into_inner())
}
pub(super) struct Fixture {
    pub source: PhysicalSource,
    pub destination: PathBuf,
    pub host: Option<PreparedPhysicalRoomRecoveryHost>,
    pub local: Option<PreparedLogGenerationRecoveryHost>,
    pub native: Arc<VerifiedPhysicalServerRoomRecoveryState>,
    pub peer: Registration,
    pub expected: PhysicalServerRoomRecoveryStateIdentity,
    pub owner: String,
    pub reader: String,
}
fn append_peer_images(
    source: &PhysicalSource,
    operation: &mut OperationalLogGenerationServerRoom,
    atomic: bool,
) -> TestResult<Registration> {
    let room = operation.room_mut();
    let peer = room.register("owner")?;
    let mut client = source.source.profile.join_frame(
        "room".into(),
        peer.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    client.apply(vec![
        Command::ReplaceImage(ReplaceImage {
            block: "image-block".into(),
            asset: asset_id(&raster(image::ImageFormat::Jpeg)?),
            generation: "provider-jpeg".into(),
        }),
        Command::ReplaceImage(ReplaceImage {
            block: "image-block".into(),
            asset: asset_id(&raster(image::ImageFormat::WebP)?),
            generation: "provider-webp".into(),
        }),
        Command::ReplaceImage(ReplaceImage {
            block: "image-block".into(),
            asset: "asset".into(),
            generation: "provider-current".into(),
        }),
    ])?;
    send(room, &client, "owner", &peer.lease, "0", atomic)?;
    Ok(peer)
}
fn supplied(source: &PhysicalSource, peer: &Registration) -> RecoveryRegistrationCredentials {
    let mut input = source.source.protected_records();
    input.documents.push(RecoveryDocumentCredential {
        principal: "owner".into(),
        writer: peer.lease.writer.clone(),
        credential: peer.credential.clone(),
    });
    input
}
impl Fixture {
    pub async fn new(profile: (u32, bool), atomic: bool) -> TestResult<Self> {
        let source = PhysicalSource::new(profile, atomic, true, true)?;
        let destination = source.source.directory.0.join("provider-current");
        let mut operation = source.operation("provider-current")?;
        // Never reuse the old offline author's ID for these later peer operations.
        let peer = append_peer_images(&source, &mut operation, atomic)?;
        let (auth, owner, reader) = authentication()?;
        let local = Box::pin(prepare_log_generation_recovery_host(
            operation,
            auth,
            source.local_copy()?,
            &source.local.info()?.identity,
            "owner",
            &owner,
        ))
        .await?;
        let host = Box::pin(prepare_physical_room_recovery_host(
            local.clone(),
            source.source.original_copy()?,
            &source.source.original.info()?.identity,
            &source.local.info()?.identity,
            "owner",
            &owner,
        ))
        .await?;
        let captured = host.capture_recovery_state("owner", &owner).await?;
        let expected = captured.identity()?;
        assert_eq!(expected.ancestor, source.source.original.info()?.identity);
        assert_eq!(expected.local_origin, source.local.info()?.identity);
        assert!(
            expected.server.native.source.records > expected.local_origin.native.source.records
        );
        assert_eq!(expected.server.assets, expected.local_origin.assets);
        let (_, inventory) = captured.into_parts();
        let PhysicalServerRoomRecoveryCoverage::Pending { missing } = host
            .verify_selected_recovery_state(
                "owner",
                &owner,
                expected.clone(),
                inventory.clone(),
                source.source.protected_records(),
            )
            .await?
        else {
            return Err("later peer protected input was not required".into());
        };
        assert_eq!(missing.len(), 1);
        let PhysicalServerRoomRecoveryCoverage::Verified(native) = host
            .verify_selected_recovery_state(
                "owner",
                &owner,
                expected.clone(),
                inventory,
                supplied(&source, &peer),
            )
            .await?
        else {
            return Err("all seven current protected records did not verify".into());
        };
        Ok(Self {
            source,
            destination,
            host: Some(host),
            local: Some(local),
            native: Arc::new(native),
            peer,
            expected,
            owner,
            reader,
        })
    }
    pub fn host(&self) -> &PreparedPhysicalRoomRecoveryHost {
        self.host.as_ref().expect("actual fixture host")
    }
    pub fn local(&self) -> &PreparedLogGenerationRecoveryHost {
        self.local.as_ref().expect("actual fixture local host")
    }
    pub fn credentials(&self) -> RecoveryRegistrationCredentials {
        supplied(&self.source, &self.peer)
    }
    pub fn stop(&mut self) {
        self.host.take();
        self.local.take();
    }
}
