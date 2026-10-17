//! Prepare a new owned flow replacement and prove its exact admitted result before publication.
use super::{DocumentVersionInfo, VersionComparison, compare_version, packet::Packet};
use crate::{
    Error,
    rich_replica::{
        ClipboardNamespace, Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
        SharedObservation,
        actions::{DeleteBlock, PasteBlocks},
    },
};
use breditor_core::rich_content::{
    RichClipboardFragment, RichDocument, RichSelection, RichSelectionKind,
};
use serde_json::Value;

/// Non-serializable source-guarded version restore. It is not a backup, authority or replay packet.
pub struct DocumentVersionRestorePlan {
    pub(super) observed: SharedObservation,
    pub(super) commands: Vec<Command>,
    pub(super) document_json: String,
    pub(super) document: RichDocument,
    info: DocumentVersionInfo,
    comparison: VersionComparison,
}
impl DocumentVersionRestorePlan {
    /// Immutable descriptive version metadata; no principal receives permissions from this value.
    #[must_use]
    pub fn version(&self) -> &DocumentVersionInfo {
        &self.info
    }
    /// Fully admitted new semantic content, including fresh identities and authored merge clocks.
    #[must_use]
    pub fn document_json(&self) -> &str {
        &self.document_json
    }
    /// Native old/current comparison presented before the explicit whole-document restore.
    #[must_use]
    pub fn comparison(&self) -> &VersionComparison {
        &self.comparison
    }
}
impl RichReplica {
    /// Preview restoring semantic content as fresh owned births and observed old-root deletions.
    /// Uses native semantic copy laws: active geometry and every source-cell body survive, but
    /// inactive causal merge/retraction history is not resurrected. The host must keep all referenced
    /// asset bytes available and permanently consume the supplied fresh namespace even on failure.
    /// No selection, accepted content, writer counter or history changes while preparing.
    /// # Errors
    /// Exact guard/read-only, version/root binding, allocation, existing 64-command/flow-block limits,
    /// staged native admission or recovery budget failures return no applicable plan.
    pub fn prepare_document_version_restore_guarded(
        &self,
        observed: &SharedObservation,
        input: &str,
        prefix: &str,
    ) -> Result<DocumentVersionRestorePlan, Error> {
        self.check(observed)?;
        self.require_writable()?;
        let (version, document) = Packet::read(self, input)?;
        let old: Value = serde_json::from_str(self.document_json())?;
        let saved: Value = serde_json::from_str(&version.data.document_json)?;
        for field in ["type", "properties", "entityId"] {
            if old["root"][field] != saved["root"][field] {
                return Err(Error::Contract("immutable version root header"));
            }
        }
        let comparison = compare_version::compare(
            version.id.clone(),
            &version.data.document_json,
            self.document_json(),
        )?;
        let selection = RichSelection::try_new(&document, RichSelectionKind::Document)
            .map_err(|_| Error::Contract("version restore scope"))?;
        let clip = RichClipboardFragment::copy_selection(
            &super::super::paragraphs::context(&self.codec),
            &document,
            &selection,
        )
        .map_err(|_| Error::Contract("version restore semantic copy"))?
        .ok_or(Error::Contract("version restore empty scope"))?;
        let nodes = self.fresh_clipboard_nodes(&clip, &mut ClipboardNamespace::try_new(prefix)?)?;
        let roots = old["root"]["children"]
            .as_array()
            .ok_or(Error::Contract("version restore root children"))?
            .iter()
            .map(super::super::creation::block)
            .collect::<Result<Vec<_>, Error>>()?;
        let mut commands = vec![Command::PasteBlocks(PasteBlocks {
            parent: None,
            before: roots.first().map(|s| (*s).into()),
            nodes,
        })];
        for block in roots {
            commands.push(Command::DeleteBlock(DeleteBlock { block: block.into() }));
        }
        let mut candidate = self.staged()?;
        candidate.apply_with_state(
            commands.clone(),
            SelectionUpdate::Set(None),
            PendingFormatsUpdate::Set(None),
        )?;
        Ok(DocumentVersionRestorePlan {
            observed: observed.clone(),
            commands,
            document_json: candidate.document_json().into(),
            document: candidate.document.clone(),
            info: version.info(),
            comparison,
        })
    }
}
