use crate::{
    action::{
        ActionStateValue, ActionStateValueContract, ActionStateValueVersion, ActionValue,
        ActionValueError,
    },
    document::{Format, FormatSet, PropertyMap, PropertyObject, PropertyValue, PropertyValueInner},
    identity::QualifiedName,
};

/// Stable qualified name of the current inline-format property-map state value.
///
/// This intentionally matches the typed input contract name: every uniform
/// output is the canonical `Set` branch accepted by that input. Input and
/// output versions remain independently typed so either side can evolve only
/// by making an explicit compatibility decision.
pub const INLINE_FORMAT_PROPERTIES_STATE_CONTRACT_NAME: &str =
    super::SET_INLINE_FORMAT_INPUT_CONTRACT_NAME;

/// Version of [`inline_format_properties_state_contract`].
pub const INLINE_FORMAT_PROPERTIES_STATE_VERSION: ActionStateValueVersion =
    ActionStateValueVersion::one();

/// Returns the exact output contract used by property-aware inline-format actions.
///
/// A uniform value has the closed shape
/// `{ "operation": "set", "properties": [{ "name": QualifiedName, "value": Value }] }`.
/// Property entries are in strict lexical name order. `Unset` means the format
/// is absent everywhere observed, while `Mixed` means presence or complete
/// property maps differ across the observed text.
#[must_use]
pub fn inline_format_properties_state_contract() -> ActionStateValueContract {
    ActionStateValueContract::new(
        QualifiedName::from_known_static(INLINE_FORMAT_PROPERTIES_STATE_CONTRACT_NAME),
        INLINE_FORMAT_PROPERTIES_STATE_VERSION,
    )
}

/// Incremental exact scan of one inline-format kind across relevant text runs.
///
/// Empty fragments contribute no observation. Callers explicitly observe a
/// `FormatSet` for a collapsed selection so the effective typing-format state
/// still distinguishes an absent format from a uniform empty property map.
#[derive(Default)]
pub(super) struct InlineFormatPropertiesScan {
    absent: bool,
    first: Option<PropertyMap>,
    different: bool,
}

impl InlineFormatPropertiesScan {
    pub(super) fn observe_formats(&mut self, formats: &FormatSet, format_kind: &QualifiedName) {
        self.observe_format(formats.get(format_kind));
    }

    /// Observes the already-looked-up instance for one non-empty text run.
    ///
    /// The set action uses this entry point so activation and property values
    /// share one lookup and one traversal of selected runs.
    pub(super) fn observe_format(&mut self, format: Option<&Format>) {
        let Some(format) = format else {
            self.absent = true;
            return;
        };
        let properties = format.properties();
        if self.first.as_ref().is_some_and(|first| first != properties) {
            self.different = true;
        } else if self.first.is_none() {
            self.first = Some(properties.clone());
        }
    }

    pub(super) fn finish(self) -> Result<ActionStateValue, ActionValueError> {
        let contract = inline_format_properties_state_contract();
        if self.different || (self.absent && self.first.is_some()) {
            return Ok(ActionStateValue::mixed(contract));
        }
        match self.first {
            Some(properties) => {
                Ok(ActionStateValue::uniform(contract, property_map_action_value(&properties)?))
            }
            None => Ok(ActionStateValue::unset(contract)),
        }
    }
}

pub(super) fn properties_state_for_formats(
    formats: &FormatSet,
    format_kind: &QualifiedName,
) -> Result<ActionStateValue, ActionValueError> {
    let mut scan = InlineFormatPropertiesScan::default();
    scan.observe_formats(formats, format_kind);
    scan.finish()
}

fn property_map_action_value(properties: &PropertyMap) -> Result<ActionValue, ActionValueError> {
    let mut entries = Vec::with_capacity(properties.len());
    for (name, value) in properties {
        entries.push(ActionValue::try_object(vec![
            ("name".to_owned(), ActionValue::try_from_string(name.as_str())?),
            ("value".to_owned(), property_value_action_value(value)?),
        ])?);
    }
    ActionValue::try_object(vec![
        ("operation".to_owned(), ActionValue::try_from_string("set")?),
        ("properties".to_owned(), ActionValue::try_array(entries)?),
    ])
}

