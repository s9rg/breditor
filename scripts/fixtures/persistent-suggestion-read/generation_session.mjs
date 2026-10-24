/** Actual local/relay/retained generation factories; every queue is offline. */
import {environment} from '../room-participant-inventory/environment.mjs';
import {cleanupSession} from '../owned-core-cleanup/session.mjs';
import {captureSegmentedPersistentRecords} from '../../../packages/breditor-collaboration/dist/persistence/segmented_session.js';
import {captureRelayGenerationRecords} from '../../../packages/breditor-collaboration/dist/segmented_relay/session.js';
export async function generationRecordFixture({api,profile,tag,family='retained',scope=2,mask=0,seed,language=3}){
 const reset=environment(),selected=cleanupSession(api,profile,{family,language,scope,mask,database:tag});let source,queue,revisions,versions,transport;
 try{
  if(seed){const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value,document={...JSON.parse(selected.document),root:canonical(seed)};selected.options.create=()=>profile.create(JSON.stringify(document),'101');}
  if(family==='retained'){
   const endpoint='ws://127.0.0.1:1/ws',principal='alice',writer='101',identity={endpoint,principal,room:'room',documentWriter:writer,effectWriter:'900',writerTransport:'atomic-v2',binding:'a'.repeat(64)},binding={document:{endpoint,principal,room:'room',writer,writerTransport:'atomic-v2'},review:{endpoint,principal,room:'room',actor:'comments',documentWriter:writer,binding:'b'.repeat(64),writerTransport:'atomic-v2'}},retained={suggestions:{identity,ownedHistory:mask&2?'reviewed-v1':null},revisions:{binding:'d'.repeat(64)},versions:{endpoint,principal,room:'room',documentWriter:writer,binding:'c'.repeat(64),writerTransport:'atomic-v2'}};
   source=await api.SharedSegmentedRelaySession.openRetained({...selected.options,binding,retained});queue=await source.openSuggestionQueue();transport=api.createSharedSegmentedRelaySync(source,{identity:{...binding.document,credential:'e'.repeat(64)},getToken:()=>{throw Error('Read tests cannot get network tokens');},autoConnect:false,suggestions:{binding:identity.binding,effectWriter:identity.effectWriter},suggestionRevisions:retained.revisions});revisions=await source.openSuggestionRevisions({transport});versions=await source.openVersionCatalog({getToken:()=>{throw Error('Read tests cannot get network tokens');}});
  }else source=await selected.open();
  return{tag,source,queue,revisions,versions,selected,capture:(authority,signal)=>family==='relay'||family==='retained'?captureRelayGenerationRecords(source,authority,signal):captureSegmentedPersistentRecords(source,authority,signal),async close(){transport?.dispose();await source.discardAndClose();reset();}};
 }catch(error){transport?.dispose();await source?.discardAndClose();reset();throw error;}
}
export const generationRecordDraft=text=>({scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text}}]}});
