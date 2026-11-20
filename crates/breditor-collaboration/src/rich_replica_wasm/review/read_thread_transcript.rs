//! Read one complete archived discussion without repeating native ordering for every page.
use super::{RichReplicaProbe, RichSharedObservation, decode, error};
use breditor_core::rich_content::review::{
    ReviewThreadHistoryEntry, ReviewThreadId, ReviewThreadView,
};
use serde::Serialize;
use std::io::{self, Write};
use wasm_bindgen::prelude::*;

const MAX_TRANSCRIPT_BYTES: usize = 256 * 1024 * 1024;

#[derive(Serialize)]
struct Transcript<'a> {
    thread: ReviewThreadView,
    events: Vec<ReviewThreadHistoryEntry<'a>>,
}

struct BoundedTranscript(Vec<u8>);

impl Write for BoundedTranscript {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > MAX_TRANSCRIPT_BYTES - self.0.len() {
            return Err(io::Error::other("review transcript byte budget"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Bounded, one-pass thread transcript and direct birth reads.
    #[must_use]
    #[allow(clippy::unused_self)] // Instance capability must be discoverable on the live JS owner.
    pub fn review_thread_transcript_version(&self) -> String {
        "1".into()
    }

    /// Read the original creation event at the supplied native observation.
    pub fn read_review_thread_birth(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let token = self.check_review(observed)?;
        let thread: ReviewThreadId = decode(input, 2048)?;
        let birth = self
            .review
            .as_ref()
            .ok_or_else(|| error("review unavailable"))?
            .read_thread_birth(token, &thread)
            .map_err(error)?;
        serde_json::to_string(&birth).map_err(error)
    }

    /// Read one selected thread's projection and exact attributed event timeline.
    pub fn read_review_thread_transcript(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        let token = self.check_review(observed)?;
        let thread: ReviewThreadId = decode(input, 2048)?;
        let mut events = Vec::new();
        let thread = self
            .review
            .as_ref()
            .ok_or_else(|| error("review unavailable"))?
            .visit_thread_history(token, &thread, |entry| {
                events.push(entry);
                Ok(())
            })
            .map_err(error)?;
        let mut result = BoundedTranscript(Vec::new());
        serde_json::to_writer(&mut result, &Transcript { thread, events }).map_err(error)?;
        String::from_utf8(result.0).map_err(error)
    }
}
