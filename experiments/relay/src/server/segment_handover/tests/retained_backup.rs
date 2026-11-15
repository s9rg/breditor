use super::{POLICY, Source, TestResult};
use crate::{Error, server::RelaySegmentRetainedBackup};

#[test]
fn a_source_free_retained_backup_restores_without_client_archives() -> TestResult {
    let source = Source::open()?;
    let path = source.parent.join("retained-backup");
    let (invalid_token, _) = crate::server::Authentication::issue_token()?;
    assert!(matches!(
        source.handle.capture_relay_segment_with_retained_clients("owner", &invalid_token, &path),
        Err(Error::Permission)
    ));
    assert!(!path.exists());
    let expected =
        source.handle.capture_relay_segment_with_retained_clients("owner", &source.token, &path)?;
    assert_eq!(expected.source_epoch, source.lease.selection());
    assert!(expected.selected_journals.is_empty());
    assert!(expected.alternate_journals.is_empty());
    assert!(expected.standalone_uploads.is_empty());
    let opened = RelaySegmentRetainedBackup::open(&path, None, &expected)?;
    assert_eq!(opened.backup().identity(), &expected.backup);
    let target = opened.restore(&source.parent.join("restored"), "restored", POLICY)?;
    assert!(target.client_upload_pins()?.is_none());
    assert!(target.client_alternate_pins()?.is_empty());
    assert_eq!(source.authority.current_selection()?, source.lease.selection());
    Ok(())
}
