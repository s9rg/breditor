/** Lossless JSON-only payloads. Never let JSON.stringify silently omit an
 * undefined value, accessor, Map, function or hidden field from a native cut.
 * Native checkpoint/head/packet strings remain opaque exact strings. */
import {fail,MAX_ROOM_RECORD_CUT_JSON_BYTES} from './policy.js';
export function recordCutJson(value:unknown,maximum=MAX_ROOM_RECORD_CUT_JSON_BYTES):string{
 const active=new Set<object>();let nodes=0;
 const visit=(value:unknown,depth:number):void=>{
  if(++nodes>1000000||depth>64)throw fail('record_cut_budget');
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0))throw fail();return;}
  if(typeof value!=='object'||active.has(value))throw fail();active.add(value);
  try{if(Array.isArray(value)){if(Reflect.ownKeys(value).length!==value.length+1)throw fail();for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!('value'in d))throw fail();visit(d.value,depth+1);}}
   else{if(![null,Object.prototype].includes(Object.getPrototypeOf(value)))throw fail();for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!d?.enumerable||!('value'in d))throw fail();visit(d.value,depth+1);}}
  }finally{active.delete(value);}
 };
 visit(value,0);const text=JSON.stringify(value);if(new TextEncoder().encode(text).length>maximum)throw fail('record_cut_budget');return text;
}
export function parseRecordCutJson(text:string,maximum=MAX_ROOM_RECORD_CUT_JSON_BYTES):unknown{
 if(new TextEncoder().encode(text).length>maximum)throw fail('record_cut_budget');let value:unknown;try{value=JSON.parse(text);}catch{throw fail();}if(recordCutJson(value,maximum)!==text)throw fail('record_cut_integrity');return value;
}
