//! Pure complete transport A->B retention. No native replay, filesystem custody or activation.
use super::{format, manifest::Manifest};
use crate::{Error, Result, archive_input::ArchiveSlice};
use std::collections::BTreeMap;

#[cfg(test)]
pub(crate) fn verify_archive_ancestor(
    current: &BTreeMap<&str, &[u8]>,
    ancestor: &BTreeMap<&str, &[u8]>,
) -> Result<()> {
    let current =
        current.iter().map(|(&name, &bytes)| (name, ArchiveSlice::Bytes(bytes))).collect();
    let ancestor =
        ancestor.iter().map(|(&name, &bytes)| (name, ArchiveSlice::Bytes(bytes))).collect();
    verify_archive_sections(&current, &ancestor)
}

pub(crate) fn verify_archive_sections(
    current: &BTreeMap<&str, ArchiveSlice<'_>>,
    ancestor: &BTreeMap<&str, ArchiveSlice<'_>>,
) -> Result<()> {
    let after = super::closure::verify_generation_sections(current)?;
    let before = super::closure::verify_generation_sections(ancestor)?;
    let name = format::manifest_name(&before.manifest);
    let encoded = ancestor
        .get(name.as_str())
        .copied()
        .ok_or(Error::Contract("archive ancestor manifest absent"))?;
    if after.records < before.records
        || current.get(name.as_str()).copied().is_none_or(|part| part.len() != encoded.len())
    {
        return Err(Error::Contract("archive ancestor is not in local physical lineage"));
    }
    // Fully admitted B permits only selected-chain m-* manifests. Presence is physical ancestry,
    // not merely equal logical clocks. Only A's formerly active WAL may grow.
    let manifest: Manifest = format::decode(&encoded.read(format::MAX_CONTROL)?)?;
    let active = format::wal_name(&manifest.active.generation);
    for (&name, &bytes) in ancestor {
        if name == ".head.json" {
            continue;
        }
        let selected = current
            .get(name)
            .copied()
            .ok_or(Error::Contract("archive local source lost ancestor file"))?;
        let length = bytes.len();
        if selected.len() < length
            || name != active && selected.len() != length
            || selected.section(0, length)?.digest()? != bytes.digest()?
        {
            return Err(Error::Contract("archive local source differs from ancestor bytes"));
        }
    }
    Ok(())
}
