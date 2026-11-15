//! Closed wire envelope. The native archive verifier compares each opaque JSON value
//! to the original native serialization, including every attribution and action.
use crate::{Error, Result, credentials};
use breditor_collab_feasibility::review::{ReviewPrincipalId, ReviewThreadId};
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DiscussionLink {
    pub id: ReviewThreadId,
    pub principal: ReviewPrincipalId,
    pub digest: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DiscussionRoom<'a> {
    endpoint: &'a str,
    pub room: &'a str,
    pub binding: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DiscussionSeed<'a> {
    pub writer: &'a str,
    pub through: &'a str,
    pub prefix_digest: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DiscussionOriginal<'a> {
    archive_sha256: &'a str,
    birth_digest: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DiscussionRecord<'a> {
    format: &'a str,
    format_version: u32,
    #[serde(borrow)]
    pub(super) room: DiscussionRoom<'a>,
    #[serde(borrow)]
    pub(super) seed: DiscussionSeed<'a>,
    #[serde(borrow)]
    original: DiscussionOriginal<'a>,
    pub(super) link: DiscussionLink,
    #[serde(borrow)]
    thread: &'a RawValue,
    #[serde(borrow)]
    events: Vec<&'a RawValue>,
}

impl<'a> DiscussionRecord<'a> {
    pub(in crate::room) fn read(packet: &'a str) -> Result<Self> {
        if packet.is_empty() || packet.len() > super::MAX_DISCUSSION_BYTES {
            return Err(Error::Contract("recovered discussion packet budget"));
        }
        let value: Self = serde_json::from_str(packet)?;
        if value.format != "breditor/recovered-discussion"
            || value.format_version != 1
            || value.room.endpoint.is_empty()
            || value.room.endpoint.len() > 4096
            || value.events.is_empty()
            || value.events.len() > 65_536
        {
            return Err(Error::Contract("recovered discussion packet shape"));
        }
        credentials::hash(value.original.archive_sha256)?;
        if !native_digest(value.original.birth_digest) || !native_digest(&value.link.digest) {
            return Err(Error::Contract("recovered discussion digest shape"));
        }
        // The fields are retained verbatim through replay even with the server disabled.
        if value.thread.get().len() <= 2 {
            return Err(Error::Contract("recovered discussion projection shape"));
        }
        Ok(value)
    }

    pub(super) fn check_source_archive(&self, archive_sha256: &[u8; 32]) -> Result<()> {
        if !archive_sha256.iter().zip(self.original.archive_sha256.as_bytes().chunks_exact(2)).all(
            |(byte, hex)| {
                const HEX: &[u8; 16] = b"0123456789abcdef";
                hex == [HEX[(byte >> 4) as usize], HEX[(byte & 15) as usize]]
            },
        ) {
            return Err(Error::Contract("recovered discussion archive identity differs"));
        }
        Ok(())
    }

    #[cfg(feature = "server")]
    pub(in crate::room) fn verify_original(
        &self,
        archive_sha256: &[u8; 32],
        endpoint: &str,
        comments: &breditor_collab_feasibility::review::ReviewSession,
    ) -> Result<()> {
        self.check_source_archive(archive_sha256)?;
        if endpoint != self.room.endpoint {
            return Err(Error::Contract("recovered discussion archive identity differs"));
        }
        // This ID selects a native birth. Its remaining projection fields are verified
        // by the full canonical encoding below.
        #[derive(Deserialize)]
        struct SelectedThread {
            id: ReviewThreadId,
        }
        let SelectedThread { id } = serde_json::from_str(self.thread.get())?;
        let mut originals = self.events.iter();
        let thread = comments.visit_thread_history(&comments.observe(), &id, |entry| {
            use breditor_collab_feasibility::review::ReviewError;
            let exact = serde_json::to_string(&entry)?;
            if (entry.index == 0 && entry.digest != self.original.birth_digest)
                || originals.next().map(|event| event.get()) != Some(exact.as_str())
            {
                return Err(ReviewError::Contract("original recovered discussion event differs"));
            }
            Ok(())
        })?;
        if originals.next().is_some() {
            return Err(Error::Contract("original recovered discussion event count differs"));
        }
        if serde_json::to_string(&thread)? != self.thread.get() {
            return Err(Error::Contract("original recovered discussion projection differs"));
        }
        Ok(())
    }
}

fn native_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|sha| credentials::hash(sha).is_ok())
}
