//! Closing the explicit operator guard cannot release an actual in-flight blocking native worker.
use super::super::super::{
    super::source::{POLICY, TestResult},
    history::continue_history,
};
use super::{
    fixture::{Setup, operators},
    network::{Network, Request},
};
use crate::{
    Error, OperationalLogGenerationServerRoom,
    server::{
        PhysicalServerRecoveryAssetCoverage, ServerRecoveryAssetProvider,
        prepare_physical_room_recovery_control,
    },
};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use std::{
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::Duration,
};

struct Pause {
    armed: AtomicBool,
    entered: mpsc::SyncSender<()>,
    release: Mutex<bool>,
    changed: Condvar,
}
struct Guard {
    base: Arc<dyn ServerRecoveryAssetProvider>,
    pause: Arc<Pause>,
}
impl ServerRecoveryAssetProvider for Guard {
    fn check(&self) -> crate::Result<()> {
        self.base.check()?;
        if self.pause.armed.swap(false, Ordering::AcqRel) {
            self.pause.entered.try_send(()).map_err(|_| Error::NeedsRecovery)?;
            let release = self.pause.release.lock().map_err(|_| Error::NeedsRecovery)?;
            let (released, _) = self
                .pause
                .changed
                .wait_timeout_while(release, Duration::from_secs(5), |released| !*released)
                .map_err(|_| Error::NeedsRecovery)?;
            if !*released {
                return Err(Error::NeedsRecovery);
            }
        }
        self.base.check()
    }
    fn resolve(&self, reference: &VersionAssetReference) -> crate::Result<Option<String>> {
        self.base.resolve(reference)
    }
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn closing_operator_guard_during_actual_native_work_refuses_result_and_retains_lease_until_done()
-> TestResult {
    let mut setup = Box::pin(Setup::new((3, true), true)).await?;
    drop(setup.control.take());
    let (entered, received) = mpsc::sync_channel(1);
    let pause = Arc::new(Pause {
        armed: AtomicBool::new(false),
        entered,
        release: Mutex::new(false),
        changed: Condvar::new(),
    });
    let provider: Arc<dyn ServerRecoveryAssetProvider> =
        Arc::new(Guard { base: setup.provider.clone(), pause: pause.clone() });
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
        return Err("actual paused-provider proof".into());
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
    let body = serde_json::to_vec(&control.identity())?;
    let network = Arc::new(Network::start(router).await?);
    pause.armed.store(true, Ordering::Release);
    let request_network = network.clone();
    let token = setup.token.clone();
    let request = tokio::spawn(async move {
        request_network
            .request(&Request::check(&token), &body)
            .await
            .map_err(|error| error.to_string())
    });
    tokio::task::spawn_blocking(move || received.recv_timeout(Duration::from_secs(5))).await??;
    setup.fixture.stop();
    drop(control);
    let locked = OperationalLogGenerationServerRoom::resume(
        &setup.fixture.destination,
        &setup.fixture.source.local,
        &setup.fixture.source.local.info()?.identity,
        POLICY,
        "owner",
    )
    .is_err();
    *pause.release.lock().map_err(|_| "pause release")? = true;
    pause.changed.notify_all();
    assert!(
        locked,
        "The actual worker must retain native ownership after the public control guard is gone"
    );
    assert_eq!(request.await?.map_err(|error| format!("test HTTP: {error}"))?.status, 503);
    let mut operation = OperationalLogGenerationServerRoom::resume(
        &setup.fixture.destination,
        &setup.fixture.source.local,
        &setup.fixture.source.local.info()?.identity,
        POLICY,
        "owner",
    )?;
    continue_history(
        &mut operation,
        &setup.fixture.source.local,
        &setup.fixture.source.source,
        true,
    )?;
    Arc::try_unwrap(network).map_err(|_| "test network still borrowed")?.stop().await?;
    Ok(())
}
