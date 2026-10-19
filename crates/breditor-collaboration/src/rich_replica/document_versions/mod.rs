//! Named semantic snapshots and guarded restore-as-new-change, never old writer recovery.
mod apply_version_restore;
mod asset_references;
mod capture_version;
mod compare_version;
mod packet;
mod prepare_version_restore;
mod read_version;
mod verify_version_source;
pub(super) use compare_version::compare as compare_documents;
pub use compare_version::{
    VersionAssetReference, VersionBlockChange, VersionChangeAspect, VersionComparison,
    VersionNodeTarget,
};
pub use packet::DocumentVersionInfo;
pub use prepare_version_restore::DocumentVersionRestorePlan;
pub use verify_version_source::DocumentVersionSource;
