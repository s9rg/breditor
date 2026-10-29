//! Small genuine host helpers. Raw credentials never leave the test's private inputs.
use super::super::source::{Source, TestResult, authentication, review_policy};
use crate::server::{
    PreparedLogGenerationRecoveryHost, ServerLogGenerationRecoveryCoverage,
    VerifiedServerLogGenerationRecoveryState, prepare_log_generation_recovery_host,
};
use crate::{Admission, Error, ReviewAdmission, Role, ServerLogGenerationRoomBackup};
use std::{io::Cursor, sync::Arc};

pub(super) async fn host(
    source: &Source,
    name: &str,
) -> TestResult<(PreparedLogGenerationRecoveryHost, String, String)> {
    let (auth, owner, reader) = authentication()?;
    let handle = Box::pin(prepare_log_generation_recovery_host(
        source.operation(name)?,
        auth,
        source.original_copy()?,
        &source.original.info()?.identity,
        "owner",
        &owner,
    ))
    .await?;
    Ok((handle, owner, reader))
}
pub(super) async fn proof(
    handle: &PreparedLogGenerationRecoveryHost,
    owner: &str,
    source: &Source,
) -> TestResult<Arc<VerifiedServerLogGenerationRecoveryState>> {
    let capture = handle.capture_recovery_state("owner", owner).await?;
    let expected = capture.identity()?;
    let (_, inventory) = capture.into_parts();
    let ServerLogGenerationRecoveryCoverage::Verified(proof) = handle
        .verify_selected_recovery_state(
            "owner",
            owner,
            expected,
            inventory,
            source.protected_records(),
        )
        .await?
    else {
        return Err("complete native credentials required".into());
    };
    Ok(Arc::new(proof))
}
pub(super) async fn middle(handle: &PreparedLogGenerationRecoveryHost) -> TestResult {
    handle
        .host
        .transaction(|room| {
            room.grant("owner", "middle-reader", Some(Role::Reader))?;
            room.rotate_log_generation("owner", "delivery-middle")?;
            Ok(())
        })
        .await?;
    Ok(())
}
pub(super) async fn capture(
    handle: &PreparedLogGenerationRecoveryHost,
    owner: &str,
) -> TestResult<ServerLogGenerationRoomBackup> {
    Ok(handle.capture_recovery_state("owner", owner).await?.into_parts().0)
}
pub(super) fn copy(
    value: &ServerLogGenerationRoomBackup,
) -> TestResult<ServerLogGenerationRoomBackup> {
    Ok(ServerLogGenerationRoomBackup::from_owned_bytes(value.to_bytes()?)?)
}
pub(super) fn png(width: u32, height: u32) -> TestResult<Vec<u8>> {
    let mut bytes = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(width, height).write_to(&mut bytes, image::ImageFormat::Png)?;
    Ok(bytes.into_inner())
}
pub(super) async fn advance(
    handle: &PreparedLogGenerationRecoveryHost,
    source: &Source,
    atomic: bool,
    document: bool,
    review: bool,
) -> TestResult {
    let client = source.profile.restore("room", &source.offline)?;
    let groups: serde_json::Value = serde_json::from_str(&if atomic {
        client.writer_groups_v2_guarded(&client.observe()?, &source.through)?
    } else {
        client.writer_groups_guarded(&client.observe()?, &source.through)?
    })?;
    let frames = groups["groups"]
        .as_array()
        .ok_or("native groups")?
        .iter()
        .map(|frame| frame.as_str().map(String::from).ok_or("native group"))
        .collect::<Result<Vec<_>, _>>()?;
    let comments =
        client.restore_review_session(review_policy("owner.comments")?, &source.review_offline)?;
    let comment = comments.export_frame(source.review_through)?;
    let writer = source.author.lease.writer.clone();
    let credential = source.author.credential.clone();
    let actor = source.reviewer.lease.actor.clone();
    let review_credential = source.reviewer.credential.clone();
    let assets = handle.host.assets.clone().ok_or("actual raster store")?;
    let raster = png(4, 5)?;
    handle
        .host
        .transaction(move |room| {
            let lease = room.resume("owner", &writer, &credential)?;
            for frame in frames {
                if !matches!(room.admit("owner", &lease, &frame)?, Admission::Durable(_)) {
                    return Err(Error::Contract("actual document durability required"));
                }
            }
            let lease = room.resume_review("owner", &actor, &review_credential)?;
            if !matches!(room.admit_review("owner", &lease, &comment)?, ReviewAdmission::Durable(_))
            {
                return Err(Error::Contract("actual comment durability required"));
            }
            if document {
                room.seal_document_history_generation("owner", "delivery-document-two".into())?;
            }
            if review {
                room.seal_review_history_generation("owner", "delivery-review-two".into())?;
            }
            room.rotate_log_generation("owner", "delivery-after")?;
            let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
            room.put_asset(
                "owner",
                &mut assets,
                crate::assets::prepare_asset(
                    &crate::assets::asset_id(&raster),
                    "image/png",
                    raster,
                )?,
            )?;
            Ok(())
        })
        .await?;
    Ok(())
}
