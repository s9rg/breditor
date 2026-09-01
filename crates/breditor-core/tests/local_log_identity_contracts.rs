//! Public identity, sequence, and event-discriminator contracts for local logs.

use std::error::Error;

use breditor_core::local_log::{
    LocalLogEvent, LocalLogEventErrorCode, LocalLogEventKind, LocalLogId, LocalLogIdentityError,
    LocalLogIdentityErrorCode, LocalLogSequence, LocalLogSequenceError, LocalSessionId,
    MAX_LOCAL_LOG_IDENTITY_BYTES, ReplayId,
};

type TestResult = Result<(), Box<dyn Error>>;

#[test]
fn all_three_identity_scopes_share_one_exact_portable_grammar() -> TestResult {
    let maximum = format!("A{}", "z".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES - 1));
    let log = LocalLogId::try_new(&maximum)?;
    let session = LocalSessionId::try_new(&maximum)?;
    let replay = ReplayId::try_new(&maximum)?;

    assert_eq!(log.as_str(), maximum);
    assert_eq!(session.as_str(), maximum);
    assert_eq!(replay.as_str(), maximum);
    assert_eq!("log:generation-2".parse::<LocalLogId>()?.as_str(), "log:generation-2");
    assert_eq!(
        LocalSessionId::try_from(String::from("session.stable"))?.as_str(),
        "session.stable"
    );
    assert_eq!(ReplayId::try_new("request_1-retry.2")?.as_str(), "request_1-retry.2");
    Ok(())
}

#[test]
fn identity_failures_have_stable_codes_without_retaining_oversized_text() -> TestResult {
    let oversized = "x".repeat(MAX_LOCAL_LOG_IDENTITY_BYTES + 1);
    let cases = [
        (rejected_identity(LocalLogId::try_new(""))?, LocalLogIdentityErrorCode::Empty),
        (
            rejected_identity(LocalSessionId::try_new("-session"))?,
            LocalLogIdentityErrorCode::InvalidStart,
        ),
        (
            rejected_identity(ReplayId::try_new("request/1"))?,
            LocalLogIdentityErrorCode::InvalidCharacter,
        ),
        (rejected_identity(ReplayId::try_new(&oversized))?, LocalLogIdentityErrorCode::TooLong),
    ];

    for (error, expected_code) in cases {
        assert_eq!(error.code(), expected_code);
        assert!(!format!("{error:?}").contains(&oversized));
    }
    assert_eq!(LocalLogIdentityErrorCode::Empty.as_str(), "local_log_identity.empty");
    assert_eq!(
        LocalLogIdentityErrorCode::InvalidCharacter.as_str(),
        "local_log_identity.invalid_character"
    );
    assert!(matches!(
        ReplayId::try_new("request-é"),
        Err(LocalLogIdentityError::InvalidCharacter { byte_index: 8, character: 'é' })
    ));
    Ok(())
}

fn rejected_identity<T>(
    result: Result<T, LocalLogIdentityError>,
) -> Result<LocalLogIdentityError, Box<dyn Error>> {
    match result {
        Ok(_) => {
            Err(std::io::Error::other("invalid identity fixture unexpectedly succeeded").into())
        }
        Err(error) => Ok(error),
    }
}

#[test]
fn sequence_is_one_based_session_global_and_checked() -> TestResult {
    assert_eq!(LocalLogSequence::try_new(0), Err(LocalLogSequenceError::Zero));
    assert_eq!(LocalLogSequence::FIRST.get(), 1);
    assert_eq!(LocalLogSequence::FIRST.successor()?.get(), 2);

    let maximum = LocalLogSequence::try_new(u64::MAX)?;
    assert_eq!(maximum.to_string(), u64::MAX.to_string());
    assert_eq!(maximum.successor(), Err(LocalLogSequenceError::Overflow));
    assert_eq!(LocalLogSequenceError::Zero.as_str(), "local_log_sequence.zero");
    assert_eq!(LocalLogSequenceError::Overflow.as_str(), "local_log_sequence.overflow");
    Ok(())
}

#[test]
fn event_discriminators_and_error_codes_are_stable() {
    let cases = [
        (LocalLogEvent::close_history_group(), LocalLogEventKind::CloseHistoryGroup),
        (LocalLogEvent::clear_history(), LocalLogEventKind::ClearHistory),
    ];
    for (event, kind) in cases {
        assert_eq!(event.kind(), kind);
        assert_eq!(event.as_commit(), None);
        assert_eq!(kind.to_string(), kind.as_str());
    }
    assert_eq!(LocalLogEventKind::Commit.as_str(), "commit");
    assert_eq!(LocalLogEventKind::Undo.as_str(), "undo");
    assert_eq!(LocalLogEventKind::Redo.as_str(), "redo");
    assert_eq!(
        LocalLogEventErrorCode::EmptyForwardOperations.as_str(),
        "local_log_event.empty_forward_operations"
    );
    assert_eq!(
        LocalLogEventErrorCode::UnexpectedAction.as_str(),
        "local_log_event.unexpected_action"
    );
    assert_eq!(
        LocalLogEventErrorCode::UnexpectedHistoryIntent.as_str(),
        "local_log_event.unexpected_history_intent"
    );
}
