//! Real public document/comment authors and complete raster input.
use super::super::{TestResult, insert, send};
use breditor_collab_feasibility::{
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewOutcome, ReviewPrincipalId,
        ReviewSession,
        actions::{CreateReviewThread, ReviewAction},
    },
    rich_replica::{
        Command, ReviewAnchorTarget, RichReplica, SharedRichProfile, actions::ReplaceImage,
        selection::Selection,
    },
};
use breditor_collab_relay::{
    Registration, ReviewAdmission, ReviewRegistration, Room,
    assets::{AssetStore, asset_id, prepare_asset},
};
use std::{io::Cursor, path::Path};

pub(crate) struct Author {
    pub document: RichReplica,
    pub review: ReviewSession,
    pub document_registration: Registration,
    pub review_registration: ReviewRegistration,
    pub document_through: String,
    pub review_through: u64,
}
pub(crate) struct Prepared {
    pub author: Author,
    pub assets: AssetStore,
    pub asset: String,
    pub png: Vec<u8>,
}
pub(crate) fn comment(
    document: &RichReplica,
    review: &mut ReviewSession,
    body: &str,
) -> TestResult {
    let anchor_json = document.capture_review_anchor_guarded(
        &document.observe()?,
        &ReviewAnchorTarget::Selection(Selection::Node { block: "image-block".into() }),
    )?;
    let observed = review.observe();
    assert!(matches!(
        document.dispatch_review_guarded(
            &document.observe()?,
            review,
            &observed,
            ReviewAction::CreateThread(CreateReviewThread { anchor_json, body: body.into() })
        )?,
        ReviewOutcome::Committed(_)
    ));
    Ok(())
}
pub(crate) fn prepare(
    room: &mut Room,
    profile: &SharedRichProfile,
    path: &Path,
    atomic: bool,
) -> TestResult<Prepared> {
    room.enable_review("owner")?;
    room.enable_document_history_generations("owner", "root".into(), "one".into())?;
    room.enable_review_history_generations("owner", "root".into(), "one".into())?;
    let document_registration = room.register("owner")?;
    let review_registration =
        room.register_review("owner", ReviewActorId::try_new("owner.comments")?)?;
    let mut assets = AssetStore::open(path, room.asset_binding())?;
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3).write_to(&mut png, image::ImageFormat::Png)?;
    let png = png.into_inner();
    let asset = asset_id(&png);
    room.put_asset("owner", &mut assets, prepare_asset(&asset, "image/png", png.clone())?)?;
    let mut document = profile.join_frame(
        "room".into(),
        document_registration.lease.writer.clone(),
        &room.catchup("owner")?,
    )?;
    document.apply(vec![Command::ReplaceImage(ReplaceImage {
        block: "image-block".into(),
        asset: asset.clone(),
        generation: "public-handover".into(),
    })])?;
    insert(&mut document, "accepted before handover 🙂 ")?;
    let document_through =
        send(room, &document, "owner", &document_registration.lease, "0", atomic)?;
    let policy = ReviewActorPolicy {
        actor: ReviewActorId::try_new("owner.comments")?,
        principal: ReviewPrincipalId::try_new("owner")?,
        access: ReviewAccess::Moderate,
    };
    let mut review = document.create_review_session(policy)?;
    comment(&document, &mut review, "accepted comment")?;
    assert!(matches!(
        room.admit_review("owner", &review_registration.lease, &review.export_frame(0)?)?,
        ReviewAdmission::Durable(_)
    ));
    let review_through = review.local_writer_clock()?.through.parse()?;
    Ok(Prepared {
        author: Author {
            document,
            review,
            document_registration,
            review_registration,
            document_through,
            review_through,
        },
        assets,
        asset,
        png,
    })
}
