use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    identity::MAX_QUALIFIED_NAME_BYTES,
    local_log::{
        LocalLogId, LocalLogStorageFenceId, LocalLogStorageHeadId, LocalLogStorageProfileId,
        LocalLogStorageProfileVersion, LocalLogStorageScopeId, LocalLogStorageTransactionId,
        LocalSessionId, MAX_LOCAL_LOG_IDENTITY_BYTES,
    },
    record::{DecimalU64Record, DecimalU64RecordError},
};

use super::{
    BoundedDiagnostic, LocalLogFrameLimits, LocalLogStorageGenerationBindingField,
    LocalLogStorageGenerationCodecError, LocalLogStorageGenerationContinuityError,
    LocalLogStorageGenerationFrameV1, LocalLogStorageGenerationJsonCodec,
    LocalLogStorageGenerationJsonFailure, LocalLogStorageGenerationManifest,
    LocalLogStorageGenerationManifestParts, LocalLogStorageGenerationRecordError,
    LocalLogStorageGenerationRecordErrorCode, LocalLogStorageGenerationRecordLocation,
    LocalLogStorageGenerationResourceLimit, LocalLogStorageGenerationTopologyError,
    local_log_storage_generation_checkpoint_preflight::{
        CheckpointJsonStringPreflightError, preflight_checkpoint_json_string_token,
    },
    local_log_storage_generation_json::{
        LOCAL_LOG_STORAGE_GENERATION_FORMAT, LOCAL_LOG_STORAGE_GENERATION_FORMAT_VERSION,
        binding_mismatch, runtime_invariant,
    },
};

const MAX_PROFILE_ID_STRING_JSON_BYTES: usize = 6 * MAX_QUALIFIED_NAME_BYTES + 2;
const MAX_LOCAL_IDENTITY_STRING_JSON_BYTES: usize = 6 * MAX_LOCAL_LOG_IDENTITY_BYTES + 2;
const MAX_DECIMAL_U64_STRING_JSON_BYTES: usize = 6 * 20 + 2;
const MAX_FORMAT_STRING_JSON_BYTES: usize = 6 * LOCAL_LOG_STORAGE_GENERATION_FORMAT.len() + 2;
const FRAME_FORMAT_VERSION: u32 = 1;

impl LocalLogStorageGenerationJsonCodec {
    /// Strictly decodes one canonical ordinary rotation against its trusted
    /// binding and one already validated prior manifest.
    ///
    /// Successful decode proves structural, binding, continuity, nested replay,
    /// and byte-canonical equality only. It does not authenticate storage,
    /// establish current-head freshness, reserve a generation, or prove that a
    /// transaction was durably committed.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationCodecError`] for oversized or
    /// malformed input, unsupported routing, invalid fields or topology,
    /// binding/continuity mismatch, nested checkpoint failure, or any
    /// noncanonical byte representation.
    pub fn decode_rotation(
        &self,
        json: &str,
        prior: &LocalLogStorageGenerationManifest,
    ) -> Result<LocalLogStorageGenerationManifest, LocalLogStorageGenerationCodecError> {
        crate::schema::require_exact_breditor_base(self.context().schema())
            .map_err(|_| LocalLogStorageGenerationCodecError::ContextConfigurationMismatch)?;
        self.decode_rotation_inner(json, Some(prior))
    }

    /// Strictly decodes one canonical rotation against only its complete
    /// trusted binding and intrinsic topology.
    ///
    /// Selected-root normalization uses this path for the current value and
    /// for a rotation predecessor whose older predecessor is intentionally no
    /// longer retained. The public prior-aware action remains the ordinary
    /// edge-validation boundary.
    pub(crate) fn decode_bound_rotation(
        &self,
        json: &str,
    ) -> Result<LocalLogStorageGenerationManifest, LocalLogStorageGenerationCodecError> {
        self.decode_rotation_inner(json, None)
    }

