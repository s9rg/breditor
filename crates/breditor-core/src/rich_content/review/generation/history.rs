//! Immutable file custody shared across staged owners, never mutable event/history buffers.
use super::{
    super::{ReviewError, event},
    checkpoint_budget::quoted_bytes,
    record::{CONTINUED_MAX_EVENTS, MAX_RETAINED_EVENTS},
};
use std::sync::Arc;

#[derive(Clone)]
pub(super) struct SealedReviewGeneration {
    pub generation: String,
    pub json: Arc<str>,
    pub quoted_bytes: usize,
    pub digest: String,
    pub start: usize,
    pub end: usize,
}

impl SealedReviewGeneration {
    pub(super) fn new(
        generation: String,
        json: Arc<str>,
        start: usize,
        end: usize,
    ) -> Result<Self, ReviewError> {
        let quoted_bytes = quoted_bytes(&json)?;
        let digest = file_digest(&json)?;
        Ok(Self { generation, json, quoted_bytes, digest, start, end })
    }
}

#[derive(Clone)]
pub(in crate::rich_content::review) struct ReviewGenerations {
    pub(super) root_generation: String,
    pub(super) root_json: Arc<str>,
    pub(super) root_quoted_bytes: usize,
    pub(super) root_digest: String,
    pub(super) root_events: usize,
    pub(super) sealed: Vec<SealedReviewGeneration>,
    pub(super) active_generation: String,
    pub(super) active_start: usize,
    pub(super) continued_after: Option<usize>,
}

impl ReviewGenerations {
    pub(super) fn new(
        root: String,
        root_json: String,
        active: String,
        events: usize,
    ) -> Result<Self, ReviewError> {
        let root_digest = file_digest(&root_json)?;
        let root_quoted_bytes = quoted_bytes(&root_json)?;
        Ok(Self {
            root_generation: root,
            root_json: root_json.into(),
            root_quoted_bytes,
            root_digest,
            root_events: events,
            sealed: vec![],
            active_generation: active,
            active_start: events,
            continued_after: None,
        })
    }

    pub(in crate::rich_content::review) const fn event_limit(&self) -> usize {
        if self.continued_after.is_some() { CONTINUED_MAX_EVENTS } else { MAX_RETAINED_EVENTS }
    }

    pub(super) fn parent(&self) -> (&str, &str) {
        self.sealed
            .last()
            .map_or((self.root_generation.as_str(), self.root_digest.as_str()), |file| {
                (file.generation.as_str(), file.digest.as_str())
            })
    }

    pub(super) fn contains_id(&self, id: &str) -> bool {
        self.root_generation == id
            || self.active_generation == id
            || self.sealed.iter().any(|file| file.generation == id)
    }
}

pub(super) fn file_digest(json: &str) -> Result<String, ReviewError> {
    event::hash(b"breditor/review-history-file/1\0", json.as_bytes())
}
