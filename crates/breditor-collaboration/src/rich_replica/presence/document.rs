//! Separate ephemeral document selection family. Original presence packets keep their old meaning.
use super::{PresenceResolution, packet};
use crate::{
    Error,
    rich_replica::{
        RichReplica, SharedObservation,
        selection::{AnchoredSelection, Selection, SelectionLoss},
    },
};
use serde::{Serialize, Serializer, ser::SerializeMap};

/// Read-only selection carried only by the explicitly selected document presence family.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DocumentPresenceSelection {
    /// Current whole-document scope, including atoms and hidden/no-text content.
    Document,
    /// Original directional text, node or grid candidate resolved by native causal anchors.
    Original(Selection),
}
impl Serialize for DocumentPresenceSelection {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Original(selection) => selection.serialize(serializer),
            Self::Document => {
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry("kind", "document")?;
                map.end()
            }
        }
    }
}
/// Pure document presence mapping. It grants no identity, writer, content or mutation authority.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DocumentPresenceResolution {
    /// The packet's dependencies are applied and its selection is admitted.
    Resolved {
        /// Originating causal writer; the host separately authenticates its connection.
        writer: String,
        /// Explicit document/original scope, or genuine absence.
        selection: Option<DocumentPresenceSelection>,
    },
    /// Captured content dependencies have not arrived; no numeric endpoints are guessed.
    Pending {
        /// Originating causal writer.
        writer: String,
    },
    /// An original target has no safe visible selection under existing relocation laws.
    Cleared {
        /// Originating causal writer.
        writer: String,
        /// Existing structural clearing reason.
        reason: SelectionLoss,
    },
}
impl From<PresenceResolution> for DocumentPresenceResolution {
    fn from(value: PresenceResolution) -> Self {
        match value {
            PresenceResolution::Resolved { writer, selection } => Self::Resolved {
                writer,
                selection: selection.map(DocumentPresenceSelection::Original),
            },
            PresenceResolution::Pending { writer } => Self::Pending { writer },
            PresenceResolution::Cleared { writer, reason } => Self::Cleared { writer, reason },
        }
    }
}
impl RichReplica {
    /// Capture explicit document-family presence without publishing content, UI or history.
    /// # Errors
    /// Wrong family, stale/foreign observations or existing packet budgets reject atomically.
    pub fn document_presence_frame_guarded(
        &self,
        observation: &SharedObservation,
    ) -> Result<String, Error> {
        self.check(observation)?;
        if !self.document_selection_enabled() {
            return Err(Error::Contract("document presence requires explicit family"));
        }
        let json = serde_json::to_string(&packet::Packet::capture_document(self))?;
        if json.len() > packet::MAX_BYTES {
            return Err(Error::Limit("shared document presence bytes"));
        }
        Ok(json)
    }
    /// Resolve only the named document packet family without importing content or changing selection.
    /// Readers may use an ordinary room replica: this pure read never upgrades its replay family.
    /// Whole-document scope follows the receiver's current root after captured dependencies arrive.
    /// # Errors
    /// Wrong packet/binding, unsupported document scope version, malformed anchors or budgets reject.
    pub fn resolve_document_presence_frame(
        &self,
        input: &str,
    ) -> Result<DocumentPresenceResolution, Error> {
        if input.len() > packet::MAX_BYTES {
            return Err(Error::Limit("shared document presence bytes"));
        }
        let packet: packet::Packet = serde_json::from_str(input)?;
        let ready = packet.ready_document(self)?;
        if let Some(AnchoredSelection::Document { version }) = &packet.selection {
            if *version != 1 {
                return Err(Error::Contract("document presence scope version"));
            }
            return Ok(if ready {
                DocumentPresenceResolution::Resolved {
                    writer: packet.writer,
                    selection: Some(DocumentPresenceSelection::Document),
                }
            } else {
                DocumentPresenceResolution::Pending { writer: packet.writer }
            });
        }
        Ok(super::resolve_ready(self, packet, ready)?.into())
    }
}
