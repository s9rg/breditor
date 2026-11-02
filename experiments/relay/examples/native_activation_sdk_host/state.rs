//! Real running fixture state. Native and HTTP owners remain explicit.
use super::{Result, begin, inspection, protocol, service, setup, snapshot};
use breditor_collab_relay::{
    ServerLogGenerationRoomBackup, server::ServerLogGenerationDeliveryPathRecoveryControl,
};
use std::{collections::BTreeMap, net::SocketAddr, sync::Arc};

pub(super) struct Offer {
    pub selection: serde_json::Value,
    pub endpoint: String,
    pub token: String,
}
pub(super) struct State {
    pub ready: Option<setup::Ready>,
    pub client_address: SocketAddr,
    pub retired_address: SocketAddr,
    pub tasks: Vec<service::Running>,
    pub controls: Vec<ServerLogGenerationDeliveryPathRecoveryControl>,
    pub inspections: Vec<inspection::Inspection>,
    pub observed: BTreeMap<u64, Arc<ServerLogGenerationRoomBackup>>,
    pub sequence: u64,
    pub previous: Option<super::next::Previous>,
    pub serving: bool,
    pub offer: Option<Offer>,
}
impl State {
    pub async fn start() -> Result<Self> {
        let (ready, clients, retired) = Box::pin(begin::prepare()).await?;
        let client_address = clients.local_addr()?;
        let retired_address = retired.local_addr()?;
        let tasks = vec![
            service::start(ready.active.router().await?, clients),
            service::start(ready.old_router.clone(), retired),
        ];
        Ok(Self {
            ready: Some(ready),
            client_address,
            retired_address,
            tasks,
            controls: Vec::new(),
            inspections: Vec::new(),
            observed: BTreeMap::new(),
            sequence: 0,
            previous: None,
            serving: true,
            offer: None,
        })
    }
    pub fn ready(&self) -> Result<&setup::Ready> {
        self.ready.as_ref().ok_or_else(|| "actual native owner missing".into())
    }
    pub fn predecessor(&self) -> Result<super::next::Previous> {
        Ok((
            self.sequence,
            self.observed.get(&self.sequence).ok_or("actual observed predecessor missing")?.clone(),
        ))
    }
    pub async fn stop_services(&mut self) -> Result {
        for inspection in self.inspections.drain(..) {
            inspection.close().await;
        }
        for control in self.controls.drain(..) {
            control.close();
        }
        for task in self.tasks.drain(..) {
            task.close().await?;
        }
        Ok(())
    }
    pub async fn publish(&mut self) -> Result {
        let snapshot = Box::pin(snapshot::capture(
            self.ready()?,
            self.sequence,
            &format!("ws://{}/ws", self.client_address),
            &format!("ws://{}/ws", self.retired_address),
            self.previous.as_ref(),
            &self.observed,
        ))
        .await?;
        self.observed.insert(self.sequence, snapshot.archive);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let mut public = snapshot.public;
        public["endpoint"] =
            serde_json::json!(format!("http://{address}/recovery/generations/v1/check"));
        public["deliveryEndpoint"] =
            serde_json::json!(format!("http://{address}/recovery/generation-delivery/v1/check"));
        public["deliveryPathEndpoint"] = serde_json::json!(format!(
            "http://{address}/recovery/generation-delivery-path/v1/check"
        ));
        self.controls.push(snapshot.control);
        self.tasks.push(service::start(snapshot.router, listener));
        let mut reply = serde_json::json!({"kind":"snapshot","format":"breditor/native-selected-delivery-host","formatVersion":1,"request":self.sequence,"case":public,"privateOperatorToken":snapshot.operator_token});
        if let Some(offer) = &self.offer {
            reply["kind"] = serde_json::json!("activationPrepared");
            reply["activationSelection"] = offer.selection.clone();
            reply["activationEndpoint"] = serde_json::json!(offer.endpoint);
            reply["privateActivationToken"] = serde_json::json!(offer.token);
        }
        protocol::reply(&reply)
    }
}
