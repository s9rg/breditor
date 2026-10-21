//! Actual incremental SHA-256 laws, not a substitute document or recovery model.
use super::{
    ArchiveDigest, ArchiveDigestError as Error, MAX_ARCHIVE_DIGEST_BYTES,
    MAX_ARCHIVE_DIGEST_CHUNK_BYTES,
};
use sha2::{Digest, Sha256};
fn hex(bytes: [u8; 32]) -> String {
    use std::fmt::Write;
    let mut output = String::with_capacity(64);
    for byte in bytes {
        let _ = write!(&mut output, "{byte:02x}");
    }
    output
}

#[test]
fn known_empty_and_abc_vectors_have_exact_standard_sha256_bytes() {
    let mut empty = ArchiveDigest::new(0).unwrap();
    assert_eq!(
        hex(empty.finish().unwrap()),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    let mut abc = ArchiveDigest::new(3).unwrap();
    for bytes in [b"a".as_slice(), b"".as_slice(), b"bc".as_slice()] {
        abc.update(bytes).unwrap();
    }
    assert_eq!(
        hex(abc.finish().unwrap()),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
}
#[test]
fn every_block_boundary_and_multi_megabyte_partition_matches_one_shot() {
    let data: Vec<u8> =
        (0..2 * MAX_ARCHIVE_DIGEST_CHUNK_BYTES + 193).map(|index| index.to_le_bytes()[0]).collect();
    for length in
        [0, 1, 55, 56, 63, 64, 65, 127, 128, 129, 1024, MAX_ARCHIVE_DIGEST_CHUNK_BYTES, data.len()]
    {
        for chunk in [1, 7, 63, 64, 65, 999, MAX_ARCHIVE_DIGEST_CHUNK_BYTES] {
            let mut digest = ArchiveDigest::new(u32::try_from(length).unwrap()).unwrap();
            for bytes in data[..length].chunks(chunk) {
                digest.update(bytes).unwrap();
            }
            assert_eq!(digest.finish().unwrap(), <[u8; 32]>::from(Sha256::digest(&data[..length])));
        }
    }
}
#[test]
fn oversized_chunks_and_overflow_preserve_the_exact_previous_digest() {
    let mut digest = ArchiveDigest::new(3).unwrap();
    digest.update(b"a").unwrap();
    assert_eq!(digest.update(&vec![0; MAX_ARCHIVE_DIGEST_CHUNK_BYTES + 1]), Err(Error::Budget));
    assert_eq!(digest.update(b"bcd"), Err(Error::Overflow));
    digest.update(b"bc").unwrap();
    assert_eq!(digest.finish().unwrap(), <[u8; 32]>::from(Sha256::digest(b"abc")));
}
#[test]
fn premature_finish_preserves_state_but_success_is_terminal() {
    let mut digest = ArchiveDigest::new(2).unwrap();
    digest.update(b"a").unwrap();
    assert_eq!(digest.finish(), Err(Error::Incomplete));
    digest.update(b"b").unwrap();
    assert_eq!(digest.finish().unwrap(), <[u8; 32]>::from(Sha256::digest(b"ab")));
    assert_eq!(digest.update(b""), Err(Error::Closed));
    assert_eq!(digest.finish(), Err(Error::Closed));
}
#[test]
fn selecting_the_maximum_does_not_allocate_or_retain_an_input_sized_buffer() {
    let mut digest = ArchiveDigest::new(MAX_ARCHIVE_DIGEST_BYTES).unwrap();
    assert!(std::mem::size_of::<ArchiveDigest>() < 1024);
    assert_eq!(digest.finish(), Err(Error::Incomplete));
    assert!(matches!(ArchiveDigest::new(MAX_ARCHIVE_DIGEST_BYTES + 1), Err(Error::Budget)));
}
