//! Read the exact pending intent, its physical artifacts and the current head without replay writes.
use super::{
    Control, Generations, Intent, RecoveryStages, format,
    held_file::{self, FileIdentity, FileStamp},
};
use crate::{Error, Result, log::Log};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
};

/// An observation of a pending physical log rotation, detached from its live directory.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingNativeLogRotation {
    /// Logical name of the intent's next continuation.
    pub next_generation: String,
    /// Exact prior manifest in the intent.
    pub before_manifest: [u8; 32],
    /// Exact intended successor manifest.
    pub after_manifest: [u8; 32],
    /// Whether the current head already selects the successor.
    pub head_published: bool,
    /// Digest of the exact local intent and its observed files, including inode identities.
    pub evidence_sha256: [u8; 32],
    #[serde(skip)]
    evidence: Vec<u8>,
    #[serde(skip)]
    pub(in crate::log::generations) continuation: FileIdentity,
}

impl PendingNativeLogRotation {
    /// Exact detached evidence to retain independently of the original room.
    #[must_use]
    pub fn evidence_bytes(&self) -> &[u8] {
        &self.evidence
    }
}

#[derive(Eq, PartialEq)]
pub(in crate::log::generations) struct RotationInspection {
    pub observation: PendingNativeLogRotation,
    pub excluded: BTreeSet<String>,
}

#[derive(Serialize)]
struct Piece {
    identity: FileIdentity,
    links: u64,
    bytes: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Evidence<'a> {
    format: &'static str,
    format_version: u32,
    selected_manifest: [u8; 32],
    files: &'a BTreeMap<String, Piece>,
}

fn read_piece(state: &Generations, name: &str) -> Result<Option<Piece>> {
    let path = state.directory.path.join(name);
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
        Ok(metadata) if !metadata.is_file() => {
            return Err(Error::Contract("pending rotation inspection file type"));
        }
        Ok(_) => {}
    }
    let file = fs::File::open(&path)?;
    let identity = FileIdentity::of(&file)?;
    let stamp = FileStamp::of(&file)?;
    identity.guard(&file, &path)?;
    let bytes = held_file::read(&file, format::MAX_CONTROL)?;
    stamp.guard(&file)?;
    identity.guard(&file, &path)?;
    #[cfg(unix)]
    let links = {
        use std::os::unix::fs::MetadataExt;
        file.metadata()?.nlink()
    };
    #[cfg(not(unix))]
    let links = 0;
    Ok(Some(Piece { identity, links, bytes }))
}

impl Generations {
    pub(in crate::log::generations) fn inspect_pending_rotation(
        &self,
        log: &Log,
    ) -> Result<RotationInspection> {
        self.guard(&log.file, log.bytes)?;
        let marker = read_piece(self, ".rotation.json")?
            .ok_or(Error::Contract("no pending native rotation to inspect"))?;
        let intent: Intent = format::decode(&marker.bytes)?;
        intent.validate()?;
        let head_published = self.current().hash == intent.after;
        let child = if head_published {
            let parent = self
                .history
                .iter()
                .rev()
                .nth(1)
                .ok_or(Error::Contract("rotation parent absent"))?;
            let child = Self::child_from_parent(parent, &intent)?;
            if child != self.current().value || log.next != child.active.first || log.bytes != 0 {
                return Err(Error::Contract("completed physical rotation cut differs"));
            }
            child
        } else {
            if self.current().hash != intent.before || self.active_cut(log)? != intent.sealed {
                return Err(Error::Contract("physical rotation prior cut differs"));
            }
            self.child(&intent.next, intent.sealed.clone())?
        };
        let expected_manifest = format::encode(&child)?;
        if format::sha(&expected_manifest) != intent.after {
            return Err(Error::Contract("physical rotation after hash differs"));
        }
        let mut pieces = BTreeMap::from([(".rotation.json".to_owned(), marker)]);
        let mut excluded = BTreeSet::from([".rotation.json".to_owned()]);
        self.inspect_continuation(&intent, head_published, &mut pieces, &mut excluded)?;
        self.inspect_rotation_controls(
            &intent,
            head_published,
            &expected_manifest,
            &mut pieces,
            &mut excluded,
        )?;
        self.guard(&log.file, log.bytes)?;
        let evidence = serde_json::to_vec(&Evidence {
            format: "breditor/pending-native-log-rotation-evidence",
            format_version: 1,
            selected_manifest: self.current().hash,
            files: &pieces,
        })?;
        let evidence_sha256 = format::sha(&evidence);
        Ok(RotationInspection {
            observation: PendingNativeLogRotation {
                next_generation: intent.next,
                before_manifest: intent.before,
                after_manifest: intent.after,
                head_published,
                evidence_sha256,
                evidence,
                continuation: intent.identity,
            },
            excluded,
        })
    }

