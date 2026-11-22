//! Real independent document/review generations, physical cuts, old suffixes and cold proof renewal.
use super::{
    super::source::{POLICY, Source, TestResult, authentication, review_policy, send},
    source,
};
use crate::server::prepare_log_generation_recovery_host;
use crate::{OperationalLogGenerationServerRoom, ReviewAdmission, Role};
use breditor_collab_feasibility::review::ReviewOutcome;
async fn workflow(profile: (u32, bool), atomic: bool, document: bool, review: bool) -> TestResult {
    let seed = Source::new(profile, atomic, document, review)?;
    let (handle, owner, _) = source::host(&seed, "path").await?;
    source::middle(&handle).await?;
    let b = source::capture(&handle, &owner).await?;
    source::advance(&handle, &seed, atomic, document, review).await?;
    let c1 = source::capture(&handle, &owner).await?;
    handle
        .host
        .transaction(|room| {
            room.grant("owner", "path-c2-reader", Some(Role::Reader))?;
            room.rotate_log_generation("owner", "path-c2")?;
            Ok(())
        })
        .await?;
    let c2 = source::capture(&handle, &owner).await?;
    let stale = source::proof(&handle, &owner, &seed).await?;
    handle
        .host
        .transaction(|room| {
            room.grant("owner", "path-d-reader", Some(Role::Reader))?;
            room.rotate_log_generation("owner", "path-d")?;
            Ok(())
        })
        .await?;
    let copy = || -> TestResult<Vec<crate::ServerLogGenerationRoomBackup>> {
        Ok(vec![source::copy(&b)?, source::copy(&c1)?, source::copy(&c1)?, source::copy(&c2)?])
    };
    let pins = copy()?
        .iter()
        .map(|value| value.info().map(|info| info.identity))
        .collect::<crate::Result<Vec<_>>>()?;
    assert!(handle.verify_delivery_path("owner", &owner, copy()?, &pins, stale).await.is_err());
    let current = source::proof(&handle, &owner, &seed).await?;
    let proof = handle.verify_delivery_path("owner", &owner, copy()?, &pins, current).await?;
    assert_eq!(proof.identity().ancestors, pins);
    assert_eq!(proof.identity().current.origin, seed.original.info()?.identity);
    assert_ne!(pins[0], proof.identity().current.origin);
    assert_ne!(pins[0], proof.identity().current.server);
    proof.check_live(&handle, "owner", &owner).await?;
    drop(handle);
    let operation = OperationalLogGenerationServerRoom::resume(
        &seed.directory.0.join("path"),
        &seed.original,
        &seed.original.info()?.identity,
        POLICY,
        "owner",
    )?;
    let (auth, token, _) = authentication()?;
    let reopened = Box::pin(prepare_log_generation_recovery_host(
        operation,
        auth,
        seed.original_copy()?,
        &seed.original.info()?.identity,
        "owner",
        &token,
    ))
    .await?;
    assert_eq!(
        reopened.capture_recovery_state("owner", &token).await?.identity()?,
        proof.identity().current
    );
    assert!(proof.check_live(&reopened, "owner", &token).await.is_err());
    let fresh = source::proof(&reopened, &token, &seed).await?;
    let renewed = reopened.verify_delivery_path("owner", &token, copy()?, &pins, fresh).await?;
    renewed.check_live(&reopened, "owner", &token).await?;
    drop(reopened);
    future_native_history(&seed, atomic)?;
    Ok(())
}
fn future_native_history(seed: &Source, atomic: bool) -> TestResult {
    let mut operation = OperationalLogGenerationServerRoom::resume(
        &seed.directory.0.join("path"),
        &seed.original,
        &seed.original.info()?.identity,
        POLICY,
        "owner",
    )?;
    let (room, assets) = operation.components_mut();
    let raster = source::png(4, 5)?;
    assert_eq!(
        room.read_asset("owner", assets, &crate::assets::asset_id(&raster))?
            .ok_or("new raster")?
            .bytes,
        raster
    );
    assert_eq!(assets.count(), 4);
    let lease = room.resume("owner", &seed.author.lease.writer, &seed.author.credential)?;
    let mut client = seed.profile.restore("room", &seed.offline)?;
    client.receive_frame(&room.catchup("owner")?)?;
    let mut through = if atomic {
        client.writer_clock_v2(&seed.author.lease.writer)?.through
    } else {
        client.writer_clock(&seed.author.lease.writer)?.through
    };
    for redo in [false, true] {
        assert!(if redo { client.redo()? } else { client.undo()? });
        through = send(room, &client, "owner", &lease, &through, atomic)?;
        assert_eq!(client.document_json().contains("Old offline "), redo);
    }
    let lease =
        room.resume_review("owner", &seed.reviewer.lease.actor, &seed.reviewer.credential)?;
    let mut comments =
        client.restore_review_session(review_policy("owner.comments")?, &seed.review_offline)?;
    let mut through: u64 = comments.local_writer_clock()?.through.parse()?;
    for redo in [false, true] {
        let observed = comments.observe();
        let outcome = if redo {
            client.redo_review_guarded(&client.observe()?, &mut comments, &observed)?
        } else {
            client.undo_review_guarded(&client.observe()?, &mut comments, &observed)?
        };
        assert!(matches!(outcome, ReviewOutcome::Committed(_)));
        assert!(matches!(
            room.admit_review("owner", &lease, &comments.export_frame(through)?)?,
            ReviewAdmission::Durable(_)
        ));
        through = comments.local_writer_clock()?.through.parse()?;
    }
    operation.check_live_source(&seed.original, "owner")?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn forty_original_modes_preserve_each_ordered_cut_real_offline_lanes_and_future_history()
-> TestResult {
    let mut n = 0;
    for profile in [(1, false), (2, false), (2, true), (3, false), (3, true)] {
        for atomic in [false, true] {
            for document in [false, true] {
                for review in [false, true] {
                    Box::pin(workflow(profile, atomic, document, review)).await?;
                    n += 1;
                }
            }
        }
    }
    assert_eq!(n, 40);
    Ok(())
}
