//! Versioned root-set checkpoint envelope: set metadata, global journal and one
//! unchanged per-root session checkpoint each. Roots are restored with their
//! existing codecs and then attached, which re-verifies every journal count.
//!
//! Version 2 adds undoable structure steps to the journal and the retained
//! detached roots they can restore. A set with neither is still written as
//! version 1 byte-for-byte, and version 1 envelopes are still read.

use super::{
    RichRootId, RichRootJournalEntry, RichRootMeta, RichRootSet, RichRootSetError,
    RichRootStructureStep,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Envelope format identifier.
pub const RICH_ROOT_SET_FORMAT: &str = "breditor/rich-root-set";
/// Current envelope format version (structure steps and retained detached roots).
pub const RICH_ROOT_SET_FORMAT_VERSION: u32 = 2;
/// Original envelope version: content units only; still written when sufficient and always read.
pub const RICH_ROOT_SET_FORMAT_VERSION_V1: u32 = 1;
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
    /// Root id; parts list attached roots in set order, then retained detached roots.
    pub id: RichRootId,
    /// Whether this is a retained detached root (restorable only through global Undo/Redo).
    pub detached: bool,
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
    /// Per-root checkpoints: attached roots in shared order, then retained detached roots.
    pub parts: Vec<RichRootCheckpointPart>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Envelope {
    format: String,
    format_version: u32,
    roots: Vec<RootWire>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    detached: Option<Vec<RootWire>>,
    journal: Vec<EntryWire>,
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

#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum EntryWire {
    Unit(String),
    Step(StepWire),
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "step", rename_all = "camelCase", deny_unknown_fields)]
enum StepWire {
    Add { root: String, index: usize },
    Remove { root: String, index: usize },
    Move { root: String, from: usize, to: usize },
    Attributes { root: String, before: BTreeMap<String, String>, after: BTreeMap<String, String> },
}

fn root_wire(meta: &RichRootMeta, part: &RichRootCheckpointPart) -> RootWire {
    RootWire {
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
    }
}

fn entry_wire(entry: &RichRootJournalEntry) -> EntryWire {
    let name = |id: &RichRootId| id.as_str().to_owned();
    match entry {
        RichRootJournalEntry::Unit(id) => EntryWire::Unit(name(id)),
        RichRootJournalEntry::Structure(step) => EntryWire::Step(match step {
            RichRootStructureStep::Add { id, index } => {
                StepWire::Add { root: name(id), index: *index }
            }
            RichRootStructureStep::Remove { id, index } => {
                StepWire::Remove { root: name(id), index: *index }
            }
            RichRootStructureStep::Move { id, from, to } => {
                StepWire::Move { root: name(id), from: *from, to: *to }
            }
            RichRootStructureStep::Attributes { id, before, after } => StepWire::Attributes {
                root: name(id),
                before: before.clone(),
                after: after.clone(),
            },
        }),
    }
}

fn entry(wire: EntryWire) -> Result<RichRootJournalEntry, RichRootSetError> {
    let id =
        |value: &str| RichRootId::try_new(value).map_err(|_| RichRootSetError::CheckpointRejected);
    Ok(match wire {
        EntryWire::Unit(root) => RichRootJournalEntry::Unit(id(&root)?),
        EntryWire::Step(step) => RichRootJournalEntry::Structure(match step {
            StepWire::Add { root, index } => RichRootStructureStep::Add { id: id(&root)?, index },
            StepWire::Remove { root, index } => {
                RichRootStructureStep::Remove { id: id(&root)?, index }
            }
            StepWire::Move { root, from, to } => {
                RichRootStructureStep::Move { id: id(&root)?, from, to }
            }
            StepWire::Attributes { root, before, after } => {
                let root = id(&root)?;
                // Both sides must be admissible root attributes.
                for side in [&before, &after] {
                    RichRootMeta::try_new(root.clone(), None, side.clone())
                        .map_err(|_| RichRootSetError::CheckpointRejected)?;
                }
                RichRootStructureStep::Attributes { id: root, before, after }
            }
        }),
    })
}

