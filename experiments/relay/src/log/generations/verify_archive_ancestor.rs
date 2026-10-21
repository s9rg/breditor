//! Pure complete transport A->B retention. No native replay, filesystem custody or activation.
use super::{closure::verify_generation_files, format, manifest::Manifest};
use crate::{Error, Result};
use std::collections::BTreeMap;

pub(crate) fn verify_archive_ancestor(
    current: &BTreeMap<&str, &[u8]>,
    ancestor: &BTreeMap<&str, &[u8]>,
) -> Result<()> {
    let after = verify_generation_files(current)?;
    let before = verify_generation_files(ancestor)?;
    let name = format::manifest_name(&before.manifest);
    let encoded = ancestor
        .get(name.as_str())
        .copied()
        .ok_or(Error::Contract("archive ancestor manifest absent"))?;
    if after.records < before.records || current.get(name.as_str()).copied() != Some(encoded) {
        return Err(Error::Contract("archive ancestor is not in local physical lineage"));
    }
    // Fully admitted B permits only selected-chain m-* manifests. Presence is physical ancestry,
    // not merely equal logical clocks. Only A's formerly active WAL may grow.
    let manifest: Manifest = format::decode(encoded)?;
    let active = format::wal_name(&manifest.active.generation);
    for (&name, &bytes) in ancestor {
        if name == ".head.json" {
            continue;
        }
        let selected = current
            .get(name)
            .copied()
            .ok_or(Error::Contract("archive local source lost ancestor file"))?;
        if if name == active { !selected.starts_with(bytes) } else { selected != bytes } {
            return Err(Error::Contract("archive local source differs from ancestor bytes"));
        }
    }
    Ok(())
}
