//! Select only an actually observed complete predecessor; never open a caller path or DTO.
use super::{Result, protocol, setup::Ready};
use breditor_collab_relay::ServerLogGenerationRoomBackup;
use std::{collections::BTreeMap, sync::Arc};
pub(super) type Previous = (u64, Arc<ServerLogGenerationRoomBackup>);
pub(super) async fn read(
    ready: &Ready,
    input: &mut tokio::sync::mpsc::Receiver<Result<protocol::Request>>,
    observed: &BTreeMap<u64, Arc<ServerLogGenerationRoomBackup>>,
    sequence: u64,
    inspections: &mut Vec<super::inspection::Inspection>,
) -> Result<Option<(u64, Option<Previous>, bool)>> {
    let next = loop {
        tokio::select! {
         result=tokio::signal::ctrl_c()=>{result?;return Ok(None);}
         command=input.recv()=>match command {
          None=>return Ok(None),Some(Err(error))=>return Err(error),
          Some(Ok(protocol::Request::Snapshot{request}))=>break(request,None,false),
          Some(Ok(protocol::Request::Handover{request}))=>break(request,None,true),
          Some(Ok(protocol::Request::SnapshotAfter{request,previous}))=>{
           let archive=observed.get(&previous).ok_or("select an actual complete observed predecessor")?;
           break(request,Some((previous,archive.clone())),false);
          }
          Some(Ok(protocol::Request::Inspect{request,source}))=>{
           let archive=observed.get(&source).ok_or("select actual observed inspection source")?;
           let(inspection,reply)=Box::pin(super::inspection::prepare(ready,request,source,archive)).await?;
           inspections.push(inspection);protocol::reply(&reply)?;
          }
          Some(Ok(protocol::Request::Credentials{request,writer,actor,retired}))=>{
           protocol::reply(&protocol::credentials(ready,request,&writer,&actor,retired)?)?;
          }
         }
        }
    };
    if next.0 <= sequence {
        return Err("private snapshot sequence must increase".into());
    }
    Ok(Some(next))
}
