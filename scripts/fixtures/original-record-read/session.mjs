/** Real original sessions/stores; no transport or token is available to a read. */
import {environment} from '../room-participant-inventory/environment.mjs';
import {cleanupSession} from '../owned-core-cleanup/session.mjs';
import {originalQueueFixture} from '../persistent-suggestion-read/session.mjs';
import {offlineTransport} from '../room-participant-inventory/participant.mjs';
export async function originalNativeFixture({api,profile,tag,language=3,scope=0,mask=0}){
 const reset=environment(),selected=cleanupSession(api,profile,{family:'original',language,scope,mask,database:tag});let source;
 try{source=await selected.open();return{tag,source,selected,async close(){await source.discardAndClose();reset();}};}catch(error){await source?.discardAndClose();reset();throw error;}
}
export async function originalStoresFixture({api,profile,seed,tag,scope=2,mask=0,revisions=true,versions=true,storage}){
 const f=await originalQueueFixture({api,profile,seed,tag,scope,mask}),counts={networkCalls:0},transport=offlineTransport(counts);let outbox,catalog;
 try{
  if(revisions)outbox=await api.SharedSuggestionRevisions.open({database:tag+'-revisions',binding:'c'.repeat(64),queue:f.queue,storage:storage??f.source,transport,autoStart:false});
  if(versions)catalog=await api.SharedDocumentVersions.open({database:tag+'-versions',identity:{endpoint:f.identity.endpoint,room:'room',principal:'alice',documentWriter:'101',binding:'d'.repeat(64),writerTransport:'atomic-v2'},storage:storage??f.source,getToken:()=>{counts.networkCalls++;throw Error('Record reads must request no token');},autoConnect:false});
  return{...f,outbox,versions:catalog,transport,counts,async close(){await outbox?.discardAndClose();await catalog?.discardAndClose();await f.close();}};
 }catch(error){await outbox?.discardAndClose();await catalog?.discardAndClose();await f.close();throw error;}
}
export const imageDraft=asset=>({scope:'commands',edit:{kind:'commands',data:[{kind:'replace_image',data:{block:'image-block',asset,generation:'retained-packet'}}]}});
