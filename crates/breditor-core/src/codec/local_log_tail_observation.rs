use super::{
    LocalLogFrameScan, LocalLogTailCursor, LocalLogTailError, LocalLogTailFailure,
    LocalLogTailStatus, LocalLogTailStep,
};

impl LocalLogTailCursor {
    /// Scans, decodes, and attempts to admit at most one framed observation.
    ///
    /// `input_origin` is the caller-authoritative generation-relative offset of
    /// input byte zero and must equal [`Self::accepted_byte_offset`]. Validation
    /// order is input origin; binary scan; checked `usize`-to-`u64` frame length
    /// and accepted-offset addition; semantic decode under owner-derived
    /// context and binding; then consuming semantic admission. Only joint
    /// success publishes the advanced owner and byte offset. Exact duplicates
    /// count as joint success. The returned frame length lets the caller slice
    /// its still owned input; trailing bytes are not inspected.
    ///
    /// A truncated step retains no borrowed bytes or incremental scanner state.
    /// The next call must therefore resupply the complete accumulated frame
    /// prefix from the same unchanged origin, not only newly arrived suffix
    /// bytes.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogTailFailure`] with the complete unchanged cursor for
    /// origin mismatch, offset overflow, frame scan/decode failure, or semantic
    /// admission rejection. Admission failure additionally retains the exact
    /// decoded entry. Allocation failure, panic, abort, and process failure are
    /// outside this typed atomicity contract.
    pub fn try_observe_frame(
        self,
        input_origin: u64,
        input: &[u8],
    ) -> Result<LocalLogTailStep, LocalLogTailFailure> {
        if input_origin != self.accepted_byte_offset {
            let expected = self.accepted_byte_offset;
            return Err(LocalLogTailFailure::new(
                self,
                None,
                LocalLogTailError::InputOriginMismatch { expected, actual: input_origin },
            ));
        }

        let scan = match self.frame_codec.scan(input) {
            Ok(scan) => scan,
            Err(error) => {
                return Err(LocalLogTailFailure::new(
                    self,
                    None,
                    LocalLogTailError::FrameScan(Box::new(error)),
                ));
            }
        };
        let frame = match scan {
            LocalLogFrameScan::EndOfInput => {
                return Ok(LocalLogTailStep::new(self, LocalLogTailStatus::EndOfInput));
            }
            LocalLogFrameScan::Truncated(truncation) => {
                return Ok(LocalLogTailStep::new(self, LocalLogTailStatus::Truncated(truncation)));
            }
            LocalLogFrameScan::Complete(frame) => frame,
        };

        let frame_bytes = frame.consumed_bytes();
        let Ok(consumed_u64) = u64::try_from(frame_bytes) else {
            return Err(LocalLogTailFailure::new(
                self,
                None,
                LocalLogTailError::ConsumedBytesOverflow { consumed_bytes: frame_bytes },
            ));
        };
        let Some(frame_end) = self.accepted_byte_offset.checked_add(consumed_u64) else {
            let accepted_bytes = self.accepted_byte_offset;
            return Err(LocalLogTailFailure::new(
                self,
                None,
                LocalLogTailError::AcceptedOffsetOverflow {
                    accepted_bytes,
                    consumed_bytes: consumed_u64,
                },
            ));
        };
        let entry = match self.frame_codec.decode_frame(frame) {
            Ok(entry) => entry,
            Err(error) => {
                return Err(LocalLogTailFailure::new(
                    self,
                    None,
                    LocalLogTailError::FrameDecode(Box::new(error)),
                ));
            }
        };

        let Self { owner, frame_codec, accepted_byte_offset: frame_start } = self;
        match owner.try_observe(entry) {
            Ok((owner, observation)) => {
                let cursor = Self { owner, frame_codec, accepted_byte_offset: frame_end };
                Ok(LocalLogTailStep::new(
                    cursor,
                    LocalLogTailStatus::Accepted {
                        observation,
                        frame_start,
                        frame_end,
                        frame_bytes,
                    },
                ))
            }
            Err(failure) => {
                let (owner, rejected_entry, error) = failure.into_parts();
                let cursor = Self { owner, frame_codec, accepted_byte_offset: frame_start };
                Err(LocalLogTailFailure::new(
                    cursor,
                    Some(rejected_entry),
                    LocalLogTailError::Admission(Box::new(error)),
                ))
            }
        }
    }
}
