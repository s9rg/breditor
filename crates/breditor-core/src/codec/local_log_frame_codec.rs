use crate::{local_log::LocalLogEntry, schema::require_exact_breditor_base, state::EditorContext};

use super::{
    BorrowedLocalLogFrame, LOCAL_LOG_ENTRY_FORMAT_VERSION, LocalLogEntryJsonCodec,
    LocalLogFrameBinding, LocalLogFrameCodecError, LocalLogFrameLimits, LocalLogFrameScan,
    LocalLogFrameTruncation, LocalLogFrameTruncationStage, local_log_frame_checksum::crc32c,
};

/// Fixed Local Log Frame V1 magic bytes.
pub const LOCAL_LOG_FRAME_MAGIC: [u8; 8] = *b"\x89BRDTL\r\n";

/// Local Log Frame wire version implemented by this codec.
pub const LOCAL_LOG_FRAME_FORMAT_VERSION: u16 = 1;

/// Fixed Local Log Frame V1 header length.
pub const LOCAL_LOG_FRAME_HEADER_BYTES: usize = 28;

const MAGIC_END: usize = 8;
const VERSION_START: usize = 8;
const FLAGS_START: usize = 10;
const PAYLOAD_LENGTH_START: usize = 12;
const PAYLOAD_CHECKSUM_START: usize = 20;
const HEADER_CHECKSUM_START: usize = 24;
const SUPPORTED_FLAGS: u16 = 0;
const NESTED_LOCAL_LOG_ENTRY_FORMAT_VERSION: u32 = 1;

// Local Log Frame V1 embeds Local Log Entry V1 bytes. If the active entry
// codec moves forward, this boundary must retain an explicit V1 encoder and
// decoder or increment the frame version instead of drifting silently.
const _: () = assert!(LOCAL_LOG_ENTRY_FORMAT_VERSION == NESTED_LOCAL_LOG_ENTRY_FORMAT_VERSION);

/// Strict codec and allocation-free borrowed scanner for Local Log Frame V1.
///
/// One frame is a fixed 28-byte header followed by one exact Local Log Entry V1
/// UTF-8 JSON payload. The header stores, in order, eight magic bytes, a
/// big-endian `u16` version, reserved big-endian `u16` flags, a big-endian
/// `u64` payload length, the payload CRC-32C, and the CRC-32C of the preceding
/// 24 header bytes. The independently validated header checksum prevents an
/// accidental length-field change from being mistaken for an ordinary torn
/// payload. CRC-32C diagnoses accidental corruption only; it is not
/// authentication or an adversarial integrity proof.
///
/// [`Self::scan`] checks binary structure and checksums without allocation and
/// returns one borrowed frame plus its exact consumed prefix. [`Self::decode_frame`]
/// then delegates all semantic reconstruction to [`LocalLogEntryJsonCodec`] and
/// checks its session and log assertions against the trusted
/// [`LocalLogFrameBinding`]. Trailing bytes remain uninspected. These boundaries
/// do not establish adjacency, replay uniqueness, append durability, ordering,
/// authorization, writer fencing, or crash-tail policy.
#[derive(Clone, Debug)]
pub struct LocalLogFrameCodec {
    entry_codec: LocalLogEntryJsonCodec,
    binding: LocalLogFrameBinding,
    limits: LocalLogFrameLimits,
}

impl LocalLogFrameCodec {
    /// Creates a frame codec with default payload limits.
    #[must_use]
    pub fn new(context: EditorContext, binding: LocalLogFrameBinding) -> Self {
        Self {
            entry_codec: LocalLogEntryJsonCodec::new(context),
            binding,
            limits: LocalLogFrameLimits::default(),
        }
    }

    /// Returns the semantic entry codec used inside each frame.
    #[must_use]
    pub const fn entry_codec(&self) -> &LocalLogEntryJsonCodec {
        &self.entry_codec
    }

    /// Returns the trusted active-tail scope.
    #[must_use]
    pub const fn binding(&self) -> &LocalLogFrameBinding {
        &self.binding
    }

    /// Returns the independent frame payload policy.
    #[must_use]
    pub const fn limits(&self) -> LocalLogFrameLimits {
        self.limits
    }

    /// Replaces the frame payload policy.
    #[must_use]
    pub const fn with_limits(mut self, limits: LocalLogFrameLimits) -> Self {
        self.limits = limits;
        self
    }

