//! Prepare an existing suggestion intent from a schema-admitted semantic clipboard.
use super::{DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionScope};
use crate::{
    Error,
    rich_replica::{
        ClipboardNamespace, Command, RichReplica, SharedObservation, VersionAssetReference,
        actions::PasteGeneralFlowAtTextV1, general_range_input_json, selection::Selection,
    },
};
use breditor_core::{
    codec::RichClipboardJsonCodec,
    document::{ElementNode, NodeRef, PropertyValue},
    rich_content::RichClipboardKind,
};
use serde::Serialize;

/// Exact archived image binding and its distinct destination binding in the proposed edit.
#[derive(Serialize)]
pub struct SuggestionAssetRelocation {
    /// Complete original asset key and generation.
    pub source: VersionAssetReference,
    /// Fresh destination generation for the same opaque asset key.
    pub target: VersionAssetReference,
}

/// A native proposal draft and the byte-resolution obligations for its copied images.
#[derive(Serialize)]
pub struct DocumentSuggestionClipboardPlan {
    /// Existing immutable suggestion draft family.
    pub draft: DocumentSuggestionDraft,
    /// Source-to-target image bindings in admitted document order.
    pub assets: Vec<SuggestionAssetRelocation>,
}

fn binding(node: &ElementNode) -> Result<VersionAssetReference, Error> {
    let property = |name: &str| {
        node.properties()
            .iter()
            .find(|(key, _)| key.as_str() == name)
            .and_then(|(_, value)| PropertyValue::as_string(value))
            .map(str::to_owned)
            .ok_or(Error::Contract("suggestion clipboard image binding"))
    };
    Ok(VersionAssetReference {
        asset: property("breditor/asset-id")?,
        generation: property("breditor/asset-generation")?,
    })
}

fn collect_relocations(
    source: &NodeRef,
    target: &NodeRef,
    assets: &mut Vec<SuggestionAssetRelocation>,
) -> Result<(), Error> {
    if source == target {
        return Ok(());
    }
    let mismatch = || Error::Contract("suggestion clipboard rekeyed shape");
    let (source, target) =
        (source.as_element().ok_or_else(mismatch)?, target.as_element().ok_or_else(mismatch)?);
    if source.kind() != target.kind() || source.children().len() != target.children().len() {
        return Err(mismatch());
    }
    if source.kind().as_str() == "breditor/image" {
        let source = binding(source)?;
        let target = binding(target)?;
        if source.asset != target.asset || source.generation == target.generation {
            return Err(Error::Contract("suggestion clipboard rekeyed asset binding"));
        }
        assets.push(SuggestionAssetRelocation { source, target });
    }
    for (source, target) in source.children().iter().zip(target.children().iter()) {
        collect_relocations(source, target, assets)?;
    }
    Ok(())
}

impl RichReplica {
    /// Plan native clipboard insertion under the selected observation, including fresh image IDs.
    /// Keep the corresponding source bytes available and resolve each new asset generation
    /// through the ordinary application provider before publishing or accepting the suggestion.
    ///
    /// # Errors
    /// Stale observations, invalid alternate clipboard data, unsupported destination structure,
    /// namespace collisions and incomplete asset binding mappings refuse.
    pub fn plan_suggestion_clipboard_guarded(
        &self,
        observed: &SharedObservation,
        selection_json: &str,
        clipboard_json: &str,
        prefix: &str,
    ) -> Result<DocumentSuggestionClipboardPlan, Error> {
        self.check(observed)?;
        let selection: Selection = general_range_input_json::decode(selection_json)?;
        let context = super::super::paragraphs::context(&self.codec);
        let clipboard = RichClipboardJsonCodec::new(context.clone())
            .decode(clipboard_json)
            .map_err(|_| Error::Contract("suggestion clipboard admission"))?;
        if clipboard.kind() == RichClipboardKind::Text {
            let inserted = clipboard
                .text_fragment(&context)
                .map_err(|_| Error::Contract("suggestion inline clipboard"))?;
            let draft =
                self.plan_suggestion_general_text_guarded(observed, &selection, &inserted, prefix)?;
            return Ok(DocumentSuggestionClipboardPlan { draft, assets: Vec::new() });
        }

        let deletion = self.plan_clipboard_flow_deletion(&selection, prefix)?;
        let fresh =
            self.rekey_clipboard_flow(&clipboard, &mut ClipboardNamespace::try_new(prefix)?)?;
        let mut assets = Vec::new();
        collect_relocations(
            clipboard.document().document().root(),
            fresh.document().document().root(),
            &mut assets,
        )?;
        let command = Command::PasteGeneralFlowAtTextV1(PasteGeneralFlowAtTextV1 {
            deletion,
            right: format!("{prefix}:suffix"),
            nodes: self.clipboard_flow_nodes(&fresh)?,
        });
        let draft = DocumentSuggestionDraft {
            scope: DocumentSuggestionScope::Commands,
            edit: DocumentSuggestionEdit::Commands(vec![command]),
        };
        super::evaluate_commands::evaluate(
            self,
            &self.doc,
            &self.document,
            self.document_json(),
            &draft,
        )?;
        Ok(DocumentSuggestionClipboardPlan { draft, assets })
    }
}