    fn decode_rotation_inner(
        &self,
        json: &str,
        prior: Option<&LocalLogStorageGenerationManifest>,
    ) -> Result<LocalLogStorageGenerationManifest, LocalLogStorageGenerationCodecError> {
        let maximum = self.limits().max_input_bytes();
        if json.len() > maximum {
            return Err(LocalLogStorageGenerationCodecError::InputTooLarge {
                actual: json.len(),
                maximum,
            });
        }

        validate_header(json)?;
        let envelope: BorrowedStorageGenerationRecordV1<'_> = decode_json(json)?;

        let profile_id = decode_profile_id(envelope.profile_id)?;
        let profile_version = decode_profile_version(envelope.profile_version)?;
        let scope_id = decode_scope_id(envelope.scope_id)?;
        let transaction_id = decode_transaction_id(envelope.transaction_id)?;
        let expected_head_id = decode_expected_head_id(envelope.expected_head_id)?;
        let committed_head_id = decode_committed_head_id(envelope.committed_head_id)?;
        let fence_id = decode_fence_id(envelope.fence_id)?;
        let session_id = decode_session_id(envelope.session_id)?;
        let sealed_log_id = decode_sealed_log_id(envelope.sealed_log_id)?;
        let successor_log_id = decode_successor_log_id(envelope.successor_log_id)?;
        let accepted_prefix_bytes = decode_decimal_u64(
            envelope.accepted_prefix_bytes,
            LocalLogStorageGenerationRecordErrorCode::InvalidAcceptedPrefixBytes,
            LocalLogStorageGenerationRecordLocation::AcceptedPrefixBytes,
            "accepted prefix",
        )?;
        let sealed_frame = decode_frame(envelope.sealed_frame, FrameField::Sealed)?;
        let successor_frame = decode_frame(envelope.successor_frame, FrameField::Successor)?;

        let metadata = DecodedMetadata {
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
            sealed_frame,
            successor_frame,
        };
        match prior {
            Some(prior) => validate_decoded_metadata(self, &metadata, prior)?,
            None => validate_bound_decoded_metadata(self, &metadata)?,
        }

        let checkpoint_json = decode_checkpoint_json(
            envelope.checkpoint_json,
            self.limits().max_checkpoint_json_bytes(),
        )?;
        let manifest = metadata.into_manifest(checkpoint_json);
        self.validate_nested_checkpoint(&manifest)?;
        Self::validate_canonical_outer(&manifest, json)?;
        Ok(manifest)
    }
}

struct DecodedMetadata {
    profile_id: LocalLogStorageProfileId,
    profile_version: LocalLogStorageProfileVersion,
    scope_id: LocalLogStorageScopeId,
    transaction_id: LocalLogStorageTransactionId,
    expected_head_id: LocalLogStorageHeadId,
    committed_head_id: LocalLogStorageHeadId,
    fence_id: LocalLogStorageFenceId,
    session_id: LocalSessionId,
    sealed_log_id: LocalLogId,
    successor_log_id: LocalLogId,
    accepted_prefix_bytes: u64,
    sealed_frame: LocalLogStorageGenerationFrameV1,
    successor_frame: LocalLogStorageGenerationFrameV1,
}

impl DecodedMetadata {
    fn into_manifest(self, checkpoint_json: String) -> LocalLogStorageGenerationManifest {
        LocalLogStorageGenerationManifest::from_parts(LocalLogStorageGenerationManifestParts {
            profile_id: self.profile_id,
            profile_version: self.profile_version,
            scope_id: self.scope_id,
            transaction_id: self.transaction_id,
            expected_head_id: self.expected_head_id,
            committed_head_id: self.committed_head_id,
            fence_id: self.fence_id,
            session_id: self.session_id,
            sealed_log_id: self.sealed_log_id,
            successor_log_id: self.successor_log_id,
            accepted_prefix_bytes: self.accepted_prefix_bytes,
            sealed_frame: self.sealed_frame,
            successor_frame: self.successor_frame,
            checkpoint_json,
        })
    }
}

