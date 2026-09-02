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
    BoundedDiagnostic, LocalLogFrameLimits, LocalLogStorageGenerationFrameV1,
    LocalLogStorageRootBindingField, LocalLogStorageRootCodecError, LocalLogStorageRootJsonCodec,
    LocalLogStorageRootJsonFailure, LocalLogStorageRootRecordError,
    LocalLogStorageRootRecordErrorCode, LocalLogStorageRootRecordLocation,
    LocalLogStorageRootResourceLimit, LocalLogStorageRootSelection,
    LocalLogStorageRootSelectionParts, LocalLogStorageRootTopologyError,
    local_log_storage_generation_checkpoint_preflight::{
        CheckpointJsonStringPreflightError, preflight_checkpoint_json_string_token,
    },
    local_log_storage_root_json::{
        LOCAL_LOG_STORAGE_ROOT_FORMAT, LOCAL_LOG_STORAGE_ROOT_FORMAT_VERSION, binding_mismatch,
        runtime_invariant,
    },
};

const MAX_PROFILE_ID_STRING_JSON_BYTES: usize = 6 * MAX_QUALIFIED_NAME_BYTES + 2;
const MAX_LOCAL_IDENTITY_STRING_JSON_BYTES: usize = 6 * MAX_LOCAL_LOG_IDENTITY_BYTES + 2;
const MAX_DECIMAL_U64_STRING_JSON_BYTES: usize = 6 * 20 + 2;
const MAX_FORMAT_STRING_JSON_BYTES: usize = 6 * LOCAL_LOG_STORAGE_ROOT_FORMAT.len() + 2;
const FRAME_FORMAT_VERSION: u32 = 1;

impl LocalLogStorageRootJsonCodec {
    /// Strictly decodes one canonical initial root against its trusted binding.
    ///
    /// Successful decode proves structural, binding, nested-replay, and
    /// byte-canonical equality only. It does not authenticate storage, establish
    /// current-head freshness, provision either generation, authorize writes,
    /// or prove that a transaction was durably committed.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageRootCodecError`] for oversized or malformed
    /// input, unsupported routing, invalid fields or topology, binding mismatch,
    /// nested checkpoint failure, or any noncanonical byte representation.
    pub fn decode_root(
        &self,
        json: &str,
    ) -> Result<LocalLogStorageRootSelection, LocalLogStorageRootCodecError> {
        let maximum = self.limits().max_input_bytes();
        if json.len() > maximum {
            return Err(LocalLogStorageRootCodecError::InputTooLarge {
                actual: json.len(),
                maximum,
            });
        }

        validate_header(json)?;
        let envelope: BorrowedStorageRootRecordV1<'_> = decode_json(json)?;

        let profile_id = decode_profile_id(envelope.profile_id)?;
        let profile_version = decode_profile_version(envelope.profile_version)?;
        let scope_id = decode_scope_id(envelope.scope_id)?;
        let transaction_id = decode_transaction_id(envelope.transaction_id)?;
        let committed_head_id = decode_committed_head_id(envelope.committed_head_id)?;
        let fence_id = decode_fence_id(envelope.fence_id)?;
        let session_id = decode_session_id(envelope.session_id)?;
        let checkpoint_log_id = decode_checkpoint_log_id(envelope.checkpoint_log_id)?;
        let active_log_id = decode_active_log_id(envelope.active_log_id)?;
        let active_frame = decode_active_frame(envelope.active_frame)?;

        let metadata = DecodedMetadata {
            profile_id,
            profile_version,
            scope_id,
            transaction_id,
            committed_head_id,
            fence_id,
            session_id,
            checkpoint_log_id,
            active_log_id,
            active_frame,
        };
        validate_decoded_metadata(self, &metadata)?;

        let checkpoint_json = decode_checkpoint_json(
            envelope.checkpoint_json,
            self.limits().max_checkpoint_json_bytes(),
        )?;
        let selection = metadata.into_selection(checkpoint_json);
        self.validate_nested_checkpoint(&selection)?;
        Self::validate_canonical_outer(&selection, json)?;
        Ok(selection)
    }
}

struct DecodedMetadata {
    profile_id: LocalLogStorageProfileId,
    profile_version: LocalLogStorageProfileVersion,
    scope_id: LocalLogStorageScopeId,
    transaction_id: LocalLogStorageTransactionId,
    committed_head_id: LocalLogStorageHeadId,
    fence_id: LocalLogStorageFenceId,
    session_id: LocalSessionId,
    checkpoint_log_id: LocalLogId,
    active_log_id: LocalLogId,
    active_frame: LocalLogStorageGenerationFrameV1,
}

