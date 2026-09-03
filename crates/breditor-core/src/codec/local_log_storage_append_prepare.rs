use std::sync::Arc;

use crate::local_log::{LocalLogEntry, LocalLogStorageChunkStart};

use super::{
    LocalLogStorageAppendPlan, LocalLogStorageAppendPreparationError,
    LocalLogStorageAppendPreparationFailure, LocalLogStorageMutationToken, LocalLogTailCursor,
    LocalLogTailStatus,
};

impl LocalLogStorageMutationToken {
    /// Consumes this token and cursor into one checked speculative append plan.
    ///
    /// Validation precedence is selected session, checkpoint generation,
    /// active generation, exact Frame V1 policy, deterministic frame encoding,
    /// then the existing atomic tail transition. Successful preparation admits
    /// the exact encoded frame into a cursor quarantined inside the plan. The
    /// future chunk starts at the cursor's pre-append accepted byte offset and
    /// contains exactly this one frame.
    ///
    /// Preparation performs no storage I/O and proves no token currentness,
    /// append, or durability. A future adapter request must re-observe the
    /// complete token binding and append the exact planned frame inside one
    /// serialized transaction before releasing the speculative cursor.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageAppendPreparationFailure`] containing this
    /// complete unchanged token and cursor. `entry` is borrowed and remains
    /// caller-owned for every outcome.
    pub fn try_prepare_append(
        self,
        cursor: LocalLogTailCursor,
        entry: &LocalLogEntry,
    ) -> Result<LocalLogStorageAppendPlan, LocalLogStorageAppendPreparationFailure> {
        let selected = self.selected_binding();
        if selected.current_receipt().session_id() != cursor.owner().session_id() {
            return Err(LocalLogStorageAppendPreparationFailure::new(
                self,
                cursor,
                LocalLogStorageAppendPreparationError::SessionMismatch,
            ));
        }
        if selected.checkpoint_generation().log_id() != cursor.owner().checkpoint_log_id() {
            return Err(LocalLogStorageAppendPreparationFailure::new(
                self,
                cursor,
                LocalLogStorageAppendPreparationError::CheckpointLogMismatch,
            ));
        }
        if selected.active_generation().log_id() != cursor.owner().active_log_id() {
            return Err(LocalLogStorageAppendPreparationFailure::new(
                self,
                cursor,
                LocalLogStorageAppendPreparationError::ActiveLogMismatch,
            ));
        }
        if selected.active_generation().frame().limits() != cursor.frame_limits() {
            return Err(LocalLogStorageAppendPreparationFailure::new(
                self,
                cursor,
                LocalLogStorageAppendPreparationError::FramePolicyMismatch,
            ));
        }

        let frame = match cursor.frame_codec.encode(entry) {
            Ok(frame) => frame,
            Err(error) => {
                return Err(LocalLogStorageAppendPreparationFailure::new(
                    self,
                    cursor,
                    LocalLogStorageAppendPreparationError::FrameEncode(Box::new(error)),
                ));
            }
        };
        let input_origin = cursor.accepted_byte_offset();
        let step = match cursor.try_observe_frame(input_origin, &frame) {
            Ok(step) => step,
            Err(failure) => {
                let (cursor, rejected_entry, error) = failure.into_parts();
                drop(rejected_entry);
                return Err(LocalLogStorageAppendPreparationFailure::new(
                    self,
                    cursor,
                    LocalLogStorageAppendPreparationError::TailTransition(Box::new(error)),
                ));
            }
        };
        let (speculative_cursor, status) = step.into_parts();
        let LocalLogTailStatus::Accepted { observation, frame_start, frame_end, frame_bytes } =
            status
        else {
            unreachable!("a frame emitted by the same codec must scan as one complete frame");
        };
        debug_assert_eq!(frame_start, input_origin);
        debug_assert_eq!(frame_bytes, frame.len());

        Ok(LocalLogStorageAppendPlan::new(
            self,
            speculative_cursor,
            Arc::from(frame),
            LocalLogStorageChunkStart::new(frame_start),
            frame_end,
            observation,
        ))
    }
}
