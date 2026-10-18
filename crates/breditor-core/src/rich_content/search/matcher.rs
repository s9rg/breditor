//! Bounded UTF-8 regex compilation; external feature unification cannot enable other engines.
use super::{
    MAX_CAPTURE_GROUPS, MAX_NFA_BYTES, MAX_REGEX_CACHE_BYTES, RichSearchError, RichSearchMode,
    RichSearchQuery,
};
use regex_automata::{PatternID, meta::Regex, util::syntax};

pub(super) fn compile(query: &RichSearchQuery) -> Result<Option<Regex>, RichSearchError> {
    if query.mode() == RichSearchMode::Literal && query.case_sensitive() {
        return Ok(None);
    }
    let pattern = if query.mode() == RichSearchMode::Literal {
        escape(query.pattern())
    } else {
        query.pattern().to_owned()
    };
    let regex = Regex::builder()
        .syntax(
            syntax::Config::new()
                .utf8(true)
                .unicode(true)
                .case_insensitive(!query.case_sensitive())
                .nest_limit(64),
        )
        .configure(
            Regex::config()
                .nfa_size_limit(Some(MAX_NFA_BYTES))
                .hybrid_cache_capacity(MAX_REGEX_CACHE_BYTES)
                .utf8_empty(true)
                .dfa(false)
                .onepass(false)
                .backtrack(false),
        )
        .build(&pattern)
        .map_err(|_| RichSearchError::Pattern)?;
    if regex.group_info().group_len(PatternID::ZERO) > MAX_CAPTURE_GROUPS {
        return Err(RichSearchError::CaptureLimit);
    }
    Ok(Some(regex))
}

fn escape(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    for character in value.chars() {
        if matches!(
            character,
            '\\' | '.' | '^' | '$' | '|' | '?' | '*' | '+' | '(' | ')' | '[' | ']' | '{' | '}'
        ) {
            output.push('\\');
        }
        output.push(character);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_engine_policy_survives_dependency_feature_unification()
    -> Result<(), RichSearchError> {
        let query = RichSearchQuery::try_new("(a)", RichSearchMode::Regex, true, false)?;
        let regex = compile(&query)?.ok_or(RichSearchError::Invariant)?;
        assert!(!regex.get_config().get_backtrack());
        assert!(!regex.get_config().get_dfa());
        assert!(!regex.get_config().get_onepass());
        Ok(())
    }
}
