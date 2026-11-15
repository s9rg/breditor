//! Coordinated-only recovery is a property of the durable authority lineage.
use super::{
    super::{RoomDeploymentAuthority, journal, permit::Permit},
    fixture::{Directory, TestResult},
};
use crate::Error;
use std::{fs, io::Write};

#[test]
fn ordinary_claim_refuses_after_coordinated_epoch_even_on_a_cold_open() -> TestResult {
    let directory = Directory::new()?;
    let root = directory.authority();
    let authority =
        RoomDeploymentAuthority::create_with_coordinated_recovery(&root, &"a".repeat(64))?;
    assert_eq!(authority.identity().format_version, 2);
    let first = authority.claim(&authority.current_selection()?)?;
    let startup = RoomDeploymentAuthority::open_at_least(&root, &first.selection())?;
    let before = startup.claim(&startup.current_selection()?)?;
    before.check()?;
    let mut permit = Permit::try_acquire(&startup.state, true)?;
    let replacement = startup.claim_handover_held(&mut permit, &before.selection(), [7; 32])?;
    permit.finish()?;
    assert!(matches!(before.check(), Err(Error::Lease)));
    replacement.check()?;

    let selected = replacement.selection();
    let independent = RoomDeploymentAuthority::open_at_least(&root, &before.selection())?;
    let file = root.join("authority.log");
    let bytes = fs::read(&file)?;
    assert_eq!(startup.current_selection()?, selected);
    assert_eq!(independent.current_selection()?, selected);
    for observer in [&startup, &independent] {
        assert!(matches!(
            observer.claim(&selected),
            Err(Error::Contract("deployment authority requires coordinated recovery"))
        ));
        assert_eq!(fs::read(&file)?, bytes);
    }
    let mut permit = Permit::try_acquire(&independent.state, true)?;
    let continuation = independent.claim_handover_held(&mut permit, &selected, [8; 32])?;
    permit.finish()?;
    continuation.check()?;
    assert_eq!(continuation.selection().generation, "4");
    Ok(())
}

#[test]
fn a_checksummed_ordinary_frame_cannot_reopen_a_coordinated_authority() -> TestResult {
    let directory = Directory::new()?;
    let root = directory.authority();
    let authority =
        RoomDeploymentAuthority::create_with_coordinated_recovery(&root, &"b".repeat(64))?;
    let first = authority.claim(&authority.current_selection()?)?;
    let mut permit = Permit::try_acquire(&authority.state, true)?;
    authority.claim_handover_held(&mut permit, &first.selection(), [7; 32])?;
    let current = authority.state.selected(permit.file()?)?;
    permit.finish()?;
    let plain = journal::frame(
        &authority.state.header_digest,
        current.count + 1,
        false,
        &[8; 32],
        &current.digest,
    );
    let path = root.join("authority.log");
    fs::OpenOptions::new().append(true).open(&path)?.write_all(&plain)?;
    let contents = fs::read(&path)?;
    assert!(matches!(
        RoomDeploymentAuthority::open(&root, &authority.identity()),
        Err(Error::Contract("deployment coordinated recovery was rolled back"))
    ));
    assert_eq!(fs::read(&path)?, contents);
    Ok(())
}
