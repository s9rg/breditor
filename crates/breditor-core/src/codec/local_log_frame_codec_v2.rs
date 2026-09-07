use crate::{local_log::LocalLogEntry, schema::DurableSchemaBinding, state::EditorContext};

use super::{
    BorrowedLocalLogFrameV2, LOCAL_LOG_ENTRY_V2_FORMAT_VERSION, LOCAL_LOG_FRAME_HEADER_BYTES,
    LOCAL_LOG_FRAME_MAGIC, LocalLogEntryJsonCodecV2, LocalLogFrameBinding, LocalLogFrameLimits,
    LocalLogFrameScanV2, LocalLogFrameTruncationStage, LocalLogFrameTruncationV2,
    LocalLogFrameV2CodecError, local_log_frame_checksum::crc32c,
};

/// Local Log Frame wire version carried by [`LocalLogFrameCodecV2`].
pub const LOCAL_LOG_FRAME_V2_FORMAT_VERSION: u16 = 2;

const MAGIC_END: usize = 8;
const VERSION_START: usize = 8;
const FLAGS_START: usize = 10;
const PAYLOAD_LENGTH_START: usize = 12;
const PAYLOAD_CHECKSUM_START: usize = 20;
const HEADER_CHECKSUM_START: usize = 24;
const SUPPORTED_FLAGS: u16 = 0;
const NESTED_LOCAL_LOG_ENTRY_FORMAT_VERSION: u32 = 2;

const _: () = assert!(LOCAL_LOG_ENTRY_V2_FORMAT_VERSION == NESTED_LOCAL_LOG_ENTRY_FORMAT_VERSION);

/// Strict codec and allocation-free borrowed scanner for Local Log Frame V2.
///
/// Frame V2 intentionally retains the 28-byte V1 layout, magic, zero-flags
/// contract, and CRC-32C semantics. Its binary version is exactly `2` and its
/// payload is exactly Local Log Entry V2 JSON. The codec retains the complete
/// durable schema binding derived from its context even when a scan observes
/// empty input, truncation, or a control-only entry.
///
/// Scanning proves only binary structure and accidental-corruption checks.
/// [`Self::decode_frame`] performs UTF-8 and Entry V2 validation, then checks
/// the trusted session and active-log binding. Neither operation proves
/// adjacency, authorization, durability, writer fencing, or storage freshness.
#[derive(Clone, Debug)]
pub struct LocalLogFrameCodecV2 {
    entry_codec: LocalLogEntryJsonCodecV2,
    binding: LocalLogFrameBinding,
    schema_binding: DurableSchemaBinding,
    limits: LocalLogFrameLimits,
}

impl LocalLogFrameCodecV2 {
    /// Creates a fingerprint-bound Frame V2 codec with default payload limits.
    #[must_use]
    pub fn new(context: EditorContext, binding: LocalLogFrameBinding) -> Self {
        let schema_binding = context.schema().durable_binding();
        Self {
            entry_codec: LocalLogEntryJsonCodecV2::new(context),
            binding,
            schema_binding,
            limits: LocalLogFrameLimits::default(),
        }
    }

    /// Returns the semantic Entry V2 codec used inside each frame.
    #[must_use]
    pub const fn entry_codec(&self) -> &LocalLogEntryJsonCodecV2 {
        &self.entry_codec
    }

    /// Returns the trusted active-tail session and append-generation scope.
    #[must_use]
    pub const fn binding(&self) -> &LocalLogFrameBinding {
        &self.binding
    }

    /// Returns the exact durable schema selector and fingerprint.
    #[must_use]
    pub const fn schema_binding(&self) -> &DurableSchemaBinding {
        &self.schema_binding
    }

    /// Returns this codec's fixed binary frame generation.
    #[must_use]
    pub const fn format_version(&self) -> u16 {
        LOCAL_LOG_FRAME_V2_FORMAT_VERSION
    }

