/** Optional structural port only. Default editor imports never load a foreign parser. */
import type {RichClipboardTextProjection,RichClipboardTransfer} from "./core.js";
import {defaultRichUi,type RichUiLocale} from "./ui_locale.js";
import {detectMarkdownPaste,type MarkdownPasteDetection} from "./markdown_paste_detection.js";
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
export interface ClipboardInput {
 readonly fragment:string;readonly plain:string;readonly formats:readonly RichInterchangeFormatReport[];
 /** Present only when opted-in automatic detection converted an ordinary text/plain paste. */
 readonly markdownPaste?:{readonly plain:string;readonly detection:MarkdownPasteDetection};
}
/**
 * How an event reads a clipboard: `default` keeps text/plain literal, `detect` offers a text/plain-only
 * clipboard to the Markdown import when `markdown-paste-detect-v1` accepts it, and `literal` is the one-shot
 * paste-as-plain-text escape, which reads only text/plain and ignores private, HTML and Markdown flavors.
 */
export type ClipboardPlainTextMode="default"|"detect"|"literal";
export type RichTextPasteIntent="literal"|"detect-markdown";
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
function convertInput(source:string,kind:"html"|"markdown",adapter:RichClipboardInterchange,grid:boolean,imported?:RichInterchangeResult<RichClipboardTransfer>):ClipboardInput {
 if(!source)throw Error("Clipboard foreign content was empty");
 const converted=result(imported??adapter[kind==="html"?"importHtml":"importMarkdown"](source,{kind:grid?"grid":"auto"}),kind),transfer=converted.value;
 if(!transfer||transfer.format!=="breditor/rich-clipboard-transfer"||transfer.formatVersion!==1||!['text','flow','grid'].includes(transfer.kind))throw Error("Clipboard interchange transfer was invalid");
 return{fragment:string(transfer.structuredJson),plain:string(transfer.plainText),formats:Object.freeze([Object.freeze({kind,losses:converted.losses})])};
}
// Require a heading, a blank line and a flat, consistently marked list of at least two items.
function isHeadingAndList(source:string):boolean {
 const lines=source.trimEnd().split(/\r\n|[\r\n]/),first=lines[0];
 if(lines.length<4||!/^ {0,3}#{1,6}[ \t]+[^ \t#]/.test(first??"")||!/^[ \t]*$/.test(lines[1]!))return false;
 const item=/^( {0,3}[-+*])[ \t]+[^ \t]/,marker=item.exec(lines[2]!)?.[1];
 return marker!==undefined&&lines.slice(3).every(line=>item.exec(line)?.[1]===marker);
}
/** An explicit host action. The ordinary text/plain event path remains literal. */
export function readClipboardText(source:string,adapter:RichClipboardInterchange|undefined,grid:boolean,intent:RichTextPasteIntent):ClipboardInput {
 if(intent!=="literal"&&intent!=="detect-markdown")throw new TypeError("Unknown text paste intent");
 const plain=string(source);
 if(intent==="detect-markdown"&&adapter&&!grid&&isHeadingAndList(plain))return convertInput(plain,"markdown",adapter,false);
 return{fragment:"",plain,formats:[]};
}
/**
 * Event-scoped data is detached before it can enter an editor queue. No rich failure retries as plain; only an
 * automatically detected text/plain paste whose Markdown import is rejected stays literal, because the user
 * never asked for Markdown.
 */
export function readClipboardInput(data:DataTransfer,adapter:RichClipboardInterchange|undefined,grid:boolean,plainText:ClipboardPlainTextMode="default"):ClipboardInput {
 if(plainText!=="default"&&plainText!=="detect"&&plainText!=="literal")throw new TypeError("Unknown plain-text paste mode");
 if(plainText==="literal")return{fragment:"",plain:data.getData("text/plain"),formats:[]};
 const fragment=data.getData(RICH_CLIPBOARD_MIME);
 if(fragment||adapter&&data.types.includes(RICH_CLIPBOARD_MIME)){if(!fragment)throw Error("Clipboard rich content was empty");return{fragment,plain:"",formats:[]};}
 if(adapter){
  const kind=data.types.includes("text/html")?"html":data.types.includes("text/markdown")?"markdown":undefined;
  if(kind)return convertInput(string(data.getData(kind==="html"?"text/html":"text/markdown")),kind,adapter,grid);
 }
 const plain=data.getData("text/plain");
 if(plainText==="detect"&&adapter&&!grid&&plain)return detectedInput(string(plain),adapter)??{fragment:"",plain,formats:[]};
 return{fragment:"",plain,formats:[]};
}
function detectedInput(plain:string,adapter:RichClipboardInterchange):ClipboardInput|undefined {
 const detection=detectMarkdownPaste(plain);if(!detection.markdown)return undefined;
 const imported=adapter.importMarkdown(plain,{kind:"auto"});if(imported?.ok===false)return undefined;
 return{...convertInput(plain,"markdown",adapter,false,imported),markdownPaste:Object.freeze({plain,detection})};
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
/** Catalog values for a caption/code paste projection: the `{target}` and `{losses}` of `pasteLoss`. */
export function clipboardProjectionText(projection:Pick<RichClipboardTextProjection,"target"|"losses">,ui:RichUiLocale=defaultRichUi):{target:string;losses:string}{
 return {target:ui.text(projection.target==="caption"?"pasteTargetCaption":"pasteTargetCode"),losses:projection.losses.map(code=>ui.notice(code)).join(ui.text("panelListSeparator"))};
}
/**
 * Plain text only, never imported markup. Empty notices leave the ordinary revision status intact. Loss codes are
 * end-user text through the catalog's `notices` (the code itself by default); the report keeps the stable codes.
 */
export function clipboardInterchangeStatus(report:RichClipboardInterchangeReport,ui:RichUiLocale=defaultRichUi):string|null {
 const list=ui.text("panelListSeparator"),notice=(n:RichInterchangeNotice)=>n.count>1?ui.text("clipboardNoticeCount",{notice:ui.notice(n.code),count:n.count}):ui.notice(n.code);
 const messages=report.formats.filter(f=>f.losses.length).map(f=>ui.text("clipboardFormatLosses",{format:ui.text(f.kind==="html"?"clipboardFormatHtml":"clipboardFormatMarkdown"),losses:f.losses.map(notice).join(list)}));
 if(report.destination)messages.push(ui.text("clipboardDestination",clipboardProjectionText(report.destination,ui)));
 return messages.length?ui.text("clipboardStatus",{operation:ui.text(report.operation==="paste"?"clipboardPasted":report.operation==="cut"?"clipboardCut":"clipboardCopied"),messages:messages.join(ui.text("panelGroupSeparator"))}):null;
}
