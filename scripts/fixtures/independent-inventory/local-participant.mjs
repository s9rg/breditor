/** Genuine local-only histories. No delivery identity, receipt or outbox is
 * invented; this fixture selects a native-only recovery from an empty-outbox seed. */
import assert from 'node:assert/strict';
import {independentParticipant} from './independent-participant.mjs';
export async function localParticipant(input){
 const {api,tag}=input,h=await independentParticipant(input);let session,backup,source;
 try{
  const delivered=h.session.exportRecovery();
  for(const kind of ['suggestions','revisions'])if(delivered.retained[kind])assert.equal(delivered.retained[kind].retained.length,0);
  if(delivered.retained.versions){assert.equal(delivered.retained.versions.catalog,null);assert.deepEqual(delivered.retained.versions.packets,[]);}
  const recovery=delivered.source;h.source.dispose();await h.session.close();
  const {binding:_binding,retained:_retained,...nativeOptions}=h.options,options={...nativeOptions,database:tag+'-local-source'};
  session=await api.SharedIndependentHistoryPersistentSession.restoreRecovery(options,recovery,'host-reacquired');
  assert.deepEqual(session.exportRecovery(),recovery);
  await session.retainVersion(session.core.captureVersion('Local retained native version',h.client.principal,'11'));
  if(input.prepareLocalInput)await input.prepareLocalInput(session,options);
  const result=await api.captureSharedIndependentParticipant({participant:tag,principal:h.client.principal,source:{session},assets:h.uploads,checkAuthority(){}});assert.equal(result.kind,'ready');backup=result.backup;source=api.captureSharedIndependentSource({session});
  const value={...h,options,session,backup,source,async close(){value.source?.dispose();value.backup.dispose();await value.session.discardAndClose();await h.close();}};return value;
 }catch(error){source?.dispose();backup?.dispose();await session?.discardAndClose();await h.close();throw error;}
}
