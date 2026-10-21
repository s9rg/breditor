//! Explicit physical storage family. Original file readers never infer this layout.
mod capture;
mod closure;
mod create;
mod directory;
mod format;
mod held_file;
#[cfg(test)]
mod interruption;
mod inventory;
mod manifest;
mod open;
mod options;
mod publication;
mod publish_ready;
mod receipt;
mod rotate;
mod state;
mod verify;
mod verify_archive;
pub(crate) use capture::GenerationFileSection;
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
pub use receipt::{ServerLogGenerationDescriptor, ServerLogGenerationReceipt};
pub(super) use state::Generations;
