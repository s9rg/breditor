//! One explicit bounded envelope composing search with the selected scope, typing and review history.
use super::{
    super::{
        RichReplica,
        general_history::ReplayContract,
        session::{Journal, MAX_JOURNAL_BYTES},
    },
    FORMAT,
};
use crate::Error;
use serde::{Deserialize, Serialize};
use std::io::{self, Write};

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum Scope {
    Original,
    GeneralV1,
    DocumentV1,
}
impl From<ReplayContract> for Scope {
    fn from(value: ReplayContract) -> Self {
        match value {
            ReplayContract::Original => Self::Original,
            ReplayContract::GeneralV1 => Self::GeneralV1,
            ReplayContract::DocumentV1 => Self::DocumentV1,
        }
    }
}
impl From<Scope> for ReplayContract {
    fn from(value: Scope) -> Self {
        match value {
            Scope::Original => Self::Original,
            Scope::GeneralV1 => Self::GeneralV1,
            Scope::DocumentV1 => Self::DocumentV1,
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Encoding<'a> {
    format: &'static str,
    format_version: u32,
    model_version: u32,
    journal_version: u32,
    scope: Scope,
    reviewed: bool,
    journal: &'a Journal,
    joins: Option<&'a [u32]>,
}
struct Counter {
    bytes: usize,
}
impl Write for Counter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > MAX_JOURNAL_BYTES - self.bytes {
            return Err(io::Error::other("search checkpoint byte limit"));
        }
        self.bytes += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
impl RichReplica {
    /// Save only the explicit search family, retaining exact scope, natural groups
    /// and reviewed history. This is not an account credential or portable author import.
    /// # Errors
    /// Disabled/wrong modes, invalid retained history or the unchanged 16 MiB bound reject.
    pub fn search_checkpoint(&self) -> Result<String, Error> {
        if !self.search_contract {
            return Err(Error::Contract("search history required"));
        }
        if let Some(history) = &self.typing {
            history.validate(&self.journal)?;
        }
        if self.reviewed_contract {
            self.reviewed_history.as_ref().ok_or(Error::ReplayMismatch)?.validate(self)?;
        }
        super::super::document_checkpoint::validate_journal_scope(
            &self.journal,
            self.replay_contract,
        )?;
        let value = Encoding {
            format: FORMAT,
            format_version: 1,
            model_version: self.model_version(),
            journal_version: self.journal_version(),
            scope: self.replay_contract.into(),
            reviewed: self.reviewed_contract,
            journal: &self.journal,
            joins: self.typing.as_ref().map(|typing| typing.joins.as_slice()),
        };
        serde_json::to_writer(&mut Counter { bytes: 0 }, &value)
            .map_err(|_| Error::Limit("search checkpoint encoding"))?;
        Ok(serde_json::to_string(&value)?)
    }
}
