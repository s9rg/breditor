use super::{
    LocalLogFrameScanV3, LocalLogTailCursorV3, LocalLogTailErrorV3, LocalLogTailFailureV3,
    LocalLogTailStatusV3, LocalLogTailStepV3,
};

impl LocalLogTailCursorV3 {
    /// Scans, decodes, and attempts to admit at most one Frame V3 observation.
    ///
    /// Only joint binary, Entry V3, schema-binding, and semantic-admission
    /// success advances the owner and byte offset. End, truncation, and every
    /// typed failure retain the complete V3 cursor and its binding unchanged.
    /// A truncated retry must resupply the whole accumulated frame prefix from
    /// the same origin.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogTailFailureV3`] with the unchanged cursor for origin
    /// mismatch, offset overflow, Frame V3 scan/decode failure, or semantic
    /// admission rejection. Admission failure also retains the decoded entry.
    pub fn try_observe_frame(
        self,
        input_origin: u64,
        input: &[u8],
    ) -> Result<LocalLogTailStepV3, LocalLogTailFailureV3> {
        if input_origin != self.accepted_byte_offset {
            let expected = self.accepted_byte_offset;
            return Err(LocalLogTailFailureV3::new(
                self,
                None,
                LocalLogTailErrorV3::InputOriginMismatch { expected, actual: input_origin },
            ));
        }

        let scan = match self.frame_codec.scan(input) {
            Ok(scan) => scan,
            Err(error) => {
                return Err(LocalLogTailFailureV3::new(
                    self,
                    None,
                    LocalLogTailErrorV3::FrameScan(Box::new(error)),
                ));
            }
        };
        let frame = match scan {
            LocalLogFrameScanV3::EndOfInput => {
                return Ok(LocalLogTailStepV3::new(self, LocalLogTailStatusV3::EndOfInput));
            }
            LocalLogFrameScanV3::Truncated(truncation) => {
                return Ok(LocalLogTailStepV3::new(
                    self,
                    LocalLogTailStatusV3::Truncated(truncation),
                ));
            }
            LocalLogFrameScanV3::Complete(frame) => frame,
        };

        let frame_bytes = frame.consumed_bytes();
        let Ok(consumed_u64) = u64::try_from(frame_bytes) else {
            return Err(LocalLogTailFailureV3::new(
                self,
                None,
                LocalLogTailErrorV3::ConsumedBytesOverflow { consumed_bytes: frame_bytes },
            ));
        };
        let Some(frame_end) = self.accepted_byte_offset.checked_add(consumed_u64) else {
            let accepted_bytes = self.accepted_byte_offset;
            return Err(LocalLogTailFailureV3::new(
                self,
                None,
                LocalLogTailErrorV3::AcceptedOffsetOverflow {
                    accepted_bytes,
                    consumed_bytes: consumed_u64,
                },
            ));
        };
        let entry = match self.frame_codec.decode_frame(frame) {
            Ok(entry) => entry,
            Err(error) => {
                return Err(LocalLogTailFailureV3::new(
                    self,
                    None,
                    LocalLogTailErrorV3::FrameDecode(Box::new(error)),
                ));
            }
        };

        let Self { owner, frame_codec, accepted_byte_offset: frame_start } = self;
        match owner.try_observe(entry) {
            Ok((owner, observation)) => {
                let cursor = Self { owner, frame_codec, accepted_byte_offset: frame_end };
                Ok(LocalLogTailStepV3::new(
                    cursor,
                    LocalLogTailStatusV3::Accepted {
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
                Err(LocalLogTailFailureV3::new(
                    cursor,
                    Some(rejected_entry),
                    LocalLogTailErrorV3::Admission(Box::new(error)),
                ))
            }
        }
    }
}
