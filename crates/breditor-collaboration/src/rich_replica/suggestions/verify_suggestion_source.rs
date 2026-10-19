//! Prove the captured command batch against the retained native source, not a supplied AST claim.
use super::{
    DocumentSuggestionInfo,
    source_evaluation::{SourceEvaluation, evaluate_source},
};
use crate::{
    Error,
    rich_replica::{RichReplica, WriterDependency},
};
use serde::Serialize;
/// Pure native source proof; it is neither an authenticated publication nor an accepted decision.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DocumentSuggestionSource {
    /// Some captured document operations are not available yet.
    Pending {
        /// Original exclusive operation ends, in numeric writer order.
        missing: Vec<WriterDependency>,
    },
    /// Original commands have a valid nonempty semantic result at their captured causal cut.
    Verified {
        /// Descriptive attribution, still requiring independent host authentication.
        info: DocumentSuggestionInfo,
        /// Exact captured native source operation ends; host acceptance boundaries are separate.
        clocks: Vec<WriterDependency>,
    },
}
impl RichReplica {
    /// Verify a proposal's actual source intent without changing any live field or history lane.
    /// # Errors
    /// Noncausal/incomplete-mark cuts, invalid native commands, no effect or limits reject.
    pub fn verify_document_suggestion_source(
        &self,
        input: &str,
    ) -> Result<DocumentSuggestionSource, Error> {
        Ok(match evaluate_source(self, input)? {
            SourceEvaluation::Pending { missing, .. } => {
                DocumentSuggestionSource::Pending { missing }
            }
            SourceEvaluation::Verified { info, clocks, .. } => {
                DocumentSuggestionSource::Verified { info, clocks }
            }
        })
    }
}
