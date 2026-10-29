/** Detached original owned-decision DATA for guarded native ingress.
 * No accessor/toJSON runs after native owner/proof lookup. Native validation
 * remains responsible for packet semantics, binding, counters and digests. */
import {nativeRecoveryFailure as fail} from './policy.js';
import {nativeRecoveryFrame} from './input.js';
function fields(value:unknown,names:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail();
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 if(keys.length!==names.length||keys.some(key=>typeof key!=='string'||!names.includes(key)))throw fail();
 const out:Record<string,unknown>={};
 for(const name of names){const field=descriptors[name];if(!field||!('value'in field))throw fail();out[name]=field.value;}
 return out;
}
function strings(value:Record<string,unknown>):Record<string,string>{
 const out:Record<string,string>={};for(const [name,item]of Object.entries(value)){if(typeof item!=='string')throw fail();out[name]=item;}return out;
}
/** Own fields only; descriptor observation occurs within the real import guard.
 * Detached data conveys no server finality or accepting-writer authorization. */
export function nativeRecoverySuggestionAdoption(packet:unknown,acceptance:unknown):Readonly<{packet:string;acceptanceJson:string}>{
 const input=nativeRecoveryFrame(packet),record=fields(acceptance,['binding','sequence','principal','acceptingWriter','effect']);
 const effect=fields(record['effect'],['suggestionId','writerGroup','semanticFrom']),writerGroup=strings(fields(effect['writerGroup'],['writer','from','through','prefixDigest','groupDigest']));
 const {effect:_effect,...head}=record,{writerGroup:_group,...tail}=effect;
 const acceptanceJson=JSON.stringify({...strings(head),effect:{...strings(tail),writerGroup}});
 if(new TextEncoder().encode(acceptanceJson).length>64*1024)throw fail();
 return Object.freeze({packet:input.value,acceptanceJson});
}
