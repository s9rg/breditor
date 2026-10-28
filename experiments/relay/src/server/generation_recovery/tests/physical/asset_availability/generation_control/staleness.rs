//! Point-in-time receipts never authorize a later native cut or replacement provider/control lease.
use super::super::super::super::source::TestResult;
use super::{
    fixture::{Setup, operators},
    network::{Network, Request},
};
use crate::server::prepare_log_generation_recovery_control;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn physical_only_rotation_provider_epoch_and_closed_control_refuse_previously_selected_reads()
-> TestResult {
    for change in ["physical", "provider", "close"] {
        let setup = Box::pin(Setup::new((3, true), true)).await?;
        let server = Network::start(setup.router.clone()).await?;
        let selection = setup.selection();
        let body = serde_json::to_vec(&selection)?;
        assert_eq!(server.request(&Request::check(&setup.token), &body).await?.status, 200);
        match change {
            "physical" => {
                setup
                    .fixture
                    .local()
                    .host
                    .transaction(|room| {
                        room.rotate_log_generation("owner", "control-new-cut").map(|_| ())
                    })
                    .await?;
                let current = setup
                    .fixture
                    .local()
                    .capture_recovery_state("owner", &setup.fixture.owner)
                    .await?
                    .identity()?;
                assert_eq!(current.server.native.source, selection.source.server.native.source);
                assert_ne!(current.server.native.manifest, selection.source.server.native.manifest);
            }
            "provider" => {
                setup.mapping.lock().map_err(|_| "mapping")?.epoch += 1;
            }
            _ => setup.control.as_ref().ok_or("control")?.close(),
        }
        assert_ne!(
            server.request(&Request::check(&setup.token), &body).await?.status,
            200,
            "{change}"
        );
        server.stop().await?;
    }
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn byte_identical_live_native_cut_still_requires_the_new_explicit_control_instance()
-> TestResult {
    let setup = Box::pin(Setup::new((3, true), true)).await?;
    let (router, control) = prepare_log_generation_recovery_control(
        setup.fixture.local().clone(),
        setup.proof.clone(),
        setup.provider.clone(),
        "owner",
        &setup.fixture.owner,
        operators(&setup.token)?,
    )
    .await?;
    assert_eq!(control.identity().source, setup.selection().source);
    assert_ne!(control.identity().instance, setup.selection().instance);
    let server = Network::start(router).await?;
    assert_eq!(
        server
            .request(&Request::check(&setup.token), &serde_json::to_vec(&setup.selection())?)
            .await?
            .status,
        400
    );
    assert_eq!(
        server
            .request(&Request::check(&setup.token), &serde_json::to_vec(&control.identity())?)
            .await?
            .status,
        200
    );
    server.stop().await?;
    Ok(())
}
