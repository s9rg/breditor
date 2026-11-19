/** Host side of the opt-in source view: export, bounded import preview and one guarded whole-document paste. */
import type {RichClipboardInterchange,RichInterchangeNotice} from "./clipboard_interchange.js";
import type {RichCommandOutcome,RichDocumentCoreEditor} from "./core.js";
import {RICH_DOCUMENT_SOURCE_MAX_BYTES,type RichDocumentSourceHost,type RichDocumentSourceHostState,type RichDocumentSourcePreview,type RichDocumentSourceRead} from "./source_view_types.js";
/** Narrow coordinator port. The coordinator keeps its own queue, rendering, focus and change notifications. */
export interface RichDocumentSourcePort {
 readonly surface:HTMLElement;
 readonly core:RichDocumentCoreEditor;
 readonly interchange:RichClipboardInterchange|undefined;
 state():{readonly revision:string;readonly closed:boolean;readonly busy:boolean;readonly composing:boolean;readonly readOnly:boolean};
 subscribe(listener:()=>void):()=>void;
 selectDocument(revision:string):RichCommandOutcome|"queued";
 paste(clipboardJson:string,revision:string):RichCommandOutcome|"queued";
}
export function sourceBytes(source:string):number {
 let count=0;
 for(let i=0;i<source.length;i++){const u=source.charCodeAt(i);if(u>=0xd800&&u<=0xdbff&&i+1<source.length){const next=source.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){count+=4;i++;continue;}}count+=u<0x80?1:u<0x800?2:3;}
 return count;
}
/**
 * Whole-document flow paste always appends one fresh empty paragraph, and the export shows it. Dropping exactly one
 * trailing empty paragraph from the source keeps export → apply idempotent instead of growing the document.
 */
