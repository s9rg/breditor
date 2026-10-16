import type {InterchangeErrorCode,InterchangeLoss,InterchangeLossCode} from "./types.js";
export const limits=Object.freeze({sourceBytes:1024*1024,parsedNodes:32768,treeMutations:131200,depth:48,outputNodes:16384,outputBytes:1024*1024,styleBytes:8192,rows:256,columns:128,cells:4096,markdownTokens:32768});
export class ConversionFailure extends Error {constructor(readonly code:InterchangeErrorCode){super(code);}}
export function fail(code:InterchangeErrorCode):never{throw new ConversionFailure(code);}
/** Reject ill-formed UTF-16 rather than letting TextEncoder replace its source scalars. */
export function bytes(source:string):number {
  let count=0;
  for(let i=0;i<source.length;i++){
    const u=source.charCodeAt(i);
    if(u>=0xd800&&u<=0xdbff){const next=source.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))fail("invalid-source");count+=4;}
    else if(u>=0xdc00&&u<=0xdfff)fail("invalid-source");
    else count+=u<0x80?1:u<0x800?2:3;
  }
  return count;
}
export function sourceWithinBudget(source:unknown):asserts source is string {
  if(typeof source!=="string"||source.includes("\u0000"))fail("invalid-source");
  if(source.length>limits.sourceBytes||bytes(source)>limits.sourceBytes)fail("resource-limit");
}
export class Budget {
  #nodes=0;#ids=0;#losses=new Map<InterchangeLossCode,number>();
  node():void{if(++this.#nodes>limits.outputNodes)fail("resource-limit");}
  id():string{return `external-${++this.#ids}`;}
  loss(code:InterchangeLossCode,count=1):void{this.#losses.set(code,(this.#losses.get(code)??0)+count);}
  losses():readonly InterchangeLoss[]{return Object.freeze([...this.#losses].sort(([a],[b])=>a<b?-1:1).map(([code,count])=>Object.freeze({code,count,effect:code==="markdown-feature"||code==="html-repaired"?"compatibility":"loss"})));}
}