    /// Returns the independent frame payload policy.
    #[must_use]
    pub const fn limits(&self) -> LocalLogFrameLimits {
        self.limits
    }

    /// Replaces the frame payload policy without changing any binding.
    #[must_use]
    pub const fn with_limits(mut self, limits: LocalLogFrameLimits) -> Self {
        self.limits = limits;
        self
    }

    /// Encodes one binding-matched Entry V2 as deterministic Frame V2 bytes.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogFrameV2CodecError`] for session, active-log, or schema
    /// binding mismatch, Entry V2 failure, resource excess, or length overflow.
    pub fn encode(&self, entry: &LocalLogEntry) -> Result<Vec<u8>, LocalLogFrameV2CodecError> {
        self.validate_binding(entry)?;
        let payload = self
            .entry_codec
            .encode(entry)
            .map_err(|source| LocalLogFrameV2CodecError::InvalidEntry(Box::new(source)))?;
        let payload_bytes = u64::try_from(payload.len()).map_err(|_| {
            LocalLogFrameV2CodecError::PayloadLengthOverflow {
                actual: payload.len(),
                maximum: u64::MAX,
            }
        })?;
        self.validate_payload_limit(payload_bytes)?;
        let frame_bytes = checked_frame_v2_bytes(payload_bytes)?;

        let mut header = [0u8; LOCAL_LOG_FRAME_HEADER_BYTES];
        header[..MAGIC_END].copy_from_slice(&LOCAL_LOG_FRAME_MAGIC);
        header[VERSION_START..FLAGS_START]
            .copy_from_slice(&LOCAL_LOG_FRAME_V2_FORMAT_VERSION.to_be_bytes());
        header[FLAGS_START..PAYLOAD_LENGTH_START].copy_from_slice(&SUPPORTED_FLAGS.to_be_bytes());
        header[PAYLOAD_LENGTH_START..PAYLOAD_CHECKSUM_START]
            .copy_from_slice(&payload_bytes.to_be_bytes());
        let payload_checksum = crc32c(&[payload.as_bytes()]);
        header[PAYLOAD_CHECKSUM_START..HEADER_CHECKSUM_START]
            .copy_from_slice(&payload_checksum.to_be_bytes());
        let header_checksum = crc32c(&[&header[..HEADER_CHECKSUM_START]]);
        header[HEADER_CHECKSUM_START..].copy_from_slice(&header_checksum.to_be_bytes());

        let mut frame = Vec::with_capacity(frame_bytes);
        frame.extend_from_slice(&header);
        frame.extend_from_slice(payload.as_bytes());
        debug_assert_eq!(frame.len(), frame_bytes);
        Ok(frame)
    }

