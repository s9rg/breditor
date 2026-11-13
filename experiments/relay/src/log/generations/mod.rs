//! Explicit physical storage family. Original file readers never infer this layout.
mod archive_sealed_wal;
mod archive_wal_copy;
#[cfg(test)]
pub(crate) use archive_sealed_wal::WalArchiveInterruption;
#[cfg(test)]
pub(crate) use format::wal_name as test_wal_name;
mod capture;
mod closure;
mod complete_recovery;
mod create;
mod directory;
mod format;
mod guard_directory;
mod held_file;
mod inspect_tail;
#[cfg(test)]
mod interruption;
mod inventory;
mod manifest;
mod open;
mod options;
mod pack_sealed_wal;
#[cfg(test)]
pub(crate) use pack_sealed_wal::WalPackingInterruption;
mod packed_wal;
mod prepare_original_root;
mod publication;
mod publish_ready;
mod receipt;
#[cfg(feature = "server")]
mod repair_tail;
mod replay;
#[cfg(feature = "server")]
pub(crate) use repair_tail::NativeTailRepairInterruption;
#[cfg(all(feature = "server", test))]
pub(crate) use repair_tail::NativeTailRepairPoint;
mod rotate;
#[cfg(feature = "server")]
pub use rotate::inspection::PendingNativeLogRotation;
mod rotation_recovery_stages;
mod state;
mod verify;
mod verify_archive;
mod verify_archive_ancestor;
pub use archive_sealed_wal::ServerSealedWalArchive;
pub(crate) use capture::{GenerationFileSection, GenerationFiles};
pub(crate) use closure::{
    MAX_GENERATION_BODY_BYTES, MAX_GENERATION_FILES, verify_generation_files,
    visit_generation_records,
};
pub(crate) use create::Creation;
pub(crate) use directory::{
    Directory as GenerationDirectory, DirectoryWitness as GenerationDirectoryWitness,
};
pub(super) use format::{
    MAX_GENERATIONS as MAX_PHYSICAL_GENERATIONS, MAX_WAL_BYTES as MAX_PHYSICAL_LOG_BYTES,
};
pub(crate) use held_file::FileIdentity as GenerationFileWitness;
pub(crate) use held_file::FileStamp as GenerationFileStamp;
#[cfg(test)]
pub(crate) use interruption::RotationPoint;
pub use options::ServerLogGenerationOptions;
pub use packed_wal::ServerSealedWalPacking;
pub(crate) use prepare_original_root::prepare_original_root;
pub use receipt::{ServerLogGenerationDescriptor, ServerLogGenerationReceipt};
pub(super) use state::Generations;
pub(crate) use verify_archive_ancestor::verify_archive_ancestor;
