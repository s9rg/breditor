/** Per-file actual native profile with per-case isolated storage/lock fixtures. */
import{readFileSync}from'node:fs';import{pathToFileURL}from'node:url';
import{environment}from'../room-participant-inventory/environment.mjs';import{nativeProfile}from'../owned-core-cleanup/session.mjs';import{localRecoveryFixture}from'./session.mjs';
export async function localRecoveryUnitHost({api,rich,runtime,fixture}){
 const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});const profile=nativeProfile(native,3,true);let sequence=0;
 return{async fixture(extra={}){const reset=environment();try{const f=await localRecoveryFixture({api,rich,profile,root:JSON.parse(readFileSync(fixture,'utf8')),tag:'local-recovery-law-'+sequence++,...extra});return{...f,async close(){try{await f.close();}finally{reset();}}};}catch(error){reset();throw error;}},free(){profile.free();}};
}
