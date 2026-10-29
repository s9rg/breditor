//! Quota and actual native ownership are shared, not inferred from socket status.
use super::super::source::{POLICY, TestResult};
use super::{
    fixture::{Gate, Setup, png},
    network::{Network, Request},
};
use crate::OperationalLogGenerationServerRoom;
use std::sync::atomic::Ordering;
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn new_and_original_routes_share_the_same_two_actual_body_admissions() -> TestResult {
    let setup = Box::pin(Setup::new((3, true), true, true, true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let selected = setup.selection();
    let first = server.unfinished(&setup.token).await?;
    let mut current = Request::check(&setup.token);
    current.path = "/recovery/generations/v1/check";
    let mut prior = Request::check(&setup.token);
    prior.path = "/recovery/generation-delivery/v1/check";
    let second = server.unfinished_request(&prior).await?;
    assert_eq!(server.request(&prior, &serde_json::to_vec(&selected.current)?).await?.status, 503);
    assert_eq!(
        server
            .request(&Request::check(&setup.token), &serde_json::to_vec(&selected)?)
            .await?
            .status,
        503
    );
    assert_eq!(
        server.request(&current, &serde_json::to_vec(&selected.current.current)?).await?.status,
        503
    );
    assert_eq!(Network::finish_unfinished(first).await?.status, 400);
    assert_eq!(Network::finish_unfinished(second).await?.status, 400);
    assert_eq!(
        server
            .request(&Request::check(&setup.token), &serde_json::to_vec(&selected)?)
            .await?
            .status,
        200
    );
    server.stop().await?;
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn body_only_admission_never_retains_native_custody_after_the_actual_guard_is_dropped()
-> TestResult {
    let mut setup = Box::pin(Setup::new((3, true), true, true, true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let selected = setup.selection();
    let first = server.unfinished(&setup.token).await?;
    let mut current = Request::check(&setup.token);
    current.path = "/recovery/generations/v1/check";
    let second = server.unfinished_request(&current).await?;
    let calls = setup.provider.calls.load(Ordering::Acquire);
    setup.host.take();
    drop(setup.control.take());
    let early = OperationalLogGenerationServerRoom::resume(
        &setup.source.directory.0.join("delivery-path-control"),
        &setup.source.original,
        &setup.source.original.info()?.identity,
        POLICY,
        "owner",
    );
    let released = early.is_ok();
    assert_eq!(
        server
            .request(&Request::check(&setup.token), &serde_json::to_vec(&selected)?)
            .await?
            .status,
        503
    );
    assert_eq!(
        server.request(&current, &serde_json::to_vec(&selected.current.current)?).await?.status,
        503
    );
    assert_eq!(Network::finish_unfinished(first).await?.status, 503);
    assert_eq!(Network::finish_unfinished(second).await?.status, 503);
    server.stop().await?;
    assert!(released, "An unfinished body must not own the native server");
    assert_eq!(setup.provider.calls.load(Ordering::Acquire), calls);
    drop(early);
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn actual_inflight_native_provider_work_keeps_its_lease_until_the_callback_finishes()
-> TestResult {
    let mut setup = Box::pin(Setup::new((3, true), true, true, true)).await?;
    let server = Network::start(setup.router.clone()).await?;
    let selected = setup.selection();
    let token = setup.token.clone();
    let (gate, entered) = Gate::new();
    let _release_on_error = gate.release_on_drop();
    *setup.provider.gate.lock().map_err(|_| "provider gate")? = Some(gate.clone());
    let request = tokio::spawn(async move {
        let result = server.request(&Request::check(&token), &serde_json::to_vec(&selected)?).await;
        Ok::<_, Box<dyn std::error::Error + Send + Sync>>((
            server,
            result.map_err(|error| error.to_string()),
        ))
    });
    entered.await?;
    setup.control.as_ref().ok_or("actual control")?.close();
    setup.host.take();
    drop(setup.control.take());
    let early = OperationalLogGenerationServerRoom::resume(
        &setup.source.directory.0.join("delivery-path-control"),
        &setup.source.original,
        &setup.source.original.info()?.identity,
        POLICY,
        "owner",
    );
    let retained = early.is_err();
    gate.release();
    let (server, response) = request.await?.map_err(|_| "native worker wrapper failed")?;
    assert_ne!(response.map_err(|_| "actual response")?.status, 200);
    server.stop().await?;
    assert!(retained, "A real native callback must retain its original lease until it drains");
    drop(early);
    let operation = OperationalLogGenerationServerRoom::resume(
        &setup.source.directory.0.join("delivery-path-control"),
        &setup.source.original,
        &setup.source.original.info()?.identity,
        POLICY,
        "owner",
    )?;
    drop(operation);
    Ok(())
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn physical_raster_provider_and_closed_control_changes_all_stale_the_selected_read()
-> TestResult {
    for change in ["physical", "raster", "provider", "close"] {
        let setup = Box::pin(Setup::new((3, true), true, true, true)).await?;
        let server = Network::start(setup.router.clone()).await?;
        let body = serde_json::to_vec(&setup.selection())?;
        assert_eq!(server.request(&Request::check(&setup.token), &body).await?.status, 200);
        match change {
            "physical" => {
                setup
                    .host
                    .as_ref()
                    .ok_or("host")?
                    .host
                    .transaction(|room| {
                        room.grant("owner", "after-selection-reader", Some(crate::Role::Reader))?;
                        room.rotate_log_generation("owner", "after-selection").map(|_| ())
                    })
                    .await?;
            }
            "raster" => {
                let host = setup.host.as_ref().ok_or("host")?;
                let assets = host.host.assets.clone().ok_or("rasters")?;
                let bytes = png(4, 5)?;
                host.host
                    .transaction(move |room| {
                        let mut assets = assets.lock().map_err(|_| crate::Error::NeedsRecovery)?;
                        room.put_asset(
                            "owner",
                            &mut assets,
                            crate::assets::prepare_asset(
                                &crate::assets::asset_id(&bytes),
                                "image/png",
                                bytes,
                            )?,
                        )?;
                        Ok(())
                    })
                    .await?;
            }
            "provider" => setup.provider.allowed.store(false, Ordering::Release),
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
