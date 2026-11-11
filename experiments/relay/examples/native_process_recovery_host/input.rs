//! Bounded private process fixture input. Credentials stay on the IPC channel.
use super::Result;
use breditor_collab_relay::{
    RecoveryDocumentCredential, RecoveryRegistrationCredentials, RecoveryReviewCredential,
};
use serde::{Deserialize, de::DeserializeOwned};
use std::io::{BufRead, Read};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Protected {
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

pub fn read<T: DeserializeOwned>() -> Result<T> {
    const MAX: usize = 16 * 1024 * 1024;
    let stdin = std::io::stdin();
    let mut input = stdin.lock().take((MAX + 1) as u64);
    let mut bytes = Vec::new();
    input.read_until(b'\n', &mut bytes)?;
    if bytes.len() > MAX || bytes.last() != Some(&b'\n') {
        return Err("private recovery bootstrap byte budget or truncation".into());
    }
    Ok(serde_json::from_slice(&bytes)?)
}
