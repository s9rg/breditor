use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    identity::QualifiedName,
    schema::{
        DurableSchemaBinding, SchemaFingerprint, SchemaId, SchemaVersion,
        require_schema_fingerprint, require_schema_id,
    },
};

use super::{
    BoundedDiagnostic, LocalLogFrameLimits, LocalLogStorageGenerationFrameV1,
    LocalLogStorageGenerationFrameV2, LocalLogStorageRootBindingField,
    LocalLogStorageRootCodecError, LocalLogStorageRootJsonCodecV2, LocalLogStorageRootJsonFailure,
    LocalLogStorageRootRecordError, LocalLogStorageRootRecordErrorCode,
    LocalLogStorageRootRecordLocation, LocalLogStorageRootSelection,
    LocalLogStorageRootSelectionParts, LocalLogStorageRootSelectionV2,
    LocalLogStorageRootTopologyError, LocalLogStorageRootV2CodecError,
    local_log_storage_root_decode::{
        decode_active_log_id, decode_checkpoint_json, decode_checkpoint_log_id,
        decode_committed_head_id, decode_decimal_u64, decode_fence_id, decode_profile_id,
        decode_profile_version, decode_scope_id, decode_session_id, decode_transaction_id,
    },
    local_log_storage_root_encoding_v2::LocalLogStorageRootEncodingV2,
    local_log_storage_root_json::LOCAL_LOG_STORAGE_ROOT_FORMAT,
    local_log_storage_root_json_v2::{
        LOCAL_LOG_STORAGE_ROOT_V2_FORMAT_VERSION, binding_mismatch, runtime_invariant,
    },
};

const MAX_FORMAT_STRING_JSON_BYTES: usize = 6 * LOCAL_LOG_STORAGE_ROOT_FORMAT.len() + 2;

