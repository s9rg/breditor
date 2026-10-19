//! Explicit bounded local save; original checkpoint encoders never emit reviewed records.
use super::FORMAT;
use crate::{
    Error,
    rich_replica::{
        RichReplica,
        general_history::ReplayContract,
        session::{Journal, MAX_JOURNAL_BYTES},
    },
};
use serde::{Deserialize, Serialize};
use std::io::{self, Write};

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum Replay {
    Original,
    GeneralV1,
    DocumentV1,
}
impl From<ReplayContract> for Replay {
    fn from(value: ReplayContract) -> Self {
        match value {
            ReplayContract::Original => Self::Original,
            ReplayContract::GeneralV1 => Self::GeneralV1,
            ReplayContract::DocumentV1 => Self::DocumentV1,
        }
    }
}
impl From<Replay> for ReplayContract {
    fn from(value: Replay) -> Self {
        match value {
            Replay::Original => Self::Original,
            Replay::GeneralV1 => Self::GeneralV1,
            Replay::DocumentV1 => Self::DocumentV1,
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
    replay: Replay,
    journal: &'a Journal,
    joins: Option<&'a [u32]>,
}
struct Counter {
    bytes: usize,
    exceeded: bool,
}
impl Write for Counter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > MAX_JOURNAL_BYTES - self.bytes {
            self.exceeded = true;
            return Err(io::Error::other("reviewed checkpoint byte limit"));
        }
        self.bytes += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
impl RichReplica {
    /// Save the explicit reviewed-history family with all ordinary policy and typing partitions.
    /// No identity here is an authority, live permission or lease; reacquire the exact saved writer.
    /// # Errors
    /// Disabled contract, invalid retained history/partition or the 16 MiB whole-save bound reject.
    pub fn reviewed_checkpoint(&self) -> Result<String, Error> {
        self.require_unsegmented_checkpoint()?;
        if self.search_contract {
            return Err(Error::Contract("use explicit search checkpoint"));
        }
        if !self.reviewed_contract {
            return Err(Error::Contract("reviewed history required"));
        }
        self.reviewed_history.as_ref().ok_or(Error::ReplayMismatch)?.validate(self)?;
        if let Some(history) = &self.typing {
            history.validate(&self.journal)?;
        }
        let value = Encoding {
            format: FORMAT,
            format_version: 1,
            model_version: self.model_version(),
            journal_version: self.journal_version(),
            replay: self.replay_contract.into(),
            journal: &self.journal,
            joins: self.typing.as_ref().map(|history| history.joins.as_slice()),
        };
        let mut counter = Counter { bytes: 0, exceeded: false };
        let result = serde_json::to_writer(&mut counter, &value);
        if counter.exceeded {
            return Err(Error::Limit("reviewed checkpoint bytes"));
        }
        result?;
        Ok(serde_json::to_string(&value)?)
    }
}
