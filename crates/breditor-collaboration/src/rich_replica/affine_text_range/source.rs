//! Derive original scalar witnesses from admitted historical operations, never packet-supplied IDs.
use super::{AffineTextDomain, MAX_SCALARS};
use crate::{
    Error,
    rich_replica::{selection::Selection, text_flow},
};
use breditor_core::rich_content::{RichCoverageDomain, RichDocument, RichSelectionCoverage};
use loro::LoroDoc;
use serde_json::Value;
use std::{collections::BTreeMap, sync::Arc};
#[derive(Clone)]
pub(super) struct Binding {
    pub block: Arc<str>,
    pub kind: String,
    pub domain: AffineTextDomain,
}
pub(super) struct Scalar {
    pub identity: Vec<u8>,
    pub block: Arc<str>,
    pub offset: u32,
    pub character: char,
    pub formats: Arc<Vec<Value>>,
    pub binding: Arc<Binding>,
}
pub(super) fn domain(value: &RichCoverageDomain) -> AffineTextDomain {
    match value {
        RichCoverageDomain::Document => AffineTextDomain::Document,
        RichCoverageDomain::Caption(image) => {
            AffineTextDomain::Caption { image: image.as_str().into() }
        }
        RichCoverageDomain::Cell(cell) => AffineTextDomain::Cell {
            cell: crate::rich_replica::selection::CellTarget {
                table: cell.table().as_str().into(),
                row: cell.row().as_str().into(),
                column: cell.column().as_str().into(),
            },
        },
    }
}
pub(super) struct Bindings {
    pub blocks: Vec<(String, bool)>,
    pub values: BTreeMap<String, Arc<Binding>>,
}
pub(super) fn bindings(document: &RichDocument) -> Result<Bindings, Error> {
    let coverage = RichSelectionCoverage::document(document)
        .map_err(|_| Error::Contract("affine document coverage"))?;
    let mut blocks = vec![];
    let mut values = BTreeMap::new();
    for span in coverage.text() {
        let block = span.block().as_str().to_owned();
        blocks.push((block.clone(), span.end().get() == 0));
        values.insert(
            block,
            Arc::new(Binding {
                block: Arc::from(span.block().as_str()),
                kind: span.kind().as_str().into(),
                domain: domain(span.domain()),
            }),
        );
    }
    Ok(Bindings { blocks, values })
}
pub(super) struct FormatCache {
    last: Arc<Vec<Value>>,
    bytes: usize,
}
impl FormatCache {
    pub fn new() -> Self {
        Self { last: Arc::new(vec![]), bytes: 0 }
    }
    pub fn capture(&mut self, formats: &[Value]) -> Result<Arc<Vec<Value>>, Error> {
        if self.last.as_slice() != formats {
            self.bytes = self
                .bytes
                .checked_add(super::budget::json_size(&formats, 8 * 1024 * 1024)?)
                .ok_or(Error::Limit("affine format witnesses"))?;
            if self.bytes > 8 * 1024 * 1024 {
                return Err(Error::Limit("affine format witnesses"));
            }
            self.last = Arc::new(formats.to_vec());
        }
        Ok(Arc::clone(&self.last))
    }
}
pub(super) fn capture(
    doc: &LoroDoc,
    document: &RichDocument,
    selection: &Selection,
) -> Result<Vec<Scalar>, Error> {
    let admitted = selection.admit(document)?;
    let coverage = RichSelectionCoverage::capture(document, &admitted)
        .map_err(|_| Error::Contract("affine source coverage"))?;
    let index = bindings(document)?;
    let (all, bindings) = (index.blocks, index.values);
    let selected = coverage
        .text()
        .iter()
        .map(|span| {
            Ok((
                span.block().as_str().to_owned(),
                (
                    u32::try_from(span.start().get()).map_err(|_| Error::Offset)?,
                    u32::try_from(span.end().get()).map_err(|_| Error::Offset)?,
                ),
            ))
        })
        .collect::<Result<BTreeMap<_, _>, Error>>()?;
    let blocks =
        all.into_iter().filter(|(block, _)| selected.contains_key(block)).collect::<Vec<_>>();
    let mut result = vec![];
    let mut formats = FormatCache::new();
    let mut identities = std::collections::BTreeSet::new();
    text_flow::visit_scalars(doc, &blocks, |scalar| {
        let (from, to) = selected[scalar.block];
        if scalar.offset < from || scalar.offset >= to {
            return Ok(());
        }
        if result.len() >= MAX_SCALARS {
            return Err(Error::Limit("affine selected scalars"));
        }
        if !identities.insert(scalar.identity.clone()) {
            return Err(Error::Contract("affine duplicate source scalar"));
        }
        result.push(Scalar {
            identity: scalar.identity,
            block: Arc::clone(&bindings[scalar.block].block),
            offset: scalar.offset,
            character: scalar.character,
            formats: formats.capture(scalar.formats)?,
            binding: bindings[scalar.block].clone(),
        });
        Ok(())
    })?;
    Ok(result)
}
