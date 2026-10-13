#![cfg(feature = "experimental-rich-content")]
//! Golden geometry/lifecycle contracts, independent of a CRDT or browser.

use breditor_core::rich_content::{
    AssetGeneration, AssetId, CausalStamp, CellBounds, CellId, ChangeId, ColumnId, ImageAlt,
    ImageBinding, ImageBindingError, ImageId, ImageSize, MergeConflictReason, MergeId, ReplicaId,
    RichTableLimits, RowId, TableGeometryError, TableId, TableShape, UploadCompletionMatch,
};
use proptest::{
    prelude::*,
    test_runner::{RngAlgorithm, RngSeed},
};
use std::collections::BTreeSet;

type TestResult = Result<(), Box<dyn std::error::Error>>;

fn table(rows: &[&str], columns: &[&str]) -> Result<TableShape, Box<dyn std::error::Error>> {
    Ok(TableShape::try_new(
        TableId::try_new("table-1")?,
        rows.iter().map(RowId::try_new).collect::<Result<_, _>>()?,
        columns.iter().map(ColumnId::try_new).collect::<Result<_, _>>()?,
        RichTableLimits::default(),
    )?)
}

fn cell(row: &str, column: &str) -> Result<CellId, Box<dyn std::error::Error>> {
    Ok(CellId::new(TableId::try_new("table-1")?, RowId::try_new(row)?, ColumnId::try_new(column)?))
}

fn stamp(clock: u64, writer: u64, counter: u64) -> Result<CausalStamp, Box<dyn std::error::Error>> {
    Ok(CausalStamp::new(clock, ChangeId::new(ReplicaId::try_new(writer)?, counter)))
}

#[test]
fn overlapping_merges_have_numeric_priority_and_retain_every_base_cell_partition() -> TestResult {
    let shape = table(&["r0", "r1", "r2"], &["c0", "c1", "c2"])?;
    let low = shape.capture_merge(
        MergeId::try_new("low")?,
        stamp(5, 9, 0)?,
        &CellBounds::new(cell("r0", "c0")?, cell("r1", "c1")?),
    )?;
    let high = shape.capture_merge(
        MergeId::try_new("high")?,
        stamp(5, 10, 0)?,
        &CellBounds::new(cell("r1", "c1")?, cell("r2", "c2")?),
    )?;
    let top = shape.capture_merge(
        MergeId::try_new("top")?,
        stamp(6, 8, 0)?,
        &CellBounds::new(cell("r0", "c1")?, cell("r0", "c2")?),
    )?;
    let regions = [low, high, top];
    let expected = shape.resolve(&regions, &BTreeSet::new())?;
    for order in [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]] {
        let ordered = order.map(|index| regions[index].clone());
        assert_eq!(shape.resolve(&ordered, &BTreeSet::new())?, expected);
    }
    assert_eq!(expected.active_regions(), &[MergeId::try_new("top")?, MergeId::try_new("high")?]);
    assert_eq!(expected.conflicts()[0].region(), &MergeId::try_new("low")?);
    assert_eq!(expected.conflicts()[0].reason(), MergeConflictReason::Overlap);
    let master = expected.cell(1, 1).ok_or("missing master")?;
    assert_eq!((master.row_span(), master.column_span()), (2, 2));
    assert_eq!(
        master.source_cells(),
        &[cell("r1", "c1")?, cell("r1", "c2")?, cell("r2", "c1")?, cell("r2", "c2")?]
    );
    let sources: Vec<_> =
        expected.cells().iter().flat_map(|cell| cell.source_cells().iter().cloned()).collect();
    assert_eq!(sources.len(), 9);
    assert_eq!(sources.into_iter().collect::<BTreeSet<_>>().len(), 9);
    assert!(!expected.cell(2, 2).ok_or("missing covered cell")?.is_master());
    Ok(())
}

