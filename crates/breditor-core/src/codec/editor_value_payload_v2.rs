//! Checked property-preserving conversions for shared editor values.
//!
//! Snapshot and selection records retain their exact V1 shapes. Pending
//! formats use a distinct V2 record so the V1 boundary can remain permanently
//! property-free and fail closed for every typed-format schema.

use std::{error::Error, fmt};

use crate::{
    document::{Format, FormatSet, FormatSetError},
    identity::QualifiedName,
    record::PendingFormatRecordV2,
    state::EditorContext,
};

use super::{
    BoundedDiagnostic,
    property_payload::{
        PropertyPayloadError, decode_property_map_record, encode_property_map_record,
    },
};

/// Stable category for a property-preserving editor-value conversion failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub(crate) enum EditorValueRecordV2ErrorCode {
    /// A pending-format type does not satisfy the qualified-name grammar.
    InvalidFormatName,
    /// A top-level property key does not satisfy the qualified-name grammar.
    InvalidPropertyName,
    /// A property value cannot enter the deterministic runtime value model.
    InvalidPropertyValue,
    /// A reconstructed or supplied format violates the compiled schema contract.
    InvalidFormatInstance,
    /// The pending-format array exceeds the active per-text format ceiling.
    PendingFormatLimit,
    /// Pending formats are not sorted and unique by kind.
    NonCanonicalPendingFormats,
    /// Fixed-width aggregate property-value accounting overflowed.
    PropertyValueCountOverflow,
    /// Pending formats exceed the aggregate property-value ceiling.
    PropertyValueCountLimit,
    /// Fixed-width aggregate property-string accounting overflowed.
    PropertyStringBytesOverflow,
    /// Pending formats exceed the aggregate property-string byte ceiling.
    PropertyStringBytesLimit,
}

impl EditorValueRecordV2ErrorCode {
    /// Returns the stable internal category name used by enclosing codecs.
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidFormatName => "editor_value_record_v2.invalid_format_name",
            Self::InvalidPropertyName => "editor_value_record_v2.invalid_property_name",
            Self::InvalidPropertyValue => "editor_value_record_v2.invalid_property_value",
            Self::InvalidFormatInstance => "editor_value_record_v2.invalid_format_instance",
            Self::PendingFormatLimit => "editor_value_record_v2.pending_format_limit",
            Self::NonCanonicalPendingFormats => {
                "editor_value_record_v2.noncanonical_pending_formats"
            }
            Self::PropertyValueCountOverflow => {
                "editor_value_record_v2.property_value_count_overflow"
            }
            Self::PropertyValueCountLimit => "editor_value_record_v2.property_value_count_limit",
            Self::PropertyStringBytesOverflow => {
                "editor_value_record_v2.property_string_bytes_overflow"
            }
            Self::PropertyStringBytesLimit => "editor_value_record_v2.property_string_bytes_limit",
        }
    }
}

/// Bounded, redacted details for one invalid V2 editor-value payload.
///
/// The optional index is stable control-flow data. The diagnostic never owns
/// an untrusted property name or scalar value, and its retained text is capped
/// by [`BoundedDiagnostic`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct EditorValueRecordV2Error {
    code: EditorValueRecordV2ErrorCode,
    format_index: Option<u64>,
    diagnostic: BoundedDiagnostic,
}

impl EditorValueRecordV2Error {
    /// Returns the stable failure category.
    pub(crate) const fn code(&self) -> EditorValueRecordV2ErrorCode {
        self.code
    }

    /// Returns the zero-based pending-format index when one entry owns the failure.
    pub(crate) const fn format_index(&self) -> Option<u64> {
        self.format_index
    }

    /// Returns the bounded human-readable diagnostic preview.
    pub(crate) fn diagnostic(&self) -> &str {
        self.diagnostic.preview()
    }

    /// Returns the diagnostic together with its original-size metadata.
    pub(crate) const fn diagnostic_value(&self) -> &BoundedDiagnostic {
        &self.diagnostic
    }

    fn new(
        code: EditorValueRecordV2ErrorCode,
        format_index: Option<u64>,
        diagnostic: impl Into<BoundedDiagnostic>,
    ) -> Self {
        Self { code, format_index, diagnostic: diagnostic.into() }
    }
}

impl fmt::Display for EditorValueRecordV2Error {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.code.as_str())?;
        if let Some(format_index) = self.format_index {
            write!(formatter, " at pending format {format_index}")?;
        }
        write!(formatter, ": {}", self.diagnostic)
    }
}

impl Error for EditorValueRecordV2Error {}

