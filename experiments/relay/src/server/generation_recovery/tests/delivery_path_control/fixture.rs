//! Real native histories, independent operator credentials and actual raster-backed mapping.
use super::super::source::{Source, TestResult, authentication};
use crate::server::{
    Authentication, PreparedLogGenerationRecoveryHost,
    ServerLogGenerationDeliveryPathRecoveryControl,
    ServerLogGenerationDeliveryPathRecoveryControlIdentity,
    ServerLogGenerationRecoveryAssetCoverage, ServerLogGenerationRecoveryCoverage,
    ServerRecoveryAssetProvider, prepare_log_generation_delivery_path_recovery_control,
    prepare_log_generation_delivery_recovery_control, prepare_log_generation_recovery_control,
    prepare_log_generation_recovery_host,
};
use crate::{Error, Role, ServerLogGenerationRoomBackup};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use std::{
    io::Cursor,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};
pub(super) const ORIGIN: &str = "http://127.0.0.1:4187";
pub(super) struct Gate {
    entered: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    released: Mutex<bool>,
    wake: Condvar,
}
pub(super) struct GateRelease(Arc<Gate>);
impl Drop for GateRelease {
    fn drop(&mut self) {
        self.0.release();
    }
}
impl Gate {
    pub fn release_on_drop(self: &Arc<Self>) -> GateRelease {
        GateRelease(self.clone())
    }
    pub fn new() -> (Arc<Self>, tokio::sync::oneshot::Receiver<()>) {
        let (send, receive) = tokio::sync::oneshot::channel();
        (
            Arc::new(Self {
                entered: Mutex::new(Some(send)),
                released: Mutex::new(false),
                wake: Condvar::new(),
            }),
            receive,
        )
    }
    pub fn release(&self) {
        *self.released.lock().expect("gate") = true;
        self.wake.notify_all();
    }
    fn wait(&self) -> crate::Result<()> {
        if let Some(send) = self.entered.lock().map_err(|_| Error::NeedsRecovery)?.take() {
            let _ = send.send(());
        }
        let mut ready = self.released.lock().map_err(|_| Error::NeedsRecovery)?;
        while !*ready {
            ready = self.wake.wait(ready).map_err(|_| Error::NeedsRecovery)?;
        }
        Ok(())
    }
}
pub(super) struct Provider {
    pub allowed: AtomicBool,
    pub calls: AtomicUsize,
    pub gate: Mutex<Option<Arc<Gate>>>,
    content: String,
}
impl ServerRecoveryAssetProvider for Provider {
    fn check(&self) -> crate::Result<()> {
        if !self.allowed.load(Ordering::Acquire) {
            return Err(Error::Permission);
        }
        Ok(())
    }
    fn resolve(&self, reference: &VersionAssetReference) -> crate::Result<Option<String>> {
        self.calls.fetch_add(1, Ordering::AcqRel);
        let gate = self.gate.lock().map_err(|_| Error::NeedsRecovery)?.take();
        if let Some(gate) = gate {
            gate.wait()?;
        }
        Ok((reference.asset == "asset" && reference.generation == "generation")
            .then(|| self.content.clone()))
    }
}
pub(super) fn png(width: u32, height: u32) -> TestResult<Vec<u8>> {
    let mut bytes = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(width, height).write_to(&mut bytes, image::ImageFormat::Png)?;
    Ok(bytes.into_inner())
}
fn operators(token: &str) -> TestResult<Authentication> {
    Ok(Authentication::from_json(&serde_json::json!({"format":"breditor/relay-auth","formatVersion":1,"origins":[ORIGIN],"accounts":[{"principal":"operator","tokenHash":crate::credentials::hash(token)?}]}).to_string())?)
}
pub(super) struct Setup {
    pub source: Source,
    pub host: Option<PreparedLogGenerationRecoveryHost>,
    pub owner: String,
    pub reader: String,
    pub token: String,
    pub provider: Arc<Provider>,
    pub control: Option<ServerLogGenerationDeliveryPathRecoveryControl>,
    pub router: axum::Router,
}
impl Setup {
    pub async fn new(
        profile: (u32, bool),
        atomic: bool,
        document: bool,
        review: bool,
    ) -> TestResult<Self> {
        let source = Source::new(profile, atomic, document, review)?;
        let (auth, owner, reader) = authentication()?;
        let host = Box::pin(prepare_log_generation_recovery_host(
            source.operation("delivery-path-control")?,
            auth,
            source.original_copy()?,
            &source.original.info()?.identity,
            "owner",
            &owner,
        ))
        .await?;
        host.host
            .transaction(|room| {
                room.grant("owner", "delivery-middle", Some(Role::Reader))?;
                room.rotate_log_generation("owner", "delivery-middle")?;
                Ok(())
            })
            .await?;
        let previous = host.capture_recovery_state("owner", &owner).await?.into_parts().0;
        let before = previous.info()?.identity;
        host.host
            .transaction(|room| {
                room.grant("owner", "delivery-current-reader", Some(Role::Reader))?;
                room.rotate_log_generation("owner", "delivery-current").map(|_| ())
            })
            .await?;
        let middle = host.capture_recovery_state("owner", &owner).await?.into_parts().0;
        host.host
            .transaction(|room| {
                room.grant("owner", "path-final-reader", Some(Role::Reader))?;
                room.rotate_log_generation("owner", "path-final").map(|_| ())
            })
            .await?;
        let capture = host.capture_recovery_state("owner", &owner).await?;
        let expected = capture.identity()?;
        let (_, inventory) = capture.into_parts();
        let ServerLogGenerationRecoveryCoverage::Verified(native) = host
            .verify_selected_recovery_state(
                "owner",
                &owner,
                expected,
                inventory,
                source.protected_records(),
            )
            .await?
        else {
            return Err("all actual protected streams required".into());
        };
        let native = Arc::new(native);
        let continuation = Arc::new(
            host.verify_delivery_continuation(
                "owner",
                &owner,
                ServerLogGenerationRoomBackup::from_owned_bytes(previous.to_bytes()?)?,
                &before,
                native.clone(),
            )
            .await?,
        );
        let path = super::path::verify(&host, &owner, &previous, &middle, native.clone()).await?;
        let provider = Arc::new(Provider {
            allowed: AtomicBool::new(true),
            calls: AtomicUsize::new(0),
            gate: Mutex::new(None),
            content: crate::assets::asset_id(&png(2, 3)?),
        });
        let ServerLogGenerationRecoveryAssetCoverage::Verified(assets) = host
            .verify_recovery_asset_availability("owner", &owner, native, provider.clone())
            .await?
        else {
            return Err("actual complete raster proof required".into());
        };
        let (token, _) = Authentication::issue_token()?;
        let (_, current) = prepare_log_generation_recovery_control(
            host.clone(),
            Arc::new(assets),
            provider.clone(),
            "owner",
            &owner,
            operators(&token)?,
        )
        .await?;
        let (_, control) =
            prepare_log_generation_delivery_recovery_control(current, continuation).await?;
        let (router, control) =
            prepare_log_generation_delivery_path_recovery_control(control, path).await?;
        Ok(Self {
            source,
            host: Some(host),
            owner,
            reader,
            token,
            provider,
            control: Some(control),
            router,
        })
    }
    pub fn selection(&self) -> ServerLogGenerationDeliveryPathRecoveryControlIdentity {
        self.control.as_ref().expect("live control").identity()
    }
}