    /// Scans at most one Frame V2 from the front of `input` without allocation.
    ///
    /// Empty input is a clean boundary. A matching nonempty partial magic,
    /// header, or payload returns [`LocalLogFrameScanV2::Truncated`]. Header
    /// validation order is checksum, exact V2 version, zero flags, payload
    /// policy, platform length, availability, then payload checksum. Trailing
    /// bytes remain uninspected.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogFrameV2CodecError`] for invalid or corrupt complete
    /// structure, resource excess, or platform length overflow.
    pub fn scan<'a>(
        &self,
        input: &'a [u8],
    ) -> Result<LocalLogFrameScanV2<'a>, LocalLogFrameV2CodecError> {
        if input.is_empty() {
            return Ok(LocalLogFrameScanV2::EndOfInput);
        }
        if input.len() < MAGIC_END {
            if LOCAL_LOG_FRAME_MAGIC.starts_with(input) {
                return Ok(LocalLogFrameScanV2::Truncated(LocalLogFrameTruncationV2::new(
                    LocalLogFrameTruncationStage::Magic,
                    input.len(),
                    MAGIC_END,
                )));
            }
            return Err(LocalLogFrameV2CodecError::UnsupportedMagic);
        }
        if input[..MAGIC_END] != LOCAL_LOG_FRAME_MAGIC {
            return Err(LocalLogFrameV2CodecError::UnsupportedMagic);
        }
        if input.len() < LOCAL_LOG_FRAME_HEADER_BYTES {
            return Ok(LocalLogFrameScanV2::Truncated(LocalLogFrameTruncationV2::new(
                LocalLogFrameTruncationStage::Header,
                input.len(),
                LOCAL_LOG_FRAME_HEADER_BYTES,
            )));
        }

        let stored_header_checksum = read_u32(input, HEADER_CHECKSUM_START);
        let computed_header_checksum = crc32c(&[&input[..HEADER_CHECKSUM_START]]);
        if stored_header_checksum != computed_header_checksum {
            return Err(LocalLogFrameV2CodecError::HeaderChecksumMismatch {
                stored: stored_header_checksum,
                computed: computed_header_checksum,
            });
        }
        let version = read_u16(input, VERSION_START);
        if version != LOCAL_LOG_FRAME_V2_FORMAT_VERSION {
            return Err(LocalLogFrameV2CodecError::UnsupportedVersion {
                found: version,
                supported: LOCAL_LOG_FRAME_V2_FORMAT_VERSION,
            });
        }
        let flags = read_u16(input, FLAGS_START);
        if flags != SUPPORTED_FLAGS {
            return Err(LocalLogFrameV2CodecError::UnsupportedFlags { found: flags });
        }
        let payload_bytes = read_u64(input, PAYLOAD_LENGTH_START);
        self.validate_payload_limit(payload_bytes)?;
        let frame_bytes = checked_frame_v2_bytes(payload_bytes)?;
        if input.len() < frame_bytes {
            return Ok(LocalLogFrameScanV2::Truncated(LocalLogFrameTruncationV2::new(
                LocalLogFrameTruncationStage::Payload,
                input.len(),
                frame_bytes,
            )));
        }

        let payload = &input[LOCAL_LOG_FRAME_HEADER_BYTES..frame_bytes];
        let stored_payload_checksum = read_u32(input, PAYLOAD_CHECKSUM_START);
        let computed_payload_checksum = crc32c(&[payload]);
        if stored_payload_checksum != computed_payload_checksum {
            return Err(LocalLogFrameV2CodecError::PayloadChecksumMismatch {
                stored: stored_payload_checksum,
                computed: computed_payload_checksum,
            });
        }
        Ok(LocalLogFrameScanV2::Complete(BorrowedLocalLogFrameV2::new(
            payload,
            &input[frame_bytes..],
            frame_bytes,
        )))
    }

    /// Semantically decodes one complete frame previously returned by `scan`.
    ///
    /// The receiving payload policy, UTF-8, complete Entry V2 schema binding,
    /// trusted session, and trusted active log are all checked before an entry
    /// is published.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogFrameV2CodecError`] for invalid UTF-8, Entry V2
    /// failure, resource-policy mismatch, or trusted binding mismatch.
    pub fn decode_frame(
        &self,
        frame: BorrowedLocalLogFrameV2<'_>,
    ) -> Result<LocalLogEntry, LocalLogFrameV2CodecError> {
        let payload_bytes = u64::try_from(frame.payload_bytes().len()).map_err(|_| {
            LocalLogFrameV2CodecError::PayloadLengthOverflow {
                actual: frame.payload_bytes().len(),
                maximum: u64::MAX,
            }
        })?;
        self.validate_payload_limit(payload_bytes)?;
        let json = std::str::from_utf8(frame.payload_bytes()).map_err(|error| {
            LocalLogFrameV2CodecError::InvalidUtf8 { valid_up_to: error.valid_up_to() }
        })?;
        let entry = self
            .entry_codec
            .decode(json)
            .map_err(|source| LocalLogFrameV2CodecError::InvalidEntry(Box::new(source)))?;
        self.validate_binding(&entry)?;
        Ok(entry)
    }

    fn effective_payload_limit(&self) -> u64 {
        let context_limit =
            u64::try_from(self.entry_codec.context().limits().max_json_bytes()).unwrap_or(u64::MAX);
        self.limits.max_payload_bytes().min(context_limit)
    }

    fn validate_payload_limit(&self, actual: u64) -> Result<(), LocalLogFrameV2CodecError> {
        let maximum = self.effective_payload_limit();
        if actual > maximum {
            return Err(LocalLogFrameV2CodecError::PayloadTooLarge { actual, maximum });
        }
        Ok(())
    }

    fn validate_binding(&self, entry: &LocalLogEntry) -> Result<(), LocalLogFrameV2CodecError> {
        if entry.session_id() != self.binding.session_id() {
            return Err(LocalLogFrameV2CodecError::SessionMismatch {
                expected: self.binding.session_id().clone(),
                actual: entry.session_id().clone(),
            });
        }
        if entry.log_id() != self.binding.active_log_id() {
            return Err(LocalLogFrameV2CodecError::ActiveLogMismatch {
                expected: self.binding.active_log_id().clone(),
                actual: entry.log_id().clone(),
            });
        }
        Ok(())
    }
}

