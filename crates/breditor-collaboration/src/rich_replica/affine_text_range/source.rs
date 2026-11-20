//! Derive original scalar witnesses from admitted historical operations, never packet-supplied IDs.
use super::{AffineTextDomain, MAX_SCALARS};
use crate::{
    Error,
    rich_replica::{selection::Selection, text_flow},
};
use breditor_core::{
    document::TextFragment,
    position::TextOffset,
    rich_content::{
        RichCoverageDomain, RichDocument, RichSelectionCoverage,
        actions::{RichMaskedGeneralRangePlan, RichMaskedTextSpan},
    },
};
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
        // Shared editing is rich V1–V3, whose grammars admit no table caption; a V4-only
        // table caption therefore never reaches a shared replica. Keep its own domain apart.
        RichCoverageDomain::TableCaption(table) => {
            AffineTextDomain::Caption { image: format!("table:{}", table.as_str()) }
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
    let selected = coverage
        .text()
        .iter()
        .map(|span| {
            Ok((
                span.block().as_str().to_owned(),
                vec![(
                    u32::try_from(span.start().get()).map_err(|_| Error::Offset)?,
                    u32::try_from(span.end().get()).map_err(|_| Error::Offset)?,
                )],
            ))
        })
        .collect::<Result<BTreeMap<_, _>, Error>>()?;
    capture_selected(doc, document, &selected)
}
/// Sparse masks are admitted at this historical source, never accepted as identity witnesses.
pub(super) fn capture_masked(
    doc: &LoroDoc,
    document: &RichDocument,
    selection: &Selection,
    spans: &[crate::rich_replica::actions::MaskedTextSpanV1],
) -> Result<Vec<Scalar>, Error> {
    if spans.len() > super::MAX_SEGMENTS {
        return Err(Error::Limit("affine sparse source spans"));
    }
    let core = spans
        .iter()
        .map(|span| {
            RichMaskedTextSpan::try_new(
                crate::rich_replica::paragraphs::id(&span.block)?,
                TextOffset::try_new(u64::from(span.start)).map_err(|_| Error::Offset)?,
                TextOffset::try_new(u64::from(span.end)).map_err(|_| Error::Offset)?,
            )
            .map_err(|_| Error::Contract("affine sparse source coordinates"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    RichMaskedGeneralRangePlan::capture(
        document,
        &selection.admit(document)?,
        &TextFragment::empty(),
        &core,
    )
    .map_err(|_| Error::Contract("affine sparse source admission"))?;
    let mut selected: BTreeMap<String, Vec<(u32, u32)>> = BTreeMap::new();
    for span in spans {
        selected.entry(span.block.clone()).or_default().push((span.start, span.end));
    }
    capture_selected(doc, document, &selected)
}
fn capture_selected(
    doc: &LoroDoc,
    document: &RichDocument,
    selected: &BTreeMap<String, Vec<(u32, u32)>>,
) -> Result<Vec<Scalar>, Error> {
    let index = bindings(document)?;
    let (all, bindings) = (index.blocks, index.values);
    let blocks =
        all.into_iter().filter(|(block, _)| selected.contains_key(block)).collect::<Vec<_>>();
    let mut result = vec![];
    let mut formats = FormatCache::new();
    let mut identities = std::collections::BTreeSet::new();
    text_flow::visit_scalars(doc, &blocks, |scalar| {
        let ranges = &selected[scalar.block];
        let next = ranges.partition_point(|(start, _)| *start <= scalar.offset);
        if next == 0 || scalar.offset >= ranges[next - 1].1 {
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
