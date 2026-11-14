//! Pure exact file-closure admission. No native replay, filesystem writes, leases or activation.
use super::{
    format,
    manifest::{Head, Manifest, Ready},
};
use crate::{
    Error, Result,
    archive_input::ArchiveSlice,
    credentials,
    log::{Record, frame, scan},
};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::BufReader,
};

pub(crate) const MAX_GENERATION_FILES: usize = format::MAX_GENERATIONS * 3 + 8;
pub(crate) const MAX_GENERATION_BODY_BYTES: u64 =
    format::MAX_WAL_BYTES + format::MAX_MANIFEST_BYTES * 2 + format::MAX_CONTROL * 2;

pub(crate) struct GenerationCut {
    pub manifest: [u8; 32],
    pub records: u64,
    pub previous: [u8; 32],
}
fn file<'a>(files: &BTreeMap<&str, ArchiveSlice<'a>>, name: &str) -> Result<ArchiveSlice<'a>> {
    files.get(name).copied().ok_or(Error::Contract("generation archive missing selected file"))
}
fn history(
    files: &BTreeMap<&str, ArchiveSlice<'_>>,
    selected: [u8; 32],
) -> Result<Vec<([u8; 32], Manifest)>> {
    let mut output = Vec::new();
    let mut visited = BTreeSet::new();
    let mut next = Some(selected);
    let mut bytes = 0_u64;
    while let Some(hash) = next {
        if output.len() >= format::MAX_GENERATIONS || !visited.insert(hash) {
            return Err(Error::Contract("generation archive manifest cycle or budget"));
        }
        let encoded = file(files, &format::manifest_name(&hash))?.read(format::MAX_CONTROL)?;
        bytes += encoded.len() as u64;
        if encoded.len() as u64 > format::MAX_CONTROL
            || bytes > format::MAX_MANIFEST_BYTES
            || format::sha(&encoded) != hash
        {
            return Err(Error::Contract("generation archive manifest bytes"));
        }
        let value: Manifest = format::decode(&encoded)?;
        value.validate()?;
        next = value.parent;
        output.push((hash, value));
    }
    output.reverse();
    let first = output.first().ok_or(Error::Contract("generation archive root absent"))?;
    if first.1.parent.is_some() || !first.1.sealed.is_empty() {
        return Err(Error::Contract("generation archive initial manifest differs"));
    }
    for pair in output.windows(2) {
        pair[1].1.follows(&pair[0].1, pair[0].0)?;
    }
    Ok(output)
}
fn unpublished(
    files: &BTreeMap<&str, ArchiveSlice<'_>>,
    selected: &BTreeSet<String>,
) -> Result<()> {
    let mut count = 0;
    let mut bytes = 0_u64;
    for (name, data) in files {
        if selected.contains(*name) {
            continue;
        }
        let nonce = name
            .strip_prefix(".stage-")
            .ok_or(Error::Contract("generation archive unselected or pending file"))?;
        credentials::hash(nonce)?;
        count += 1;
        bytes += data.len();
        if count > format::MAX_GENERATIONS
            || data.len() > format::MAX_CONTROL
            || bytes > format::MAX_MANIFEST_BYTES
        {
            return Err(Error::Contract("generation archive unpublished stage budget"));
        }
    }
    Ok(())
}

pub(crate) fn verify_generation_files(files: &BTreeMap<&str, &[u8]>) -> Result<GenerationCut> {
    visit_generation_records(files, |_| Ok(()))
}

/// Private fallible traversal. A callback may see a prefix before whole-closure refusal, and
/// must keep its state private until this returns successfully. Never an import/publication API.
pub(crate) fn visit_generation_records(
    files: &BTreeMap<&str, &[u8]>,
    visit: impl FnMut(Record) -> Result<()>,
) -> Result<GenerationCut> {
    visit_sections(
        &files.iter().map(|(&name, &bytes)| (name, ArchiveSlice::Bytes(bytes))).collect(),
        visit,
    )
}

pub(crate) fn verify_generation_sections(
    files: &BTreeMap<&str, ArchiveSlice<'_>>,
) -> Result<GenerationCut> {
    visit_sections(files, |_| Ok(()))
}

pub(crate) fn visit_sections(
    files: &BTreeMap<&str, ArchiveSlice<'_>>,
    mut visit: impl FnMut(Record) -> Result<()>,
) -> Result<GenerationCut> {
    if files.len() > MAX_GENERATION_FILES {
        return Err(Error::Contract("generation archive file count"));
    }
    let total = files
        .values()
        .try_fold(0_u64, |total, bytes| total.checked_add(bytes.len()))
        .ok_or(Error::Contract("generation archive byte overflow"))?;
    if total > MAX_GENERATION_BODY_BYTES {
        return Err(Error::Contract("generation archive total bytes"));
    }
    let head: Head = format::decode(&file(files, ".head.json")?.read(format::MAX_CONTROL)?)?;
    head.validate()?;
    let history = history(files, head.manifest)?;
    let root = history.first().ok_or(Error::Contract("generation archive root absent"))?;
    let ready: Ready = format::decode(&file(files, ".ready.json")?.read(format::MAX_CONTROL)?)?;
    ready.validate(root.0)?;
    let selected = &history.last().ok_or(Error::Contract("generation archive head absent"))?.1;
    if selected.origin.is_some() {
        return Err(Error::Contract("legacy generation backup requires the original root"));
    }
    let mut names = BTreeSet::from([".head.json".to_owned(), ".ready.json".into()]);
    names.extend(history.iter().map(|(hash, _)| format::manifest_name(hash)));
    for (item, family) in selected.closed_files() {
        let name = format::wal_name(&item.generation);
        let bytes = file(files, &name)?;
        if bytes.len() != item.bytes || bytes.digest()? != item.sha256 {
            return Err(Error::Contract("generation archive closed log bytes"));
        }
        let cut = scan::visit_records_from(
            &mut BufReader::new(bytes.reader()),
            bytes.len(),
            family,
            item.first,
            item.previous,
            &mut visit,
        )?;
        if cut.recovery.truncated_bytes != 0
            || cut.records != item.records
            || cut.previous != item.terminal
        {
            return Err(Error::Contract("generation archive closed log cut"));
        }
        names.insert(name);
    }
    let name = format::wal_name(&selected.active.generation);
    let active = file(files, &name)?;
    if selected
        .closed_bytes()
        .checked_add(active.len())
        .is_none_or(|bytes| bytes > format::MAX_WAL_BYTES)
    {
        return Err(Error::Contract("generation archive retained WAL budget"));
    }
    let cut = scan::visit_records_from(
        &mut BufReader::new(active.reader()),
        active.len(),
        frame::Family::Continuation,
        selected.active.first,
        selected.active.previous,
        &mut visit,
    )?;
    if cut.recovery.truncated_bytes != 0 {
        return Err(Error::Contract("generation archive incomplete active tail"));
    }
    names.insert(name);
    unpublished(files, &names)?;
    Ok(GenerationCut {
        manifest: head.manifest,
        records: selected
            .active
            .first
            .checked_add(cut.records)
            .ok_or(Error::Contract("generation archive global cut"))?,
        previous: cut.previous,
    })
}
