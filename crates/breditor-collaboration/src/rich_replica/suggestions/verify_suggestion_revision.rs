//! Re-prove both original native intents and forward causal source coverage, without accepting either.
use super::{
    DocumentSuggestionRevisionInfo,
    evaluate_commands::NativeEvaluation,
    revision_packet::Revision,
    source_evaluation::{SourceEvaluation, evaluate_source},
};
use crate::{
    Error,
    rich_replica::{RichReplica, WriterDependency},
};
use serde::Serialize;
use std::collections::BTreeMap;

/// Pure source proof; the reference host separately authenticates pending-only supersession.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DocumentSuggestionRevisionSource {
    /// Required native exclusive ends are missing. No revision may be finalized yet.
    Pending {
        /// Original predecessor dependencies are requested before replacement dependencies.
        missing: Vec<WriterDependency>,
    },
    /// Both intents have valid nonempty historical effects and the child observes its parent source.
    Verified {
        /// Exact relation and unchanged V1 replacement attribution.
        revision: DocumentSuggestionRevisionInfo,
        /// Replacement's exact original source cuts; host semantic admission is independent.
        clocks: Vec<WriterDependency>,
    },
}
pub(super) enum RevisionEvaluation {
    Pending {
        revision: DocumentSuggestionRevisionInfo,
        missing: Vec<WriterDependency>,
    },
    Verified {
        revision: DocumentSuggestionRevisionInfo,
        clocks: Vec<WriterDependency>,
        parent: Box<NativeEvaluation>,
        child: Box<NativeEvaluation>,
    },
}
pub(super) fn evaluate_revision(
    owner: &RichReplica,
    previous: &str,
    input: &str,
) -> Result<RevisionEvaluation, Error> {
    let envelope = Revision::read(owner, previous, input)?;
    let revision = envelope.info(owner)?;
    let (parent, parent_native) = match evaluate_source(owner, previous)? {
        SourceEvaluation::Pending { missing, .. } => {
            return Ok(RevisionEvaluation::Pending { revision, missing });
        }
        SourceEvaluation::Verified { clocks, native, .. } => (clocks, native),
    };
    let (clocks, child_native) =
        match evaluate_source(owner, &envelope.data.suggestion_packet_json)? {
            SourceEvaluation::Pending { missing, .. } => {
                return Ok(RevisionEvaluation::Pending { revision, missing });
            }
            SourceEvaluation::Verified { clocks, native, .. } => (clocks, native),
        };
    let child = clocks
        .iter()
        .map(|clock| {
            Ok((
                clock.writer.as_str(),
                clock
                    .counter
                    .parse::<u64>()
                    .map_err(|_| Error::Contract("suggestion revision source counter"))?,
            ))
        })
        .collect::<Result<BTreeMap<_, _>, Error>>()?;
    for clock in parent {
        let end = clock
            .counter
            .parse::<u64>()
            .map_err(|_| Error::Contract("suggestion revision source counter"))?;
        if child.get(clock.writer.as_str()).copied().unwrap_or(0) < end {
            return Err(Error::Contract("suggestion revision source precedes predecessor"));
        }
    }
    Ok(RevisionEvaluation::Verified {
        revision,
        clocks,
        parent: parent_native,
        child: child_native,
    })
}

impl RichReplica {
    /// Verify the actual source history of both proposals, not caller-supplied ancestry or an AST.
    /// It changes no selection, history, writer counter, frame or accepted content.
    /// # Errors
    /// Invalid native source/cuts/intents, altered binding/attribution or a child whose source
    /// precedes any predecessor dependency reject. Missing dependencies remain explicit Pending.
    pub fn verify_document_suggestion_revision(
        &self,
        previous: &str,
        input: &str,
    ) -> Result<DocumentSuggestionRevisionSource, Error> {
        Ok(match evaluate_revision(self, previous, input)? {
            RevisionEvaluation::Pending { missing, .. } => {
                DocumentSuggestionRevisionSource::Pending { missing }
            }
            RevisionEvaluation::Verified { revision, clocks, .. } => {
                DocumentSuggestionRevisionSource::Verified { revision, clocks }
            }
        })
    }
}
