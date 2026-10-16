import {bytes,fail} from "./budget.js";
/** Same closed portable scheme set as the existing safeLinkV1 renderer; no browser repair/credentials. */
export function safeUrl(value:string):string|null {
  if(value.length>2048||bytes(value)>2048||!/^https?:\/\/[^/?#]+/i.test(value)||/[\\\p{White_Space}\p{Cc}]/u.test(value))return null;
  const authority=value.slice(value.indexOf("://")+3).split(/[/?#]/,1)[0]??"";
  if(!authority||/[^\x21-\x7e]|[%@]/.test(authority))return null;
  try{const url=new URL(value);return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password&&url.hostname&&bytes(url.href)<=2048?url.href:null;}catch{return null;}
}
export function escapeText(value:string):string{if(value.includes("\u0000"))fail("unsupported-content");return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\r/g,"&#13;");}
export function escapeAttribute(value:string):string{return escapeText(value).replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