    /// Encodes one binding-matched entry as deterministic Local Log Frame V1.
    ///
    /// Membership is checked before semantic JSON encoding. The complete JSON
    /// must satisfy both its existing context byte limit and this codec's
    /// independent fixed-width payload ceiling.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogFrameCodecError`] for binding mismatch, entry encoding
    /// failure, payload resource excess, or platform length overflow.
    pub fn encode(&self, entry: &LocalLogEntry) -> Result<Vec<u8>, LocalLogFrameCodecError> {
        self.ensure_v1_schema()?;
        self.validate_binding(entry)?;
        let payload = self
            .entry_codec
            .encode(entry)
            .map_err(|source| LocalLogFrameCodecError::InvalidEntry(Box::new(source)))?;
        let payload_bytes = u64::try_from(payload.len()).map_err(|_| {
            LocalLogFrameCodecError::PayloadLengthOverflow {
                actual: payload.len(),
                maximum: u64::MAX,
            }
        })?;
        self.validate_payload_limit(payload_bytes)?;
        let frame_bytes = checked_frame_bytes(payload_bytes)?;

        let mut header = [0u8; LOCAL_LOG_FRAME_HEADER_BYTES];
        header[..MAGIC_END].copy_from_slice(&LOCAL_LOG_FRAME_MAGIC);
        header[VERSION_START..FLAGS_START]
            .copy_from_slice(&LOCAL_LOG_FRAME_FORMAT_VERSION.to_be_bytes());
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

    /// Scans at most one frame from the front of `input` without allocation.
    ///
    /// Empty input is a clean boundary. A matching nonempty partial magic,
    /// header, or payload returns [`LocalLogFrameScan::Truncated`]. A mismatched
    /// available magic byte fails immediately. Once the fixed header is
    /// complete, validation order is header checksum, version, flags, effective
    /// payload limit, valid-slice length, complete payload availability, then
    /// payload checksum. A complete result reports the exact prefix to remove
    /// before scanning a possible next frame.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogFrameCodecError`] for malformed or corrupt complete
    /// structure, resource excess, or platform length overflow. The scanner
    /// never decodes JSON, allocates payload storage, resynchronizes after
    /// corruption, or truncates storage itself.
    pub fn scan<'a>(
        &self,
        input: &'a [u8],
    ) -> Result<LocalLogFrameScan<'a>, LocalLogFrameCodecError> {
        self.ensure_v1_schema()?;
        if input.is_empty() {
            return Ok(LocalLogFrameScan::EndOfInput);
        }
        if input.len() < MAGIC_END {
            if LOCAL_LOG_FRAME_MAGIC.starts_with(input) {
                return Ok(LocalLogFrameScan::Truncated(LocalLogFrameTruncation::new(
                    LocalLogFrameTruncationStage::Magic,
                    input.len(),
                    MAGIC_END,
                )));
            }
            return Err(LocalLogFrameCodecError::UnsupportedMagic);
        }
        if input[..MAGIC_END] != LOCAL_LOG_FRAME_MAGIC {
            return Err(LocalLogFrameCodecError::UnsupportedMagic);
        }
        if input.len() < LOCAL_LOG_FRAME_HEADER_BYTES {
            return Ok(LocalLogFrameScan::Truncated(LocalLogFrameTruncation::new(
                LocalLogFrameTruncationStage::Header,
                input.len(),
                LOCAL_LOG_FRAME_HEADER_BYTES,
            )));
        }

        let stored_header_checksum = read_u32(input, HEADER_CHECKSUM_START);
        let computed_header_checksum = crc32c(&[&input[..HEADER_CHECKSUM_START]]);
        if stored_header_checksum != computed_header_checksum {
            return Err(LocalLogFrameCodecError::HeaderChecksumMismatch {
                stored: stored_header_checksum,
                computed: computed_header_checksum,
            });
        }
        let version = read_u16(input, VERSION_START);
        if version != LOCAL_LOG_FRAME_FORMAT_VERSION {
            return Err(LocalLogFrameCodecError::UnsupportedVersion {
                found: version,
                supported: LOCAL_LOG_FRAME_FORMAT_VERSION,
            });
        }
        let flags = read_u16(input, FLAGS_START);
        if flags != SUPPORTED_FLAGS {
            return Err(LocalLogFrameCodecError::UnsupportedFlags { found: flags });
        }
        let payload_bytes = read_u64(input, PAYLOAD_LENGTH_START);
        self.validate_payload_limit(payload_bytes)?;
        let frame_bytes = checked_frame_bytes(payload_bytes)?;
        if input.len() < frame_bytes {
            return Ok(LocalLogFrameScan::Truncated(LocalLogFrameTruncation::new(
                LocalLogFrameTruncationStage::Payload,
                input.len(),
                frame_bytes,
            )));
        }

