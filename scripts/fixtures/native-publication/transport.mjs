/** Synthetic wire declarations only; none is a Native owner or readiness proof. */
import {selection as activation} from '../native-activation/transport.mjs';
export const token='b'.repeat(64),endpoint='http://127.0.0.1:4187/recovery/native-publication/v1/publish';
export const selection=()=>({format:'breditor/native-room-publication-control',formatVersion:1,instance:'e'.repeat(64),activation:activation(),listener:'127.0.0.1:4190'});
export const joint=()=>({bytes:3072,sha256:Array(32).fill(17)});
export const options=(extra={})=>({endpoint,expected:selection(),principal:'operator',getToken:()=>token,checkAuthority(){},...extra});
export const receipt=request=>JSON.stringify({format:'breditor/native-room-publication-receipt',formatVersion:1,selection:request.selection,joint:request.joint,scope:'actual-held-native-service-and-bound-listener; joint-association-only'});
export const json=(text,status=200,headers={})=>new Response(text,{status,headers:{'content-type':'application/json',...headers}});
export const code=value=>error=>error?.code===value&&!String(error).includes('TEST_PRIVATE');
export async function using(fetcher,work){const original=globalThis.fetch;globalThis.fetch=fetcher;try{return await work();}finally{globalThis.fetch=original;}}