fn checked_frame_v2_bytes(payload_bytes: u64) -> Result<usize, LocalLogFrameV2CodecError> {
    let payload = usize::try_from(payload_bytes)
        .map_err(|_| LocalLogFrameV2CodecError::FrameLengthOverflow { payload_bytes })?;
    let frame_bytes = LOCAL_LOG_FRAME_HEADER_BYTES
        .checked_add(payload)
        .ok_or(LocalLogFrameV2CodecError::FrameLengthOverflow { payload_bytes })?;
    if frame_bytes > isize::MAX.unsigned_abs() {
        return Err(LocalLogFrameV2CodecError::FrameLengthOverflow { payload_bytes });
    }
    Ok(frame_bytes)
}

fn read_u16(bytes: &[u8], start: usize) -> u16 {
    u16::from_be_bytes([bytes[start], bytes[start + 1]])
}

fn read_u32(bytes: &[u8], start: usize) -> u32 {
    u32::from_be_bytes([bytes[start], bytes[start + 1], bytes[start + 2], bytes[start + 3]])
}

fn read_u64(bytes: &[u8], start: usize) -> u64 {
    u64::from_be_bytes([
        bytes[start],
        bytes[start + 1],
        bytes[start + 2],
        bytes[start + 3],
        bytes[start + 4],
        bytes[start + 5],
        bytes[start + 6],
        bytes[start + 7],
    ])
}

#[cfg(test)]
mod tests {
    use super::checked_frame_v2_bytes;
    use crate::codec::{LOCAL_LOG_FRAME_HEADER_BYTES, LocalLogFrameV2CodecError};

    #[test]
    fn v2_frame_length_arithmetic_rejects_unrepresentable_wire_lengths()
    -> Result<(), std::num::TryFromIntError> {
        let maximum_payload =
            u64::try_from(isize::MAX.unsigned_abs() - LOCAL_LOG_FRAME_HEADER_BYTES)?;

        assert!(matches!(
            checked_frame_v2_bytes(u64::MAX),
            Err(LocalLogFrameV2CodecError::FrameLengthOverflow { payload_bytes: u64::MAX })
        ));
        assert!(matches!(checked_frame_v2_bytes(0), Ok(LOCAL_LOG_FRAME_HEADER_BYTES)));
        assert!(matches!(
            checked_frame_v2_bytes(maximum_payload),
            Ok(frame_bytes) if frame_bytes == isize::MAX.unsigned_abs()
        ));
        assert!(matches!(
            checked_frame_v2_bytes(maximum_payload + 1),
            Err(LocalLogFrameV2CodecError::FrameLengthOverflow { payload_bytes })
                if payload_bytes == maximum_payload + 1
        ));
        Ok(())
    }
}
