export type * from "./types.js";
export {limits as interchangeLimits} from "./budget.js";
/** Conversion grammar revision, independent of native document/history/synchronization protocols. */
export const interchangeContractV1=Object.freeze({version:1,html:"bounded-semantic-html-v1",markdown:"commonmark-tables-strike-tasks-and-sanitized-html-v1",cellPartitionVersion:1} as const);
import {Budget,ConversionFailure,fail,sourceWithinBudget} from "./budget.js";
import {importHtmlContent} from "./html_import.js";
import {exportHtmlRoot} from "./html_export.js";
import {exportMarkdownRoot,markdownHtml} from "./markdown.js";
import type {Node} from "./wire.js";
import type {ClipboardTransfer,InterchangeImportOptions,InterchangeOptions,InterchangeOwner,InterchangeResult,RichInterchange} from "./types.js";
/** Separate explicit dependency: importing/mounting the editor never enables foreign clipboard admission. */
export function createRichInterchange(owner:InterchangeOwner,options:InterchangeOptions={}):RichInterchange {
  const admit=owner.admitClipboardRoot,validate=owner.validateClipboard;
  if(owner.supportsClipboardInterchange?.()!==true||typeof admit!=="function"||typeof validate!=="function")throw new TypeError("Matching native clipboard interchange version 1 is required");
  const policy=Object.freeze({...options});
  // Read once: an owner's compiled language never changes. Native admission still decides validity.
  const capabilities=Object.freeze({listNumbering:owner.supportsListNumbering?.()===true,textLanguage:owner.supportsTextLanguage?.()===true,imageLinks:owner.supportsImageLinks?.()===true,details:owner.supportsDetails?.()===true,mentions:owner.supportsMentions?.()===true,tableCaptions:owner.supportsTableCaptions?.()===true,pageBreaks:owner.supportsPageBreaks?.()===true});
  const run=<T>(work:(b:Budget)=>T):InterchangeResult<T>=>{
    const b=new Budget();try{return Object.freeze({ok:true,value:work(b),losses:b.losses()});}catch(error){return Object.freeze({ok:false,error:error instanceof ConversionFailure?error.code:"native-admission",losses:b.losses()});}
  };
  const importSource=(source:string,b:Budget,target:InterchangeImportOptions={}):ClipboardTransfer=>{const content=importHtmlContent(source,b,policy,capabilities),kind=target.kind??"auto";if(!['auto','flow','grid'].includes(kind))fail("unsupported-content");return Object.freeze(admit.call(owner,kind==="auto"?content.kind:kind,content.root));};
  const exportSource=(source:string):{nodes:Node[];kind:ClipboardTransfer["kind"]}=>{
    sourceWithinBudget(source);const admitted=validate.call(owner,source),record=JSON.parse(admitted.structuredJson) as {document:{root:{children:Node[]}}};return{nodes:record.document.root.children,kind:admitted.kind};
  };
  return Object.freeze({
    importHtml:(source:string,target?:InterchangeImportOptions)=>run(b=>importSource(source,b,target)),
    importMarkdown:(source:string,target?:InterchangeImportOptions)=>run(b=>importSource(markdownHtml(source,b),b,target)),
    exportHtml:(source:string)=>run(b=>{const sourceContent=exportSource(source);return exportHtmlRoot(sourceContent.nodes,b,policy,sourceContent.kind);}),
    exportMarkdown:(source:string)=>run(b=>{const content=exportSource(source);if(content.kind==="text")b.loss("block-structure");return exportMarkdownRoot(content.nodes,b,policy);}),
  });
}
