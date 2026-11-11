//! Explicit physical storage family. Original file readers never infer this layout.
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
mod prepare_original_root;
mod publication;
mod publish_ready;
mod receipt;
mod rotate;
mod state;
mod verify;
mod verify_archive;
mod verify_archive_ancestor;
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
pub(crate) use prepare_original_root::prepare_original_root;
pub use receipt::{ServerLogGenerationDescriptor, ServerLogGenerationReceipt};
pub(super) use state::Generations;
pub(crate) use verify_archive_ancestor::verify_archive_ancestor;