/// Reconstructs one exact, canonical typed pending-format set.
///
/// Strict property records are converted without sorting or value coercion.
/// Every reconstructed instance passes the same compiled-schema validator used
/// by documents, pending runtime state, operations, and format actions.
pub(crate) fn decode_pending_format_records_v2(
    records: Vec<PendingFormatRecordV2>,
    context: &EditorContext,
) -> Result<FormatSet, EditorValueRecordV2Error> {
    check_pending_format_count(records.len(), context)?;
    let formats = records
        .into_iter()
        .enumerate()
        .map(|(format_index, record)| decode_pending_format(record, usize_to_u64(format_index)))
        .collect::<Result<Vec<_>, _>>()?;
    let formats =
        FormatSet::try_from_formats(formats).map_err(|error| noncanonical_formats_error(&error))?;
    validate_pending_formats(&formats, context)?;
    Ok(formats)
}

/// Projects one exact typed pending-format set without dropping properties.
///
/// The runtime set is already canonical by construction, but it is still
/// checked against the receiving context before a durable representation is
/// returned. This makes encoding fail closed for a value built independently
/// of that context.
pub(crate) fn encode_pending_format_records_v2(
    formats: &FormatSet,
    context: &EditorContext,
) -> Result<Vec<PendingFormatRecordV2>, EditorValueRecordV2Error> {
    check_pending_format_count(formats.len(), context)?;
    validate_pending_formats(formats, context)?;
    Ok(formats
        .iter()
        .map(|format| PendingFormatRecordV2 {
            format_type: format.kind().as_str().to_owned(),
            properties: encode_property_map_record(format.properties()),
        })
        .collect())
}

fn decode_pending_format(
    record: PendingFormatRecordV2,
    format_index: u64,
) -> Result<Format, EditorValueRecordV2Error> {
    let kind = QualifiedName::try_from(record.format_type).map_err(|_| {
        EditorValueRecordV2Error::new(
            EditorValueRecordV2ErrorCode::InvalidFormatName,
            Some(format_index),
            "pending format has an invalid qualified type name",
        )
    })?;
    let properties = decode_property_map_record(record.properties)
        .map_err(|error| property_payload_error(&error, format_index))?;
    Ok(Format::new(kind, properties))
}

fn property_payload_error(
    error: &PropertyPayloadError,
    format_index: u64,
) -> EditorValueRecordV2Error {
    let (code, diagnostic) = match error {
        PropertyPayloadError::InvalidPropertyName { .. } => (
            EditorValueRecordV2ErrorCode::InvalidPropertyName,
            "pending format has an invalid qualified property name",
        ),
        PropertyPayloadError::InvalidInteger { .. }
        | PropertyPayloadError::InvalidObject { .. }
        | PropertyPayloadError::NonCanonicalMap { .. } => (
            EditorValueRecordV2ErrorCode::InvalidPropertyValue,
            "pending format has an invalid deterministic property value",
        ),
    };
    EditorValueRecordV2Error::new(code, Some(format_index), diagnostic)
}

fn noncanonical_formats_error(error: &FormatSetError) -> EditorValueRecordV2Error {
    let format_index = match error {
        FormatSetError::DuplicateFormat { index } | FormatSetError::NonCanonicalOrder { index } => {
            usize_to_u64(*index)
        }
    };
    EditorValueRecordV2Error::new(
        EditorValueRecordV2ErrorCode::NonCanonicalPendingFormats,
        Some(format_index),
        "pending formats are not in strict ascending unique order",
    )
}

fn validate_pending_formats(
    formats: &FormatSet,
    context: &EditorContext,
) -> Result<(), EditorValueRecordV2Error> {
    let mut property_value_count = 0_u64;
    let mut property_string_bytes = 0_u64;
    for (format_index, format) in formats.iter().enumerate() {
        let format_index = usize_to_u64(format_index);
        let summary = context
            .schema()
            .validate_inline_format_instance(context.limits(), format)
            .map_err(|report| {
                EditorValueRecordV2Error::new(
                    EditorValueRecordV2ErrorCode::InvalidFormatInstance,
                    Some(format_index),
                    format!(
                        "pending format violates the active schema contract with {} issue(s)",
                        report.issue_count()
                    ),
                )
            })?;
        property_value_count =
            property_value_count.checked_add(summary.property_value_count()).ok_or_else(|| {
                EditorValueRecordV2Error::new(
                    EditorValueRecordV2ErrorCode::PropertyValueCountOverflow,
                    Some(format_index),
                    "pending-format property-value accounting overflowed",
                )
            })?;
        property_string_bytes = property_string_bytes
            .checked_add(summary.property_string_bytes())
            .ok_or_else(|| {
                EditorValueRecordV2Error::new(
                    EditorValueRecordV2ErrorCode::PropertyStringBytesOverflow,
                    Some(format_index),
                    "pending-format property-string accounting overflowed",
                )
            })?;
    }
    check_property_totals(property_value_count, property_string_bytes, context)
}