#[test]
fn exact_priority_ties_use_merge_identity_bytes_not_locale() -> TestResult {
    let shape = table(&["r0"], &["c0", "c1"])?;
    let bounds = CellBounds::new(cell("r0", "c0")?, cell("r0", "c1")?);
    let priority = stamp(u64::MAX, u64::MAX, u64::MAX)?;
    let a = shape.capture_merge(MergeId::try_new("a")?, priority, &bounds)?;
    let z = shape.capture_merge(MergeId::try_new("z")?, priority, &bounds)?;
    let resolved = shape.resolve(&[a, z], &BTreeSet::new())?;
    assert_eq!(resolved.active_regions(), &[MergeId::try_new("z")?]);
    Ok(())
}

#[test]
fn interior_axis_insertion_expands_merge_but_boundary_insertions_stay_outside() -> TestResult {
    let old = table(&["r0", "r1", "r2"], &["c0", "c1"])?;
    let region = old.capture_merge(
        MergeId::try_new("m")?,
        stamp(4, 1, 2)?,
        &CellBounds::new(cell("r0", "c0")?, cell("r1", "c1")?),
    )?;
    let current = table(
        &["before", "r0", "inside", "r1", "after", "r2"],
        &["left", "c0", "middle", "c1", "right"],
    )?;
    let resolved = current.resolve(&[region], &BTreeSet::new())?;
    let master = resolved.cell(1, 1).ok_or("missing master")?;
    assert_eq!((master.row_span(), master.column_span()), (3, 3));
    assert_eq!(master.source_cells().len(), 9);
    assert!(resolved.cell(0, 0).ok_or("missing outside cell")?.is_master());
    assert!(resolved.cell(4, 4).ok_or("missing boundary cell")?.is_master());
    Ok(())
}

#[test]
fn deleting_merge_master_selects_first_survivors_without_inventing_axes() -> TestResult {
    let old = table(&["r0", "r1", "r2"], &["c0", "c1", "c2"])?;
    let region = old.capture_merge(
        MergeId::try_new("m")?,
        stamp(4, 1, 2)?,
        &CellBounds::new(cell("r0", "c0")?, cell("r2", "c2")?),
    )?;
    let current = table(&["r1", "r2"], &["c1", "c2"])?;
    let resolved = current.resolve(std::slice::from_ref(&region), &BTreeSet::new())?;
    let master = resolved.cell(0, 0).ok_or("missing survivor master")?;
    assert_eq!(master.master(), &cell("r1", "c1")?);
    assert_eq!((master.row_span(), master.column_span()), (2, 2));
    let hidden = table(&[], &["c1", "c2"])?;
    let resolved = hidden.resolve(&[region], &BTreeSet::new())?;
    assert!(resolved.is_hidden());
    assert!(resolved.cells().is_empty());
    assert_eq!(resolved.conflicts()[0].reason(), MergeConflictReason::AxesDeleted);
    Ok(())
}

#[test]
fn reorder_deactivates_region_and_does_not_guess_a_new_rectangle() -> TestResult {
    let old = table(&["r0", "r1", "r2"], &["c0", "c1"])?;
    let region = old.capture_merge(
        MergeId::try_new("m")?,
        stamp(4, 1, 2)?,
        &CellBounds::new(cell("r0", "c0")?, cell("r1", "c1")?),
    )?;
    let swapped = table(&["r1", "r0", "r2"], &["c0", "c1"])?;
    assert_eq!(
        swapped.resolve(std::slice::from_ref(&region), &BTreeSet::new())?.conflicts()[0].reason(),
        MergeConflictReason::AxesReordered
    );
    let outside_moved = table(&["r0", "r2", "r1"], &["c0", "c1"])?;
    let resolved = outside_moved.resolve(&[region], &BTreeSet::new())?;
    assert_eq!(resolved.conflicts()[0].reason(), MergeConflictReason::OldAxisMovedInside);
    assert!(resolved.cells().iter().all(breditor_core::rich_content::ResolvedCell::is_master));
    Ok(())
}

