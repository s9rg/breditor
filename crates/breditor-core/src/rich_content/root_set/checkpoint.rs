//! Versioned root-set checkpoint envelope: set metadata, global journal and one
//! unchanged per-root session checkpoint each. Roots are restored with their
//! existing codecs and then attached, which re-verifies every journal count.

use super::{RichRootId, RichRootMeta, RichRootSet, RichRootSetError};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Envelope format identifier.
pub const RICH_ROOT_SET_FORMAT: &str = "breditor/rich-root-set";
/// Envelope format version.
pub const RICH_ROOT_SET_FORMAT_VERSION: u32 = 1;
const MAX_JOURNAL: usize = 1 << 20;

/// History family of one root checkpoint.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichRootHistory {
    /// Original one-unit-per-dispatch local session codec.
    Explicit,
    /// Natural typing-history session codec.
    TypingV1,
}

/// Selection policy family of one root checkpoint.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichRootSelectionPolicy {
    /// Original text/node/grid selection.
    Original,
    /// Document-selection policy.
    DocumentV1,
}

/// One root's opaque session checkpoint and the codec family that restores it.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichRootCheckpointPart {
    /// Root id; must match the set order.
    pub id: RichRootId,
    /// History codec family.
    pub history: RichRootHistory,
    /// Selection policy family.
    pub selection: RichRootSelectionPolicy,
    /// Unchanged per-root session checkpoint JSON.
    pub checkpoint: String,
}

/// Decoded, not yet attached, set checkpoint.
#[derive(Debug)]
pub struct RichRootSetCheckpoint {
    /// Pending set; attach every root owner restored from `parts`.
    pub set: RichRootSet,
    /// Per-root checkpoints in shared order.
    pub parts: Vec<RichRootCheckpointPart>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Envelope {
    format: String,
    format_version: u32,
    roots: Vec<RootWire>,
    journal: Vec<String>,
    cursor: usize,
    active: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct RootWire {
    id: String,
    label: Option<String>,
    attributes: BTreeMap<String, String>,
    history: String,
    selection: String,
    checkpoint: String,
}

impl RichRootSet {
    /// Encode the set with one checkpoint part per root, in root order.
    ///
    /// # Errors
    /// Rejects an incomplete set or parts that do not name every root in order.
    pub fn encode_checkpoint(
        &self,
        parts: &[RichRootCheckpointPart],
    ) -> Result<String, RichRootSetError> {
        if !self.is_complete() {
            return Err(RichRootSetError::Incomplete);
        }
        let metas: Vec<&RichRootMeta> = self.roots().collect();
        if metas.len() != parts.len()
            || metas.iter().zip(parts).any(|(meta, part)| meta.id() != &part.id)
        {
            return Err(RichRootSetError::UnknownRoot);
        }
        let envelope = Envelope {
            format: RICH_ROOT_SET_FORMAT.to_owned(),
            format_version: RICH_ROOT_SET_FORMAT_VERSION,
            roots: metas
                .iter()
                .zip(parts)
                .map(|(meta, part)| RootWire {
                    id: meta.id().as_str().to_owned(),
                    label: meta.label().map(str::to_owned),
                    attributes: meta.attributes().clone(),
                    history: match part.history {
                        RichRootHistory::Explicit => "explicit",
                        RichRootHistory::TypingV1 => "typing-v1",
                    }
                    .to_owned(),
                    selection: match part.selection {
                        RichRootSelectionPolicy::Original => "original",
                        RichRootSelectionPolicy::DocumentV1 => "document-v1",
                    }
                    .to_owned(),
                    checkpoint: part.checkpoint.clone(),
                })
                .collect(),
            journal: self.journal().iter().map(|id| id.as_str().to_owned()).collect(),
            cursor: self.cursor(),
            active: self.active().map(|id| id.as_str().to_owned()),
        };
        serde_json::to_string(&envelope).map_err(|_| RichRootSetError::CheckpointRejected)
    }
}

impl RichRootSetCheckpoint {
    /// Strictly decode an untrusted envelope; root checkpoints stay opaque until restored.
    ///
    /// # Errors
    /// Rejects unknown fields/versions, invalid ids or metadata, duplicates, unknown
    /// journal/active ids or an out-of-range cursor.
    pub fn decode(input: &str) -> Result<Self, RichRootSetError> {
        let rejected = |_| RichRootSetError::CheckpointRejected;
        let envelope: Envelope =
            serde_json::from_str(input).map_err(|_| RichRootSetError::CheckpointRejected)?;
        if envelope.format != RICH_ROOT_SET_FORMAT
            || envelope.format_version != RICH_ROOT_SET_FORMAT_VERSION
            || envelope.journal.len() > MAX_JOURNAL
        {
            return Err(RichRootSetError::CheckpointRejected);
        }
        let mut metas = Vec::with_capacity(envelope.roots.len());
        let mut parts = Vec::with_capacity(envelope.roots.len());
        for root in envelope.roots {
            let id = RichRootId::try_new(&root.id).map_err(rejected)?;
            let history = match root.history.as_str() {
                "explicit" => RichRootHistory::Explicit,
                "typing-v1" => RichRootHistory::TypingV1,
                _ => return Err(RichRootSetError::CheckpointRejected),
            };
            let selection = match root.selection.as_str() {
                "original" => RichRootSelectionPolicy::Original,
                "document-v1" => RichRootSelectionPolicy::DocumentV1,
                _ => return Err(RichRootSetError::CheckpointRejected),
            };
            metas.push(
                RichRootMeta::try_new(id.clone(), root.label, root.attributes).map_err(rejected)?,
            );
            parts.push(RichRootCheckpointPart {
                id,
                history,
                selection,
                checkpoint: root.checkpoint,
            });
        }
        let journal = envelope
            .journal
            .iter()
            .map(|id| RichRootId::try_new(id))
            .collect::<Result<Vec<_>, _>>()
            .map_err(rejected)?;
        let active =
            envelope.active.as_deref().map(RichRootId::try_new).transpose().map_err(rejected)?;
        let set = RichRootSet::pending(metas, journal, envelope.cursor, active)?;
        Ok(Self { set, parts })
    }
}