fn validate_decoded_metadata(
    codec: &LocalLogStorageGenerationJsonCodec,
    value: &DecodedMetadata,
    prior: &LocalLogStorageGenerationManifest,
) -> Result<(), LocalLogStorageGenerationCodecError> {
    if value.expected_head_id == value.committed_head_id {
        return Err(LocalLogStorageGenerationTopologyError::HeadNotAdvanced.into());
    }
    if value.sealed_log_id == value.successor_log_id {
        return Err(LocalLogStorageGenerationTopologyError::GenerationNotAdvanced.into());
    }

    if &value.profile_id != codec.binding().profile_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::ProfileId));
    }
    if value.profile_version != codec.binding().profile_version() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::ProfileVersion));
    }
    if &value.scope_id != codec.binding().scope_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::ScopeId));
    }
    if &value.expected_head_id != codec.binding().expected_head_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::ExpectedHeadId));
    }
    if &value.committed_head_id != codec.binding().committed_head_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::CommittedHeadId));
    }

    if value.profile_id != *prior.profile_id() {
        return Err(LocalLogStorageGenerationContinuityError::ProfileIdChanged.into());
    }
    if value.profile_version != prior.profile_version() {
        return Err(LocalLogStorageGenerationContinuityError::ProfileVersionChanged.into());
    }
    if value.scope_id != *prior.scope_id() {
        return Err(LocalLogStorageGenerationContinuityError::ScopeIdChanged.into());
    }
    if value.session_id != *prior.session_id() {
        return Err(LocalLogStorageGenerationContinuityError::SessionIdChanged.into());
    }
    if value.expected_head_id != *prior.committed_head_id() {
        return Err(LocalLogStorageGenerationContinuityError::ExpectedHeadMismatch.into());
    }
    if value.sealed_log_id != *prior.successor_log_id() {
        return Err(LocalLogStorageGenerationContinuityError::SealedLogMismatch.into());
    }
    if value.sealed_frame != prior.successor_frame() {
        return Err(LocalLogStorageGenerationContinuityError::SealedFrameMismatch.into());
    }
    if value.transaction_id == *prior.transaction_id() {
        return Err(LocalLogStorageGenerationContinuityError::TransactionIdReused.into());
    }
    if value.committed_head_id == *prior.expected_head_id() {
        return Err(LocalLogStorageGenerationContinuityError::KnownHeadIdReused.into());
    }
    if value.successor_log_id == *prior.sealed_log_id() {
        return Err(LocalLogStorageGenerationContinuityError::KnownGenerationIdReused.into());
    }
    Ok(())
}

fn validate_bound_decoded_metadata(
    codec: &LocalLogStorageGenerationJsonCodec,
    value: &DecodedMetadata,
) -> Result<(), LocalLogStorageGenerationCodecError> {
    if value.expected_head_id == value.committed_head_id {
        return Err(LocalLogStorageGenerationTopologyError::HeadNotAdvanced.into());
    }
    if value.sealed_log_id == value.successor_log_id {
        return Err(LocalLogStorageGenerationTopologyError::GenerationNotAdvanced.into());
    }

    if &value.profile_id != codec.binding().profile_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::ProfileId));
    }
    if value.profile_version != codec.binding().profile_version() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::ProfileVersion));
    }
    if &value.scope_id != codec.binding().scope_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::ScopeId));
    }
    if &value.expected_head_id != codec.binding().expected_head_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::ExpectedHeadId));
    }
    if &value.committed_head_id != codec.binding().committed_head_id() {
        return Err(binding_mismatch(LocalLogStorageGenerationBindingField::CommittedHeadId));
    }
    Ok(())
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
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedStorageGenerationRecordV1<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
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
struct BorrowedFrameRecordV1<'a> {
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