fn check_pending_format_count(
    actual: usize,
    context: &EditorContext,
) -> Result<(), EditorValueRecordV2Error> {
    let maximum = context.limits().max_formats_per_text();
    if actual > maximum {
        return Err(EditorValueRecordV2Error::new(
            EditorValueRecordV2ErrorCode::PendingFormatLimit,
            None,
            format!(
                "pending format count is {}; the configured maximum is {}",
                usize_to_u64(actual),
                usize_to_u64(maximum)
            ),
        ));
    }
    Ok(())
}

fn check_property_totals(
    property_value_count: u64,
    property_string_bytes: u64,
    context: &EditorContext,
) -> Result<(), EditorValueRecordV2Error> {
    let maximum_values = usize_to_u64(context.limits().max_property_values());
    if property_value_count > maximum_values {
        return Err(EditorValueRecordV2Error::new(
            EditorValueRecordV2ErrorCode::PropertyValueCountLimit,
            None,
            format!(
                "pending formats have {property_value_count} property values; the configured maximum is {maximum_values}"
            ),
        ));
    }
    let maximum_string_bytes = usize_to_u64(context.limits().max_total_property_string_bytes());
    if property_string_bytes > maximum_string_bytes {
        return Err(EditorValueRecordV2Error::new(
            EditorValueRecordV2ErrorCode::PropertyStringBytesLimit,
            None,
            format!(
                "pending formats have {property_string_bytes} property-string bytes; the configured maximum is {maximum_string_bytes}"
            ),
        ));
    }
    Ok(())
}

