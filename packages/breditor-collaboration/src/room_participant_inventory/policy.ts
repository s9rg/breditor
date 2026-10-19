export const MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES=4*1024*1024;
export class SharedRoomParticipantInventoryError extends Error {
 constructor(readonly code:"inventory_format"|"inventory_integrity"|"inventory_budget"|"inventory_aborted"|"inventory_closed"|"inventory_source"|"inventory_fork"|"inventory_duplicate"|"inventory_crypto",message:string){super(message);this.name="SharedRoomParticipantInventoryError";}
}
export const invalid=()=>new SharedRoomParticipantInventoryError("inventory_format","Expected the exact closed native participant inventory and independent selection");
export function inventorySignal(signal?:AbortSignal):void{if(signal?.aborted)throw new SharedRoomParticipantInventoryError("inventory_aborted","Participant inventory work was cancelled");}
export function frozen<T>(value:T):T{if(value!==null&&typeof value==="object"){for(const item of Object.values(value))frozen(item);Object.freeze(value);}return value;}
export function object(value:unknown,keys:string):Record<string,unknown>{if(value===null||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!==keys)throw invalid();return value as Record<string,unknown>;}
export function name(value:unknown,max:number):string{if(typeof value!=="string"||!value||/[\u0000-\u001f\u007f-\u009f]/u.test(value))throw invalid();const bytes=new TextEncoder().encode(value);if(bytes.length>max||new TextDecoder("utf-8",{fatal:true}).decode(bytes)!==value)throw invalid();return value;}
export function choice<T extends string|number|boolean|null>(value:unknown,choices:readonly T[]):T{if(!choices.includes(value as T))throw invalid();return value as T;}
export function hex(value:unknown,prefix=false):string{if(typeof value!=="string"||!(prefix?/^sha256:[a-f0-9]{64}$/:/^[a-f0-9]{64}$/).test(value))throw invalid();return value;}
export function digestBytes(value:unknown):readonly number[]{if(!Array.isArray(value)||value.length!==32||[...value].some(v=>!Number.isInteger(v)||v<0||v>255))throw invalid();return Object.freeze([...value] as number[]);}
export function decimal(value:unknown,max=18446744073709551615n):string{if(typeof value!=="string"||value.length>20||!/^(0|[1-9][0-9]*)$/.test(value)||BigInt(value)>max)throw invalid();return value;}
export function writer(value:unknown):string{const id=decimal(value);if(id==="0"||id==="18446744073709551615")throw invalid();return id;}
export function actor(value:unknown):string{if(typeof value!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))throw invalid();return value;}
export function list<T>(value:unknown,max:number,read:(value:unknown)=>T):T[]{if(!Array.isArray(value)||value.length>max)throw invalid();return value.map(read);}
/** Rust String ordering is lexical UTF-8, not JavaScript's UTF-16 ordering. */
export function ordered<T>(rows:readonly T[],key:(row:T)=>string):void{let previous:Uint8Array|undefined;for(const row of rows){const current=new TextEncoder().encode(key(row));if(previous){let cmp=0;for(let i=0;i<Math.min(previous.length,current.length);i++){cmp=previous[i]!-current[i]!;if(cmp)break;}if((cmp||previous.length-current.length)>=0)throw invalid();}previous=current;}}
