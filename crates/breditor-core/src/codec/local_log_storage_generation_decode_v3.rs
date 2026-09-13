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
    LocalLogStorageGenerationFrameV3, LocalLogStorageGenerationJsonCodecV3,
    LocalLogStorageGenerationJsonFailure, LocalLogStorageGenerationManifest,
    LocalLogStorageGenerationManifestParts, LocalLogStorageGenerationManifestV3,
    LocalLogStorageGenerationRecordError, LocalLogStorageGenerationRecordErrorCode,
    LocalLogStorageGenerationRecordLocation, LocalLogStorageGenerationV3CodecError,
    local_log_storage_generation_decode::{
        decode_checkpoint_json, decode_committed_head_id, decode_decimal_u64,
        decode_expected_head_id, decode_fence_id, decode_profile_id, decode_profile_version,
        decode_scope_id, decode_sealed_log_id, decode_session_id, decode_successor_log_id,
        decode_transaction_id,
    },
    local_log_storage_generation_encoding_v3::LocalLogStorageGenerationEncodingV3,
    local_log_storage_generation_json::LOCAL_LOG_STORAGE_GENERATION_FORMAT,
    local_log_storage_generation_json_v3::{
        LOCAL_LOG_STORAGE_GENERATION_V3_FORMAT_VERSION, runtime_invariant, v1,
    },
};

const MAX_FORMAT_STRING_JSON_BYTES: usize = 6 * LOCAL_LOG_STORAGE_GENERATION_FORMAT.len() + 2;

impl LocalLogStorageGenerationJsonCodecV3 {
    /// Strictly decodes one canonical V3 rotation against a validated prior.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationV3CodecError`] for routing,
    /// schema-binding, record, topology, continuity, checkpoint, resource, or
    /// byte-canonical failure.
    pub fn decode_rotation(
        &self,
        json: &str,
        prior: &LocalLogStorageGenerationManifestV3,
    ) -> Result<LocalLogStorageGenerationManifestV3, LocalLogStorageGenerationV3CodecError> {
        self.decode_rotation_inner(json, Some(prior.inner()))
    }

    pub(crate) fn decode_bound_rotation(
        &self,
        json: &str,
    ) -> Result<LocalLogStorageGenerationManifestV3, LocalLogStorageGenerationV3CodecError> {
        self.decode_rotation_inner(json, None)
    }

