//! Build the initial generation closure around exact original WAL bytes. No filesystem or replay.
use super::{
    ServerLogGenerationOptions,
    capture::{GenerationFileSection, GenerationFiles, backing_buffer},
    closure::verify_generation_files,
    format,
    manifest::{ActiveFile, ClosedFile, Head, Manifest, ORIGINAL_ROOT_VERSION, Ready},
};
use crate::{Error, Result};
use std::collections::BTreeMap;

pub(crate) fn prepare_original_root(
    log: &[u8],
    (records, terminal): (u64, [u8; 32]),
    options: &ServerLogGenerationOptions,
) -> Result<GenerationFiles> {
    options.validate()?;
    let manifest = Manifest {
        format: "breditor/relay-log-generations".into(),
        format_version: ORIGINAL_ROOT_VERSION,
        parent: None,
        root: ClosedFile {
            generation: options.root.clone(),
            first: 0,
            records,
            previous: [0; 32],
            terminal,
            bytes: log.len() as u64,
            sha256: format::sha(log),
        },
        sealed: Vec::new(),
        active: ActiveFile {
            generation: options.active.clone(),
            first: records,
            previous: terminal,
        },
    };
    manifest.validate()?;
    let manifest = format::encode(&manifest)?;
    let manifest_hash = format::sha(&manifest);
    let head = format::encode(&Head::new(manifest_hash))?;
    let ready = format::encode(&Ready::new(manifest_hash))?;
    let root_name = format::wal_name(&options.root);
    let active_name = format::wal_name(&options.active);
    let manifest_name = format::manifest_name(&manifest_hash);
    let files = BTreeMap::from([
        (".head.json", head.as_slice()),
        (".ready.json", ready.as_slice()),
        (active_name.as_str(), &[]),
        (manifest_name.as_str(), manifest.as_slice()),
        (root_name.as_str(), log),
    ]);
    let cut = verify_generation_files(&files)?;
    if (cut.records, cut.previous, cut.manifest) != (records, terminal, manifest_hash) {
        return Err(Error::Contract("original migration cut differs"));
    }
    let mut body = backing_buffer(files.values().map(|part| part.len() as u64).sum())?;
    let mut sections = Vec::with_capacity(files.len());
    for (name, bytes) in files {
        sections.push(GenerationFileSection {
            name: name.into(),
            offset: body.len() as u64,
            bytes: bytes.len() as u64,
            sha256: format::sha(bytes),
        });
        body.extend_from_slice(bytes);
    }
    Ok(GenerationFiles { body, sections, cut })
}
