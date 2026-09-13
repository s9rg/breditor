use super::{
    LocalLogStorageRootReadbackErrorV3 as Error, LocalLogStorageRootReadbackEvidenceV3,
    LocalLogStorageRootReadbackFailureV3, LocalLogStorageRootReadbackMatchV3,
    LocalLogStorageRootReadbackV3,
};

impl LocalLogStorageRootReadbackV3 {
    /// Accepts only an exactly correlated, byte-exact current candidate snapshot.
    ///
    /// # Errors
    /// Returns both unchanged inputs for missing/mismatched request correlation,
    /// head-index mismatch, or candidate bytes/binding mismatch, in that order.
    /// Mismatch is not a validated absence, collision, or supersession finding.
    pub fn observe_selected(
        self,
        evidence: LocalLogStorageRootReadbackEvidenceV3,
    ) -> Result<LocalLogStorageRootReadbackMatchV3, LocalLogStorageRootReadbackFailureV3> {
        let plan = &self.source.plan;
        let selected = evidence.selected.inner();
        let error = match self.request_id.as_ref() {
            None => Some(Error::RequestNotIssued),
            Some(id) if id != &evidence.request_id => Some(Error::RequestIdMismatch),
            Some(_)
                if &evidence.head_index_transaction_id
                    != plan.candidate_receipt().transaction_id() =>
            {
                Some(Error::HeadIndexMismatch)
            }
            Some(_)
                if selected.binding() != plan.candidate_binding().inner()
                    || selected.current_selection_json() != plan.candidate_json.as_ref() =>
            {
                Some(Error::CandidateMismatch)
            }
            Some(_) => None,
        };
        if let Some(error) = error {
            return Err(LocalLogStorageRootReadbackFailureV3 {
                retained: Box::new((self, evidence)),
                error,
            });
        }
        Ok(LocalLogStorageRootReadbackMatchV3 { owner: self, evidence })
    }
}