#[test]
fn split_retracts_only_observed_region_and_preserves_source_identity() -> TestResult {
    let shape = table(&["r0", "r1"], &["c0", "c1", "c2", "c3"])?;
    let left = shape.capture_merge(
        MergeId::try_new("left")?,
        stamp(4, 1, 2)?,
        &CellBounds::new(cell("r0", "c0")?, cell("r1", "c1")?),
    )?;
    let right = shape.capture_merge(
        MergeId::try_new("right")?,
        stamp(5, 2, 3)?,
        &CellBounds::new(cell("r0", "c2")?, cell("r1", "c3")?),
    )?;
    let retracted = BTreeSet::from([left.id().clone()]);
    let resolved = shape.resolve(&[left, right], &retracted)?;
    assert_eq!(resolved.active_regions(), &[MergeId::try_new("right")?]);
    let sources: Vec<_> =
        resolved.cells().iter().flat_map(|cell| cell.source_cells().iter().cloned()).collect();
    assert_eq!(sources.len(), 8);
    assert_eq!(sources.into_iter().collect::<BTreeSet<_>>().len(), 8);
    Ok(())
}

#[test]
fn duplicate_delivery_is_idempotent_but_identity_reuse_is_rejected() -> TestResult {
    let shape = table(&["r0", "r1"], &["c0", "c1"])?;
    let region = shape.capture_merge(
        MergeId::try_new("m")?,
        stamp(4, 1, 2)?,
        &CellBounds::new(cell("r0", "c0")?, cell("r1", "c1")?),
    )?;
    assert_eq!(
        shape.resolve(&[region.clone(), region.clone()], &BTreeSet::new())?,
        shape.resolve(std::slice::from_ref(&region), &BTreeSet::new())?
    );
    let reused = shape.capture_merge(
        MergeId::try_new("m")?,
        stamp(5, 1, 3)?,
        &CellBounds::new(cell("r0", "c0")?, cell("r0", "c1")?),
    )?;
    assert_eq!(
        shape.resolve(&[region, reused], &BTreeSet::new()),
        Err(TableGeometryError::MergeIdentityReuse)
    );
    Ok(())
}

#[test]
fn axes_bounds_and_independent_product_limits_fail_before_grid_allocation() -> TestResult {
    assert!(table(&["r0", "r0"], &["c0"]).is_err());
    let rows =
        (0..256).map(|index| RowId::try_new(format!("r{index}"))).collect::<Result<Vec<_>, _>>()?;
    let columns = (0..128)
        .map(|index| ColumnId::try_new(format!("c{index}")))
        .collect::<Result<Vec<_>, _>>()?;
    assert_eq!(
        TableShape::try_new(TableId::try_new("t")?, rows, columns, RichTableLimits::default()),
        Err(TableGeometryError::Limit)
    );
    assert_eq!(RichTableLimits::try_new(257, 128, 4096, 256), Err(TableGeometryError::Limit));
    let shape = table(&["r0", "r1"], &["c0", "c1"])?;
    assert_eq!(
        shape.capture_merge(
            MergeId::try_new("m")?,
            stamp(1, 1, 0)?,
            &CellBounds::new(cell("r1", "c1")?, cell("r0", "c0")?)
        ),
        Err(TableGeometryError::ReversedBounds)
    );
    assert_eq!(
        shape.capture_merge(
            MergeId::try_new("m")?,
            stamp(1, 1, 0)?,
            &CellBounds::new(cell("r0", "c0")?, cell("r0", "c0")?)
        ),
        Err(TableGeometryError::Singleton)
    );
    Ok(())
}