impl DecodedMetadata {
    fn into_selection(self, checkpoint_json: String) -> LocalLogStorageRootSelection {
        LocalLogStorageRootSelection::from_parts(LocalLogStorageRootSelectionParts {
            profile_id: self.profile_id,
            profile_version: self.profile_version,
            scope_id: self.scope_id,
            transaction_id: self.transaction_id,
            committed_head_id: self.committed_head_id,
            fence_id: self.fence_id,
            session_id: self.session_id,
            checkpoint_log_id: self.checkpoint_log_id,
            active_log_id: self.active_log_id,
            active_frame: self.active_frame,
            checkpoint_json,
        })
    }
}

fn validate_decoded_metadata(
    codec: &LocalLogStorageRootJsonCodec,
    value: &DecodedMetadata,
) -> Result<(), LocalLogStorageRootCodecError> {
    if value.checkpoint_log_id == value.active_log_id {
        return Err(LocalLogStorageRootTopologyError::GenerationNotAdvanced.into());
    }
    if &value.profile_id != codec.binding().profile_id() {
        return Err(binding_mismatch(LocalLogStorageRootBindingField::ProfileId));
    }
    if value.profile_version != codec.binding().profile_version() {
        return Err(binding_mismatch(LocalLogStorageRootBindingField::ProfileVersion));
    }
    if &value.scope_id != codec.binding().scope_id() {
        return Err(binding_mismatch(LocalLogStorageRootBindingField::ScopeId));
    }
    if &value.committed_head_id != codec.binding().committed_head_id() {
        return Err(binding_mismatch(LocalLogStorageRootBindingField::CommittedHeadId));
    }
    Ok(())
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
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedStorageRootRecordV1<'a> {
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
struct BorrowedActiveFrameRecordV1<'a> {
    #[serde(borrow)]
    format_version: &'a RawValue,
    #[serde(borrow)]
    max_payload_bytes: &'a RawValue,
}

fn validate_header(json: &str) -> Result<(), LocalLogStorageRootCodecError> {
    let header: BorrowedStorageRootHeader<'_> = decode_json(json)?;
    if !raw_is_string(header.format) {
        let _: String = decode_json(header.format.get())?;
        return Err(runtime_invariant("JSON string routing precheck accepted a non-string format"));
    }
    if header.format.get().len() > MAX_FORMAT_STRING_JSON_BYTES {
        return Err(LocalLogStorageRootCodecError::UnsupportedFormat {
            expected: LOCAL_LOG_STORAGE_ROOT_FORMAT,
        });
    }
    let format: Cow<'_, str> = serde_json::from_str(header.format.get())
        .map_err(|error| LocalLogStorageRootJsonFailure::from_serde(&error))
        .map_err(LocalLogStorageRootCodecError::InvalidJson)?;
    if format != LOCAL_LOG_STORAGE_ROOT_FORMAT {
        return Err(LocalLogStorageRootCodecError::UnsupportedFormat {
            expected: LOCAL_LOG_STORAGE_ROOT_FORMAT,
        });
    }
    let version: u32 = serde_json::from_str(header.format_version.get())
        .map_err(|error| LocalLogStorageRootJsonFailure::from_serde(&error))
        .map_err(LocalLogStorageRootCodecError::InvalidJson)?;
    if version != LOCAL_LOG_STORAGE_ROOT_FORMAT_VERSION {
        return Err(LocalLogStorageRootCodecError::UnsupportedFormatVersion {
            found: version,
            supported: LOCAL_LOG_STORAGE_ROOT_FORMAT_VERSION,
        });
    }
    Ok(())
}

fn decode_json<'de, T>(json: &'de str) -> Result<T, LocalLogStorageRootCodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| LocalLogStorageRootJsonFailure::from_serde(&error))
        .map_err(LocalLogStorageRootCodecError::InvalidJson)
}

fn decode_profile_id(
    raw: &RawValue,
) -> Result<LocalLogStorageProfileId, LocalLogStorageRootCodecError> {
    decode_bounded_identity(
        raw,
        MAX_PROFILE_ID_STRING_JSON_BYTES,
        LocalLogStorageRootRecordErrorCode::InvalidProfileId,
        LocalLogStorageRootRecordLocation::ProfileId,
        LocalLogStorageProfileId::try_new,
    )
}

fn decode_profile_version(
    raw: &RawValue,
) -> Result<LocalLogStorageProfileVersion, LocalLogStorageRootCodecError> {
    let value: u32 = decode_json(raw.get())?;
    LocalLogStorageProfileVersion::try_new(value).map_err(|_| {
        record_error(
            LocalLogStorageRootRecordErrorCode::InvalidProfileVersion,
            LocalLogStorageRootRecordLocation::ProfileVersion,
            "storage-profile version zero is reserved",
        )
    })
}

fn decode_scope_id(
    raw: &RawValue,
) -> Result<LocalLogStorageScopeId, LocalLogStorageRootCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageRootRecordErrorCode::InvalidScopeId,
        LocalLogStorageRootRecordLocation::ScopeId,
        LocalLogStorageScopeId::try_new,
    )
}

