//! Named semantic snapshots and guarded restore-as-new-change, never old writer recovery.
mod apply_version_restore;
mod capture_version;
mod compare_version;
mod packet;
mod prepare_version_restore;
mod read_version;
pub use compare_version::{
    VersionAssetReference, VersionBlockChange, VersionChangeAspect, VersionComparison,
    VersionNodeTarget,
};
pub use packet::DocumentVersionInfo;
pub use prepare_version_restore::DocumentVersionRestorePlan;