#[test]
fn image_replacement_preserves_node_metadata_and_rejects_stale_upload_results() -> TestResult {
    let old = ImageBinding::new(
        ImageId::try_new("image-1")?,
        AssetId::try_new("asset-1")?,
        AssetGeneration::try_new("generation-1")?,
        ImageAlt::try_description("A coastline".into())?,
        Some(ImageSize::try_new(640, 480)?),
    );
    let token = old.upload_token();
    assert_eq!(token.classify(Some(&old)), UploadCompletionMatch::CurrentBinding);
    assert_eq!(token.classify(None), UploadCompletionMatch::StaleOrDeleted);
    let replaced =
        old.replace_asset(AssetId::try_new("asset-2")?, AssetGeneration::try_new("generation-2")?)?;
    assert_eq!(replaced.image(), old.image());
    assert_eq!(replaced.alt(), old.alt());
    assert_eq!(replaced.size(), old.size());
    assert_eq!(token.classify(Some(&replaced)), UploadCompletionMatch::StaleOrDeleted);
    assert_eq!(
        old.replace_asset(AssetId::try_new("asset-2")?, AssetGeneration::try_new("generation-1")?),
        Err(ImageBindingError::GenerationReuse)
    );
    assert_eq!(
        token.classify(Some(&old)),
        UploadCompletionMatch::CurrentBinding,
        "explicit undo restoring the exact binding can resolve its original asset again"
    );
    Ok(())
}

#[test]
fn image_dimensions_and_decorative_intent_are_closed_checked_values() {
    assert_eq!(ImageSize::try_new(0, 480), Err(ImageBindingError::Size));
    assert_eq!(ImageSize::try_new(640, 4097), Err(ImageBindingError::Size));
    assert_eq!(ImageAlt::try_description("  ".into()), Err(ImageBindingError::Alt));
    let alt = ImageAlt::decorative();
    assert!(alt.is_decorative());
    assert_eq!(alt.text(), "");
    assert!(AssetId::try_new("https://example.invalid/image.png").is_err());
    assert!(RowId::try_new("").is_err());
    assert!(ReplicaId::try_new(0).is_err());
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 256,
        rng_algorithm: RngAlgorithm::ChaCha,
        rng_seed: RngSeed::Fixed(0x6272_6564_6974_6f72),
        ..ProptestConfig::default()
    })]

    #[test]
    fn merge_partition_is_total_and_independent_of_input_order(
        intents in prop::collection::vec((0_usize..3, 0_usize..3, 0_usize..3, 0_usize..3, any::<u64>(), 1_u64..100), 0..24)
    ) {
        let failure = |error: Box<dyn std::error::Error>| proptest::test_runner::TestCaseError::fail(error.to_string());
        let rows = ["r0", "r1", "r2"];
        let columns = ["c0", "c1", "c2"];
        let shape = table(&rows, &columns).map_err(failure)?;
        let mut regions = vec![];
        for (index, (r0, r1, c0, c1, clock, writer)) in intents.into_iter().enumerate() {
            let (r0, r1) = (r0.min(r1), r0.max(r1));
            let (c0, c1) = (c0.min(c1), c0.max(c1));
            if r0 == r1 && c0 == c1 { continue; }
            let id = MergeId::try_new(format!("merge-{index}")).map_err(|error| proptest::test_runner::TestCaseError::fail(error.to_string()))?;
            let priority = stamp(clock, writer, u64::try_from(index).map_err(|error| proptest::test_runner::TestCaseError::fail(error.to_string()))?).map_err(failure)?;
            let bounds = CellBounds::new(cell(rows[r0], columns[c0]).map_err(failure)?, cell(rows[r1], columns[c1]).map_err(failure)?);
            regions.push(shape.capture_merge(id, priority, &bounds).map_err(|error| proptest::test_runner::TestCaseError::fail(error.to_string()))?);
        }
        let normal = shape.resolve(&regions, &BTreeSet::new()).map_err(|error| proptest::test_runner::TestCaseError::fail(error.to_string()))?;
        regions.reverse();
        let reverse = shape.resolve(&regions, &BTreeSet::new()).map_err(|error| proptest::test_runner::TestCaseError::fail(error.to_string()))?;
        prop_assert_eq!(&normal, &reverse);
        let sources: Vec<_> = normal.cells().iter().flat_map(|cell| cell.source_cells().iter().cloned()).collect();
        prop_assert_eq!(sources.len(), 9);
        prop_assert_eq!(sources.into_iter().collect::<BTreeSet<_>>().len(), 9);
        prop_assert_eq!(normal.active_regions().len() + normal.conflicts().len(), regions.len());
    }
}
