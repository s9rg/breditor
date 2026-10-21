//! Streaming output preserves the existing component family and detached-error behavior.
use super::*;
use std::io::{self, Write};
#[test]
fn streamed_rasters_keep_the_exact_original_component_envelope_identity_and_unchanged_source()
-> TestResult {
    let directory = Directory::new()?;
    let mut store = source(&directory)?;
    let before = snapshot(&directory.path("source"))?;
    let backup = store.export_backup()?;
    let original = frame(&serde_json::to_vec(&backup.header)?, &body(&backup))?;
    let mut streamed = Vec::new();
    backup.write_to(&mut streamed)?;
    assert_eq!(streamed, original);
    assert_eq!(backup.to_bytes()?, original);
    assert_eq!(backup.encoded_len()?, original.len() as u64);
    assert_eq!(backup.info().identity.archive_sha256, format::sha(&original));
    assert_eq!(AssetStoreBackup::from_bytes(&streamed)?.info(), backup.info());
    assert_eq!(snapshot(&directory.path("source"))?, before);
    Ok(())
}
struct BrokenWriter;
impl Write for BrokenWriter {
    fn write(&mut self, _: &[u8]) -> io::Result<usize> {
        Err(io::Error::other("fixture writer failure"))
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
#[test]
fn a_detached_raster_writer_error_does_not_poison_or_mutate_the_live_store() -> TestResult {
    let directory = Directory::new()?;
    let mut store = source(&directory)?;
    let backup = store.export_backup()?;
    let before = snapshot(&directory.path("source"))?;
    assert!(backup.write_to(&mut BrokenWriter).is_err());
    assert_eq!(store.export_backup()?.to_bytes()?, backup.to_bytes()?);
    assert_eq!(snapshot(&directory.path("source"))?, before);
    Ok(())
}
