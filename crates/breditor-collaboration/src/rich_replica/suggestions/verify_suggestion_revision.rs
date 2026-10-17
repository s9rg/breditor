//! Re-prove both original native intents and forward causal source coverage, without accepting either.
use super::{DocumentSuggestionRevisionInfo, DocumentSuggestionSource, revision_packet::Revision};
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
        let revision = Revision::read(self, previous, input)?;
        let parent = match self.verify_document_suggestion_source(previous)? {
            DocumentSuggestionSource::Pending { missing } => {
                return Ok(DocumentSuggestionRevisionSource::Pending { missing });
            }
            DocumentSuggestionSource::Verified { clocks, .. } => clocks,
        };
        let clocks =
            match self.verify_document_suggestion_source(&revision.data.suggestion_packet_json)? {
                DocumentSuggestionSource::Pending { missing } => {
                    return Ok(DocumentSuggestionRevisionSource::Pending { missing });
                }
                DocumentSuggestionSource::Verified { clocks, .. } => clocks,
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
        Ok(DocumentSuggestionRevisionSource::Verified { revision: revision.info(self)?, clocks })
    }
}
