//! Commands select only actual observed Native cuts; restart is private fixture IPC.
use super::{Result, protocol, setup::Ready};
use breditor_collab_relay::ServerLogGenerationRoomBackup;
use std::{collections::BTreeMap, sync::Arc};
pub(super) type Previous = (u64, Arc<ServerLogGenerationRoomBackup>);
pub(super) enum Action {
    Snapshot {
        request: u64,
        previous: Option<Previous>,
    },
    PrepareActivation {
        request: u64,
        source: Box<breditor_collab_relay::server::ServerLogGenerationRecoveryStateIdentity>,
    },
    PrepareJointActivation {
        request: u64,
        source: Box<breditor_collab_relay::server::ServerLogGenerationRecoveryStateIdentity>,
    },
    ObservePublication {
        request: u64,
    },
}
pub(super) async fn read(
    ready: &Ready,
    input: &mut tokio::sync::mpsc::Receiver<Result<protocol::Request>>,
    observed: &BTreeMap<u64, Arc<ServerLogGenerationRoomBackup>>,
    sequence: u64,
    inspections: &mut Vec<super::inspection::Inspection>,
) -> Result<Option<Action>> {
    let next = loop {
        tokio::select! {
            result=tokio::signal::ctrl_c()=>{result?;return Ok(None);}
            command=input.recv()=>match command {
                None=>return Ok(None),Some(Err(error))=>return Err(error),
                Some(Ok(protocol::Request::Snapshot{request}))=>break Action::Snapshot{request,previous:None},
                Some(Ok(protocol::Request::SnapshotAfter{request,previous}))=>{
                    let archive=observed.get(&previous).ok_or("select actual complete predecessor")?;
                    break Action::Snapshot{request,previous:Some((previous,archive.clone()))};
                }
                Some(Ok(protocol::Request::PrepareActivation{request,source}))=>break Action::PrepareActivation{request,source},
                Some(Ok(protocol::Request::PrepareJointActivation{request,source}))=>break Action::PrepareJointActivation{request,source},
                Some(Ok(protocol::Request::ObservePublication{request}))=>break Action::ObservePublication{request},
                Some(Ok(protocol::Request::Inspect{request,source}))=>{
                    let archive=observed.get(&source).ok_or("select actual observed inspection source")?;
                    let (inspection,reply)=Box::pin(super::inspection::prepare(ready,request,source,archive)).await?;
                    inspections.push(inspection);protocol::reply(&reply)?;
                }
                Some(Ok(protocol::Request::Credentials{request,writer,actor,retired}))=>{
                    protocol::reply(&protocol::credentials(ready,request,&writer,&actor,retired)?)?;
                }
            }
        }
    };
    let request = match &next {
        Action::Snapshot { request, .. }
        | Action::PrepareActivation { request, .. }
        | Action::PrepareJointActivation { request, .. }
        | Action::ObservePublication { request } => *request,
    };
    if request <= sequence {
        return Err("private command sequence must increase".into());
    }
    Ok(Some(next))
}
