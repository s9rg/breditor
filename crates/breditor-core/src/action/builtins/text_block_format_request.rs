//! Shared format policy; tree capture and atomic publication live separately.
use super::{
    SetInlineFormatInput,
    clear_inline_formats::clear_fragment,
    set_inline_format::{
        SetInlineFormatScan, indicator_for_formats, replace_format, replace_fragment_format,
        unavailable_indicator,
    },
};
use crate::{
    action::{ActionActivation, ActionFault, ActionStateIndicator, ActionStateValue},
    document::{Format, FormatSet, PropertyMap, TextFragment},
    identity::QualifiedName,
    state::EditorState,
};

pub(super) enum FormatRequest<'a> {
    Toggle(&'a QualifiedName),
    Set(&'a QualifiedName, &'a SetInlineFormatInput),
    Clear,
}

impl FormatRequest<'_> {
    pub(super) fn supported(&self, state: &EditorState) -> bool {
        match self {
            Self::Toggle(kind) => state.context().schema().is_property_free_inline_format(kind),
            Self::Set(kind, _) => state.context().schema().allows_text_format(kind),
            Self::Clear => true,
        }
    }

    pub(super) fn unavailable(&self) -> ActionStateIndicator {
        match self {
            Self::Toggle(_) => {
                ActionStateIndicator::new(ActionActivation::Inactive, ActionStateValue::Unsupported)
            }
            Self::Set(_, _) => unavailable_indicator(),
            Self::Clear => ActionStateIndicator::stateless(),
        }
    }

    fn observed_kind(&self) -> Option<&QualifiedName> {
        match self {
            Self::Toggle(kind) | Self::Set(kind, _) => Some(kind),
            Self::Clear => None,
        }
    }

    fn desired_for_scan(&self) -> Option<Format> {
        match self {
            Self::Set(kind, SetInlineFormatInput::Set(properties)) => {
                Some(Format::new((*kind).clone(), properties.clone()))
            }
            Self::Toggle(_) | Self::Set(_, SetInlineFormatInput::Remove) | Self::Clear => None,
        }
    }

    fn project(&self, indicator: ActionStateIndicator) -> ActionStateIndicator {
        match self {
            Self::Toggle(_) => {
                ActionStateIndicator::new(indicator.activation(), ActionStateValue::Unsupported)
            }
            Self::Set(_, _) => indicator,
            Self::Clear => ActionStateIndicator::stateless(),
        }
    }

    pub(super) fn indicator(
        &self,
        selected: &[TextFragment],
    ) -> Result<ActionStateIndicator, ActionFault> {
        let Some(kind) = self.observed_kind() else {
            return Ok(self.unavailable());
        };
        let desired = self.desired_for_scan();
        let mut scan = SetInlineFormatScan::default();
        for fragment in selected {
            scan.observe_fragment(fragment, kind, desired.as_ref());
        }
        Ok(self.project(scan.finish()?))
    }

    pub(super) fn collapsed_indicator(
        &self,
        formats: &FormatSet,
    ) -> Result<ActionStateIndicator, ActionFault> {
        let Some(kind) = self.observed_kind() else {
            return Ok(self.unavailable());
        };
        Ok(self.project(indicator_for_formats(formats, kind, self.desired_for_scan().as_ref())?))
    }

    pub(super) fn valid(&self, state: &EditorState) -> bool {
        self.desired_for_scan().as_ref().is_none_or(|format| {
            state
                .context()
                .schema()
                .validate_inline_format_instance(state.context().limits(), format)
                .is_ok()
        })
    }

    pub(super) fn rewrite(&self, activation: ActionActivation) -> FormatRewrite<'_> {
        match self {
            Self::Toggle(kind) => FormatRewrite::One(
                kind,
                if activation == ActionActivation::Active {
                    None
                } else {
                    Some(Format::new((*kind).clone(), PropertyMap::default()))
                },
            ),
            Self::Set(kind, _) => FormatRewrite::One(kind, self.desired_for_scan()),
            Self::Clear => FormatRewrite::Clear,
        }
    }
}

pub(super) enum FormatRewrite<'a> {
    One(&'a QualifiedName, Option<Format>),
    Clear,
}

impl FormatRewrite<'_> {
    pub(super) fn fragment(
        &self,
        state: &EditorState,
        fragment: &TextFragment,
    ) -> Result<Option<TextFragment>, ActionFault> {
        let limits = state.context().limits();
        match self {
            Self::One(kind, desired) => replace_fragment_format(
                fragment,
                kind,
                desired.as_ref(),
                limits.max_formats_per_text(),
                limits.max_text_bytes(),
            ),
            Self::Clear => clear_fragment(fragment, limits.max_text_bytes()),
        }
    }

    pub(super) fn formats(
        &self,
        state: &EditorState,
        formats: &FormatSet,
    ) -> Result<Option<FormatSet>, ActionFault> {
        match self {
            Self::One(kind, desired) => replace_format(
                formats,
                kind,
                desired.as_ref(),
                state.context().limits().max_formats_per_text(),
            ),
            Self::Clear => Ok(Some(FormatSet::default())),
        }
    }
}