impl RichRootSet {
    /// Encode the set with one checkpoint part per attached root (in order), then per
    /// retained detached root (in [`Self::detached`] order).
    ///
    /// Writes version 1 when the journal holds no structure step and no root is
    /// detached, otherwise version 2.
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
        let metas: Vec<(&RichRootMeta, bool)> = self
            .roots()
            .map(|meta| (meta, false))
            .chain(self.detached().map(|meta| (meta, true)))
            .collect();
        if metas.len() != parts.len()
            || metas
                .iter()
                .zip(parts)
                .any(|((meta, detached), part)| meta.id() != &part.id || *detached != part.detached)
        {
            return Err(RichRootSetError::UnknownRoot);
        }
        let side = |detached: bool| -> Vec<RootWire> {
            metas
                .iter()
                .zip(parts)
                .filter(|((_, is_detached), _)| *is_detached == detached)
                .map(|((meta, _), part)| root_wire(meta, part))
                .collect()
        };
        let structured = self.detached().next().is_some()
            || self.journal().iter().any(RichRootJournalEntry::is_structure);
        let envelope = Envelope {
            format: RICH_ROOT_SET_FORMAT.to_owned(),
            format_version: if structured {
                RICH_ROOT_SET_FORMAT_VERSION
            } else {
                RICH_ROOT_SET_FORMAT_VERSION_V1
            },
            roots: side(false),
            detached: structured.then(|| side(true)),
            journal: self.journal().iter().map(entry_wire).collect(),
            cursor: self.cursor(),
            active: self.active().map(|id| id.as_str().to_owned()),
        };
        serde_json::to_string(&envelope).map_err(|_| RichRootSetError::CheckpointRejected)
    }
}

impl RichRootSetCheckpoint {
    /// Strictly decode an untrusted version 1 or 2 envelope; root checkpoints stay opaque until restored.
    ///
    /// # Errors
    /// Rejects unknown fields/versions, invalid ids or metadata, duplicates, unknown
    /// journal/active ids, an out-of-range cursor, structure steps in version 1, and
    /// any structure history that does not replay exactly (see `verify_structure`).
    pub fn decode(input: &str) -> Result<Self, RichRootSetError> {
        let rejected = |_| RichRootSetError::CheckpointRejected;
        let envelope: Envelope =
            serde_json::from_str(input).map_err(|_| RichRootSetError::CheckpointRejected)?;
        let structured = match envelope.format_version {
            RICH_ROOT_SET_FORMAT_VERSION_V1 => false,
            RICH_ROOT_SET_FORMAT_VERSION => true,
            _ => return Err(RichRootSetError::CheckpointRejected),
        };
        if envelope.format != RICH_ROOT_SET_FORMAT
            || envelope.journal.len() > MAX_JOURNAL
            || structured != envelope.detached.is_some()
            || (!structured
                && envelope.journal.iter().any(|entry| matches!(entry, EntryWire::Step(_))))
        {
            return Err(RichRootSetError::CheckpointRejected);
        }
        let mut metas = Vec::with_capacity(envelope.roots.len());
        let mut detached = Vec::new();
        let mut parts = Vec::with_capacity(envelope.roots.len());
        let roots = envelope.roots.into_iter().map(|root| (root, false));
        let retained = envelope.detached.unwrap_or_default().into_iter().map(|root| (root, true));
        for (root, is_detached) in roots.chain(retained) {
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
            let meta =
                RichRootMeta::try_new(id.clone(), root.label, root.attributes).map_err(rejected)?;
            if is_detached {
                detached.push(meta);
            } else {
                metas.push(meta);
            }
            parts.push(RichRootCheckpointPart {
                id,
                detached: is_detached,
                history,
                selection,
                checkpoint: root.checkpoint,
            });
        }
        let journal = envelope.journal.into_iter().map(entry).collect::<Result<Vec<_>, _>>()?;
        let active =
            envelope.active.as_deref().map(RichRootId::try_new).transpose().map_err(rejected)?;
        let set = RichRootSet::pending(metas, detached, journal, envelope.cursor, active)?;
        Ok(Self { set, parts })
    }
}