fn validate_header(json: &str) -> Result<(), LocalLogStorageGenerationCodecError> {
    let header: BorrowedStorageGenerationHeader<'_> = decode_json(json)?;
    if !raw_is_string(header.format) {
        let _: String = decode_json(header.format.get())?;
        return Err(runtime_invariant("JSON string routing precheck accepted a non-string format"));
    }
    if header.format.get().len() > MAX_FORMAT_STRING_JSON_BYTES {
        return Err(LocalLogStorageGenerationCodecError::UnsupportedFormat {
            expected: LOCAL_LOG_STORAGE_GENERATION_FORMAT,
        });
    }
    let format: Cow<'_, str> = serde_json::from_str(header.format.get())
        .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
        .map_err(LocalLogStorageGenerationCodecError::InvalidJson)?;
    if format != LOCAL_LOG_STORAGE_GENERATION_FORMAT {
        return Err(LocalLogStorageGenerationCodecError::UnsupportedFormat {
            expected: LOCAL_LOG_STORAGE_GENERATION_FORMAT,
        });
    }
    let version: u32 = serde_json::from_str(header.format_version.get())
        .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
        .map_err(LocalLogStorageGenerationCodecError::InvalidJson)?;
    if version != LOCAL_LOG_STORAGE_GENERATION_FORMAT_VERSION {
        return Err(LocalLogStorageGenerationCodecError::UnsupportedFormatVersion {
            found: version,
            supported: LOCAL_LOG_STORAGE_GENERATION_FORMAT_VERSION,
        });
    }
    Ok(())
}

fn decode_json<'de, T>(json: &'de str) -> Result<T, LocalLogStorageGenerationCodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
        .map_err(LocalLogStorageGenerationCodecError::InvalidJson)
}

pub(super) fn decode_profile_id(
    raw: &RawValue,
) -> Result<LocalLogStorageProfileId, LocalLogStorageGenerationCodecError> {
    decode_bounded_identity(
        raw,
        MAX_PROFILE_ID_STRING_JSON_BYTES,
        LocalLogStorageGenerationRecordErrorCode::InvalidProfileId,
        LocalLogStorageGenerationRecordLocation::ProfileId,
        LocalLogStorageProfileId::try_new,
    )
}

pub(super) fn decode_profile_version(
    raw: &RawValue,
) -> Result<LocalLogStorageProfileVersion, LocalLogStorageGenerationCodecError> {
    let value: u32 = decode_json(raw.get())?;
    LocalLogStorageProfileVersion::try_new(value).map_err(|_| {
        record_error(
            LocalLogStorageGenerationRecordErrorCode::InvalidProfileVersion,
            LocalLogStorageGenerationRecordLocation::ProfileVersion,
            "storage-profile version zero is reserved",
        )
    })
}

pub(super) fn decode_scope_id(
    raw: &RawValue,
) -> Result<LocalLogStorageScopeId, LocalLogStorageGenerationCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageGenerationRecordErrorCode::InvalidScopeId,
        LocalLogStorageGenerationRecordLocation::ScopeId,
        LocalLogStorageScopeId::try_new,
    )
}

pub(super) fn decode_transaction_id(
    raw: &RawValue,
) -> Result<LocalLogStorageTransactionId, LocalLogStorageGenerationCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageGenerationRecordErrorCode::InvalidTransactionId,
        LocalLogStorageGenerationRecordLocation::TransactionId,
        LocalLogStorageTransactionId::try_new,
    )
}

pub(super) fn decode_expected_head_id(
    raw: &RawValue,
) -> Result<LocalLogStorageHeadId, LocalLogStorageGenerationCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageGenerationRecordErrorCode::InvalidExpectedHeadId,
        LocalLogStorageGenerationRecordLocation::ExpectedHeadId,
        LocalLogStorageHeadId::try_new,
    )
}

pub(super) fn decode_committed_head_id(
    raw: &RawValue,
) -> Result<LocalLogStorageHeadId, LocalLogStorageGenerationCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageGenerationRecordErrorCode::InvalidCommittedHeadId,
        LocalLogStorageGenerationRecordLocation::CommittedHeadId,
        LocalLogStorageHeadId::try_new,
    )
}

