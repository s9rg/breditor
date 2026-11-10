//! Prove actual pre-seal bytes through the successor's new restore origin.
use super::{Setup, TestResult};
use crate::{
    Error, ServerLogGenerationRoomBackup,
    server::{
        PreparedLogGenerationHandover, PreparedLogGenerationRecoveryHost,
        ServerLogGenerationHandoverDeliveryPathOptions,
        VerifiedServerLogGenerationHandoverDeliveryPath, VerifiedServerLogGenerationRecoveryState,
    },
};
use std::sync::Arc;

fn copy(value: &ServerLogGenerationRoomBackup) -> crate::Result<ServerLogGenerationRoomBackup> {
    ServerLogGenerationRoomBackup::from_owned_bytes(value.to_bytes()?)
}

pub(super) async fn check(
    setup: &Setup,
    successor: &PreparedLogGenerationRecoveryHost,
    token: &str,
    current: Arc<VerifiedServerLogGenerationRecoveryState>,
    earlier: &ServerLogGenerationRoomBackup,
    source: Arc<PreparedLogGenerationHandover>,
    competing: Arc<PreparedLogGenerationHandover>,
) -> TestResult<VerifiedServerLogGenerationHandoverDeliveryPath> {
    let first = &setup.source.original;
    let earlier_identity = earlier.info()?.identity;
    // The old contract starts at the restore origin and correctly refuses a
    // client cut older than that origin, even when its data is retained.
    assert!(
        successor
            .verify_delivery_path(
                "owner",
                token,
                vec![copy(earlier)?],
                std::slice::from_ref(&earlier_identity),
                current.clone(),
            )
            .await
            .is_err()
    );
    let local = Arc::new(
        successor
            .verify_delivery_path(
                "owner",
                token,
                vec![copy(source.source_backup())?],
                std::slice::from_ref(source.identity().source()),
                current,
            )
            .await?,
    );
    let options = |handover: Arc<PreparedLogGenerationHandover>,
                   archives: [&ServerLogGenerationRoomBackup; 2]|
     -> TestResult<ServerLogGenerationHandoverDeliveryPathOptions> {
        Ok(ServerLogGenerationHandoverDeliveryPathOptions {
            expected_handover: handover.identity().clone(),
            handover,
            authority: setup.authority.clone(),
            earlier: vec![copy(archives[0])?, copy(archives[1])?],
            expected_earlier: vec![archives[0].info()?.identity, archives[1].info()?.identity],
        })
    };
    assert!(matches!(
        successor
            .verify_handover_delivery_path(
                "owner",
                token,
                local.clone(),
                options(competing, [first, earlier])?,
            )
            .await,
        Err(Error::Contract("delivery handover seal is absent"))
    ));
    // Native clocks match in these two older cuts. Only the raster bytes
    // distinguish the correct order from the reversed one.
    assert!(matches!(
        successor
            .verify_handover_delivery_path(
                "owner",
                token,
                local.clone(),
                options(source.clone(), [earlier, first])?,
            )
            .await,
        Err(Error::Contract("local archive lost or changed ancestor raster"))
    ));
    let mut wrong = options(source.clone(), [first, earlier])?;
    wrong.expected_earlier.swap(0, 1);
    assert!(matches!(
        successor.verify_handover_delivery_path("owner", token, local.clone(), wrong).await,
        Err(Error::Contract("delivery path archive selection differs"))
    ));
    let verified = successor
        .verify_handover_delivery_path(
            "owner",
            token,
            local.clone(),
            options(source.clone(), [first, earlier])?,
        )
        .await?;
    let selected = verified.identity();
    assert_eq!(selected.seal, *source.identity().planned_selection());
    assert_eq!(selected.earlier, vec![first.info()?.identity, earlier_identity]);
    assert_eq!(selected.successor, local.identity());
    Ok(verified)
}
