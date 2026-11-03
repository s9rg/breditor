//! Bounded PRIVATE parent/child IPC. Never install these commands as HTTP routes.
use super::{Result, setup::Ready};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io::{Read, Write};

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum Request {
    Snapshot {
        request: u64,
    },
    PrepareActivation {
        request: u64,
        source: Box<breditor_collab_relay::server::ServerLogGenerationRecoveryStateIdentity>,
    },
    PrepareJointActivation {
        request: u64,
        source: Box<breditor_collab_relay::server::ServerLogGenerationRecoveryStateIdentity>,
    },
    ObservePublication {
        request: u64,
    },
    SnapshotAfter {
        request: u64,
        previous: u64,
    },
    Inspect {
        request: u64,
        source: u64,
    },
    Credentials {
        request: u64,
        writer: String,
        actor: String,
        retired: bool,
    },
}
pub(super) fn read() -> tokio::sync::mpsc::Receiver<Result<Request>> {
    let (sender, receiver) = tokio::sync::mpsc::channel(2);
    std::thread::spawn(move || {
        let input = std::io::stdin();
        let mut input = input.lock();
        loop {
            let mut line = Vec::new();
            let result = loop {
                let mut byte = [0];
                match input.read(&mut byte) {
                    Ok(0) if line.is_empty() => return,
                    Ok(0) => break Err("truncated private fixture command".into()),
                    Ok(_) if byte[0] == b'\n' => {
                        break serde_json::from_slice(&line).map_err(Into::into);
                    }
                    Ok(_) if line.len() < 65536 => line.push(byte[0]),
                    Ok(_) => break Err("private fixture command budget".into()),
                    Err(error) => break Err(error.into()),
                }
            };
            let failed = result.is_err();
            if sender.blocking_send(result).is_err() || failed {
                return;
            }
        }
    });
    receiver
}
pub(super) fn reply(value: &Value) -> Result {
    let bytes = serde_json::to_vec(value)?;
    if bytes.len() > 1024 * 1024 {
        return Err("private fixture response budget".into());
    }
    let output = std::io::stdout();
    let mut output = output.lock();
    output.write_all(&bytes)?;
    output.write_all(b"\n")?;
    output.flush()?;
    Ok(())
}
pub(super) fn credentials(
    ready: &Ready,
    request: u64,
    writer: &str,
    actor: &str,
    retired: bool,
) -> Result<Value> {
    let rows = ready.records.as_array().ok_or("actual native client rows")?;
    if !rows
        .iter()
        .any(|row| row["writer"] == writer && row["actor"] == actor && row["principal"] == "alice")
    {
        return Err("select one actual fixture registration pair".into());
    }
    let document = ready
        .protected
        .documents
        .iter()
        .find(|row| row.writer == writer && row.principal == "alice")
        .ok_or("actual protected document input missing")?;
    let review = ready
        .protected
        .reviews
        .iter()
        .find(|row| row.actor == actor && row.principal == "alice")
        .ok_or("actual protected comment input missing")?;
    Ok(
        json!({"kind":"credentials","request":request,"principal":"alice","writer":writer,"actor":actor,
        "privateAccountToken":if retired { &ready.old_alice_token } else { &ready.alice_token },
        "privateDocumentCredential":document.credential,"privateReviewCredential":review.credential}),
    )
}

/// A bounded fixture refusal leaves the genuine current owner available.
pub(super) fn refuse(request: u64, reason: &str) -> Result {
    reply(&json!({"kind":"activationRefused","request":request,"reason":reason}))
}
