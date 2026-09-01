//! Property laws for complete editor-state checkpoint JSON.

mod support;

use std::fmt::Display;

use breditor_core::{
    codec::{DocumentJsonCodec, EditorStateJsonCodec},
    document::{Format, FormatSet, PropertyMap},
    identity::QualifiedName,
    position::{Affinity, NodePath, Point},
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId, Revision},
};
use proptest::{
    collection::vec,
    prelude::{Just, Strategy, any, prop_oneof},
    sample::select,
    test_runner::{Config, FileFailurePersistence, TestCaseError},
};
use serde_json::Value;
use support::{document_json, paragraph, text_node};

#[derive(Clone, Debug)]
struct RunSpec {
    text: String,
    strong: bool,
}

#[derive(Clone, Copy, Debug)]
enum PendingSpec {
    None,
    Empty,
    Strong,
}

#[derive(Clone, Copy, Debug)]
enum StateValueSpec {
    Unselected,
    Collapsed {
        at_end: bool,
        anchor_affinity: Affinity,
        focus_affinity: Affinity,
        pending: PendingSpec,
    },
    Forward {
        anchor_affinity: Affinity,
        focus_affinity: Affinity,
    },
    Backward {
        anchor_affinity: Affinity,
        focus_affinity: Affinity,
    },
}

fn property_config() -> Config {
    let mut config = Config::with_failure_persistence(FileFailurePersistence::Direct(
        "tests/editor_state_json_properties.proptest-regressions",
    ));
    config.cases = 48;
    config
}

fn unicode_text() -> impl Strategy<Value = String> {
    vec(
        select(vec![
            'a',
            'Z',
            '0',
            ' ',
            '\n',
            '"',
            '\\',
            '\u{e9}',
            '\u{754c}',
            '\u{301}',
            '\u{1f600}',
            '\u{1f680}',
            '\u{1f1e8}',
            '\u{1f1e6}',
            '\u{200d}',
        ]),
        1..5,
    )
    .prop_map(|characters| characters.into_iter().collect())
}

fn canonical_runs() -> impl Strategy<Value = Vec<RunSpec>> {
    (any::<bool>(), vec(unicode_text(), 0..5)).prop_map(|(first_strong, texts)| {
        texts
            .into_iter()
            .enumerate()
            .map(|(index, text)| RunSpec {
                text,
                strong: if index % 2 == 0 { first_strong } else { !first_strong },
            })
            .collect()
    })
}

fn affinity_strategy() -> impl Strategy<Value = Affinity> {
    any::<bool>().prop_map(|after| if after { Affinity::After } else { Affinity::Before })
}

fn pending_strategy() -> impl Strategy<Value = PendingSpec> {
    select(vec![PendingSpec::None, PendingSpec::Empty, PendingSpec::Strong])
}

fn state_value_strategy() -> impl Strategy<Value = StateValueSpec> {
    prop_oneof![
        Just(StateValueSpec::Unselected),
        (any::<bool>(), affinity_strategy(), affinity_strategy(), pending_strategy(),).prop_map(
            |(at_end, anchor_affinity, focus_affinity, pending)| {
                StateValueSpec::Collapsed { at_end, anchor_affinity, focus_affinity, pending }
            },
        ),
        (affinity_strategy(), affinity_strategy()).prop_map(|(anchor_affinity, focus_affinity)| {
            StateValueSpec::Forward { anchor_affinity, focus_affinity }
        },),
        (affinity_strategy(), affinity_strategy()).prop_map(|(anchor_affinity, focus_affinity)| {
            StateValueSpec::Backward { anchor_affinity, focus_affinity }
        },),
    ]
}

fn revision_strategy() -> impl Strategy<Value = u64> {
    prop_oneof![
        Just(0),
        Just(1),
        Just(9_007_199_254_740_991),
        Just(9_007_199_254_740_993),
        Just(u64::MAX - 1),
        Just(u64::MAX),
        any::<u64>(),
    ]
}

fn test_failure(error: impl Display) -> TestCaseError {
    TestCaseError::fail(error.to_string())
}

fn strong_formats() -> Result<FormatSet, TestCaseError> {
    let kind = QualifiedName::try_new("breditor/strong").map_err(test_failure)?;
    FormatSet::try_from_formats(vec![Format::new(kind, PropertyMap::default())])
        .map_err(test_failure)
}

fn child_point(paragraph_path: &NodePath, child_index: u32, affinity: Affinity) -> Point {
    Point::Children { parent_path: paragraph_path.clone(), child_index, affinity }
}

