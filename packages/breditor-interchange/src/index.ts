export type * from "./types.js";
export {htmlPageMetadataLimits,type HtmlPageMetadata,type ImportedHtmlPage} from "./html_page.js";
export {limits as interchangeLimits} from "./budget.js";
/** Conversion grammar revision, independent of native document/history/synchronization protocols. */
export const interchangeContractV1=Object.freeze({version:1,html:"bounded-semantic-html-v1",markdown:"commonmark-tables-strike-tasks-and-sanitized-html-v1",markdownAutolinks:"opt-in-gfm-autolink-literals-autolink-v1",cellPartitionVersion:1} as const);
import {Budget,bytes,ConversionFailure,fail,limits,sourceWithinBudget} from "./budget.js";
import {importHtmlContent,importHtmlTree} from "./html_import.js";
import {htmlTree} from "./html_tree.js";
import {exportHtmlRoot} from "./html_export.js";
import {htmlPageOpening,readHtmlPageMetadata,type HtmlPageMetadata,type ImportedHtmlPage} from "./html_page.js";
import {exportMarkdownRoot,markdownHtml} from "./markdown.js";
import type {Node} from "./wire.js";
import type {ClipboardTransfer,InterchangeImportOptions,InterchangeOptions,InterchangeOwner,InterchangeResult,InterchangeLoss,RichInterchange} from "./types.js";
function nativeInterchange(owner:InterchangeOwner){
  const admit=owner.admitClipboardRoot,validate=owner.validateClipboard;
  if(owner.supportsClipboardInterchange?.()!==true||typeof admit!=="function"||typeof validate!=="function")throw new TypeError("Matching native clipboard interchange version 1 is required");
  return {admit,validate};
}
function ownerCapabilities(owner:InterchangeOwner){
  // Read once: an owner's compiled language never changes. Native admission still decides validity.
  return Object.freeze({listNumbering:owner.supportsListNumbering?.()===true,textLanguage:owner.supportsTextLanguage?.()===true,imageLinks:owner.supportsImageLinks?.()===true,details:owner.supportsDetails?.()===true,mentions:owner.supportsMentions?.()===true,tableCaptions:owner.supportsTableCaptions?.()===true,pageBreaks:owner.supportsPageBreaks?.()===true,bookmarks:owner.supportsBookmarks?.()===true,ruby:owner.supportsRubyAnnotations?.()===true});
}
/** Separate explicit dependency: importing/mounting the editor never enables foreign clipboard admission. */
export function createRichInterchange(owner:InterchangeOwner,options:InterchangeOptions={}):RichInterchange {
  const {admit,validate}=nativeInterchange(owner),policy=Object.freeze({...options}),capabilities=ownerCapabilities(owner);
  const run=<T>(work:(b:Budget)=>T):InterchangeResult<T>=>{
    const b=new Budget();try{return Object.freeze({ok:true,value:work(b),losses:b.losses()});}catch(error){return Object.freeze({ok:false,error:error instanceof ConversionFailure?error.code:"native-admission",losses:b.losses()});}
  };
  const importSource=(source:string,b:Budget,target:InterchangeImportOptions={}):ClipboardTransfer=>{const content=importHtmlContent(source,b,policy,capabilities),kind=target.kind??"auto";if(!['auto','flow','grid'].includes(kind))fail("unsupported-content");return Object.freeze(admit.call(owner,kind==="auto"?content.kind:kind,content.root));};
  const exportSource=(source:string):{nodes:Node[];kind:ClipboardTransfer["kind"]}=>{
    sourceWithinBudget(source);const admitted=validate.call(owner,source),record=JSON.parse(admitted.structuredJson) as {document:{root:{children:Node[]}}};return{nodes:record.document.root.children,kind:admitted.kind};
  };
  return Object.freeze({
    importHtml:(source:string,target?:InterchangeImportOptions)=>run(b=>importSource(source,b,target)),
    importMarkdown:(source:string,target?:InterchangeImportOptions)=>run(b=>{
      const autolinks=target?.autolinks;if(autolinks!==undefined&&typeof autolinks!=="boolean")fail("unsupported-content");
      return importSource(markdownHtml(source,b,autolinks===true),b,target);
    }),
    exportHtml:(source:string)=>run(b=>{const sourceContent=exportSource(source);return exportHtmlRoot(sourceContent.nodes,b,policy,sourceContent.kind,capabilities.bookmarks);}),
    exportMarkdown:(source:string)=>run(b=>{const content=exportSource(source);if(content.kind==="text")b.loss("block-structure");return exportMarkdownRoot(content.nodes,b,policy,capabilities.bookmarks);}),
  });
}

/** Serialize an admitted clipboard snapshot as a complete page with host-supplied metadata. */
export function exportHtmlPage(owner:InterchangeOwner,clipboardJson:string,metadata:HtmlPageMetadata,
  options:Pick<InterchangeOptions,"exportImage">={}):InterchangeResult<string> {
  let losses:readonly InterchangeLoss[]=Object.freeze([]);
  try{
    const opening=htmlPageOpening(metadata);
    const fragment=createRichInterchange(owner,options).exportHtml(clipboardJson);
    if(!fragment.ok)return fragment;
    losses=fragment.losses;
    const value=opening+fragment.value+"</body></html>";
    if(value.length>limits.outputBytes||bytes(value)>limits.outputBytes)fail("resource-limit");
    return Object.freeze({ok:true,value,losses});
  }catch(error){return Object.freeze({ok:false,error:error instanceof ConversionFailure?error.code:"native-admission",losses});}
}

/** Stage a complete page's host metadata and admit its body as ordinary native flow. */
export function importHtmlPage(owner:InterchangeOwner,source:string,
  options:Pick<InterchangeOptions,"resolveImage">={}):InterchangeResult<ImportedHtmlPage> {
  const budget=new Budget();
  try{
    const {admit}=nativeInterchange(owner),policy=Object.freeze({...options}),capabilities=ownerCapabilities(owner);
    const nodes=htmlTree(source,budget),metadata=readHtmlPageMetadata(nodes,budget);
    const body=Object.freeze(admit.call(owner,"flow",importHtmlTree(nodes,budget,policy,capabilities).root));
    return Object.freeze({ok:true,value:Object.freeze({metadata,body}),losses:budget.losses()});
  }catch(error){return Object.freeze({ok:false,error:error instanceof ConversionFailure?error.code:"native-admission",losses:budget.losses()});}
}
