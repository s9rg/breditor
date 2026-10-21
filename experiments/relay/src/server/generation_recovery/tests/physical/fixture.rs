//! Actual complete A and later B archives. Every restored host keeps B as its local origin.
use super::super::source::{POLICY, Source, TestResult, authentication};
use crate::{
    OperationalLogGenerationServerRoom, Role, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomRecovery,
    assets::{AssetStore, asset_id, prepare_asset},
    server::{
        PreparedLogGenerationRecoveryHost, PreparedPhysicalRoomRecoveryHost,
        prepare_log_generation_recovery_host, prepare_physical_room_recovery_host,
    },
};
use std::io::Cursor;

pub(super) struct PhysicalSource {
    pub source: Source,
    pub local: ServerLogGenerationRoomBackup,
}
pub(super) fn add_raster(
    room: &mut crate::Room,
    assets: &mut AssetStore,
    width: u32,
) -> crate::Result<()> {
    let mut bytes = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(width, width + 1)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .map_err(|_| crate::Error::Contract("test raster encoding"))?;
    let bytes = bytes.into_inner();
    room.put_asset("owner", assets, prepare_asset(&asset_id(&bytes), "image/png", bytes)?)?;
    Ok(())
}
impl PhysicalSource {
    pub fn new(
        profile: (u32, bool),
        atomic: bool,
        document: bool,
        review: bool,
    ) -> TestResult<Self> {
        let source = Source::new(profile, atomic, document, review)?;
        let mut operation = source.operation("build-later")?;
        let (room, assets) = operation.components_mut();
        room.grant("owner", "reader", Some(Role::Editor))?;
        room.rotate_log_generation("owner", "later-local-origin")?;
        add_raster(room, assets, 4)?;
        let local = ServerLogGenerationRoomBackup::capture(room, assets, "owner")?;
        local.check_archive_ancestor(&source.original)?;
        assert_ne!(local.info()?.identity, source.original.info()?.identity);
        drop(operation);
        Ok(Self { source, local })
    }
    pub fn operation(&self, name: &str) -> TestResult<OperationalLogGenerationServerRoom> {
        let selected = self.local.info()?.identity;
        Ok(ServerLogGenerationRoomRecovery::begin(
            &self.source.directory.0.join(name),
            &self.local,
            &selected,
            POLICY,
        )?
        .finish(&self.local)?
        .begin_operation(&self.local, &selected, POLICY, "owner")?)
    }
    pub fn local_copy(&self) -> TestResult<ServerLogGenerationRoomBackup> {
        Ok(ServerLogGenerationRoomBackup::from_owned_bytes(self.local.to_bytes()?)?)
    }
    pub async fn local_host(
        &self,
        name: &str,
    ) -> TestResult<(PreparedLogGenerationRecoveryHost, String, String)> {
        let (auth, owner, reader) = authentication()?;
        let host = Box::pin(prepare_log_generation_recovery_host(
            self.operation(name)?,
            auth,
            self.local_copy()?,
            &self.local.info()?.identity,
            "owner",
            &owner,
        ))
        .await?;
        Ok((host, owner, reader))
    }
    pub async fn physical_host(
        &self,
        name: &str,
    ) -> TestResult<(PreparedPhysicalRoomRecoveryHost, String, String)> {
        let (host, _, owner, reader) = Box::pin(self.paired_host(name)).await?;
        Ok((host, owner, reader))
    }
    pub async fn paired_host(
        &self,
        name: &str,
    ) -> TestResult<(
        PreparedPhysicalRoomRecoveryHost,
        PreparedLogGenerationRecoveryHost,
        String,
        String,
    )> {
        let (local, owner, reader) = Box::pin(self.local_host(name)).await?;
        let host = Box::pin(prepare_physical_room_recovery_host(
            local.clone(),
            self.source.original_copy()?,
            &self.source.original.info()?.identity,
            &self.local.info()?.identity,
            "owner",
            &owner,
        ))
        .await?;
        Ok((host, local, owner, reader))
    }
}
