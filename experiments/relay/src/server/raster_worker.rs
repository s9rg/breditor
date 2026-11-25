//! Bounded admission in a trusted one-shot decoder process. The caller owns publication.
use crate::{Error, Result, assets};
use serde::{Deserialize, Serialize};
use std::{
    io::{self, Read},
    path::PathBuf,
    process::Stdio,
    sync::{Arc, Mutex, PoisonError},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
};

const WORKER_DEADLINE: Duration = Duration::from_secs(15);
const MAX_REPLY_BYTES: u64 = 1024;

#[derive(Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
enum Reply {
    Admitted { info: assets::AssetInfo },
    Rejected,
}

/// Read one bounded encoded payload and write one closed admission receipt.
/// # Errors
/// Returns an error if the request bytes or response channel cannot be read or written.
pub fn run_worker(asset: &str, mime: &str) -> Result<()> {
    let mut bytes = Vec::new();
    io::stdin().lock().take(assets::MAX_ASSET_BYTES + 1).read_to_end(&mut bytes)?;
    let reply = match assets::prepare_asset(asset, mime, bytes) {
        Ok(admitted) => Reply::Admitted { info: admitted.info().clone() },
        Err(_) => Reply::Rejected,
    };
    serde_json::to_writer(io::stdout().lock(), &reply)?;
    Ok(())
}

/// Completed raster admission checks in one isolated room worker pool.
#[derive(Clone, Copy, Debug, Default, Serialize)]
pub struct RasterWorkerStats {
    /// Validated inputs eligible for the subsequent room publication check.
    pub admitted: u64,
    /// Encoded inputs refused by the asset contract.
    pub rejected: u64,
    /// Workers whose exchange exceeded the deadline.
    pub timed_out: u64,
    /// Failed worker exchanges, processes, or receipts.
    pub failed: u64,
}

/// A private, host-owned view of raster worker outcomes. No request data is retained.
#[derive(Clone, Default)]
pub struct RasterWorkerMonitor(Arc<Mutex<RasterWorkerStats>>);

impl RasterWorkerMonitor {
    /// Copy the aggregate counters for this router instance.
    pub fn snapshot(&self) -> RasterWorkerStats {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn record(&self, result: &std::result::Result<assets::PreparedAsset, WorkerFailure>) {
        let mut stats = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        let count = match result {
            Ok(_) => &mut stats.admitted,
            Err(WorkerFailure::Rejected(_)) => &mut stats.rejected,
            Err(WorkerFailure::TimedOut) => &mut stats.timed_out,
            Err(WorkerFailure::Failed(_)) => &mut stats.failed,
        };
        *count = count.saturating_add(1);
    }
}

enum WorkerFailure {
    Rejected(Error),
    TimedOut,
    Failed(Error),
}

impl From<Error> for WorkerFailure {
    fn from(error: Error) -> Self {
        Self::Failed(error)
    }
}

impl From<io::Error> for WorkerFailure {
    fn from(error: io::Error) -> Self {
        Self::Failed(error.into())
    }
}

pub(super) struct Worker {
    executable: PathBuf,
    deadline: Duration,
    monitor: RasterWorkerMonitor,
}

impl Worker {
    pub(super) fn new(executable: PathBuf) -> Result<Self> {
        if !executable.is_absolute() {
            return Err(Error::Contract("absolute raster worker executable required"));
        }
        Ok(Self { executable, deadline: WORKER_DEADLINE, monitor: RasterWorkerMonitor::default() })
    }

    pub(super) fn monitor(&self) -> RasterWorkerMonitor {
        self.monitor.clone()
    }

    pub(super) async fn prepare(
        &self,
        asset: &str,
        mime: &str,
        bytes: Vec<u8>,
    ) -> Result<assets::PreparedAsset> {
        let result = self.admit(asset, mime, bytes).await;
        self.monitor.record(&result);
        result.map_err(|error| match error {
            WorkerFailure::Rejected(error) | WorkerFailure::Failed(error) => error,
            WorkerFailure::TimedOut => Error::NeedsRecovery,
        })
    }

