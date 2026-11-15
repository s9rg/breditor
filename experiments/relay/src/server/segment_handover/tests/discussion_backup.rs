use super::{Source, TestResult};
use crate::{Error, server::RelaySegmentDiscussionBackup};

#[test]
fn bundled_capture_with_no_sources_reopens_and_a_superseded_host_cannot_create_another()
-> TestResult {
    let source = Source::open()?;
    let path = source.parent.join("discussion-backup");
    let expected = source.handle.capture_relay_segment_with_discussion_sources(
        "owner",
        &source.token,
        &path,
    )?;
    assert_eq!(expected.source_epoch, source.lease.selection());
    assert!(expected.discussion_sources.is_empty());
    assert!(!path.join("discussion-sources").exists());
    let opened = RelaySegmentDiscussionBackup::open(&path, None, &expected)?;
    assert_eq!(opened.backup.identity(), &expected.backup);
    assert!(opened.discussion_sources.is_empty());
    assert!(opened.backup.required_recovered_discussion_sources()?.is_empty());
    let _next = source.authority.claim(&source.authority.current_selection()?)?;
    let absent = source.parent.join("superseded-discussion-backup");
    assert!(matches!(
        source.handle.capture_relay_segment_with_discussion_sources(
            "owner",
            &source.token,
            &absent
        ),
        Err(Error::Lease)
    ));
    assert!(!absent.exists());
    Ok(())
}
