//! Shared rich V4 inline commands: text language, mentions and image links.
//!
//! Each command is the shared form of the frozen local slice command
//! (`setTextLanguage`, `insertMention`, `setImageLink`) with the same input JSON and the same
//! user-visible semantics. Each publishes exactly one writer-local history group (one Undo
//! step), is checked against the complete local core result before adoption, and is refused
//! atomically outside an explicit shared V4 owner.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::{InsertMention, MentionEntity, SetImageLink},
    selection::{Selection, TextPoint},
};
use crate::Error;
use breditor_core::{
    codec::{
        decode_rich_image_link_command, decode_rich_mention, decode_rich_text_language_command,
    },
    document::PropertyValue,
    identity::QualifiedName,
    rich_content::{
        ImageId, RICH_TEXT_LANGUAGE_FORMAT, RICH_TEXT_LANGUAGE_TAG_PROPERTY, RichImageLink,
        RichLanguageTag, RichMention, actions::SetImageLink as CoreSetImageLink,
    },
};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MentionRequest {
    selection: Selection,
    mention: Value,
}

impl RichReplica {
    /// Set (`{"language":"fr-CA"}`, any letter case) or clear (`{"language":null}`) the text
    /// language of the current selection, exactly like local `setTextLanguage`.
    ///
    /// A range changes every covered character in one history group (unselected text keeps
    /// its value; direction and other formats are untouched); a caret changes pending typing
    /// formats only; code selections are refused. Under the document-selection family a
    /// whole-document selection uses the document formatting action.
    /// # Errors
    /// Stale/read-only owners, a non-V4 owner, malformed or non-canonicalizable tags and
    /// every selection/admission failure publish nothing.
    pub fn set_text_language_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let language =
            decode_rich_text_language_command(&super::paragraphs::context(&self.codec), input)
                .map_err(|_| Error::Contract("text language intent"))?;
        self.set_text_language_guarded(observation, language.as_ref())
    }
    /// Typed form of [`Self::set_text_language_json_guarded`].
    /// # Errors
    /// As [`Self::set_text_language_json_guarded`].
    pub fn set_text_language_guarded(
        &mut self,
        observation: &SharedObservation,
        language: Option<&RichLanguageTag>,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if !self.codec.schema().supports_rich_text_language() {
            return Err(Error::Contract("shared text language requires rich language V4"));
        }
        // A removal carries one complete admitted literal of the kind; its value is irrelevant.
        let (kind, tag) = match language {
            Some(tag) => ("set", tag.as_str().to_owned()),
            None => ("remove", "und".to_owned()),
        };
        let literal = json!([{"type":RICH_TEXT_LANGUAGE_FORMAT,"properties":{RICH_TEXT_LANGUAGE_TAG_PROPERTY:tag}}]);
        let input =
            json!({"changes":[{"kind":kind,"formatsJson":literal.to_string()}]}).to_string();
        if self.document_selection_enabled() {
            self.change_document_selection_formats_json_guarded(observation, &input)
        } else {
            self.change_selection_formats_json_guarded(observation, &input)
        }
    }

    /// Replace one text range (normally the typed `@query` trigger) by a mention, exactly like
    /// local `insertMention`: `{"selection":{"kind":"text","anchor":…,"focus":…},
    /// "mention":{"kind":…,"id":…,"label":…}}`.
    ///
    /// The range lies in one paragraph, heading or section summary and is snapped outward
    /// out of existing mentions. The inserted text is `@label` (the trigger's styles plus the
    /// mention) followed by one plain space with the trigger's styles; the caret lands after
    /// the space and pending formats never contain a mention. One history group: one Undo
    /// restores the typed trigger and the pre-edit selection.
    /// # Errors
    /// Stale/read-only owners, a non-V4 owner, malformed or out-of-domain input, a missing,
    /// cross-block, code or non-text target and every admission failure publish nothing.
    pub fn insert_mention_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if input.len() > 4 * 1024 {
            return Err(Error::Limit("mention intent bytes"));
        }
        let request: MentionRequest = serde_json::from_str(input).map_err(|_| Error::Json)?;
        let Selection::TextRange { anchor, focus } = request.selection else {
            return Err(Error::Contract("shared mention target"));
        };
        let mention = decode_rich_mention(
            &super::paragraphs::context(&self.codec),
            &request.mention.to_string(),
        )
        .map_err(|_| Error::Contract("mention intent"))?;
        self.insert_mention_guarded(observation, anchor, focus, &mention)
    }
    /// Typed form of [`Self::insert_mention_json_guarded`].
    /// # Errors
    /// As [`Self::insert_mention_json_guarded`].
    pub fn insert_mention_guarded(
        &mut self,
        observation: &SharedObservation,
        anchor: TextPoint,
        focus: TextPoint,
        mention: &RichMention,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        if self.journal.ui.document_selected() {
            return Err(Error::Contract("use explicit document selection family"));
        }
        let command =
            InsertMention { anchor, focus, mention: MentionEntity::from_mention(mention) };
        let plan = command.plan(&self.codec, &self.document)?;
        let caret = plan.caret;
        self.apply_with_state_inner(
            vec![Command::InsertMention(command)],
            SelectionUpdate::Set(Some(Selection::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            PendingFormatsUpdate::Set(Some(plan.pending)),
            None,
            Some(&plan.document),
        )
    }

    /// Set, replace or clear one image's link, exactly like local `setImageLink`:
    /// `{"image": imageId, "href": url|null, "newWindow"?: bool}` (`image` is the image's
    /// `breditor/image-id`). The href and new-window choice are one paired field, so peers
    /// never see half of a change. An identical value is an exact no-op.
    /// # Errors
    /// Stale/read-only owners, a non-V4 owner, a non-canonical or unsafe target, `newWindow`
    /// with a clear, a missing image and a link on a decorative image publish nothing.
    pub fn set_image_link_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let (image, link) =
            decode_rich_image_link_command(&super::paragraphs::context(&self.codec), input)
                .map_err(|_| Error::Contract("image link intent"))?;
        self.set_image_link_guarded(observation, &image, link.as_ref())
    }
    /// Typed form of [`Self::set_image_link_json_guarded`].
    /// # Errors
    /// As [`Self::set_image_link_json_guarded`].
    pub fn set_image_link_guarded(
        &mut self,
        observation: &SharedObservation,
        image: &ImageId,
        link: Option<&RichImageLink>,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let context = super::paragraphs::context(&self.codec);
        if !context.schema().supports_rich_image_links() {
            return Err(Error::Contract("shared image links require rich language V4"));
        }
        if link.is_some()
            && self
                .document
                .image(image)
                .map_err(|_| Error::Contract("shared image link target"))?
                .is_some_and(|binding| binding.alt().is_decorative())
        {
            return Err(Error::Contract("a decorative image cannot be linked"));
        }
        let action = CoreSetImageLink::capture(&self.document, image, link)
            .map_err(|_| Error::Contract("shared image link target"))?;
        let Some(edit) = action
            .apply(&context, &self.document)
            .map_err(|_| Error::Contract("shared image link admission"))?
        else {
            return Ok(false);
        };
        let block = self.image_block(image)?;
        self.apply_with_state_inner(
            vec![Command::SetImageLink(SetImageLink {
                block,
                href: link.map(|link| link.href().as_str().to_owned()),
                new_window: link.is_some_and(RichImageLink::new_window),
            })],
            SelectionUpdate::Map,
            PendingFormatsUpdate::Map,
            None,
            Some(edit.document()),
        )
    }
    fn image_block(&self, image: &ImageId) -> Result<String, Error> {
        let path =
            self.document.image_path(image).ok_or(Error::Contract("shared image link target"))?;
        self.document
            .document()
            .node_at(path)
            .ok()
            .and_then(breditor_core::document::NodeRef::as_element)
            .and_then(|node| {
                node.properties()
                    .get(&QualifiedName::try_new("breditor/block-id").ok()?)
                    .and_then(PropertyValue::as_string)
                    .map(str::to_owned)
            })
            .ok_or(Error::Contract("shared image link target"))
    }
}
