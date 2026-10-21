//! Exact global transport continuity. No manifest, rotation, authority or native-room claim.
use super::{Event, Log, MAX_LOG, MAX_RECORD, MAX_RECORDS, Record, decoder, frame};
use crate::Error;
use sha2::{Digest, Sha256};
use std::{fs, io::Read};
type TestResult<T = ()> = std::result::Result<T, Box<dyn std::error::Error>>;

fn grant() -> Event {
    Event::Grant { actor: "owner".into(), principal: "alice".into(), role: None }
}
fn bytes(encoded: &frame::Encoded) -> Vec<u8> {
    [encoded.header.as_slice(), encoded.payload.as_slice()].concat()
}
fn selected(input: &[u8], first: u64, previous: [u8; 32]) -> crate::Result<decoder::DecodedLog> {
    let mut reader = input;
    decoder::read_records_from(
        &mut reader,
        input.len() as u64,
        frame::Family::Continuation,
        first,
        previous,
    )
}

#[test]
fn full_original_log_then_two_continuation_cuts_preserve_absolute_positions_and_exact_root_bytes()
-> TestResult {
    let files = super::framing_tests::Files::new()?;
    let mut original = Log::create(&files.log(), super::framing_tests::seed())?;
    for _ in 1..MAX_RECORDS {
        original.append(grant())?;
    }
    let root = fs::read(files.log())?;
    let (next, digest) = original.snapshot_cut()?;
    assert_eq!(next, MAX_RECORDS);
    assert!(matches!(original.append(grant()), Err(Error::Contract("log record budget"))));
    original.ready()?;
    assert_eq!(fs::read(files.log())?, root);
    let parsed = decoder::read_records(&mut root.as_slice(), root.len() as u64)?;
    assert_eq!(parsed.records.len() as u64, MAX_RECORDS);
    assert_eq!(parsed.previous, digest);
    let mut first = next;
    let mut previous = digest;
    for _cut in 0..2 {
        let parent = previous;
        let mut segment = Vec::new();
        for offset in 0..2 {
            let record =
                frame::encode(grant(), frame::Family::Continuation, first + offset, previous)?;
            segment.extend(bytes(&record));
            previous = record.digest;
        }
        let admitted = selected(&segment, first, parent)?;
        assert_eq!(admitted.records.len(), 2);
        assert_eq!(admitted.records[0].sequence, first);
        assert_eq!(admitted.records[1].sequence, first + 1);
        assert_eq!(admitted.previous, previous);
        assert!(decoder::read_records(&mut segment.as_slice(), segment.len() as u64).is_err());
        first += 2;
    }
    assert_eq!(first, MAX_RECORDS + 4);
    assert_eq!(fs::read(files.log())?, root);
    Ok(())
}

#[test]
fn original_and_continuation_families_cannot_impersonate_each_other_even_at_zero() -> TestResult {
    let root = bytes(&frame::encode(grant(), frame::Family::Original, 0, [0; 32])?);
    let next = bytes(&frame::encode(grant(), frame::Family::Continuation, 0, [0; 32])?);
    assert!(selected(&root, 0, [0; 32]).is_err());
    assert!(decoder::read_records(&mut next.as_slice(), next.len() as u64).is_err());
    assert!(
        decoder::read_records_from(
            &mut next.as_slice(),
            next.len() as u64,
            frame::Family::Original,
            MAX_RECORDS,
            [1; 32]
        )
        .is_err()
    );
    assert!(matches!(
        frame::encode(grant(), frame::Family::Original, MAX_RECORDS, [0; 32]),
        Err(Error::Contract("log record budget"))
    ));
    assert!(decoder::read_records(&mut &[][..], 0).is_err());
    let empty = selected(&[], MAX_RECORDS, [7; 32])?;
    assert!(empty.records.is_empty());
    assert_eq!(empty.previous, [7; 32]);
    assert_eq!(empty.bytes, 0);
    assert_eq!(empty.recovery.truncated_bytes, 0);
    Ok(())
}

#[test]
fn every_incomplete_continuation_tail_retains_its_precise_predecessor_cut() -> TestResult {
    let first = frame::encode(grant(), frame::Family::Continuation, MAX_RECORDS, [7; 32])?;
    let first_bytes = bytes(&first);
    let second =
        frame::encode(grant(), frame::Family::Continuation, MAX_RECORDS + 1, first.digest)?;
    let all = [first_bytes.as_slice(), bytes(&second).as_slice()].concat();
    for end in 0..all.len() {
        let parsed = selected(&all[..end], MAX_RECORDS, [7; 32])?;
        let complete = usize::from(end >= first_bytes.len());
        assert_eq!(parsed.records.len(), complete);
        let retained = if complete == 0 { 0 } else { first_bytes.len() };
        assert_eq!(parsed.bytes, retained as u64);
        assert_eq!(parsed.recovery.truncated_bytes, (end - retained) as u64);
        assert_eq!(parsed.previous, if complete == 0 { [7; 32] } else { first.digest });
    }
    assert_eq!(selected(&all, MAX_RECORDS, [7; 32])?.records.len(), 2);
    Ok(())
}

