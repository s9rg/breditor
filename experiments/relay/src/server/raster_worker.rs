//! Bounded admission in a trusted one-shot decoder process. The caller owns publication.
use crate::{Error, Result, assets};
use serde::{Deserialize, Serialize};
use std::{
    io::{self, Read},
    path::PathBuf,
    process::Stdio,
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

pub(super) struct Worker {
    executable: PathBuf,
    deadline: Duration,
}

impl Worker {
    pub(super) fn new(executable: PathBuf) -> Result<Self> {
        if !executable.is_absolute() {
            return Err(Error::Contract("absolute raster worker executable required"));
        }
        Ok(Self { executable, deadline: WORKER_DEADLINE })
    }

    pub(super) async fn prepare(
        &self,
        asset: &str,
        mime: &str,
        bytes: Vec<u8>,
    ) -> Result<assets::PreparedAsset> {
        assets::encoded_input(asset, mime, bytes.len())?;
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
            return Err(Error::NeedsRecovery);
        };
        if !status.success() {
            return Err(Error::NeedsRecovery);
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
            }
            Reply::Rejected => Err(Error::Contract("raster worker rejected encoded image")),
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::{fs, os::unix::fs::OpenOptionsExt, time::Instant};

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
