//! Closed explicit socket negotiation; new revisions do not widen any old protocol meaning.
const KNOWN: [&str; 10] = [
    "assets",
    "presence",
    "writerTransportV2",
    "documentPresenceV1",
    "reviewV1",
    "reviewLineageV1",
    "reviewObserverV1",
    "documentVersionsV1",
    "documentSuggestionsV1",
    "documentSuggestionRevisionsV1",
];
pub(super) fn valid(values: &[String]) -> bool {
    let has = |name| values.iter().any(|value| value == name);
    values.len() <= 9
        && values.iter().all(|value| KNOWN.contains(&value.as_str()))
        && values.iter().collect::<std::collections::BTreeSet<_>>().len() == values.len()
        && !(has("presence") && has("documentPresenceV1"))
        && (!has("reviewLineageV1") || has("reviewV1"))
        && (!has("reviewObserverV1") || has("reviewLineageV1"))
        && (!has("documentSuggestionRevisionsV1")
            || has("documentSuggestionsV1") && has("writerTransportV2"))
}
#[cfg(test)]
mod tests {
    use super::*;
    fn values(input: &[&str]) -> Vec<String> {
        input.iter().map(ToString::to_string).collect()
    }
    #[test]
    fn revisions_require_both_original_capabilities_and_no_implicit_upgrade() {
        for input in [
            &["documentSuggestionRevisionsV1"][..],
            &["documentSuggestionRevisionsV1", "documentSuggestionsV1"][..],
            &["documentSuggestionRevisionsV1", "writerTransportV2"][..],
        ] {
            assert!(!valid(&values(input)));
        }
        assert!(valid(&values(&[
            "documentSuggestionRevisionsV1",
            "documentSuggestionsV1",
            "writerTransportV2"
        ])));
        assert!(valid(&values(&["documentSuggestionsV1"])));
    }
    #[test]
    fn original_limits_presence_exclusion_and_closed_unique_names_remain_intact() {
        let old = values(&[
            "assets",
            "presence",
            "writerTransportV2",
            "reviewV1",
            "reviewLineageV1",
            "reviewObserverV1",
            "documentVersionsV1",
            "documentSuggestionsV1",
        ]);
        assert!(valid(&old));
        let mut revised = old.clone();
        revised.push("documentSuggestionRevisionsV1".into());
        assert!(valid(&revised));
        for extra in ["presence", "documentPresenceV1", "unknown"] {
            let mut bad = old.clone();
            bad.push(extra.into());
            assert!(!valid(&bad));
        }
    }
}