    fn inspect_continuation(
        &self,
        intent: &Intent,
        head_published: bool,
        pieces: &mut BTreeMap<String, Piece>,
        excluded: &mut BTreeSet<String>,
    ) -> Result<()> {
        let final_name = format::wal_name(&intent.next);
        let alias = read_piece(self, &intent.stage)?;
        let final_file = read_piece(self, &final_name)?;
        if final_file.is_none() && (alias.is_none() || head_published) {
            return Err(Error::Contract("pending rotation continuation absent"));
        }
        for (name, observed, omit) in
            [(&intent.stage, alias, true), (&final_name, final_file, !head_published)]
        {
            if let Some(observed) = observed {
                if observed.identity != intent.identity || !observed.bytes.is_empty() {
                    return Err(Error::Contract("pending rotation continuation differs"));
                }
                if omit {
                    excluded.insert(name.clone());
                }
                pieces.insert(name.clone(), observed);
            }
        }
        Ok(())
    }

    fn inspect_rotation_controls(
        &self,
        intent: &Intent,
        head_published: bool,
        expected_manifest: &[u8],
        pieces: &mut BTreeMap<String, Piece>,
        excluded: &mut BTreeSet<String>,
    ) -> Result<()> {
        let name = format::manifest_name(&intent.after);
        let manifest = read_piece(self, &name)?;
        if head_published && manifest.is_none()
            || manifest.as_ref().is_some_and(|value| value.bytes != expected_manifest)
        {
            return Err(Error::Contract("pending rotation manifest differs"));
        }
        let stages = RecoveryStages::new(intent.stage_nonce()?);
        if let Some(control) = stages.existing(&self.directory)? {
            if head_published
                || pieces.contains_key(&intent.stage)
                || !pieces.contains_key(&format::wal_name(&intent.next))
            {
                return Err(Error::Contract("pending rotation control publication order"));
            }
            let (staging_name, expected, linked) = match control {
                Control::Manifest => {
                    (stages.manifest, expected_manifest.to_vec(), manifest.as_ref())
                }
                Control::Head if manifest.is_some() => {
                    (stages.head, Self::head_bytes(intent.after)?, None)
                }
                Control::Head => {
                    return Err(Error::Contract("pending rotation control publication order"));
                }
            };
            let observed = read_piece(self, &staging_name)?
                .ok_or(Error::Contract("pending rotation stage changed"))?;
            let valid = if let Some(final_piece) = linked {
                observed.identity == final_piece.identity
                    && observed.links == 2
                    && observed.bytes == expected
            } else {
                observed.links == 1 && expected.starts_with(&observed.bytes)
            };
            if !valid {
                return Err(Error::Contract("pending rotation control stage differs"));
            }
            excluded.insert(staging_name.clone());
            pieces.insert(staging_name, observed);
        }
        if let Some(manifest) = manifest {
            if !head_published {
                excluded.insert(name.clone());
            }
            pieces.insert(name, manifest);
        }
        Ok(())
    }
}