    async fn admit(
        &self,
        asset: &str,
        mime: &str,
        bytes: Vec<u8>,
    ) -> std::result::Result<assets::PreparedAsset, WorkerFailure> {
        assets::encoded_input(asset, mime, bytes.len()).map_err(WorkerFailure::Rejected)?;
        let mut child = Command::new(&self.executable)
            .args(["raster-worker-v1", asset, mime])
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()?;
        let mut input = child.stdin.take().ok_or(Error::NeedsRecovery)?;
        let mut output = child.stdout.take().ok_or(Error::NeedsRecovery)?.take(MAX_REPLY_BYTES + 1);
        let exchange = tokio::time::timeout(self.deadline, async {
            let send = async {
                input.write_all(&bytes).await?;
                input.shutdown().await?;
                drop(input);
                Ok(())
            };
            let receive = async {
                let mut reply = Vec::new();
                let size = output.read_to_end(&mut reply).await?;
                if u64::try_from(size).unwrap_or(u64::MAX) > MAX_REPLY_BYTES {
                    return Err(io::Error::other("raster worker reply exceeds its budget"));
                }
                Ok(reply)
            };
            tokio::try_join!(send, receive, child.wait())
        })
        .await;
        let Ok(Ok(((), reply, status))) = exchange else {
            // Keep the caller's slot until the failed or timed-out process is reaped.
            let _ = child.kill().await;
            child.wait().await?;
            return Err(if exchange.is_err() {
                WorkerFailure::TimedOut
            } else {
                Error::NeedsRecovery.into()
            });
        };
        if !status.success() {
            return Err(Error::NeedsRecovery.into());
        }
        match serde_json::from_slice(&reply).map_err(|_| Error::NeedsRecovery)? {
            Reply::Admitted { info } => {
                // Recheck the admission binding against the original parent-owned bytes.
                let asset = asset.to_owned();
                let mime = mime.to_owned();
                tokio::task::spawn_blocking(move || {
                    assets::PreparedAsset::from_worker(info, &asset, &mime, bytes)
                })
                .await
                .map_err(|_| Error::NeedsRecovery)?
                .map_err(WorkerFailure::Failed)
            }
            Reply::Rejected => Err(WorkerFailure::Rejected(Error::Contract(
                "raster worker rejected encoded image",
            ))),
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::{fs, os::unix::fs::OpenOptionsExt, time::Instant};

    #[tokio::test]
    async fn observes_failed_processes_separately_from_refused_input() -> Result<()> {
        let executable = std::env::current_exe()?.join("unavailable-raster-worker");
        let worker = Worker::new(executable)?;
        let bytes = b"fixture raster bytes".to_vec();
        let asset = assets::asset_id(&bytes);
        assert!(matches!(
            worker.prepare(&asset, "image/png", bytes.clone()).await,
            Err(Error::Io(_))
        ));
        assert!(matches!(
            worker.prepare(&asset, "image/tiff", bytes).await,
            Err(Error::Contract(_))
        ));
        let stats = worker.monitor().snapshot();
        assert_eq!((stats.admitted, stats.rejected, stats.timed_out, stats.failed), (0, 1, 0, 1));
        Ok(())
    }

    #[tokio::test]
    async fn times_out_and_reaps_a_worker_that_stops_responding() -> Result<()> {
        use std::io::Write;

        let dir =
            std::env::temp_dir().join(format!("breditor-raster-worker-{}", std::process::id()));
        fs::create_dir(&dir)?;
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(dir.clone());
        let executable = dir.join("wait-worker");
        let mut file =
            fs::OpenOptions::new().write(true).create_new(true).mode(0o700).open(&executable)?;
        file.write_all(b"#!/bin/sh\nprintf '%s\\n' \"$$\" > \"${0}.pid\"\nexec /bin/sleep 30\n")?;
        drop(file);
        let mut worker = Worker::new(executable)?;
        worker.deadline = Duration::from_millis(500);
        let bytes = b"fixture raster bytes".to_vec();
        let start = Instant::now();
        let result = worker.prepare(&assets::asset_id(&bytes), "image/png", bytes).await;
        assert!(matches!(result, Err(Error::NeedsRecovery)));
        let stats = worker.monitor().snapshot();
        assert_eq!((stats.admitted, stats.rejected, stats.timed_out, stats.failed), (0, 0, 1, 0));
        let elapsed = start.elapsed();
        assert!(elapsed >= worker.deadline && elapsed < Duration::from_secs(5));
        let pid: u32 = fs::read_to_string(dir.join("wait-worker.pid"))?
            .trim()
            .parse()
            .map_err(io::Error::other)?;
        assert!(pid > 0);
        let observed =
            std::process::Command::new("/bin/kill").args(["-0", &pid.to_string()]).output()?;
        assert!(!observed.status.success(), "timed-out worker still exists");
        Ok(())
    }
}