fn decode_transaction_id(
    raw: &RawValue,
) -> Result<LocalLogStorageTransactionId, LocalLogStorageRootCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageRootRecordErrorCode::InvalidTransactionId,
        LocalLogStorageRootRecordLocation::TransactionId,
        LocalLogStorageTransactionId::try_new,
    )
}

fn decode_committed_head_id(
    raw: &RawValue,
) -> Result<LocalLogStorageHeadId, LocalLogStorageRootCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageRootRecordErrorCode::InvalidCommittedHeadId,
        LocalLogStorageRootRecordLocation::CommittedHeadId,
        LocalLogStorageHeadId::try_new,
    )
}

fn decode_fence_id(
    raw: &RawValue,
) -> Result<LocalLogStorageFenceId, LocalLogStorageRootCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageRootRecordErrorCode::InvalidFenceId,
        LocalLogStorageRootRecordLocation::FenceId,
        LocalLogStorageFenceId::try_new,
    )
}

fn decode_session_id(raw: &RawValue) -> Result<LocalSessionId, LocalLogStorageRootCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageRootRecordErrorCode::InvalidSessionId,
        LocalLogStorageRootRecordLocation::SessionId,
        LocalSessionId::try_new,
    )
}

fn decode_checkpoint_log_id(raw: &RawValue) -> Result<LocalLogId, LocalLogStorageRootCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageRootRecordErrorCode::InvalidCheckpointLogId,
        LocalLogStorageRootRecordLocation::CheckpointLogId,
        LocalLogId::try_new,
    )
}

fn decode_active_log_id(raw: &RawValue) -> Result<LocalLogId, LocalLogStorageRootCodecError> {
    decode_local_identity(
        raw,
        LocalLogStorageRootRecordErrorCode::InvalidActiveLogId,
        LocalLogStorageRootRecordLocation::ActiveLogId,
        LocalLogId::try_new,
    )
}

fn decode_local_identity<T, E>(
    raw: &RawValue,
    code: LocalLogStorageRootRecordErrorCode,
    location: LocalLogStorageRootRecordLocation,
    constructor: impl FnOnce(String) -> Result<T, E>,
) -> Result<T, LocalLogStorageRootCodecError> {
    decode_bounded_identity(raw, MAX_LOCAL_IDENTITY_STRING_JSON_BYTES, code, location, constructor)
}

fn decode_bounded_identity<T, E>(
    raw: &RawValue,
    maximum_encoded_bytes: usize,
    code: LocalLogStorageRootRecordErrorCode,
    location: LocalLogStorageRootRecordLocation,
    constructor: impl FnOnce(String) -> Result<T, E>,
) -> Result<T, LocalLogStorageRootCodecError> {
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

fn decode_active_frame(
    raw: &RawValue,
) -> Result<LocalLogStorageGenerationFrameV1, LocalLogStorageRootCodecError> {
    let record: BorrowedActiveFrameRecordV1<'_> = decode_json(raw.get())?;
    let version: u32 = decode_json(record.format_version.get())?;
    if version != FRAME_FORMAT_VERSION {
        return Err(record_error(
            LocalLogStorageRootRecordErrorCode::InvalidActiveFrameFormatVersion,
            LocalLogStorageRootRecordLocation::ActiveFrameFormatVersion,
            "storage-root V1 requires Local Log Frame V1",
        ));
    }
    let maximum = decode_decimal_u64(
        record.max_payload_bytes,
        LocalLogStorageRootRecordErrorCode::InvalidActiveFrameMaxPayloadBytes,
        LocalLogStorageRootRecordLocation::ActiveFrameMaxPayloadBytes,
        "active frame maximum payload",
    )?;
    Ok(LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(maximum)))
}

fn decode_decimal_u64(
    raw: &RawValue,
    code: LocalLogStorageRootRecordErrorCode,
    location: LocalLogStorageRootRecordLocation,
    noun: &'static str,
) -> Result<u64, LocalLogStorageRootCodecError> {
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

fn decode_checkpoint_json(
    raw: &RawValue,
    maximum: usize,
) -> Result<String, LocalLogStorageRootCodecError> {
    let preflight = match preflight_checkpoint_json_string_token(raw.get(), maximum) {
        Ok(preflight) => preflight,
        Err(CheckpointJsonStringPreflightError::DecodedLengthLimitExceeded {
            minimum,
            maximum,
        }) => {
            return Err(
                LocalLogStorageRootResourceLimit::CheckpointJsonBytes { minimum, maximum }.into()
            );
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
    code: LocalLogStorageRootRecordErrorCode,
    location: LocalLogStorageRootRecordLocation,
    diagnostic: impl Into<BoundedDiagnostic>,
) -> LocalLogStorageRootCodecError {
    LocalLogStorageRootRecordError::new(code, location, diagnostic).into()
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
