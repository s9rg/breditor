//! Exact conversion between strict JSON property records and runtime values.

use std::collections::BTreeMap;

use thiserror::Error;

use crate::{
    document::{
        LocalInvariantError, PropertyInteger, PropertyIntegerError, PropertyMap, PropertyMapError,
        PropertyObject, PropertyValue, PropertyValueInner,
    },
    identity::{QualifiedName, QualifiedNameError},
    record::{PropertyMapRecord, PropertyValueRecord},
};

#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub(crate) enum PropertyPayloadError {
    #[error("invalid qualified property name: {source}")]
    InvalidPropertyName {
        #[source]
        source: QualifiedNameError,
    },
    #[error("invalid exact property integer: {source}")]
    InvalidInteger {
        #[source]
        source: PropertyIntegerError,
    },
    #[error("invalid nested property object: {source}")]
    InvalidObject {
        #[source]
        source: LocalInvariantError,
    },
    #[error("noncanonical runtime property map: {source}")]
    NonCanonicalMap {
        #[source]
        source: PropertyMapError,
    },
}

/// Reconstructs one strict sorted property record without normalization.
pub(crate) fn decode_property_map_record(
    record: PropertyMapRecord,
) -> Result<PropertyMap, PropertyPayloadError> {
    let mut values = Vec::with_capacity(record.0.len());
    for (name, value) in record.0 {
        let name = QualifiedName::try_from(name)
            .map_err(|source| PropertyPayloadError::InvalidPropertyName { source })?;
        values.push((name, decode_property_value_record(value)?));
    }
    PropertyMap::try_from_sorted(values)
        .map_err(|source| PropertyPayloadError::NonCanonicalMap { source })
}

/// Projects one canonical runtime property map into the strict owned record.
pub(crate) fn encode_property_map_record(properties: &PropertyMap) -> PropertyMapRecord {
    PropertyMapRecord(
        properties
            .iter()
            .map(|(name, value)| (name.as_str().to_owned(), encode_property_value_record(value)))
            .collect(),
    )
}

fn decode_property_value_record(
    record: PropertyValueRecord,
) -> Result<PropertyValue, PropertyPayloadError> {
    match record {
        PropertyValueRecord::Null => Ok(PropertyValue::null()),
        PropertyValueRecord::Boolean(value) => Ok(PropertyValue::boolean(value)),
        PropertyValueRecord::Integer(value) => PropertyInteger::try_new(value)
            .map(PropertyValue::from_integer)
            .map_err(|source| PropertyPayloadError::InvalidInteger { source }),
        PropertyValueRecord::String(value) => Ok(PropertyValue::from_string(value)),
        PropertyValueRecord::Array(records) => records
            .into_iter()
            .map(decode_property_value_record)
            .collect::<Result<Vec<_>, _>>()
            .map(PropertyValue::array),
        PropertyValueRecord::Object(records) => {
            let values = records
                .into_iter()
                .map(|(key, value)| Ok((key, decode_property_value_record(value)?)))
                .collect::<Result<BTreeMap<_, _>, PropertyPayloadError>>()?;
            PropertyObject::try_from_map(values)
                .map(PropertyValue::object)
                .map_err(|source| PropertyPayloadError::InvalidObject { source })
        }
    }
}

fn encode_property_value_record(value: &PropertyValue) -> PropertyValueRecord {
    match value.inner() {
        PropertyValueInner::Null => PropertyValueRecord::Null,
        PropertyValueInner::Boolean(value) => PropertyValueRecord::Boolean(*value),
        PropertyValueInner::Integer(value) => PropertyValueRecord::Integer(value.get()),
        PropertyValueInner::String(value) => PropertyValueRecord::String(value.to_string()),
        PropertyValueInner::Array(values) => {
            PropertyValueRecord::Array(values.iter().map(encode_property_value_record).collect())
        }
        PropertyValueInner::Object(values) => PropertyValueRecord::Object(
            values
                .iter()
                .map(|(key, value)| (key.to_owned(), encode_property_value_record(value)))
                .collect(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::{decode_property_map_record, encode_property_map_record};
    use crate::record::{PropertyMapRecord, PropertyValueRecord};
    use std::collections::BTreeMap;

    #[test]
    fn strict_property_records_round_trip_without_dropping_nested_values()
    -> Result<(), Box<dyn std::error::Error>> {
        let record = PropertyMapRecord(BTreeMap::from([
            ("example/enabled".to_owned(), PropertyValueRecord::Boolean(true)),
            (
                "example/value".to_owned(),
                PropertyValueRecord::Object(BTreeMap::from([(
                    "nested-key".to_owned(),
                    PropertyValueRecord::Array(vec![
                        PropertyValueRecord::Null,
                        PropertyValueRecord::Integer(7),
                        PropertyValueRecord::String("exact".to_owned()),
                    ]),
                )])),
            ),
        ]));

        let runtime = decode_property_map_record(record.clone())?;
        assert_eq!(encode_property_map_record(&runtime), record);
        Ok(())
    }
}