pub(super) fn decode_fence_id(
    raw: &RawValue,
) -> Result<LocalLogStorageFenceId, LocalLogStorageGenerationCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageGenerationRecordErrorCode::InvalidFenceId,
        LocalLogStorageGenerationRecordLocation::FenceId,
        LocalLogStorageFenceId::try_new,
    )
}

pub(super) fn decode_session_id(
    raw: &RawValue,
) -> Result<LocalSessionId, LocalLogStorageGenerationCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageGenerationRecordErrorCode::InvalidSessionId,
        LocalLogStorageGenerationRecordLocation::SessionId,
        LocalSessionId::try_new,
    )
}

pub(super) fn decode_sealed_log_id(
    raw: &RawValue,
) -> Result<LocalLogId, LocalLogStorageGenerationCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageGenerationRecordErrorCode::InvalidSealedLogId,
        LocalLogStorageGenerationRecordLocation::SealedLogId,
        LocalLogId::try_new,
    )
}

pub(super) fn decode_successor_log_id(
    raw: &RawValue,
) -> Result<LocalLogId, LocalLogStorageGenerationCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageGenerationRecordErrorCode::InvalidSuccessorLogId,
        LocalLogStorageGenerationRecordLocation::SuccessorLogId,
        LocalLogId::try_new,
    )
}

fn decode_local_identity<T, E>(
    raw: &RawValue,
    code: LocalLogStorageGenerationRecordErrorCode,
    location: LocalLogStorageGenerationRecordLocation,
    constructor: impl FnOnce(String) -> Result<T, E>,
) -> Result<T, LocalLogStorageGenerationCodecError> {
    decode_bounded_identity(raw, MAX_LOCAL_IDENTITY_STRING_JSON_BYTES, code, location, constructor)
}

fn decode_bounded_identity<T, E>(
    raw: &RawValue,
    maximum_encoded_bytes: usize,
    code: LocalLogStorageGenerationRecordErrorCode,
    location: LocalLogStorageGenerationRecordLocation,
    constructor: impl FnOnce(String) -> Result<T, E>,
) -> Result<T, LocalLogStorageGenerationCodecError> {
    if !raw_is_string(raw) {
        let _: String = decode_json(raw.get())?;
        return Err(runtime_invariant("JSON string type precheck accepted a non-string identity"));
    }
    if raw.get().len() > maximum_encoded_bytes {
        return Err(record_error(
            code,
            location,
            "encoded identity exceeds its maximum JSON string representation",
        ));
    }
    let value: String = decode_json(raw.get())?;
    constructor(value).map_err(|_| {
        record_error(code, location, "decoded identity violates its required grammar or byte limit")
    })
}

fn decode_frame(
    raw: &RawValue,
    field: FrameField,
) -> Result<LocalLogStorageGenerationFrameV1, LocalLogStorageGenerationCodecError> {
    let record: BorrowedFrameRecordV1<'_> = decode_json(raw.get())?;
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
    if version != FRAME_FORMAT_VERSION {
        return Err(record_error(
            version_code,
            version_location,
            "storage-generation V1 requires Local Log Frame V1",
        ));
    }
    let maximum =
        decode_decimal_u64(record.max_payload_bytes, maximum_code, maximum_location, noun)?;
    Ok(LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(maximum)))
}

pub(super) fn decode_decimal_u64(
    raw: &RawValue,
    code: LocalLogStorageGenerationRecordErrorCode,
    location: LocalLogStorageGenerationRecordLocation,
    noun: &'static str,
) -> Result<u64, LocalLogStorageGenerationCodecError> {
    if !raw_is_string(raw) {
        let _: String = decode_json(raw.get())?;
        return Err(runtime_invariant(
            "JSON string type precheck accepted a non-string decimal field",
        ));
    }
    if raw.get().len() > MAX_DECIMAL_U64_STRING_JSON_BYTES {
        return Err(record_error(
            code,
            location,
            format!("encoded {noun} exceeds the canonical u64 JSON string bound"),
        ));
    }
    let value: String = decode_json(raw.get())?;
    DecimalU64Record::try_from_decimal(&value)
        .map(DecimalU64Record::get)
        .map_err(|error| record_error(code, location, decimal_diagnostic(noun, error)))
}

