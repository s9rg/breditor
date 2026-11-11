//! Fixture-only holder of actual public native owners, never a fabricated service flag.
use super::Result;
use breditor_collab_relay::server::{
    ActivatedNativeLogGenerationHost, DurableNativeActivationControl,
    PreparedLogGenerationRecoveryHost,
};

enum Owner {
    Native(Box<ActivatedNativeLogGenerationHost>),
    Controlled(DurableNativeActivationControl),
}
pub(super) struct NativeService {
    host: PreparedLogGenerationRecoveryHost,
    owner: Owner,
}
impl NativeService {
    pub fn native(active: ActivatedNativeLogGenerationHost) -> Self {
        Self { host: active.recovery_host(), owner: Owner::Native(Box::new(active)) }
    }
    pub fn controlled(
        host: PreparedLogGenerationRecoveryHost,
        control: DurableNativeActivationControl,
    ) -> Self {
        Self { host, owner: Owner::Controlled(control) }
    }
    pub fn actual_native(&self) -> Result<&ActivatedNativeLogGenerationHost> {
        match &self.owner {
            Owner::Native(active) => Ok(active),
            Owner::Controlled(_) => {
                Err("select the initial actual Native owner before handover".into())
            }
        }
    }
    pub fn recovery_host(&self) -> PreparedLogGenerationRecoveryHost {
        self.host.clone()
    }
    pub async fn router(&self) -> Result<axum::Router> {
        Ok(match &self.owner {
            Owner::Native(active) => active.router(),
            Owner::Controlled(control) => control.service_router().await?,
        })
    }
}