const trailingEmptyParagraph=/<p(?:\s[^<>]*)?>\s*(?:<br\s*\/?>\s*)?<\/p>\s*$/i;
export function withoutTrailingEmptyParagraph(source:string):string {const match=trailingEmptyParagraph.exec(source);if(!match)return source;const rest=source.slice(0,match.index);return rest.trim()?rest:source;}
export function staleSourceMessage(opened:string,current:string):string {return `The document changed after the source view opened (revision ${opened}, now ${current}). Nothing was applied; reload the source to edit the current document.`;}
function notices(value:unknown):readonly RichInterchangeNotice[] {
 if(!Array.isArray(value)||value.length>64)throw Error("Source interchange report was invalid");
 return Object.freeze(value.map((n:RichInterchangeNotice)=>{if(!n||typeof n.code!=="string"||!/^[a-z][a-z0-9-]{0,63}$/.test(n.code)||!Number.isSafeInteger(n.count)||n.count<1||!["loss","compatibility"].includes(n.effect))throw Error("Source interchange report was invalid");return Object.freeze({code:n.code,count:n.count,effect:n.effect});}));
}
class SourceHost implements RichDocumentSourceHost {
 readonly surface:HTMLElement;readonly #port:RichDocumentSourcePort;
 readonly #reads=new WeakSet<RichDocumentSourceRead>();readonly #previews=new WeakMap<RichDocumentSourcePreview,string|null>();
 constructor(port:RichDocumentSourcePort){this.#port=port;this.surface=port.surface;}
 sourceState():RichDocumentSourceHostState{const s=this.#port.state();return Object.freeze({revision:s.revision,closed:s.closed,busy:s.busy,composing:s.composing,readOnly:s.readOnly,available:!s.closed&&this.#port.interchange!==undefined});}
 subscribeSource(listener:()=>void):()=>void{return this.#port.subscribe(listener);}
 #idle(action:string):RichDocumentSourceHostState{
  const s=this.sourceState();if(s.closed)throw Error("The rich DOM editor is disposed");
  if(!this.#port.interchange)throw Error("The source view requires an explicit clipboard interchange adapter");
  if(s.busy||s.composing)throw Error(`Source ${action} waits for the current operation or composition`);return s;
 }
 readDocumentSource():RichDocumentSourceRead{
  let s=this.#idle("export");const core=this.#port.core,adapter=this.#port.interchange!;
  if(core.view().selection?.kind!=="document"){if(this.#port.selectDocument(s.revision)==="queued")throw Error("Source export waits for the current operation");s=this.#idle("export");}
  const view=core.view();if(view.selection?.kind!=="document"||view.revision!==s.revision)throw Error("Source export requires the whole document selected at the current revision");
  const transfer=core.copyDocument();let html="",losses:readonly RichInterchangeNotice[]=Object.freeze([]);
  if(transfer){
   const result=adapter.exportHtml(transfer.structuredJson);if(result?.ok!==true)throw Error(`The document could not be exported as HTML (${typeof result?.error==="string"&&/^[a-z][a-z0-9-]{0,63}$/.test(result.error)?result.error:"rejected"})`);
   if(typeof result.value!=="string"||sourceBytes(result.value)>RICH_DOCUMENT_SOURCE_MAX_BYTES)throw Error("The exported HTML exceeds the 1 MiB source limit");html=result.value;losses=notices(result.losses);
  }
  if(core.view().revision!==s.revision)throw Error("The document changed during source export");
  const read=Object.freeze({format:"breditor/document-source",formatVersion:1,revision:s.revision,readOnly:s.readOnly,html,losses} as const);this.#reads.add(read);return read;
 }
 #guard(revision:string,action:string):RichDocumentSourceHostState{
  const s=this.#idle(action);if(s.readOnly)throw Error("This document is read-only; its source can be viewed but not applied");
  if(s.revision!==revision)throw Error(staleSourceMessage(revision,s.revision));return s;
 }
 previewDocumentSource(source:string,read:RichDocumentSourceRead):RichDocumentSourcePreview{
  if(!this.#reads.has(read))throw Error("Use a source read issued by this editor");
  if(typeof source!=="string")throw new TypeError("Expected source text");
  this.#guard(read.revision,"review");
  const bytes=sourceBytes(source),base={format:"breditor/document-source-preview",formatVersion:1,revision:read.revision,bytes,exportLosses:read.losses} as const;
  if(bytes>RICH_DOCUMENT_SOURCE_MAX_BYTES)return this.#issue({...base,unchanged:false,applicable:false,error:"resource-limit",kind:null,losses:Object.freeze([])},null);
  if(source===read.html)return this.#issue({...base,unchanged:true,applicable:true,error:null,kind:null,losses:Object.freeze([])},null);
  const result=this.#port.interchange!.importHtml(withoutTrailingEmptyParagraph(source),{kind:"flow"}),losses=notices(result?.losses??[]);
  if(result?.ok!==true){const code=typeof result?.error==="string"&&/^[a-z][a-z0-9-]{0,63}$/.test(result.error)?result.error:"rejected";return this.#issue({...base,unchanged:false,applicable:false,error:code,kind:null,losses},null);}
  const transfer=result.value;
  if(!transfer||transfer.format!=="breditor/rich-clipboard-transfer"||transfer.formatVersion!==1||!["text","flow","grid"].includes(transfer.kind)||typeof transfer.structuredJson!=="string")throw Error("Source interchange transfer was invalid");
  return this.#issue({...base,unchanged:false,applicable:true,error:null,kind:transfer.kind,losses},transfer.structuredJson);
 }
 #issue(value:RichDocumentSourcePreview,clipboardJson:string|null):RichDocumentSourcePreview{const preview=Object.freeze(value);this.#previews.set(preview,clipboardJson);return preview;}
 applyDocumentSource(preview:RichDocumentSourcePreview):RichCommandOutcome|"queued"{
  if(!this.#previews.has(preview))throw Error("Review the source with this editor before applying it");
  if(!preview.applicable)throw Error("The reviewed source was refused; nothing can be applied");
  const s=this.#guard(preview.revision,"apply"),clipboardJson=this.#previews.get(preview)!;
  this.#previews.delete(preview);
  if(preview.unchanged)return "unchanged";
  return this.#port.paste(clipboardJson!,s.revision);
 }
}
export function createDocumentSourceHost(port:RichDocumentSourcePort):RichDocumentSourceHost{return new SourceHost(port);}
