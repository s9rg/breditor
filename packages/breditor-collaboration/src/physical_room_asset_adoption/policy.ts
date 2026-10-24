/** Closed own-data inputs, fixed budgets and separate redacted staging errors. */
import {physicalCatalogDatabase,physicalCatalogName} from '../physical_room_catalog/policy.js';
export const MAX_ROOM_ASSET_BASE_BYTES=1024*1024*1024;
export const MAX_ROOM_ASSET_PLAN_BYTES=16*1024*1024;
export class RoomAssetAdoptionError extends Error {
 constructor(readonly code:'asset_adoption_policy'|'asset_adoption_budget'|'asset_adoption_diverged'|'asset_adoption_exists'|'asset_adoption_missing'|'asset_adoption_busy'|'asset_adoption_closed'|'asset_adoption_aborted'|'asset_adoption_storage'){super('Retain every selected base and bind it to the actual held room without overwriting original participants');this.name='RoomAssetAdoptionError';}
}
export const fail=(code:RoomAssetAdoptionError['code']='asset_adoption_storage')=>new RoomAssetAdoptionError(code);
export const database=(v:unknown):string=>{try{return physicalCatalogDatabase(v);}catch{throw fail('asset_adoption_policy');}};
export const identifier=(v:unknown):string=>{try{return physicalCatalogName(v);}catch{throw fail('asset_adoption_policy');}};
export const hash=(v:unknown):string=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))throw fail('asset_adoption_diverged');return v;};
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail('asset_adoption_policy');const keys=Reflect.ownKeys(value),out:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
 if(required.some(k=>!Object.hasOwn(value,k))||keys.some(k=>typeof k!=='string'||!required.includes(k)&&!optional.includes(k)))throw fail('asset_adoption_policy');
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(typeof k!=='string'||!d||!d.enumerable||!('value'in d))throw fail('asset_adoption_policy');out[k]=d.value;}return out;
}
export function rows<T>(value:unknown,read:(row:unknown)=>T):T[]{
 if(!Array.isArray(value))throw fail('asset_adoption_policy');const n=Object.getOwnPropertyDescriptor(value,'length')?.value;if(!Number.isSafeInteger(n)||n<0||n>1024)throw fail('asset_adoption_budget');const result:T[]=[];
 for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!d.enumerable||!('value'in d))throw fail('asset_adoption_policy');result.push(read(d.value));}return result;
}
