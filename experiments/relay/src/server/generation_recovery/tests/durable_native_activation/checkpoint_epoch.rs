//! A competing actual deployment handle must not supersede a checkpoint write.
use super::{Options, Setup, Status, TestResult};
use crate::{
    Error,
    server::{
        RoomDeploymentAuthority,
        generation_backup::durable::{Barrier, Interruption, Point},
    },
};
use std::{
    sync::{Mutex, mpsc},
    time::Duration,
};

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn durable_checkpoint_prepare_holds_the_selected_epoch_through_disk_commit() -> TestResult {
    for point in [Point::SourceChecked, Point::ArchiveSynced] {
        let setup = Box::pin(Setup::new((3, true), true, (true, true), true)).await?;
        let proof = setup.proof().await?;
        let expected = setup.authority.current_selection()?;
        let contender = RoomDeploymentAuthority::open_at_least(
            &setup.source.directory.0.join("authority"),
            &expected,
        )?;
        let root = setup.source.directory.0.join("competing-checkpoint");
        let before = setup.ledger()?;
        let (entered, ready) = mpsc::channel();
        let (release, released) = mpsc::channel();
        let host = setup.handle.clone();
        let owner = setup.owner.clone();
        let source = setup.intent.clone();
        let options = Options { root: root.clone(), authority: setup.authority.clone() };
        let stop = Interruption {
            barrier: Some(Barrier { point, entered, release: Mutex::new(released) }),
            ..Interruption::default()
        };
        let worker = tokio::spawn(async move {
            host.prepare_durable_checkpoint("owner", &owner, source, None, &proof, (options, stop))
                .await
        });
        tokio::task::spawn_blocking(move || ready.recv_timeout(Duration::from_secs(15))).await??;
        let competing_claim = contender.claim(&expected);
        release.send(())?;
        let prepared = tokio::time::timeout(Duration::from_secs(15), worker).await??;
        match point {
            Point::SourceChecked => {
                competing_claim?;
                assert!(matches!(prepared, Err(Error::Lease)), "stale cut returned a checkpoint");
                assert!(!root.exists(), "stale cut created a checkpoint directory");
            }
            Point::ArchiveSynced => {
                assert!(
                    matches!(competing_claim, Err(Error::Locked)),
                    "the deployment epoch changed during the checkpoint write"
                );
                let prepared = prepared?;
                assert!(prepared.store.buffered.get().is_none());
                assert_eq!(
                    prepared.checkpoint_file()?.info().identity,
                    prepared.identity().current().server
                );
                assert_eq!(prepared.status(&setup.authority)?, Status::Prepared);
                assert!(prepared.store.buffered.get().is_none());
                let bytes = std::fs::read(root.join("target.backup"))?;
                assert_eq!(prepared.checkpoint()?.to_bytes()?, bytes);
                assert_eq!(setup.ledger()?, before);
                assert!(
                    contender.claim(&expected).is_ok(),
                    "checkpoint write retained epoch custody"
                );
                assert_eq!(prepared.status(&setup.authority)?, Status::Superseded);
            }
            _ => unreachable!(),
        }
    }
    Ok(())
}
