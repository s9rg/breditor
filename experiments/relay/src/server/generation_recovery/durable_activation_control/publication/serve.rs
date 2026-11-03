//! A cancelled close waiter cannot drop or recreate an actual server task.
use super::super::DurableNativeActivationControl;
use crate::{Error, Result};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use tokio::{net::TcpListener, runtime::Handle, sync::oneshot, task::JoinHandle};

type ServerTask = JoinHandle<std::io::Result<()>>;
pub(super) struct Serving {
    stop: Mutex<Option<oneshot::Sender<()>>>,
    task: tokio::sync::Mutex<Option<ServerTask>>,
    failed: AtomicBool,
}
impl Serving {
    /// The future retains the actual activation owner until normal serving and
    /// graceful connection drainage have really ended, independently of HTTP.
    pub fn start(
        runtime: &Handle,
        listener: TcpListener,
        router: axum::Router,
        control: Arc<DurableNativeActivationControl>,
    ) -> Arc<Self> {
        let (stop, stopped) = oneshot::channel();
        let task = runtime.spawn(async move {
            let _actual_native_owner = control;
            axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = stopped.await;
                })
                .await
        });
        Arc::new(Self {
            stop: Mutex::new(Some(stop)),
            task: tokio::sync::Mutex::new(Some(task)),
            failed: AtomicBool::new(false),
        })
    }
    pub fn signal(&self) -> Result<()> {
        if let Some(stop) = self.stop.lock().map_err(|_| Error::NeedsRecovery)?.take() {
            let _ = stop.send(());
        }
        Ok(())
    }
    pub fn running(&self) -> bool {
        self.task.try_lock().is_ok_and(|task| task.as_ref().is_some_and(|job| !job.is_finished()))
    }
    pub async fn wait(&self) -> Result<()> {
        let mut held = self.task.lock().await;
        if let Some(task) = held.as_mut() {
            let failed = !matches!(task.await, Ok(Ok(())));
            // This handle is removed only after its actual terminal observation.
            // Cancellation before that point leaves the same handle for retry.
            *held = None;
            self.failed.store(failed, Ordering::Release);
        }
        if self.failed.load(Ordering::Acquire) { Err(Error::NeedsRecovery) } else { Ok(()) }
    }
}
impl Drop for Serving {
    fn drop(&mut self) {
        if let Ok(stop) = self.stop.get_mut()
            && let Some(stop) = stop.take()
        {
            let _ = stop.send(());
        }
        // A detached Tokio task still retains its actual Native owner until the
        // shutdown future finishes. Dropping this handle is not proof of closure.
    }
}