pub(super) fn decode_checkpoint_json(
    raw: &RawValue,
    maximum: usize,
) -> Result<String, LocalLogStorageGenerationCodecError> {
    let preflight = match preflight_checkpoint_json_string_token(raw.get(), maximum) {
        Ok(preflight) => preflight,
        Err(CheckpointJsonStringPreflightError::DecodedLengthLimitExceeded {
            minimum,
            maximum,
        }) => {
            return Err(LocalLogStorageGenerationResourceLimit::CheckpointJsonBytes {
                minimum,
                maximum,
            }
            .into());
        }
        Err(CheckpointJsonStringPreflightError::DecodedLengthOverflow) => {
            return Err(runtime_invariant(
                "checkpoint JSON decoded byte count overflowed for one addressable input",
            ));
        }
        Err(error) => {
            let _: String = decode_json(raw.get())?;
            return Err(runtime_invariant(checkpoint_preflight_diagnostic(error)));
        }
    };
    let checkpoint: String = decode_json(raw.get())?;
    if checkpoint.len() != preflight.decoded_utf8_bytes() {
        return Err(runtime_invariant(
            "checkpoint JSON allocation disagreed with its decoded byte preflight",
        ));
    }
    Ok(checkpoint)
}

fn raw_is_string(raw: &RawValue) -> bool {
    raw.get().trim_start().starts_with('"')
}

fn record_error(
    code: LocalLogStorageGenerationRecordErrorCode,
    location: LocalLogStorageGenerationRecordLocation,
    diagnostic: impl Into<BoundedDiagnostic>,
) -> LocalLogStorageGenerationCodecError {
    LocalLogStorageGenerationRecordError::new(code, location, diagnostic).into()
}

fn decimal_diagnostic(noun: &str, error: DecimalU64RecordError) -> String {
    let cause = match error {
        DecimalU64RecordError::InvalidGrammar => "must use unsigned decimal digits",
        DecimalU64RecordError::LeadingZero => "must not contain a leading zero",
        DecimalU64RecordError::Overflow => "exceeds the unsigned 64-bit maximum",
    };
    format!("{noun} {cause}")
}

const fn checkpoint_preflight_diagnostic(
    error: CheckpointJsonStringPreflightError,
) -> &'static str {
    match error {
        CheckpointJsonStringPreflightError::ExpectedString => {
            "checkpointJson must be one JSON string"
        }
        CheckpointJsonStringPreflightError::UnterminatedString => {
            "checkpointJson string is unterminated"
        }
        CheckpointJsonStringPreflightError::UnescapedControlCharacter { .. } => {
            "checkpointJson string contains an unescaped control character"
        }
        CheckpointJsonStringPreflightError::InvalidEscape { .. } => {
            "checkpointJson string contains an invalid escape"
        }
        CheckpointJsonStringPreflightError::InvalidUnicodeEscape { .. } => {
            "checkpointJson string contains an invalid Unicode escape"
        }
        CheckpointJsonStringPreflightError::UnpairedHighSurrogate { .. } => {
            "checkpointJson string contains an unpaired high surrogate"
        }
        CheckpointJsonStringPreflightError::UnpairedLowSurrogate { .. } => {
            "checkpointJson string contains an unpaired low surrogate"
        }
        CheckpointJsonStringPreflightError::TrailingCharacters { .. } => {
            "checkpointJson field contains trailing characters"
        }
        CheckpointJsonStringPreflightError::DecodedLengthOverflow => {
            "checkpointJson decoded byte count overflowed"
        }
        CheckpointJsonStringPreflightError::DecodedLengthLimitExceeded { .. } => {
            "checkpointJson exceeds its decoded UTF-8 byte limit"
        }
    }
}
