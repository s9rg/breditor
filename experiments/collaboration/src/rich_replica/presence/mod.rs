//! Read-only ephemeral selections using the same stable anchors as shared history.
mod packet;
use super::{
    RichReplica, SharedObservation,
    selection::{self, Selection, SelectionLoss},
};
use crate::Error;
use serde::Serialize;

/// Read-only mapping of another writer's ephemeral selection into the current AST.
///
/// A host authenticates writer/session, orders packets and expires presence separately.
/// This result grants no account, room or writer authority.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PresenceResolution {
    /// All captured causal dependencies are applied and the selection is admitted.
    Resolved {
        /// Exact originating writer identity, not an authenticated account name.
        writer: String,
        /// Current directional text/node/grid selection, or explicit absence.
        selection: Option<Selection>,
    },
    /// The receiver has not applied the packet's captured document state yet.
    Pending {
        /// Originating writer; the host may retain only its latest ephemeral packet.
        writer: String,
    },
    /// Captured targets have no safe visible selection in the current document.
    Cleared {
        /// Originating writer.
        writer: String,
        /// The same structural-loss law used by local causal selections.
        reason: SelectionLoss,
    },
}
impl RichReplica {
    /// Freeze the current selection's causal anchors without changing publication or history.
    /// # Errors
    /// Rejects a stale/foreign observation before serialization, or an over-budget packet.
    pub fn presence_frame_guarded(&self, observation: &SharedObservation) -> Result<String, Error> {
        self.check(observation)?;
        let json = serde_json::to_string(&packet::Packet::capture(self))?;
        if json.len() > packet::MAX_BYTES {
            return Err(Error::Limit("shared presence bytes"));
        }
        Ok(json)
    }
    /// Resolve an opaque presence frame without importing changes or mutating local UI/history.
    ///
    /// Missing causal dependencies return Pending, not a guessed numeric caret.
    /// Explicit absence clears immediately even before document catchup.
    /// # Errors
    /// Rejects wrong room/schema/model/engine, malformed anchors and packet budgets.
    pub fn resolve_presence_frame(&self, input: &str) -> Result<PresenceResolution, Error> {
        if input.len() > packet::MAX_BYTES {
            return Err(Error::Limit("shared presence bytes"));
        }
        let packet: packet::Packet = serde_json::from_str(input)?;
        let ready = packet.ready(self)?;
        let Some(anchors) = packet.selection else {
            return Ok(PresenceResolution::Resolved { writer: packet.writer, selection: None });
        };
        if !ready {
            return Ok(PresenceResolution::Pending { writer: packet.writer });
        }
        Ok(match selection::resolve(&self.doc, &self.document, &anchors)? {
            Ok((_, selection)) => {
                PresenceResolution::Resolved { writer: packet.writer, selection: Some(selection) }
            }
            Err(reason) => PresenceResolution::Cleared { writer: packet.writer, reason },
        })
    }
}
