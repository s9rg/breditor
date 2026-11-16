//! Preserve the owner-verified physical selection when its archive bytes are retired.
use crate::{
    Error, RelaySegmentBaseFile, Result, ServerLogGenerationBackupIdentity,
    archive_input::ArchiveEntry,
    credentials,
    log::generations::{
        GenerationFileSection, MAX_GENERATION_BODY_BYTES, MAX_GENERATION_FILES, manifest_name,
        validate_generation_id, wal_name,
    },
};
use serde::{Deserialize, Deserializer, Serialize, de};
use std::{collections::BTreeMap, fmt};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room) struct PhysicalClosure {
    pub(in crate::room) root: String,
    pub(in crate::room) parent: Option<[u8; 32]>,
    pub(in crate::room) archive_sha256: [u8; 32],
    #[serde(deserialize_with = "read_sections")]
    pub(in crate::room) files: Vec<GenerationFileSection>,
}

impl PhysicalClosure {
    pub(in crate::room) fn select(
        self,
        expected: &ServerLogGenerationBackupIdentity,
        parent: Option<&RelaySegmentBaseFile>,
    ) -> Result<(BTreeMap<String, ArchiveEntry>, String)> {
        if self.archive_sha256 != expected.archive_sha256
            || self.parent != parent.map(RelaySegmentBaseFile::binding)
            || parent.is_some_and(|prior| prior.root_generation() != self.root)
        {
            return Err(Error::Contract("relay checkpoint physical closure identity differs"));
        }
        validate_generation_id(&self.root)?;
        let mut files = BTreeMap::new();
        let mut name = None::<&str>;
        let mut next = 0_u64;
        let mut count_wals = 0;
        for part in &self.files {
            if part.offset != next || name.is_some_and(|last| last >= part.name.as_str()) {
                return Err(Error::Contract("relay checkpoint physical closure order"));
            }
            check_name(&part.name)?;
            count_wals += usize::from(part.name.starts_with("g-"));
            next = next
                .checked_add(part.bytes)
                .filter(|bytes| *bytes <= MAX_GENERATION_BODY_BYTES)
                .ok_or(Error::Contract("relay checkpoint physical closure byte budget"))?;
            name = Some(&part.name);
            files.insert(
                part.name.clone(),
                ArchiveEntry { offset: 0, bytes: part.bytes, sha256: part.sha256 },
            );
        }
        if count_wals == 0
            || !files.contains_key(&manifest_name(&expected.manifest))
            || !files.contains_key(".head.json")
            || !files.contains_key(".ready.json")
            || (parent.is_none() && !files.contains_key(&wal_name(&self.root)))
        {
            return Err(Error::Contract("relay checkpoint physical closure missing section"));
        }
        Ok((files, self.root))
    }
}

fn check_name(name: &str) -> Result<()> {
    if matches!(name, ".head.json" | ".ready.json") {
        return Ok(());
    }
    let hash = name
        .strip_prefix("g-")
        .and_then(|name| name.strip_suffix(".wal"))
        .or_else(|| name.strip_prefix("m-").and_then(|name| name.strip_suffix(".json")))
        .or_else(|| name.strip_prefix(".stage-"))
        .ok_or(Error::Contract("relay checkpoint physical closure name"))?;
    credentials::hash(hash).map(|_| ())
}

fn read_sections<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Vec<GenerationFileSection>, D::Error> {
    struct Sections;
    impl<'de> de::Visitor<'de> for Sections {
        type Value = Vec<GenerationFileSection>;

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("a bounded physical closure")
        }

        fn visit_seq<A: de::SeqAccess<'de>>(
            self,
            mut input: A,
        ) -> std::result::Result<Self::Value, A::Error> {
            let mut files = Vec::new();
            while let Some(part) = input.next_element()? {
                if files.len() == MAX_GENERATION_FILES {
                    return Err(de::Error::custom("relay checkpoint physical closure file budget"));
                }
                files.push(part);
            }
            Ok(files)
        }
    }
    deserializer.deserialize_seq(Sections)
}
