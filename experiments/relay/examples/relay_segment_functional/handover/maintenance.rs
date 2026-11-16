//! Private stdin commands for exercising maintenance against the real serving handle.
use super::{Result, next_input};
use breditor_collab_relay::{
    ServerNativeHistoryBoundary, ServerNativeHistoryLane, server::ServerBackupHandle,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io::Write;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Command {
    principal: String,
    token: String,
    action: Action,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Action {
    Describe,
    Capacity,
    Boundary { lane: ServerNativeHistoryLane, boundary: ServerNativeHistoryBoundary },
    Rotate { next: String },
}

impl Command {
    async fn run(self, handle: &ServerBackupHandle) -> Result<Value> {
        let Self { principal, token, action } = self;
        Ok(match action {
            Action::Describe => {
                serde_json::to_value(handle.native_history_descriptor(&principal, &token).await?)?
            }
            Action::Capacity => {
                serde_json::to_value(handle.storage_capacity(&principal, &token).await?)?
            }
            Action::Boundary { lane, boundary } => serde_json::to_value(
                handle.apply_native_history_boundary(&principal, &token, lane, boundary).await?,
            )?,
            Action::Rotate { next } => serde_json::to_value(
                handle.rotate_log_generation(&principal, &token, &next).await?,
            )?,
        })
    }
}

pub(super) fn serve(handle: ServerBackupHandle) -> tokio::task::JoinHandle<Result> {
    let runtime = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || {
        while let Some(line) = next_input()? {
            let command: Command = serde_json::from_slice(&line)?;
            let reply = match runtime.block_on(command.run(&handle)) {
                Ok(result) => json!({"kind":"maintenance", "result":result}),
                Err(error) => json!({"kind":"maintenance", "error":error.to_string()}),
            };
            let mut stdout = std::io::stdout().lock();
            writeln!(stdout, "{reply}")?;
            stdout.flush()?;
        }
        Ok(())
    })
}