fn property_value_action_value(value: &PropertyValue) -> Result<ActionValue, ActionValueError> {
    match value.inner() {
        PropertyValueInner::Null => Ok(ActionValue::null()),
        PropertyValueInner::Boolean(value) => Ok(ActionValue::boolean(*value)),
        PropertyValueInner::Integer(value) => Ok(ActionValue::from_integer(*value)),
        PropertyValueInner::String(value) => ActionValue::try_from_string(value),
        PropertyValueInner::Array(values) => values
            .iter()
            .map(property_value_action_value)
            .collect::<Result<Vec<_>, _>>()
            .and_then(ActionValue::try_array),
        PropertyValueInner::Object(values) => property_object_action_value(values),
    }
}

fn property_object_action_value(values: &PropertyObject) -> Result<ActionValue, ActionValueError> {
    values
        .into_iter()
        .map(|(name, value)| Ok((name.to_owned(), property_value_action_value(value)?)))
        .collect::<Result<Vec<_>, ActionValueError>>()
        .and_then(ActionValue::try_object)
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        action::ActionStateValue,
        document::{Format, FormatSet, PropertyMap, PropertyValue, TextFragment, TextRun},
        identity::QualifiedName,
    };

    use super::{
        InlineFormatPropertiesScan, inline_format_properties_state_contract,
        properties_state_for_formats,
    };

    fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
        QualifiedName::try_new(value).map_err(Into::into)
    }

    fn link(href: &str) -> Result<Format, Box<dyn Error>> {
        Ok(Format::new(
            name("example/link")?,
            PropertyMap::try_from_sorted(vec![(
                name("example/href")?,
                PropertyValue::from_string(href),
            )])?,
        ))
    }

    #[test]
    fn absent_and_uniform_empty_maps_remain_distinct() -> Result<(), Box<dyn Error>> {
        let kind = name("example/link")?;
        assert!(matches!(
            properties_state_for_formats(&FormatSet::default(), &kind)?,
            ActionStateValue::Unset { ref contract }
                if contract == &inline_format_properties_state_contract()
        ));

        let formats =
            FormatSet::try_from_formats(vec![Format::new(kind.clone(), PropertyMap::default())])?;
        let ActionStateValue::Uniform { contract, value } =
            properties_state_for_formats(&formats, &kind)?
        else {
            return Err("expected a uniform empty property map".into());
        };
        assert_eq!(contract, inline_format_properties_state_contract());
        assert_eq!(
            value
                .as_object()
                .and_then(|object| object.get("operation"))
                .and_then(crate::action::ActionValue::as_string),
            Some("set")
        );
        assert_eq!(
            value
                .as_object()
                .and_then(|object| object.get("properties"))
                .and_then(crate::action::ActionValue::as_array)
                .map(<[_]>::len),
            Some(0)
        );
        Ok(())
    }

    #[test]
    fn scan_reports_uniform_different_and_partial_property_maps() -> Result<(), Box<dyn Error>> {
        let kind = name("example/link")?;
        let one = FormatSet::try_from_formats(vec![link("https://one.test")?])?;
        let two = FormatSet::try_from_formats(vec![link("https://two.test")?])?;
        let plain = FormatSet::default();

        let mut uniform = InlineFormatPropertiesScan::default();
        uniform.observe_formats(&one, &kind);
        uniform.observe_formats(&one, &kind);
        let ActionStateValue::Uniform { value, .. } = uniform.finish()? else {
            return Err("expected uniform properties".into());
        };
        let property = value
            .as_object()
            .and_then(|object| object.get("properties"))
            .and_then(crate::action::ActionValue::as_array)
            .and_then(|values| values.first())
            .and_then(crate::action::ActionValue::as_object)
            .ok_or("missing encoded property")?;
        assert_eq!(
            property.get("name").and_then(crate::action::ActionValue::as_string),
            Some("example/href")
        );
        assert_eq!(
            property.get("value").and_then(crate::action::ActionValue::as_string),
            Some("https://one.test")
        );

        for formats in [&two, &plain] {
            let fragment = TextFragment::try_from_runs(vec![
                TextRun::try_new("a", one.clone())?,
                TextRun::try_new("b", formats.clone())?,
            ])?;
            let mut scan = InlineFormatPropertiesScan::default();
            for run in &fragment {
                scan.observe_format(run.formats().get(&kind));
            }
            assert!(matches!(scan.finish()?, ActionStateValue::Mixed { .. }));
        }
        Ok(())
    }
}
