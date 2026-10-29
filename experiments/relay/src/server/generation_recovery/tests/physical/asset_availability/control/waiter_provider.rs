//! A real provider callback gate; no replacement native state or fabricated work ticket.
use super::super::super::super::source::TestResult;
use super::fixture::{Setup, operators};
use crate::{
    Error,
    server::{
        PhysicalRoomRecoveryControl, PhysicalServerRecoveryAssetCoverage,
        ServerRecoveryAssetProvider, prepare_physical_room_recovery_control,
    },
};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use std::sync::{
    Arc, Condvar, Mutex,
    atomic::{AtomicBool, Ordering},
};
pub(super) struct Gate {
    armed: AtomicBool,
    entered: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    released: Mutex<bool>,
    changed: Condvar,
}
impl Gate {
    pub fn arm(&self) {
        self.armed.store(true, Ordering::Release);
    }
    pub fn release(&self) {
        *self.released.lock().expect("test gate") = true;
        self.changed.notify_all();
    }
}
pub(super) struct Release(pub Arc<Gate>);
impl Drop for Release {
    fn drop(&mut self) {
        self.0.release();
    }
}
struct Provider {
    base: Arc<dyn ServerRecoveryAssetProvider>,
    gate: Arc<Gate>,
}
impl ServerRecoveryAssetProvider for Provider {
    fn check(&self) -> crate::Result<()> {
        self.base.check()?;
        if self.gate.armed.swap(false, Ordering::AcqRel) {
            if let Some(send) = self.gate.entered.lock().map_err(|_| Error::NeedsRecovery)?.take() {
                let _ = send.send(());
            }
            let mut released = self.gate.released.lock().map_err(|_| Error::NeedsRecovery)?;
            while !*released {
                released = self.gate.changed.wait(released).map_err(|_| Error::NeedsRecovery)?;
            }
        }
        self.base.check()
    }
    fn resolve(&self, reference: &VersionAssetReference) -> crate::Result<Option<String>> {
        self.base.resolve(reference)
    }
}
pub(super) struct Ready {
    pub router: axum::Router,
    pub control: PhysicalRoomRecoveryControl,
    pub gate: Arc<Gate>,
    pub entered: tokio::sync::oneshot::Receiver<()>,
}
pub(super) async fn prepare(setup: &Setup) -> TestResult<Ready> {
    let (send, entered) = tokio::sync::oneshot::channel();
    let gate = Arc::new(Gate {
        armed: AtomicBool::new(false),
        entered: Mutex::new(Some(send)),
        released: Mutex::new(false),
        changed: Condvar::new(),
    });
    let provider: Arc<dyn ServerRecoveryAssetProvider> =
        Arc::new(Provider { base: setup.provider.clone(), gate: gate.clone() });
    let PhysicalServerRecoveryAssetCoverage::Verified(proof) = setup
        .fixture
        .host()
        .verify_recovery_asset_availability(
            "owner",
            &setup.fixture.owner,
            setup.fixture.native.clone(),
            provider.clone(),
        )
        .await?
    else {
        return Err("actual provider proof".into());
    };
    let (router, control) = prepare_physical_room_recovery_control(
        setup.fixture.host().clone(),
        Arc::new(proof),
        provider,
        "owner",
        &setup.fixture.owner,
        operators(&setup.token)?,
    )
    .await?;
    Ok(Ready { router, control, gate, entered })
}
