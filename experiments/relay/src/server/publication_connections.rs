//! Opt-in publication tracks actual upgrade futures through their native cleanup.
//! Ordinary routers have no drain owner and retain their existing lifecycle.
use crate::{Error, Result};
use std::sync::{Arc, Mutex};
use tokio::sync::{Notify, watch};

#[derive(Default)]
struct State {
    stopped: bool,
    connections: usize,
    failed: bool,
}
pub(super) struct Connections {
    state: Mutex<State>,
    stopped: watch::Sender<bool>,
    changed: Notify,
}
impl Connections {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(State::default()),
            stopped: watch::channel(false).0,
            changed: Notify::new(),
        })
    }
    pub fn enter(self: &Arc<Self>) -> Result<Connection> {
        let mut held = self.state.lock().map_err(|_| Error::NeedsRecovery)?;
        if held.stopped {
            return Err(Error::NeedsRecovery);
        }
        held.connections = held.connections.checked_add(1).ok_or(Error::NeedsRecovery)?;
        Ok(Connection { owner: self.clone(), started: false, finished: false })
    }
    pub fn stop(&self) -> Result<()> {
        let mut held = self.state.lock().map_err(|_| Error::NeedsRecovery)?;
        held.stopped = true;
        self.stopped.send_replace(true);
        Ok(())
    }
    pub fn is_stopped(&self) -> bool {
        *self.stopped.borrow()
    }
    pub async fn stopped(&self) {
        let mut receiver = self.stopped.subscribe();
        let _ = receiver.wait_for(|stopped| *stopped).await;
    }
    pub async fn drained(&self) -> Result<()> {
        loop {
            // Register before observing the real count. notify_waiters must not
            // be lost between that observation and this future's next poll.
            let changed = self.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            {
                let held = self.state.lock().map_err(|_| Error::NeedsRecovery)?;
                if !held.stopped {
                    return Err(Error::NeedsRecovery);
                }
                if held.connections == 0 {
                    return if held.failed { Err(Error::NeedsRecovery) } else { Ok(()) };
                }
            }
            changed.await;
        }
    }
    #[cfg(test)]
    pub fn count(&self) -> usize {
        self.state.lock().expect("actual publication connection count").connections
    }
}
pub(super) struct Connection {
    owner: Arc<Connections>,
    started: bool,
    finished: bool,
}
impl Connection {
    pub fn start(&mut self) {
        self.started = true;
    }
    pub fn finish(&mut self) {
        self.finished = true;
    }
}
impl Drop for Connection {
    fn drop(&mut self) {
        if let Ok(mut held) = self.owner.state.lock() {
            held.connections -= 1;
            held.failed |= self.started && !self.finished;
            self.owner.changed.notify_waiters();
        }
    }
}

/// Stop only socket waiting. Never cancel an actual admitted native dispatch;
/// the connection returns its ticket after `release_connection` has settled.
pub(super) async fn stopped(owner: Option<&Connections>) {
    if let Some(owner) = owner {
        owner.stopped().await;
    } else {
        std::future::pending::<()>().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn native_publication_failed_upgrade_never_started_native_cleanup() -> Result<()> {
        let owner = Connections::new();
        let unstarted_upgrade = owner.enter()?;
        owner.stop()?;
        drop(unstarted_upgrade);
        owner.drained().await?;
        assert!(owner.enter().is_err());
        Ok(())
    }

    #[tokio::test]
    async fn native_publication_aborted_started_connection_never_certifies_clean_drain()
    -> Result<()> {
        let owner = Connections::new();
        let mut connection = owner.enter()?;
        let (entered, waiting) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            connection.start();
            let _ = entered.send(());
            std::future::pending::<()>().await;
            connection.finish();
        });
        waiting.await.map_err(|_| Error::NeedsRecovery)?;
        owner.stop()?;
        task.abort();
        assert!(task.await.expect_err("actual connection task cancelled").is_cancelled());
        assert_eq!(owner.count(), 0);
        assert!(matches!(owner.drained().await, Err(Error::NeedsRecovery)));
        assert!(matches!(owner.drained().await, Err(Error::NeedsRecovery)));
        Ok(())
    }
}
