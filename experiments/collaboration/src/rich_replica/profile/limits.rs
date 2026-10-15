//! Host document budgets may tighten, never widen, core defaults.
use crate::Error;
use breditor_core::schema::DocumentLimits;
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[allow(clippy::struct_field_names)] // Names match the existing DocumentLimits contract.
pub(super) struct Limits {
    max_json_bytes: Option<usize>,
    max_node_depth: Option<usize>,
    max_nodes: Option<usize>,
    max_children_per_element: Option<usize>,
    max_text_bytes: Option<usize>,
    max_total_text_bytes: Option<usize>,
    max_formats_per_text: Option<usize>,
    max_properties_per_owner: Option<usize>,
    max_property_depth: Option<usize>,
    max_property_values: Option<usize>,
    max_property_string_bytes: Option<usize>,
    max_total_property_string_bytes: Option<usize>,
}
macro_rules! tighten {
    ($($name:ident => $setter:ident),+ $(,)?) => {
        impl Limits {
            pub fn compile(self) -> Result<DocumentLimits, Error> {
                let mut limits = DocumentLimits::default();
                $(if let Some(value) = self.$name { limits = limits.$setter(value); })+
                validate(&limits)?;
                Ok(limits)
            }
        }
        pub(super) fn validate(limits: &DocumentLimits) -> Result<(), Error> {
            let default = DocumentLimits::default();
            if $(limits.$name() > default.$name())||+ {
                return Err(Error::Contract("shared profile limits only tighten defaults"));
            }
            Ok(())
        }
    };
}
tighten!(
    max_json_bytes => with_max_json_bytes,
    max_node_depth => with_max_node_depth,
    max_nodes => with_max_nodes,
    max_children_per_element => with_max_children_per_element,
    max_text_bytes => with_max_text_bytes,
    max_total_text_bytes => with_max_total_text_bytes,
    max_formats_per_text => with_max_formats_per_text,
    max_properties_per_owner => with_max_properties_per_owner,
    max_property_depth => with_max_property_depth,
    max_property_values => with_max_property_values,
    max_property_string_bytes => with_max_property_string_bytes,
    max_total_property_string_bytes => with_max_total_property_string_bytes,
);
pub(super) fn descriptor(limits: &DocumentLimits) -> Value {
    json!({"maxJsonBytes":limits.max_json_bytes(),"maxNodeDepth":limits.max_node_depth(),
        "maxNodes":limits.max_nodes(),"maxChildrenPerElement":limits.max_children_per_element(),
        "maxTextBytes":limits.max_text_bytes(),"maxTotalTextBytes":limits.max_total_text_bytes(),
        "maxFormatsPerText":limits.max_formats_per_text(),"maxPropertiesPerOwner":limits.max_properties_per_owner(),
        "maxPropertyDepth":limits.max_property_depth(),"maxPropertyValues":limits.max_property_values(),
        "maxPropertyStringBytes":limits.max_property_string_bytes(),"maxTotalPropertyStringBytes":limits.max_total_property_string_bytes()})
}
