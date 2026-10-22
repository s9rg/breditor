/** Actual complete local recovery -> private operational parent -> real parts.
 * No fabricated ready record, delivery companion or source capture is used. */
import {environment} from '../room-participant-inventory/environment.mjs';
import {localRecoveryFixture,localRecoveryOptions} from '../independent-recovery/session.mjs';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {nativeProfile} from '../owned-core-cleanup/session.mjs';
export async function localParticipantUnitHost({api,rich,Participant,runtime,fixture}){
 const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});const profile=nativeProfile(native,3,true),root=JSON.parse(readFileSync(fixture,'utf8'));let sequence=0;
 return{profile,fixture:extra=>localParticipantFixture({api,rich,Participant,profile,root,tag:'local-participant-unit-'+sequence++,...extra}),free(){profile.free();}};
}
export async function localParticipantFixture({api,rich,Participant,profile,root,tag,...extra}){
 const restore=environment(),attempts=[],readyOwners=[],parents=[],parts=[];let f,oldAllowed=true,allowed=true;
 try{
  f=await localRecoveryFixture({api,rich,profile,root,tag,...extra});const checkAuthority=()=>{if(!allowed)throw Error('New operation grant ended');},oldCheck=()=>{if(!oldAllowed)throw Error('Old recovery grant ended');},recovery=localRecoveryOptions(f.options,f.backup,f.tag,{checkAuthority:oldCheck}),options={database:tag+'-parent',journalDatabase:tag+'-journal',sourceDatabase:tag+'-live',recovery:{...recovery,checkAuthority},session:{...f.options,database:tag+'-live'},writerRecovery:'host-reacquired'};
  const recover=async()=>{const attempt=await api.SharedIndependentParticipantRecovery.begin({...recovery,backup:f.backup});attempts.push(attempt);const ready=await attempt.finish();readyOwners.push(ready);return ready;};
  const begin=async(ready,method='begin',overrides={})=>{const p=await Participant[method]({...options,...overrides,recovered:ready});parents.push(p);return p;},resume=async(overrides={})=>{const p=await Participant.resume({...options,...overrides});parents.push(p);return p;},take=async p=>{const value=await p.intoParts();parts.push(value);return value;};
  return{...f,recoveryOptions:recovery,options,recover,begin,resume,take,setAllowed(value){allowed=value;},setOldAllowed(value){oldAllowed=value;},async close(){allowed=true;oldAllowed=true;for(const value of parts.toReversed()){await value.source.session.discardAndClose();value.uploads.close();}for(const p of parents.toReversed())await p.discardAndClose();for(const ready of readyOwners.toReversed())await ready.discardAndClose();for(const attempt of attempts.toReversed())await attempt.close();await f.close();restore();}};
 }catch(error){allowed=true;oldAllowed=true;for(const value of parts.toReversed()){await value.source.session.discardAndClose();value.uploads.close();}for(const p of parents.toReversed())await p.discardAndClose();for(const ready of readyOwners.toReversed())await ready.discardAndClose();for(const attempt of attempts.toReversed())await attempt.close();await f?.close();restore();throw error;}
}
