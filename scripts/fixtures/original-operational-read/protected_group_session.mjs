/** Two real held writers in one storage/lock host, never detached fake owners. */
import {originalOperationalFixture} from './session.mjs';
import {generationOperationalFixture} from './generation_session.mjs';
import {environment} from '../room-participant-inventory/environment.mjs';
export async function protectedHistoryGroupFixture({api,rich,profile,tag,oldSignals=[]}){
 const reset=environment(),members=[];let source;
 try{members.push(await originalOperationalFixture({api,rich,profile,tag:tag+'-original',writer:'101',actor:tag+'-original',sharedHost:true,retained:true,oldSignal:oldSignals[0],observeReady:ready=>{source=ready.session;}}));members.push(await generationOperationalFixture({api,rich,profile,tag:tag+'-generation',writer:'202',actor:tag+'-generation',sharedHost:true,oldSignal:oldSignals[1]}));const rows=[{id:'original',family:'original',operation:members[0].parent,read:{restore:s=>profile.restore_document('room',s)}},{id:'generation',family:'generation',operation:members[1].parent,read:{restoreSegmented:s=>profile.restore_segmented('room',s)}}];return{members,rows,source,async close(){for(const m of members.toReversed())await m.close();reset();}};}catch(error){for(const m of members.toReversed())await m.close();reset();throw error;}
}