    fn decode_rotation_inner(
        &self,
        json: &str,
        prior: Option<&LocalLogStorageGenerationManifest>,
    ) -> Result<LocalLogStorageGenerationManifestV3, LocalLogStorageGenerationV3CodecError> {
        let maximum = self.limits().max_input_bytes();
        if json.len() > maximum {
            return Err(LocalLogStorageGenerationV3CodecError::InputTooLarge {
                actual: json.len(),
                maximum,
            });
        }
        validate_header(json)?;
        let envelope: BorrowedStorageGenerationRecordV3<'_> = decode_json(json)?;
        let schema = decode_schema_id(&envelope.schema)?;
        require_schema_id(self.context().schema(), &schema)?;
        let fingerprint = envelope.schema_fingerprint.parse::<SchemaFingerprint>()?;
        require_schema_fingerprint(self.context().schema(), fingerprint)?;
        let schema_binding = DurableSchemaBinding::new(schema, fingerprint);

        let profile_id = v1(decode_profile_id(envelope.profile_id))?;
        let profile_version = v1(decode_profile_version(envelope.profile_version))?;
        let scope_id = v1(decode_scope_id(envelope.scope_id))?;
        let transaction_id = v1(decode_transaction_id(envelope.transaction_id))?;
        let expected_head_id = v1(decode_expected_head_id(envelope.expected_head_id))?;
        let committed_head_id = v1(decode_committed_head_id(envelope.committed_head_id))?;
        let fence_id = v1(decode_fence_id(envelope.fence_id))?;
        let session_id = v1(decode_session_id(envelope.session_id))?;
        let sealed_log_id = v1(decode_sealed_log_id(envelope.sealed_log_id))?;
        let successor_log_id = v1(decode_successor_log_id(envelope.successor_log_id))?;
        let accepted_prefix_bytes = v1(decode_decimal_u64(
            envelope.accepted_prefix_bytes,
            LocalLogStorageGenerationRecordErrorCode::InvalidAcceptedPrefixBytes,
            LocalLogStorageGenerationRecordLocation::AcceptedPrefixBytes,
            "accepted prefix",
        ))?;
        let sealed_frame = decode_frame(envelope.sealed_frame, FrameField::Sealed)?;
        let successor_frame = decode_frame(envelope.successor_frame, FrameField::Successor)?;
        let checkpoint_json = v1(decode_checkpoint_json(
            envelope.checkpoint_json,
            self.limits().max_checkpoint_json_bytes(),
        ))?;

        let manifest = LocalLogStorageGenerationManifest::from_parts_v3(
            schema_binding,
            LocalLogStorageGenerationManifestParts {
                profile_id,
                profile_version,
                scope_id,
                transaction_id,
                expected_head_id,
                committed_head_id,
                fence_id,
                session_id,
                sealed_log_id,
                successor_log_id,
                accepted_prefix_bytes,
                sealed_frame: LocalLogStorageGenerationFrameV1::new(sealed_frame.limits()),
                successor_frame: LocalLogStorageGenerationFrameV1::new(successor_frame.limits()),
                checkpoint_json,
            },
            sealed_frame,
            successor_frame,
        );
        match prior {
            Some(prior) => self.validate_rotation(&manifest, prior)?,
            None => self.validate_manifest(&manifest)?,
        }
        self.validate_nested_checkpoint(&manifest)?;
        let canonical = serde_json::to_string(&LocalLogStorageGenerationEncodingV3::new(&manifest))
            .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageGenerationV3CodecError::Encoding)?;
        if canonical != json {
            return Err(LocalLogStorageGenerationV3CodecError::NonCanonicalManifestJson);
        }
        Ok(LocalLogStorageGenerationManifestV3::new(manifest))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedStorageGenerationHeader<'a> {
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
struct BorrowedStorageGenerationRecordV3<'a> {
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
    expected_head_id: &'a RawValue,
    #[serde(borrow)]
    committed_head_id: &'a RawValue,
    #[serde(borrow)]
    fence_id: &'a RawValue,
    #[serde(borrow)]
    session_id: &'a RawValue,
    #[serde(borrow)]
    sealed_log_id: &'a RawValue,
    #[serde(borrow)]
    successor_log_id: &'a RawValue,
    #[serde(borrow)]
    accepted_prefix_bytes: &'a RawValue,
    #[serde(borrow)]
    sealed_frame: &'a RawValue,
    #[serde(borrow)]
    successor_frame: &'a RawValue,
    #[serde(borrow)]
    checkpoint_json: &'a RawValue,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedFramePolicyV3<'a> {
    #[serde(borrow)]
    format_version: &'a RawValue,
    #[serde(borrow)]
    max_payload_bytes: &'a RawValue,
}

#[derive(Clone, Copy)]
enum FrameField {
    Sealed,
    Successor,
}

fn validate_header(json: &str) -> Result<(), LocalLogStorageGenerationV3CodecError> {
    let header: BorrowedStorageGenerationHeader<'_> = decode_json(json)?;
    if !header.format.get().trim_start().starts_with('"') {
        let _: String = decode_json(header.format.get())?;
        return Err(runtime_invariant("format string precheck accepted a non-string"));
    }
    if header.format.get().len() > MAX_FORMAT_STRING_JSON_BYTES {
        return Err(LocalLogStorageGenerationV3CodecError::UnsupportedFormat {
            expected: LOCAL_LOG_STORAGE_GENERATION_FORMAT,
        });
    }
    let format: Cow<'_, str> = decode_json(header.format.get())?;
    if format != LOCAL_LOG_STORAGE_GENERATION_FORMAT {
        return Err(LocalLogStorageGenerationV3CodecError::UnsupportedFormat {
            expected: LOCAL_LOG_STORAGE_GENERATION_FORMAT,
        });
    }
    let version: u32 = decode_json(header.format_version.get())?;
    if version != LOCAL_LOG_STORAGE_GENERATION_V3_FORMAT_VERSION {
        return Err(LocalLogStorageGenerationV3CodecError::UnsupportedFormatVersion {
            found: version,
            supported: LOCAL_LOG_STORAGE_GENERATION_V3_FORMAT_VERSION,
        });
    }
    Ok(())
}

fn decode_schema_id(
    schema: &BorrowedSchemaIdRecord<'_>,
) -> Result<SchemaId, LocalLogStorageGenerationV3CodecError> {
    let name = QualifiedName::try_new(schema.name.as_ref()).map_err(|source| {
        LocalLogStorageGenerationV3CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(schema.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(schema.version).map_err(|source| {
        LocalLogStorageGenerationV3CodecError::InvalidSchemaVersion {
            value: schema.version,
            source,
        }
    })?;
    Ok(SchemaId::new(name, version))
}

fn decode_frame(
    raw: &RawValue,
    field: FrameField,
) -> Result<LocalLogStorageGenerationFrameV3, LocalLogStorageGenerationV3CodecError> {
    let record: BorrowedFramePolicyV3<'_> = decode_json(raw.get())?;
    let (version_code, version_location, maximum_code, maximum_location, noun) = match field {
        FrameField::Sealed => (
            LocalLogStorageGenerationRecordErrorCode::InvalidSealedFrameFormatVersion,
            LocalLogStorageGenerationRecordLocation::SealedFrameFormatVersion,
            LocalLogStorageGenerationRecordErrorCode::InvalidSealedFrameMaxPayloadBytes,
            LocalLogStorageGenerationRecordLocation::SealedFrameMaxPayloadBytes,
            "sealed frame maximum payload",
        ),
        FrameField::Successor => (
            LocalLogStorageGenerationRecordErrorCode::InvalidSuccessorFrameFormatVersion,
            LocalLogStorageGenerationRecordLocation::SuccessorFrameFormatVersion,
            LocalLogStorageGenerationRecordErrorCode::InvalidSuccessorFrameMaxPayloadBytes,
            LocalLogStorageGenerationRecordLocation::SuccessorFrameMaxPayloadBytes,
            "successor frame maximum payload",
        ),
    };
    let version: u32 = decode_json(record.format_version.get())?;
    if version != 3 {
        return Err(LocalLogStorageGenerationRecordError::new(
            version_code,
            version_location,
            "Storage Generation V3 requires Local Log Frame V3",
        )
        .into());
    }
    let maximum =
        v1(decode_decimal_u64(record.max_payload_bytes, maximum_code, maximum_location, noun))?;
    Ok(LocalLogStorageGenerationFrameV3::new(LocalLogFrameLimits::new(maximum)))
}

fn decode_json<'de, T>(json: &'de str) -> Result<T, LocalLogStorageGenerationV3CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
        .map_err(LocalLogStorageGenerationV3CodecError::InvalidJson)
}