fn state_values(
    spec: StateValueSpec,
    child_count: usize,
) -> Result<(Option<Selection>, Option<FormatSet>), TestCaseError> {
    let child_count = u32::try_from(child_count).map_err(test_failure)?;
    let paragraph_path = NodePath::try_from_indices(vec![0]).map_err(test_failure)?;
    match spec {
        StateValueSpec::Unselected => Ok((None, None)),
        StateValueSpec::Collapsed { at_end, anchor_affinity, focus_affinity, pending } => {
            let child_index = if at_end { child_count } else { 0 };
            let anchor = child_point(&paragraph_path, child_index, anchor_affinity);
            let focus = child_point(&paragraph_path, child_index, focus_affinity);
            let pending = match pending {
                PendingSpec::None => None,
                PendingSpec::Empty => Some(FormatSet::default()),
                PendingSpec::Strong => Some(strong_formats()?),
            };
            Ok((Some(RangeSelection::new(anchor, focus).into()), pending))
        }
        StateValueSpec::Forward { anchor_affinity, focus_affinity } => {
            let anchor = child_point(&paragraph_path, 0, anchor_affinity);
            let focus = child_point(&paragraph_path, child_count, focus_affinity);
            Ok((Some(RangeSelection::new(anchor, focus).into()), None))
        }
        StateValueSpec::Backward { anchor_affinity, focus_affinity } => {
            let anchor = child_point(&paragraph_path, child_count, anchor_affinity);
            let focus = child_point(&paragraph_path, 0, focus_affinity);
            Ok((Some(RangeSelection::new(anchor, focus).into()), None))
        }
    }
}

proptest::proptest! {
    #![proptest_config(property_config())]

    #[test]
    fn checkpoint_codec_laws_preserve_unicode_revision_selection_and_pending_formats(
        runs in canonical_runs(),
        revision in revision_strategy(),
        state_value_spec in state_value_strategy(),
        lineage_suffix in 0_u16..1_000,
    ) {
        let context = EditorContext::default();
        let document_json = document_json(&[paragraph(
            &runs
                .iter()
                .map(|run| text_node(&run.text, run.strong))
                .collect::<Vec<_>>(),
        )]);
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(&document_json)
            .map_err(test_failure)?;
        let (selection, pending_formats) = state_values(state_value_spec, runs.len())?;
        let lineage = format!("editor-state-property-{lineage_suffix}");
        let initial = EditorState::try_new(
            &context,
            LineageId::try_new(&lineage).map_err(test_failure)?,
            document,
            selection.clone(),
            pending_formats.clone(),
        )
        .map_err(test_failure)?;
        let codec = EditorStateJsonCodec::new(context.clone());

        let revision_zero = codec.encode(&initial).map_err(test_failure)?;
        let mut fixture: Value = serde_json::from_str(&revision_zero).map_err(test_failure)?;
        let revision_field = fixture
            .pointer_mut("/snapshot/revision")
            .ok_or_else(|| TestCaseError::fail("encoded checkpoint has no snapshot revision"))?;
        *revision_field = Value::String(revision.to_string());
        let fixture = serde_json::to_string(&fixture).map_err(test_failure)?;
        let restored = codec.decode(&fixture).map_err(test_failure)?;

        if restored.context() != &context {
            return Err(TestCaseError::fail("decoded checkpoint changed its caller context"));
        }
        if restored.snapshot().lineage().as_str() != lineage {
            return Err(TestCaseError::fail("decoded checkpoint changed its lineage"));
        }
        if restored.snapshot().revision() != Revision::new(revision) {
            return Err(TestCaseError::fail("decoded checkpoint changed its full-u64 revision"));
        }
        if restored.document() != initial.document() {
            return Err(TestCaseError::fail("decoded checkpoint changed its document"));
        }
        if restored.selection() != selection.as_ref() {
            return Err(TestCaseError::fail("decoded checkpoint changed its selection"));
        }
        if restored.pending_formats() != pending_formats.as_ref() {
            return Err(TestCaseError::fail("decoded checkpoint changed its pending formats"));
        }

        let encoded = codec.encode(&restored).map_err(test_failure)?;
        let repeated = codec.encode(&restored).map_err(test_failure)?;
        if repeated != encoded {
            return Err(TestCaseError::fail(
                "repeated encoding of one editor state was not byte-identical",
            ));
        }
        let decoded = codec.decode(&encoded).map_err(test_failure)?;
        if decoded != restored {
            return Err(TestCaseError::fail(
                "decode(encode(state)) did not preserve the complete editor state",
            ));
        }
        let reencoded = codec.encode(&decoded).map_err(test_failure)?;
        if reencoded != encoded {
            return Err(TestCaseError::fail(
                "decoded editor state changed deterministic bytes on re-encode",
            ));
        }
    }
}