fn usize_to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, error::Error};

    use crate::{
        codec::{
            MAX_DIAGNOSTIC_PREVIEW_BYTES,
            editor_value_payload_v1::{
                decode_selection_record_v1, decode_snapshot_id_v1, encode_selection_record_v1,
                encode_snapshot_id_v1,
            },
        },
        document::{Format, FormatSet, PropertyInteger, PropertyMap, PropertyValue},
        extension::{
            ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
            InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
            InlineFormatSpecV1, PropertyPresenceV1,
        },
        identity::QualifiedName,
        position::{Affinity, NodePath, Point},
        record::{PendingFormatRecordV2, PropertyMapRecord, PropertyValueRecord},
        schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
        selection::{RangeSelection, Selection},
        state::{EditorContext, LineageId, Revision, SnapshotId},
    };

    use super::{
        EditorValueRecordV2Error, EditorValueRecordV2ErrorCode, decode_pending_format_records_v2,
        encode_pending_format_records_v2,
    };

    const LINK: &str = "example/link";
    const TAG: &str = "example/tag";
    const ENABLED: &str = "example/enabled";
    const HREF: &str = "example/href";
    const NAME: &str = "example/name";
    const PRIORITY: &str = "example/priority";

    fn required_error<T>(
        result: Result<T, EditorValueRecordV2Error>,
        message: &'static str,
    ) -> Result<EditorValueRecordV2Error, Box<dyn Error>> {
        let Err(error) = result else {
            return Err(message.into());
        };
        Ok(error)
    }

    fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
        QualifiedName::try_new(value).map_err(Into::into)
    }

    fn property_contract(
        format: &str,
        properties: Vec<InlineFormatPropertySpecV1>,
    ) -> Result<InlineFormatPropertyContractV1, Box<dyn Error>> {
        InlineFormatPropertyContractV1::try_new(name(format)?, properties).map_err(Into::into)
    }

    fn typed_schema() -> Result<CompiledSchema, Box<dyn Error>> {
        let zero = PropertyInteger::try_new(0)?;
        let ten = PropertyInteger::try_new(10)?;
        let link = property_contract(
            LINK,
            vec![
                InlineFormatPropertySpecV1::new(
                    name(ENABLED)?,
                    PropertyPresenceV1::Required,
                    InlineFormatPropertyTypeV1::boolean(),
                ),
                InlineFormatPropertySpecV1::new(
                    name(HREF)?,
                    PropertyPresenceV1::Required,
                    InlineFormatPropertyTypeV1::try_string(1, 64)?,
                ),
                InlineFormatPropertySpecV1::new(
                    name(PRIORITY)?,
                    PropertyPresenceV1::Required,
                    InlineFormatPropertyTypeV1::try_integer(Some(zero), Some(ten))?,
                ),
            ],
        )?;
        let tag = property_contract(
            TAG,
            vec![InlineFormatPropertySpecV1::new(
                name(NAME)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 64)?,
            )],
        )?;
        let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
            ExtensionId::new(name("example/editor-values")?, ExtensionVersion::try_new(1)?),
            Vec::new(),
            Vec::new(),
            vec![
                InlineFormatSpecV1::new(name(LINK)?, PersistedTypeRevision::one()),
                InlineFormatSpecV1::new(name(TAG)?, PersistedTypeRevision::one()),
            ],
            vec![link, tag],
        )?;
        let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
        CompiledSchema::try_compile_base_text_profile(
            SchemaId::new(name("example/editor-value-profile")?, SchemaVersion::try_new(1)?),
            &extensions,
        )
        .map_err(Into::into)
    }

    fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
        Ok(EditorContext::new(typed_schema()?, limits))
    }

    fn link(href: &str) -> Result<Format, Box<dyn Error>> {
        let properties = PropertyMap::try_from_sorted(vec![
            (name(ENABLED)?, PropertyValue::boolean(true)),
            (name(HREF)?, PropertyValue::from_string(href)),
            (name(PRIORITY)?, PropertyValue::from_integer(PropertyInteger::try_new(7)?)),
        ])?;
        Ok(Format::new(name(LINK)?, properties))
    }

    fn tag(value: &str) -> Result<Format, Box<dyn Error>> {
        Ok(Format::new(
            name(TAG)?,
            PropertyMap::try_from_sorted(vec![(name(NAME)?, PropertyValue::from_string(value))])?,
        ))
    }

    fn typed_formats() -> Result<FormatSet, Box<dyn Error>> {
        FormatSet::try_from_formats(vec![
            Format::new(name("breditor/strong")?, PropertyMap::default()),
            link("ab")?,
            tag("cd")?,
        ])
        .map_err(Into::into)
    }

    #[test]
    fn typed_pending_round_trip_preserves_exact_order_and_property_values()
    -> Result<(), Box<dyn Error>> {
        let context = context(DocumentLimits::default())?;
        let formats = typed_formats()?;

        let records = encode_pending_format_records_v2(&formats, &context)?;
        assert_eq!(records.len(), 3);
        assert!(records[0].properties.0.is_empty());
        assert_eq!(records[1].properties.0.get(ENABLED), Some(&PropertyValueRecord::Boolean(true)));
        assert_eq!(
            records[1].properties.0.get(HREF),
            Some(&PropertyValueRecord::String("ab".to_owned()))
        );
        assert_eq!(records[1].properties.0.get(PRIORITY), Some(&PropertyValueRecord::Integer(7)));
        assert_eq!(decode_pending_format_records_v2(records, &context)?, formats);
        Ok(())
    }

    #[test]
    fn selection_and_snapshot_continue_to_use_the_exact_v1_shapes() -> Result<(), Box<dyn Error>> {
        let snapshot =
            SnapshotId::new(LineageId::try_new("editor-value-v2")?, Revision::new(u64::MAX));
        let snapshot_record = encode_snapshot_id_v1(&snapshot);
        let revision = snapshot_record.revision.get().to_string();
        let decoded_snapshot = decode_snapshot_id_v1(&snapshot_record.lineage, &revision)?;
        assert_eq!(decoded_snapshot, snapshot);

        let selection: Selection = RangeSelection::new(
            Point::Children {
                parent_path: NodePath::root(),
                child_index: 0,
                affinity: Affinity::Before,
            },
            Point::Children {
                parent_path: NodePath::root(),
                child_index: 1,
                affinity: Affinity::After,
            },
        )
        .into();
        let selection_record = encode_selection_record_v1(&selection);
        assert_eq!(decode_selection_record_v1(selection_record)?, selection);
        Ok(())
    }

    #[test]
    fn malformed_payloads_are_indexed_and_do_not_retain_names_or_values()
    -> Result<(), Box<dyn Error>> {
        let context = context(DocumentLimits::default())?;
        let invalid_type = "sensitive-invalid-format-name";
        let error = required_error(
            decode_pending_format_records_v2(
                vec![PendingFormatRecordV2 {
                    format_type: invalid_type.to_owned(),
                    properties: PropertyMapRecord::default(),
                }],
                &context,
            ),
            "invalid type name unexpectedly decoded",
        )?;
        assert_eq!(error.code(), EditorValueRecordV2ErrorCode::InvalidFormatName);
        assert_eq!(error.format_index(), Some(0));
        assert!(!error.to_string().contains(invalid_type));

        let invalid_property_name = "Sensitive Property Name";
        let invalid_property_value = "sensitive-property-value";
        let error = required_error(
            decode_pending_format_records_v2(
                vec![PendingFormatRecordV2 {
                    format_type: LINK.to_owned(),
                    properties: PropertyMapRecord(BTreeMap::from([(
                        invalid_property_name.to_owned(),
                        PropertyValueRecord::String(invalid_property_value.to_owned()),
                    )])),
                }],
                &context,
            ),
            "invalid property name unexpectedly decoded",
        )?;
        assert_eq!(error.code(), EditorValueRecordV2ErrorCode::InvalidPropertyName);
        assert_eq!(error.format_index(), Some(0));
        assert!(!error.to_string().contains(invalid_property_name));
        assert!(!error.to_string().contains(invalid_property_value));

        let error = required_error(
            decode_pending_format_records_v2(
                vec![PendingFormatRecordV2 {
                    format_type: LINK.to_owned(),
                    properties: PropertyMapRecord(BTreeMap::from([
                        (ENABLED.to_owned(), PropertyValueRecord::Boolean(true)),
                        (HREF.to_owned(), PropertyValueRecord::Boolean(false)),
                        (PRIORITY.to_owned(), PropertyValueRecord::Integer(7)),
                    ])),
                }],
                &context,
            ),
            "schema-invalid scalar unexpectedly decoded",
        )?;
        assert_eq!(error.code(), EditorValueRecordV2ErrorCode::InvalidFormatInstance);
        assert_eq!(error.format_index(), Some(0));
        assert!(!error.to_string().contains(HREF));
        Ok(())
    }

    #[test]
    fn count_order_and_aggregate_property_limits_fail_closed() -> Result<(), Box<dyn Error>> {
        let default_context = context(DocumentLimits::default())?;
        let formats = typed_formats()?;
        let records = encode_pending_format_records_v2(&formats, &default_context)?;

        let count_context = context(DocumentLimits::default().with_max_formats_per_text(2))?;
        let count_error = required_error(
            decode_pending_format_records_v2(records.clone(), &count_context),
            "oversized format list unexpectedly decoded",
        )?;
        assert_eq!(count_error.code(), EditorValueRecordV2ErrorCode::PendingFormatLimit);
        assert_eq!(count_error.format_index(), None);

        let mut reversed = records.clone();
        reversed.reverse();
        let order_error = required_error(
            decode_pending_format_records_v2(reversed, &default_context),
            "descending formats unexpectedly decoded",
        )?;
        assert_eq!(order_error.code(), EditorValueRecordV2ErrorCode::NonCanonicalPendingFormats);
        assert_eq!(order_error.format_index(), Some(1));

        let value_context = context(DocumentLimits::default().with_max_property_values(3))?;
        let value_error = required_error(
            decode_pending_format_records_v2(records.clone(), &value_context),
            "aggregate property values unexpectedly decoded",
        )?;
        assert_eq!(value_error.code(), EditorValueRecordV2ErrorCode::PropertyValueCountLimit);
        assert_eq!(value_error.format_index(), None);
        let encode_value_error = required_error(
            encode_pending_format_records_v2(&formats, &value_context),
            "aggregate property values unexpectedly encoded",
        )?;
        assert_eq!(
            encode_value_error.code(),
            EditorValueRecordV2ErrorCode::PropertyValueCountLimit
        );

        let string_context = context(
            DocumentLimits::default()
                .with_max_property_string_bytes(2)
                .with_max_total_property_string_bytes(3),
        )?;
        let string_error = required_error(
            decode_pending_format_records_v2(records, &string_context),
            "aggregate property strings unexpectedly decoded",
        )?;
        assert_eq!(string_error.code(), EditorValueRecordV2ErrorCode::PropertyStringBytesLimit);
        assert_eq!(string_error.format_index(), None);
        Ok(())
    }

    #[test]
    fn diagnostic_storage_is_bounded_even_for_an_oversized_source() {
        let diagnostic = "x".repeat(MAX_DIAGNOSTIC_PREVIEW_BYTES * 4);
        let original_byte_len = diagnostic.len();
        let error = EditorValueRecordV2Error::new(
            EditorValueRecordV2ErrorCode::InvalidPropertyValue,
            Some(u64::MAX),
            diagnostic,
        );

        assert!(error.diagnostic().len() <= MAX_DIAGNOSTIC_PREVIEW_BYTES);
        assert!(error.diagnostic_value().is_truncated());
        assert_eq!(error.diagnostic_value().original_byte_len(), original_byte_len);
    }
}