#[test]
fn continuation_budget_is_per_file_not_a_reset_or_an_unbounded_global_counter() -> TestResult {
    let first = MAX_RECORDS * 3;
    let mut previous = [7; 32];
    let mut data = Vec::new();
    for offset in 0..MAX_RECORDS {
        let record = frame::encode(grant(), frame::Family::Continuation, first + offset, previous)?;
        data.extend(bytes(&record));
        previous = record.digest;
    }
    let admitted = selected(&data, first, [7; 32])?;
    assert_eq!(admitted.records.len() as u64, MAX_RECORDS);
    assert_eq!(admitted.records.last().ok_or("last")?.sequence, first + MAX_RECORDS - 1);
    data.extend(bytes(&frame::encode(
        grant(),
        frame::Family::Continuation,
        first + MAX_RECORDS,
        previous,
    )?));
    assert!(matches!(selected(&data, first, [7; 32]), Err(Error::Contract("log record budget"))));
    let overflow = bytes(&frame::encode(grant(), frame::Family::Continuation, u64::MAX, [0; 32])?);
    assert!(matches!(selected(&overflow, u64::MAX, [0; 32]), Err(Error::Contract("log sequence"))));
    Ok(())
}

fn forged(record: &Record) -> TestResult<Vec<u8>> {
    let payload = serde_json::to_vec(record)?;
    let mut header = [0_u8; 72];
    header[..8].copy_from_slice(&(payload.len() as u64).to_be_bytes());
    header[8..40].copy_from_slice(&Sha256::digest(&payload));
    let digest = Sha256::digest(&header[..40]);
    header[40..].copy_from_slice(&digest);
    Ok([header.as_slice(), payload.as_slice()].concat())
}

struct Unread;
impl Read for Unread {
    fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
        panic!("oversized segment must refuse before reading");
    }
}

#[test]
fn checksum_valid_forks_gaps_versions_and_mixed_families_refuse_without_a_partial_result()
-> TestResult {
    for mutation in 0..5 {
        let mut record: Record = serde_json::from_slice(
            &frame::encode(grant(), frame::Family::Continuation, MAX_RECORDS, [7; 32])?.payload,
        )?;
        match mutation {
            0 => record.previous[0] ^= 1,
            1 => record.sequence += 1,
            2 => record.version += 1,
            3 => record.format = "breditor/relay-log".into(),
            _ => record.format = "unknown".into(),
        }
        assert!(matches!(
            selected(&forged(&record)?, MAX_RECORDS, [7; 32]),
            Err(Error::Contract("log lineage"))
        ));
    }
    let good = frame::encode(grant(), frame::Family::Continuation, 0, [7; 32])?;
    let mut mixed = bytes(&good);
    mixed.extend(bytes(&frame::encode(grant(), frame::Family::Original, 1, good.digest)?));
    assert!(matches!(selected(&mixed, 0, [7; 32]), Err(Error::Contract("log lineage"))));
    let mut duplicate = bytes(&good);
    duplicate.extend(bytes(&good));
    assert!(selected(&duplicate, 0, [7; 32]).is_err());
    Ok(())
}

#[test]
fn complete_corruption_is_not_torn_recovery_and_oversized_input_is_not_read() -> TestResult {
    let encoded = frame::encode(grant(), frame::Family::Continuation, MAX_RECORDS, [7; 32])?;
    for index in [0, 8, 40] {
        let mut bad = bytes(&encoded);
        bad[index] ^= 1;
        assert!(matches!(
            selected(&bad, MAX_RECORDS, [7; 32]),
            Err(Error::Contract("log header checksum"))
        ));
    }
    let mut bad = bytes(&encoded);
    *bad.last_mut().ok_or("payload")? ^= 1;
    assert!(matches!(
        selected(&bad, MAX_RECORDS, [7; 32]),
        Err(Error::Contract("log record checksum"))
    ));
    for size in [0, MAX_RECORD + 1] {
        let mut header = [0_u8; 72];
        header[..8].copy_from_slice(&size.to_be_bytes());
        let checksum = Sha256::digest(&header[..40]);
        header[40..].copy_from_slice(&checksum);
        assert!(matches!(
            selected(&header, MAX_RECORDS, [7; 32]),
            Err(Error::Contract("log record budget"))
        ));
    }
    assert!(matches!(
        decoder::read_records_from(
            &mut Unread,
            MAX_LOG + 1,
            frame::Family::Continuation,
            MAX_RECORDS,
            [7; 32]
        ),
        Err(Error::Contract("log byte budget"))
    ));
    Ok(())
}
