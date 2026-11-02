//! Bounded private operator bootstrap. Raw native identities never pass through JS numbers.
use super::Result;
use breditor_collab_relay::{
    RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    ServerLogGenerationRoomBackupIdentity,
};
use serde::Deserialize;
use std::{
    io::{BufRead, Read},
    net::SocketAddr,
    path::PathBuf,
};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Observed {
    pub sequence: u64,
    pub identity: ServerLogGenerationRoomBackupIdentity,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Protected {
    documents: Vec<(String, String, String)>,
    reviews: Vec<(String, String, String)>,
}
impl Protected {
    pub fn admit(&self) -> Result<RecoveryRegistrationCredentials> {
        if self.documents.len() != 7 || self.reviews.len() != 7 {
            return Err("exact actual protected cohort required".into());
        }
        Ok(RecoveryRegistrationCredentials {
            documents: self
                .documents
                .iter()
                .map(|(principal, writer, credential)| RecoveryDocumentCredential {
                    principal: principal.clone(),
                    writer: writer.clone(),
                    credential: credential.clone(),
                })
                .collect(),
            reviews: self
                .reviews
                .iter()
                .map(|(principal, actor, credential)| RecoveryReviewCredential {
                    principal: principal.clone(),
                    actor: actor.clone(),
                    credential: credential.clone(),
                })
                .collect(),
        })
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Bootstrap {
    format: String,
    format_version: u32,
    pub root: PathBuf,
    pub checkpoint_name: String,
    pub checkpoint_json: String,
    pub checkpoint_sha256: String,
    pub initial_sequence: u64,
    pub next_sequence: u64,
    pub previous_sequence: u64,
    pub observed: Vec<Observed>,
    pub protected: Protected,
    pub old_alice_token: String,
    pub client_address: SocketAddr,
    pub retired_address: SocketAddr,
}
pub(super) fn read() -> Result<Bootstrap> {
    const MAX: usize = 16 * 1024 * 1024;
    let stdin = std::io::stdin();
    let mut input = stdin.lock().take((MAX + 1) as u64);
    let mut bytes = Vec::new();
    input.read_until(b'\n', &mut bytes)?;
    if bytes.len() > MAX || bytes.last() != Some(&b'\n') {
        return Err("private recovery bootstrap byte budget or truncation".into());
    }
    let value: Bootstrap = serde_json::from_slice(&bytes)?;
    if value.format != "breditor/private-native-process-recovery"
        || value.format_version != 1
        || value.observed.is_empty()
        || value.observed.len() > 128
        || value.next_sequence > 9_007_199_254_740_991
        || value.next_sequence <= value.previous_sequence
        || value.observed.iter().any(|row| row.sequence >= value.next_sequence)
        || !value.client_address.ip().is_loopback()
        || !value.retired_address.ip().is_loopback()
        || value.client_address.port() == 0
        || value.retired_address.port() == 0
    {
        return Err("private recovery bootstrap selection".into());
    }
    let n = value
        .checkpoint_name
        .strip_prefix("native-checkpoint-restart-")
        .ok_or("selected checkpoint namespace")?;
    if n.is_empty()
        || !n.bytes().all(|b| b.is_ascii_digit())
        || n.starts_with('0')
        || value.root.canonicalize()? != value.root
        || !std::fs::symlink_metadata(&value.root)?.is_dir()
    {
        return Err("actual recovery directory and checkpoint required".into());
    }
    if breditor_collab_relay::assets::asset_id(value.checkpoint_json.as_bytes())
        != value.checkpoint_sha256
    {
        return Err("independent raw checkpoint digest differs".into());
    }
    Ok(value)
}
