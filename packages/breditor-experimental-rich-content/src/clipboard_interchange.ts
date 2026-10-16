/** Optional structural port only. Default editor imports never load a foreign parser. */
import type {RichClipboardTextProjection,RichClipboardTransfer} from "./core.js";
export interface RichInterchangeNotice {readonly code:string;readonly count:number;readonly effect:"loss"|"compatibility"}
export type RichInterchangeResult<T>=Readonly<{ok:true;value:T;losses:readonly RichInterchangeNotice[]}>|Readonly<{ok:false;error:string;losses:readonly RichInterchangeNotice[]}>;
export interface RichClipboardInterchange {
 importHtml(source:string,options?:{readonly kind?:"auto"|"flow"|"grid"}):RichInterchangeResult<RichClipboardTransfer>;
 importMarkdown(source:string,options?:{readonly kind?:"auto"|"flow"|"grid"}):RichInterchangeResult<RichClipboardTransfer>;
 exportHtml(clipboardJson:string):RichInterchangeResult<string>;
 exportMarkdown(clipboardJson:string):RichInterchangeResult<string>;
}
export interface RichInterchangeFormatReport {readonly kind:"html"|"markdown";readonly losses:readonly RichInterchangeNotice[]}
export interface RichClipboardInterchangeReport {
 readonly format:"breditor/clipboard-interchange-report";readonly formatVersion:1;
 readonly operation:"copy"|"cut"|"paste";readonly sourceRevision:string;
 readonly formats:readonly RichInterchangeFormatReport[];
 readonly destination?:RichClipboardTextProjection;
}
export interface ClipboardInput {readonly fragment:string;readonly plain:string;readonly formats:readonly RichInterchangeFormatReport[]}
export interface ClipboardExport {readonly html:string;readonly markdown:string;readonly formats:readonly RichInterchangeFormatReport[]}
export const RICH_CLIPBOARD_MIME="application/x-breditor-rich+json";
const maximum=1024*1024;
/** Snapshot the explicit callback port before mounting; never infer it from available HTML. */
export function requireClipboardInterchange(value:RichClipboardInterchange|undefined,core:{supportsClipboardInterchange?():boolean}):RichClipboardInterchange|undefined {
 if(value===undefined)return undefined;
 if(core.supportsClipboardInterchange?.()!==true)throw Error("Use matching native clipboard interchange");
 if(!value||[value.importHtml,value.importMarkdown,value.exportHtml,value.exportMarkdown].some(v=>typeof v!=="function"))throw new TypeError("Expected the complete explicit clipboard interchange adapter");
 return Object.freeze({importHtml:value.importHtml.bind(value),importMarkdown:value.importMarkdown.bind(value),exportHtml:value.exportHtml.bind(value),exportMarkdown:value.exportMarkdown.bind(value)});
}
function string(value:unknown):string {if(typeof value!=="string"||value.length>maximum||new TextEncoder().encode(value).byteLength>maximum)throw Error("Clipboard interchange exceeded its string budget");return value;}
function notices(value:readonly RichInterchangeNotice[]):readonly RichInterchangeNotice[] {
 if(!Array.isArray(value)||value.length>64)throw Error("Clipboard interchange report was invalid");
 return Object.freeze(value.map(n=>{if(!n||typeof n.code!=="string"||!/^[a-z][a-z0-9-]{0,63}$/.test(n.code)||!Number.isSafeInteger(n.count)||n.count<1||n.count>4*maximum||!['loss','compatibility'].includes(n.effect))throw Error("Clipboard interchange report was invalid");return Object.freeze({code:n.code,count:n.count,effect:n.effect});}));
}
function result<T>(value:RichInterchangeResult<T>,kind:string):Readonly<{value:T;losses:readonly RichInterchangeNotice[]}>{
 if(value?.ok!==true)throw Error(`Clipboard ${kind} conversion was rejected`);
 return{value:value.value,losses:notices(value.losses)};
}
/** Event-scoped data is detached before it can enter an editor queue. No rich failure retries as plain. */
export function readClipboardInput(data:DataTransfer,adapter:RichClipboardInterchange|undefined,grid:boolean):ClipboardInput {
 const fragment=data.getData(RICH_CLIPBOARD_MIME);
 if(fragment||adapter&&data.types.includes(RICH_CLIPBOARD_MIME)){if(!fragment)throw Error("Clipboard rich content was empty");return{fragment,plain:"",formats:[]};}
 if(adapter){
  const kind=data.types.includes("text/html")?"html":data.types.includes("text/markdown")?"markdown":undefined;
  if(kind){const source=string(data.getData(kind==="html"?"text/html":"text/markdown"));if(!source)throw Error("Clipboard foreign content was empty");
   const converted=result(adapter[kind==="html"?"importHtml":"importMarkdown"](source,{kind:grid?"grid":"auto"}),kind),transfer=converted.value;
   if(!transfer||transfer.format!=="breditor/rich-clipboard-transfer"||transfer.formatVersion!==1||!['text','flow','grid'].includes(transfer.kind))throw Error("Clipboard interchange transfer was invalid");
   return{fragment:string(transfer.structuredJson),plain:string(transfer.plainText),formats:Object.freeze([Object.freeze({kind,losses:converted.losses})])};
  }
 }
 return{fragment:"",plain:data.getData("text/plain"),formats:[]};
}
/** Prepare both outputs before touching the system clipboard or considering a Cut. */
export function exportClipboard(clipboardJson:string,adapter:RichClipboardInterchange|undefined):ClipboardExport|undefined {
 if(!adapter)return undefined;
 const html=result(adapter.exportHtml(clipboardJson),"HTML"),markdown=result(adapter.exportMarkdown(clipboardJson),"Markdown");
 return{html:string(html.value),markdown:string(markdown.value),formats:Object.freeze([Object.freeze({kind:"html",losses:html.losses}),Object.freeze({kind:"markdown",losses:markdown.losses})])};
}
/** An opted-in Cut requires every requested format to be retained byte for byte. */
export function writeClipboard(data:DataTransfer,plain:string,rich:string,extra:ClipboardExport|undefined,requireRich:boolean):void {
 const values:[string,string][]=[["text/plain",plain],[RICH_CLIPBOARD_MIME,rich],...(extra?[["text/html",extra.html],["text/markdown",extra.markdown]] as [string,string][]:[])];
 for(const [kind,value]of values)data.setData(kind,value);
 for(const [kind,value]of values){if(kind===RICH_CLIPBOARD_MIME&&!requireRich&&!extra)continue;if(!data.types.includes(kind)||data.getData(kind)!==value)throw Error(!extra&&kind===RICH_CLIPBOARD_MIME?"Clipboard did not retain the complete rich document; content was not cut":!extra?"Clipboard did not retain the supplied text; content was not cut":"Clipboard did not retain the requested content; nothing was cut");}
}
export function clipboardInterchangeReport(operation:RichClipboardInterchangeReport["operation"],sourceRevision:string,formats:readonly RichInterchangeFormatReport[],destination?:RichClipboardTextProjection):RichClipboardInterchangeReport {
 return Object.freeze({format:"breditor/clipboard-interchange-report",formatVersion:1,operation,sourceRevision,formats,...(destination?{destination:Object.freeze({...destination,losses:Object.freeze([...destination.losses])})}:{})});
}
/** Plain text only, never imported markup. Empty notices leave the ordinary revision status intact. */
export function clipboardInterchangeStatus(report:RichClipboardInterchangeReport):string|null {
 const messages=report.formats.filter(f=>f.losses.length).map(f=>`${f.kind}: ${f.losses.map(n=>`${n.code}${n.count>1?` ×${n.count}`:""}`).join(", ")}`);
 if(report.destination)messages.push(`text into ${report.destination.target}; formatting loss: ${report.destination.losses.join(", ")}`);
 return messages.length?`${report.operation==="paste"?"Pasted":report.operation==="cut"?"Cut":"Copied"} · ${messages.join("; ")}.`:null;
}
