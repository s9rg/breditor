//! Boundary and canonical-text contracts for mutable storage writer epochs.

use std::error::Error;

use breditor_core::local_log::{
    LocalLogStorageWriterEpoch, LocalLogStorageWriterEpochParseError,
    LocalLogStorageWriterEpochValueError, MAX_LOCAL_LOG_STORAGE_WRITER_EPOCH_DECIMAL_BYTES,
};

type TestResult = Result<(), Box<dyn Error>>;

#[test]
fn numeric_construction_accepts_the_complete_nonzero_u64_range() -> TestResult {
    let first = LocalLogStorageWriterEpoch::try_new(1)?;
    let middle = LocalLogStorageWriterEpoch::try_from(42_u64)?;
    let maximum = LocalLogStorageWriterEpoch::try_new(u64::MAX)?;

    assert_eq!(first, LocalLogStorageWriterEpoch::FIRST);
    assert_eq!(middle.get(), 42);
    assert_eq!(maximum, LocalLogStorageWriterEpoch::MAX);
    assert_eq!(maximum.get(), u64::MAX);
    assert_eq!(
        LocalLogStorageWriterEpoch::try_new(0),
        Err(LocalLogStorageWriterEpochValueError::Zero)
    );
    assert_eq!(
        LocalLogStorageWriterEpochValueError::Zero.as_str(),
        "local_log_storage_writer_epoch.zero"
    );
    Ok(())
}

#[test]
fn canonical_decimal_text_round_trips_without_normalization() -> TestResult {
    for value in [1_u64, 2, 42, u64::MAX] {
        let text = value.to_string();
        let epoch: LocalLogStorageWriterEpoch = text.parse()?;

        assert_eq!(epoch.get(), value);
        assert_eq!(epoch.to_string(), text);
    }
    Ok(())
}

#[test]
fn parsing_reports_each_noncanonical_or_out_of_range_category() {
    let cases = [
        ("", LocalLogStorageWriterEpochParseError::Empty),
        ("+1", LocalLogStorageWriterEpochParseError::Sign),
        ("-1", LocalLogStorageWriterEpochParseError::Sign),
        ("1 ", LocalLogStorageWriterEpochParseError::Whitespace { byte_index: 1 }),
        ("\u{2003}1", LocalLogStorageWriterEpochParseError::Whitespace { byte_index: 0 }),
        ("01", LocalLogStorageWriterEpochParseError::LeadingZero),
        ("00", LocalLogStorageWriterEpochParseError::LeadingZero),
        ("0", LocalLogStorageWriterEpochParseError::Zero),
        (
            "1_0",
            LocalLogStorageWriterEpochParseError::InvalidDigit { byte_index: 1, character: '_' },
        ),
        (
            "1２",
            LocalLogStorageWriterEpochParseError::InvalidDigit { byte_index: 1, character: '２' },
        ),
        ("18446744073709551616", LocalLogStorageWriterEpochParseError::Overflow),
    ];

    for (text, expected) in cases {
        assert_eq!(text.parse::<LocalLogStorageWriterEpoch>(), Err(expected));
    }

    assert_eq!(
        LocalLogStorageWriterEpochParseError::Empty.as_str(),
        "local_log_storage_writer_epoch_parse.empty"
    );
    assert_eq!(
        LocalLogStorageWriterEpochParseError::LeadingZero.as_str(),
        "local_log_storage_writer_epoch_parse.leading_zero"
    );
    assert_eq!(
        LocalLogStorageWriterEpochParseError::Overflow.as_str(),
        "local_log_storage_writer_epoch_parse.overflow"
    );
    assert_eq!(MAX_LOCAL_LOG_STORAGE_WRITER_EPOCH_DECIMAL_BYTES, 20);
    assert_eq!(
        "1".repeat(MAX_LOCAL_LOG_STORAGE_WRITER_EPOCH_DECIMAL_BYTES + 1)
            .parse::<LocalLogStorageWriterEpoch>(),
        Err(LocalLogStorageWriterEpochParseError::Overflow)
    );
}

#[test]
fn successor_is_exactly_one_and_never_wraps() -> TestResult {
    assert_eq!(LocalLogStorageWriterEpoch::FIRST.successor()?.get(), 2);
    assert_eq!(
        LocalLogStorageWriterEpoch::try_new(u64::MAX - 1)?.successor()?,
        LocalLogStorageWriterEpoch::MAX
    );

    let Err(exhausted) = LocalLogStorageWriterEpoch::MAX.successor() else {
        return Err(std::io::Error::other("maximum writer epoch unexpectedly advanced").into());
    };
    assert_eq!(exhausted.as_str(), "local_log_storage_writer_epoch.exhausted");
    assert_eq!(exhausted.to_string(), "local-log storage writer epoch is exhausted");
    Ok(())
}
