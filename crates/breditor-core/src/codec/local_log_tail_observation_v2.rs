use super::{
    LocalLogFrameScanV2, LocalLogTailCursorV2, LocalLogTailErrorV2, LocalLogTailFailureV2,
    LocalLogTailStatusV2, LocalLogTailStepV2,
};

impl LocalLogTailCursorV2 {
    /// Scans, decodes, and attempts to admit at most one Frame V2 observation.
    ///
    /// Only joint binary, Entry V2, schema-binding, and semantic-admission
    /// success advances the owner and byte offset. End, truncation, and every
    /// typed failure retain the complete V2 cursor and its binding unchanged.
    /// A truncated retry must resupply the whole accumulated frame prefix from
    /// the same origin.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogTailFailureV2`] with the unchanged cursor for origin
    /// mismatch, offset overflow, Frame V2 scan/decode failure, or semantic
    /// admission rejection. Admission failure also retains the decoded entry.
    pub fn try_observe_frame(
        self,
        input_origin: u64,
        input: &[u8],
    ) -> Result<LocalLogTailStepV2, LocalLogTailFailureV2> {
        if input_origin != self.accepted_byte_offset {
            let expected = self.accepted_byte_offset;
            return Err(LocalLogTailFailureV2::new(
                self,
                None,
                LocalLogTailErrorV2::InputOriginMismatch { expected, actual: input_origin },
            ));
        }

        let scan = match self.frame_codec.scan(input) {
            Ok(scan) => scan,
            Err(error) => {
                return Err(LocalLogTailFailureV2::new(
                    self,
                    None,
                    LocalLogTailErrorV2::FrameScan(Box::new(error)),
                ));
            }
        };
        let frame = match scan {
            LocalLogFrameScanV2::EndOfInput => {
                return Ok(LocalLogTailStepV2::new(self, LocalLogTailStatusV2::EndOfInput));
            }
            LocalLogFrameScanV2::Truncated(truncation) => {
                return Ok(LocalLogTailStepV2::new(
                    self,
                    LocalLogTailStatusV2::Truncated(truncation),
                ));
            }
            LocalLogFrameScanV2::Complete(frame) => frame,
        };

        let frame_bytes = frame.consumed_bytes();
        let Ok(consumed_u64) = u64::try_from(frame_bytes) else {
            return Err(LocalLogTailFailureV2::new(
                self,
                None,
                LocalLogTailErrorV2::ConsumedBytesOverflow { consumed_bytes: frame_bytes },
            ));
        };
        let Some(frame_end) = self.accepted_byte_offset.checked_add(consumed_u64) else {
            let accepted_bytes = self.accepted_byte_offset;
            return Err(LocalLogTailFailureV2::new(
                self,
                None,
                LocalLogTailErrorV2::AcceptedOffsetOverflow {
                    accepted_bytes,
                    consumed_bytes: consumed_u64,
                },
            ));
        };
        let entry = match self.frame_codec.decode_frame(frame) {
            Ok(entry) => entry,
            Err(error) => {
                return Err(LocalLogTailFailureV2::new(
                    self,
                    None,
                    LocalLogTailErrorV2::FrameDecode(Box::new(error)),
                ));
            }
        };

        let Self { owner, frame_codec, accepted_byte_offset: frame_start } = self;
        match owner.try_observe(entry) {
            Ok((owner, observation)) => {
                let cursor = Self { owner, frame_codec, accepted_byte_offset: frame_end };
                Ok(LocalLogTailStepV2::new(
                    cursor,
                    LocalLogTailStatusV2::Accepted {
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
                Err(LocalLogTailFailureV2::new(
                    cursor,
                    Some(rejected_entry),
                    LocalLogTailErrorV2::Admission(Box::new(error)),
                ))
            }
        }
    }
}
