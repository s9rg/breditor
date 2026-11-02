//! Stop every HTTP/WebSocket task gracefully before releasing Native custody.
use super::Result;
use tokio::{net::TcpListener, sync::oneshot, task::JoinHandle};

pub(super) struct Running {
    stop: oneshot::Sender<()>,
    task: JoinHandle<std::io::Result<()>>,
}
pub(super) fn start(router: axum::Router, listener: TcpListener) -> Running {
    let (stop, closed) = oneshot::channel();
    let task = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = closed.await;
            })
            .await
    });
    Running { stop, task }
}
impl Running {
    pub(super) async fn close(self) -> Result {
        let _ = self.stop.send(());
        let stopped = tokio::time::timeout(std::time::Duration::from_secs(30), self.task).await?;
        stopped??;
        Ok(())
    }
}