        let payload = &input[LOCAL_LOG_FRAME_HEADER_BYTES..frame_bytes];
        let stored_payload_checksum = read_u32(input, PAYLOAD_CHECKSUM_START);
        let computed_payload_checksum = crc32c(&[payload]);
        if stored_payload_checksum != computed_payload_checksum {
            return Err(LocalLogFrameCodecError::PayloadChecksumMismatch {
                stored: stored_payload_checksum,
                computed: computed_payload_checksum,
            });
        }
        Ok(LocalLogFrameScan::Complete(BorrowedLocalLogFrame::new(
            payload,
            &input[frame_bytes..],
            frame_bytes,
        )))
    }

    /// Semantically decodes one complete frame previously returned by `scan`.
    ///
    /// Validation order is the receiving codec's effective payload policy,
    /// UTF-8, the unchanged Local Log Entry V1 codec, trusted session binding,
    /// then trusted active-log binding. The binding must come from host
    /// configuration or storage scope, never from the same untrusted payload.
    /// The returned entry still requires an owning recovery or
    /// incremental-admission boundary to enforce order and replay policy.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogFrameCodecError`] for invalid UTF-8, a semantic entry
    /// failure, resource-policy mismatch, or trusted binding mismatch.
    pub fn decode_frame(
        &self,
        frame: BorrowedLocalLogFrame<'_>,
    ) -> Result<LocalLogEntry, LocalLogFrameCodecError> {
        self.ensure_v1_schema()?;
        let payload_bytes = u64::try_from(frame.payload_bytes().len()).map_err(|_| {
            LocalLogFrameCodecError::PayloadLengthOverflow {
                actual: frame.payload_bytes().len(),
                maximum: u64::MAX,
            }
        })?;
        self.validate_payload_limit(payload_bytes)?;
        let json = std::str::from_utf8(frame.payload_bytes()).map_err(|error| {
            LocalLogFrameCodecError::InvalidUtf8 { valid_up_to: error.valid_up_to() }
        })?;
        let entry = self
            .entry_codec
            .decode(json)
            .map_err(|source| LocalLogFrameCodecError::InvalidEntry(Box::new(source)))?;
        self.validate_binding(&entry)?;
        Ok(entry)
    }

    fn effective_payload_limit(&self) -> u64 {
        let context_limit =
            u64::try_from(self.entry_codec.context().limits().max_json_bytes()).unwrap_or(u64::MAX);
        self.limits.max_payload_bytes().min(context_limit)
    }

    fn ensure_v1_schema(&self) -> Result<(), LocalLogFrameCodecError> {
        require_exact_breditor_base(self.entry_codec.context().schema()).map_err(|_| {
            LocalLogFrameCodecError::InvalidEntry(Box::new(
                super::LocalLogEntryCodecError::ContextConfigurationMismatch,
            ))
        })
    }

    fn validate_payload_limit(&self, actual: u64) -> Result<(), LocalLogFrameCodecError> {
        let maximum = self.effective_payload_limit();
        if actual > maximum {
            return Err(LocalLogFrameCodecError::PayloadTooLarge { actual, maximum });
        }
        Ok(())
    }

    fn validate_binding(&self, entry: &LocalLogEntry) -> Result<(), LocalLogFrameCodecError> {
        if entry.session_id() != self.binding.session_id() {
            return Err(LocalLogFrameCodecError::SessionMismatch {
                expected: self.binding.session_id().clone(),
                actual: entry.session_id().clone(),
            });
        }
        if entry.log_id() != self.binding.active_log_id() {
            return Err(LocalLogFrameCodecError::ActiveLogMismatch {
                expected: self.binding.active_log_id().clone(),
                actual: entry.log_id().clone(),
            });
        }
        Ok(())
    }
}

fn checked_frame_bytes(payload_bytes: u64) -> Result<usize, LocalLogFrameCodecError> {
    let payload = usize::try_from(payload_bytes)
        .map_err(|_| LocalLogFrameCodecError::FrameLengthOverflow { payload_bytes })?;
    let frame_bytes = LOCAL_LOG_FRAME_HEADER_BYTES
        .checked_add(payload)
        .ok_or(LocalLogFrameCodecError::FrameLengthOverflow { payload_bytes })?;
    if frame_bytes > isize::MAX.unsigned_abs() {
        return Err(LocalLogFrameCodecError::FrameLengthOverflow { payload_bytes });
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
    use super::checked_frame_bytes;
    use crate::codec::{LOCAL_LOG_FRAME_HEADER_BYTES, LocalLogFrameCodecError};

    #[test]
    fn frame_length_arithmetic_rejects_unrepresentable_wire_lengths()
    -> Result<(), std::num::TryFromIntError> {
        let maximum_payload =
            u64::try_from(isize::MAX.unsigned_abs() - LOCAL_LOG_FRAME_HEADER_BYTES)?;

        assert!(matches!(
            checked_frame_bytes(u64::MAX),
            Err(LocalLogFrameCodecError::FrameLengthOverflow { payload_bytes: u64::MAX })
        ));
        assert!(matches!(checked_frame_bytes(0), Ok(LOCAL_LOG_FRAME_HEADER_BYTES)));
        assert!(matches!(
            checked_frame_bytes(maximum_payload),
            Ok(frame_bytes) if frame_bytes == isize::MAX.unsigned_abs()
        ));
        assert!(matches!(
            checked_frame_bytes(maximum_payload + 1),
            Err(LocalLogFrameCodecError::FrameLengthOverflow { payload_bytes })
                if payload_bytes == maximum_payload + 1
        ));
        Ok(())
    }
}
