/** All five actual operational families, with independently ended job grants.
 * Every parent is constructed through its real recovery/input implementation. */
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as LocalParent,reserveFreshIndependentLocalHistoryRead} from '../../../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {OperationalIndependentDeliveryParticipant as DeliveryParent,reserveFreshIndependentDeliveryHistoryRead} from '../../../packages/breditor-collaboration/dist/independent_operation/participant.js';
import {RestoredOperationParticipant as GraphParent,reserveFreshRestoredDeliveryHistoryRead} from '../../../packages/breditor-collaboration/dist/restored_participant/participant.js';
import {OperationalRestoredLocalParticipant as SnapshotParent,reserveFreshSnapshotLocalHistoryRead} from '../../../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import {OperationalFlatLocalParticipant as FlatParent,reserveFreshFlatLocalHistoryRead} from '../../../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import {captureIndependentOperationBackup} from '../../../packages/breditor-collaboration/dist/independent_operation/portable_capture.js';
import {captureRestoredGraph} from '../../../packages/breditor-collaboration/dist/restored_graph/capture.js';
import {captureLocalOperationBackup} from '../../../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {portableFixture} from '../independent-operation/portable.mjs';
import {localParticipantFixture} from '../independent-local-operation/participant.mjs';
import {readerRuntimeGraphFixture} from '../restored-graph/reader-runtime.mjs';
import {restoredLocalFixture} from '../restored-local-operation/session.mjs';
import {flatLocalFixture} from '../flat-local-operation/session.mjs';
import {environment} from '../room-participant-inventory/environment.mjs';
export const freshDeliveryFamilies=['independent-local','independent-delivery','restored-graph','local-operation-snapshot','local-operation-flat'];
export const freshDeliveryReserve={
 'independent-local':reserveFreshIndependentLocalHistoryRead,'independent-delivery':reserveFreshIndependentDeliveryHistoryRead,'restored-graph':reserveFreshRestoredDeliveryHistoryRead,'local-operation-snapshot':reserveFreshSnapshotLocalHistoryRead,'local-operation-flat':reserveFreshFlatLocalHistoryRead
};
export async function freshDeliveryFixture({profile,seed,tag,family,selection={},kind='lineage-v2'}){
 const reset=environment(),oldAbort=new AbortController();let f,owner,parts,allowed=true,calls=0,options,readOptions,take;
 const grant=()=>{calls++;if(!allowed)throw Error('Old operational job ended');};
 try{
  const localHost={fixture:extra=>localParticipantFixture({api,rich,Participant:LocalParent,profile,root:seed,tag,...selection,...extra})};
  if(family==='independent-local'){f=await localHost.fixture({});owner=await f.begin(await f.recover(),'begin',{recovery:{...f.options.recovery,checkAuthority:grant,signal:oldAbort.signal}});options=f.options;readOptions={session:f.options.recovery.session};take=()=>f.take(owner);}
  else if(family==='independent-delivery'){f=await portableFixture({api,rich,Participant:DeliveryParent,profile,seed,tag,selection,holdParent:true});owner=f.owner;options=f.options;readOptions={session:f.readOptions.session};take=()=>f.take();}
  else if(family==='restored-graph'){f=await readerRuntimeGraphFixture({api,rich,OldParticipant:DeliveryParent,Participant:GraphParent,captureOld:captureIndependentOperationBackup,capture:captureRestoredGraph,profile,seed,tag,selection},kind);options={...f.options,checkAuthority:grant,signal:oldAbort.signal};owner=await GraphParent.begin(f.input.file(),options);await owner.finish();readOptions={session:f.readOptions.session};}
  else{f=family==='local-operation-snapshot'?await restoredLocalFixture(localHost,captureLocalOperationBackup):await flatLocalFixture(localHost);const Parent=family==='local-operation-snapshot'?SnapshotParent:FlatParent;options={...f.options,checkAuthority:grant,signal:oldAbort.signal,cohort:{parentDatabase:tag+'-fresh-parent',uploadsDatabase:tag+'-fresh-uploads'}};owner=await Parent.begin(f.file,options);readOptions={session:(family==='local-operation-snapshot'?f.value:f.original.value).readOptions.session};}
  return{family,owner,options,readOptions,oldAbort,get oldCalls(){return calls;},endOldJob({abort=false}={}){allowed=false;f.setAllowed?.(false);f.setOldAllowed?.(false);f.setWrite?.(false);if(abort){oldAbort.abort();f.writeAbort?.abort();}},restoreOldGrant(){allowed=true;f.setAllowed?.(true);f.setOldAllowed?.(true);f.setWrite?.(true);},async take(){allowed=true;f.setAllowed?.(true);f.setOldAllowed?.(true);f.setWrite?.(true);parts=take?await take():await owner.intoParts();return parts;},async close(){allowed=true;f.setAllowed?.(true);f.setOldAllowed?.(true);f.setWrite?.(true);await parts?.source.session.discardAndClose();parts?.uploads.close();await owner?.discardAndClose();await f.close();reset();}};
 }catch(error){allowed=true;f?.setAllowed?.(true);f?.setOldAllowed?.(true);f?.setWrite?.(true);await parts?.source.session.discardAndClose();parts?.uploads.close();await owner?.discardAndClose();await f?.close();reset();throw error;}
}