impl LocalLogStorageRootJsonCodecV2 {
    /// Strictly decodes one canonical fingerprint-bound initial root.
    ///
    /// Schema selector admission precedes fingerprint parsing. Nested bytes
    /// must be exact Local Log Checkpoint V2 and the frame policy must be V2.
    /// The input is borrowed throughout admission and is never rewritten.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageRootV2CodecError`] for resource, routing,
    /// schema-binding, field, topology, trusted-association, nested-checkpoint,
    /// or byte-canonical failure.
    pub fn decode_root(
        &self,
        json: &str,
    ) -> Result<LocalLogStorageRootSelectionV2, LocalLogStorageRootV2CodecError> {
        let maximum = self.limits().max_input_bytes();
        if json.len() > maximum {
            return Err(LocalLogStorageRootV2CodecError::InputTooLarge {
                actual: json.len(),
                maximum,
            });
        }

        validate_header(json)?;
        let envelope: BorrowedStorageRootRecordV2<'_> = decode_json(json)?;
        let schema = decode_schema_id(&envelope.schema)?;
        require_schema_id(self.context().schema(), &schema)?;
        let fingerprint = envelope.schema_fingerprint.parse::<SchemaFingerprint>()?;
        require_schema_fingerprint(self.context().schema(), fingerprint)?;
        let schema_binding = DurableSchemaBinding::new(schema, fingerprint);

        let profile_id = v1(decode_profile_id(envelope.profile_id))?;
        let profile_version = v1(decode_profile_version(envelope.profile_version))?;
        let scope_id = v1(decode_scope_id(envelope.scope_id))?;
        let transaction_id = v1(decode_transaction_id(envelope.transaction_id))?;
        let committed_head_id = v1(decode_committed_head_id(envelope.committed_head_id))?;
        let fence_id = v1(decode_fence_id(envelope.fence_id))?;
        let session_id = v1(decode_session_id(envelope.session_id))?;
        let checkpoint_log_id = v1(decode_checkpoint_log_id(envelope.checkpoint_log_id))?;
        let active_log_id = v1(decode_active_log_id(envelope.active_log_id))?;
        let active_frame = decode_active_frame(envelope.active_frame)?;

        if checkpoint_log_id == active_log_id {
            return Err(LocalLogStorageRootTopologyError::GenerationNotAdvanced.into());
        }
        if &profile_id != self.binding().profile_id() {
            return Err(binding_mismatch(LocalLogStorageRootBindingField::ProfileId));
        }
        if profile_version != self.binding().profile_version() {
            return Err(binding_mismatch(LocalLogStorageRootBindingField::ProfileVersion));
        }
        if &scope_id != self.binding().scope_id() {
            return Err(binding_mismatch(LocalLogStorageRootBindingField::ScopeId));
        }
        if &committed_head_id != self.binding().committed_head_id() {
            return Err(binding_mismatch(LocalLogStorageRootBindingField::CommittedHeadId));
        }

        let checkpoint_json = v1(decode_checkpoint_json(
            envelope.checkpoint_json,
            self.limits().max_checkpoint_json_bytes(),
        ))?;
        let v1_frame = LocalLogStorageGenerationFrameV1::new(active_frame.limits());
        let selection = LocalLogStorageRootSelection::from_parts_v2(
            schema_binding,
            LocalLogStorageRootSelectionParts {
                profile_id,
                profile_version,
                scope_id,
                transaction_id,
                committed_head_id,
                fence_id,
                session_id,
                checkpoint_log_id,
                active_log_id,
                active_frame: v1_frame,
                checkpoint_json,
            },
            active_frame,
        );
        self.validate_nested_checkpoint(&selection)?;
        let canonical = serde_json::to_string(&LocalLogStorageRootEncodingV2::new(&selection))
            .map_err(|error| LocalLogStorageRootJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageRootV2CodecError::Encoding)?;
        if canonical != json {
            return Err(LocalLogStorageRootV2CodecError::NonCanonicalRootJson);
        }
        Ok(LocalLogStorageRootSelectionV2::new(selection))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedStorageRootHeader<'a> {
    #[serde(borrow)]
    format: &'a RawValue,
    #[serde(borrow)]
    format_version: &'a RawValue,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSchemaIdRecord<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedStorageRootRecordV2<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    schema: BorrowedSchemaIdRecord<'a>,
    #[serde(borrow)]
    schema_fingerprint: Cow<'a, str>,
    #[serde(borrow)]
    profile_id: &'a RawValue,
    #[serde(borrow)]
    profile_version: &'a RawValue,
    #[serde(borrow)]
    scope_id: &'a RawValue,
    #[serde(borrow)]
    transaction_id: &'a RawValue,
    #[serde(borrow)]
    committed_head_id: &'a RawValue,
    #[serde(borrow)]
    fence_id: &'a RawValue,
    #[serde(borrow)]
    session_id: &'a RawValue,
    #[serde(borrow)]
    checkpoint_log_id: &'a RawValue,
    #[serde(borrow)]
    active_log_id: &'a RawValue,
    #[serde(borrow)]
    active_frame: &'a RawValue,
    #[serde(borrow)]
    checkpoint_json: &'a RawValue,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedFramePolicyV2<'a> {
    #[serde(borrow)]
    format_version: &'a RawValue,
    #[serde(borrow)]
    max_payload_bytes: &'a RawValue,
}

fn validate_header(json: &str) -> Result<(), LocalLogStorageRootV2CodecError> {
    let header: BorrowedStorageRootHeader<'_> = decode_json(json)?;
    if !header.format.get().trim_start().starts_with('"') {
        let _: String = decode_json(header.format.get())?;
        return Err(runtime_invariant("format string precheck accepted a non-string"));
    }
    if header.format.get().len() > MAX_FORMAT_STRING_JSON_BYTES {
        return Err(LocalLogStorageRootV2CodecError::UnsupportedFormat {
            expected: LOCAL_LOG_STORAGE_ROOT_FORMAT,
        });
    }
    let format: Cow<'_, str> = decode_json(header.format.get())?;
    if format != LOCAL_LOG_STORAGE_ROOT_FORMAT {
        return Err(LocalLogStorageRootV2CodecError::UnsupportedFormat {
            expected: LOCAL_LOG_STORAGE_ROOT_FORMAT,
        });
    }
    let version: u32 = decode_json(header.format_version.get())?;
    if version != LOCAL_LOG_STORAGE_ROOT_V2_FORMAT_VERSION {
        return Err(LocalLogStorageRootV2CodecError::UnsupportedFormatVersion {
            found: version,
            supported: LOCAL_LOG_STORAGE_ROOT_V2_FORMAT_VERSION,
        });
    }
    Ok(())
}

fn decode_schema_id(
    schema: &BorrowedSchemaIdRecord<'_>,
) -> Result<SchemaId, LocalLogStorageRootV2CodecError> {
    let name = QualifiedName::try_new(schema.name.as_ref()).map_err(|source| {
        LocalLogStorageRootV2CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(schema.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(schema.version).map_err(|source| {
        LocalLogStorageRootV2CodecError::InvalidSchemaVersion { value: schema.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

fn decode_active_frame(
    raw: &RawValue,
) -> Result<LocalLogStorageGenerationFrameV2, LocalLogStorageRootV2CodecError> {
    let record: BorrowedFramePolicyV2<'_> = decode_json(raw.get())?;
    let version: u32 = decode_json(record.format_version.get())?;
    if version != 2 {
        return Err(LocalLogStorageRootRecordError::new(
            LocalLogStorageRootRecordErrorCode::InvalidActiveFrameFormatVersion,
            LocalLogStorageRootRecordLocation::ActiveFrameFormatVersion,
            "Storage Root V2 requires Local Log Frame V2",
        )
        .into());
    }
    let maximum = v1(decode_decimal_u64(
        record.max_payload_bytes,
        LocalLogStorageRootRecordErrorCode::InvalidActiveFrameMaxPayloadBytes,
        LocalLogStorageRootRecordLocation::ActiveFrameMaxPayloadBytes,
        "active frame maximum payload",
    ))?;
    Ok(LocalLogStorageGenerationFrameV2::new(LocalLogFrameLimits::new(maximum)))
}

fn decode_json<'de, T>(json: &'de str) -> Result<T, LocalLogStorageRootV2CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| LocalLogStorageRootJsonFailure::from_serde(&error))
        .map_err(LocalLogStorageRootV2CodecError::InvalidJson)
}

fn v1<T>(
    result: Result<T, LocalLogStorageRootCodecError>,
) -> Result<T, LocalLogStorageRootV2CodecError> {
    result.map_err(map_v1_error)
}

fn map_v1_error(error: LocalLogStorageRootCodecError) -> LocalLogStorageRootV2CodecError {
    match error {
        LocalLogStorageRootCodecError::ContextConfigurationMismatch => {
            LocalLogStorageRootV2CodecError::ContextConfigurationMismatch
        }
        LocalLogStorageRootCodecError::InputTooLarge { actual, maximum } => {
            LocalLogStorageRootV2CodecError::InputTooLarge { actual, maximum }
        }
        LocalLogStorageRootCodecError::OutputTooLarge { minimum, maximum } => {
            LocalLogStorageRootV2CodecError::OutputTooLarge { minimum, maximum }
        }
        LocalLogStorageRootCodecError::InvalidJson(source) => {
            LocalLogStorageRootV2CodecError::InvalidJson(source)
        }
        LocalLogStorageRootCodecError::UnsupportedFormat { expected } => {
            LocalLogStorageRootV2CodecError::UnsupportedFormat { expected }
        }
        LocalLogStorageRootCodecError::UnsupportedFormatVersion { found, .. } => {
            LocalLogStorageRootV2CodecError::UnsupportedFormatVersion {
                found,
                supported: LOCAL_LOG_STORAGE_ROOT_V2_FORMAT_VERSION,
            }
        }
        LocalLogStorageRootCodecError::BindingMismatch { field } => {
            LocalLogStorageRootV2CodecError::BindingMismatch { field }
        }
        LocalLogStorageRootCodecError::InvalidRecord(source) => source.into(),
        LocalLogStorageRootCodecError::InvalidTopology(source) => source.into(),
        LocalLogStorageRootCodecError::ResourceLimit(source) => source.into(),
        LocalLogStorageRootCodecError::InvalidCheckpoint(_) => {
            runtime_invariant("scalar root decoder unexpectedly attempted checkpoint decoding")
        }
        LocalLogStorageRootCodecError::NonCanonicalCheckpointJson
        | LocalLogStorageRootCodecError::NonCanonicalRootJson => {
            runtime_invariant("scalar root decoder unexpectedly attempted canonical validation")
        }
        LocalLogStorageRootCodecError::RuntimeInvariant { diagnostic } => {
            LocalLogStorageRootV2CodecError::RuntimeInvariant { diagnostic }
        }
        LocalLogStorageRootCodecError::Encoding(_) => {
            runtime_invariant("scalar root decoder unexpectedly attempted encoding")
        }
    }
}
