//! Positive projection reuse only: bound to one live owner and unchanged committed causal content.
//! This never skips protocol/header, causal-root, journal, history or UI admission.
use loro::{LoroDoc, VersionVector};
use std::sync::Arc;

struct Admitted {
    owner: Arc<()>,
    state: VersionVector,
    oplog: VersionVector,
}
#[derive(Default)]
pub(super) struct ProjectionCache {
    admitted: Option<Admitted>,
    #[cfg(test)]
    admissions: usize,
}
impl ProjectionCache {
    /// A pending transaction or detached checkout is never a reusable proof.
    pub fn is_current(&self, doc: &LoroDoc, owner: &Arc<()>) -> bool {
        doc.get_pending_txn_len() == 0
            && !doc.is_detached()
            && self.admitted.as_ref().is_some_and(|stamp| {
                Arc::ptr_eq(&stamp.owner, owner)
                    && stamp.state == doc.state_vv()
                    && stamp.oplog == doc.oplog_vv()
            })
    }
    /// Call only after complete materialization, schema admission and canonical encoding succeed.
    pub fn record(&mut self, doc: &LoroDoc, owner: &Arc<()>) {
        self.admitted = (doc.get_pending_txn_len() == 0 && !doc.is_detached()).then(|| Admitted {
            owner: Arc::clone(owner),
            state: doc.state_vv(),
            oplog: doc.oplog_vv(),
        });
        #[cfg(test)]
        {
            self.admissions += 1;
        }
    }
    #[cfg(test)]
    pub fn admissions(&self) -> usize {
        self.admissions
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    type Result = std::result::Result<(), Box<dyn std::error::Error>>;

    #[test]
    fn a_version_is_not_a_projection_proof_without_its_original_owner() {
        let doc = LoroDoc::new();
        let owner = Arc::new(());
        let mut cache = ProjectionCache::default();
        assert!(!cache.is_current(&doc, &owner));
        cache.record(&doc, &owner);
        assert!(cache.is_current(&doc, &Arc::clone(&owner)));
        assert!(!cache.is_current(&doc, &Arc::new(())));
    }

    #[test]
    fn pending_and_committed_local_changes_both_invalidate_positive_projection() -> Result {
        let doc = LoroDoc::new();
        doc.set_peer_id(1)?;
        let owner = Arc::new(());
        let mut cache = ProjectionCache::default();
        cache.record(&doc, &owner);
        doc.get_text("p").insert(0, "A")?;
        assert!(doc.get_pending_txn_len() > 0);
        assert!(!cache.is_current(&doc, &owner));
        cache.record(&doc, &owner);
        assert!(!cache.is_current(&doc, &owner));
        doc.commit();
        assert!(!cache.is_current(&doc, &owner));
        cache.record(&doc, &owner);
        assert!(cache.is_current(&doc, &owner));
        doc.get_text("p").insert(1, "B")?;
        doc.commit();
        assert!(!cache.is_current(&doc, &owner));
        Ok(())
    }

    #[test]
    fn imports_and_detached_checkouts_cannot_reuse_the_current_projection() -> Result {
        let doc = LoroDoc::new();
        doc.set_peer_id(1)?;
        doc.get_text("p").insert(0, "A")?;
        doc.commit();
        let first = doc.state_frontiers();
        let owner = Arc::new(());
        let mut cache = ProjectionCache::default();
        cache.record(&doc, &owner);
        let peer = doc.fork();
        peer.set_peer_id(2)?;
        peer.get_text("p").insert(1, "B")?;
        peer.commit();
        doc.import(&peer.export(loro::ExportMode::all_updates())?)?;
        assert!(!cache.is_current(&doc, &owner));
        cache.record(&doc, &owner);
        doc.checkout(&first)?;
        assert!(doc.is_detached());
        assert!(!cache.is_current(&doc, &owner));
        cache.record(&doc, &owner);
        assert!(!cache.is_current(&doc, &owner));
        doc.attach();
        assert!(!cache.is_current(&doc, &owner));
        cache.record(&doc, &owner);
        assert!(cache.is_current(&doc, &owner));
        Ok(())
    }
}
