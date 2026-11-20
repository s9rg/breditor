/** Untrusted formatted provider output through the explicit bounded interchange adapter only. */
import type {RichClipboardInterchange,RichInterchangeNotice} from "./clipboard_interchange.js";
import type {RichAiTransfer} from "./ai_tools_host.js";
export type RichAiImport=Readonly<{ok:true;transfer:RichAiTransfer;text:string;losses:readonly RichInterchangeNotice[]}>|Readonly<{ok:false;error:string;losses:readonly RichInterchangeNotice[]}>;
const code=/^[a-z][a-z0-9-]{0,63}$/;
function notices(value:unknown):readonly RichInterchangeNotice[] {
 if(!Array.isArray(value)||value.length>64)throw Error("Interchange report was invalid");
 return Object.freeze(value.map((n:RichInterchangeNotice)=>{if(!n||typeof n.code!=="string"||!code.test(n.code)||!Number.isSafeInteger(n.count)||n.count<1||!["loss","compatibility"].includes(n.effect))throw Error("Interchange report was invalid");return Object.freeze({code:n.code,count:n.count,effect:n.effect});}));
}
const textTypes=new Set(["breditor/paragraph","breditor/heading","breditor/code-block","breditor/details-summary"]);
interface Node {kind:string;type?:string;text?:string;children?:readonly Node[]}
/** Plain reading text of an admitted transfer (text blocks joined with LF), for display only. */
export function transferText(structuredJson:string):string {
 const record=JSON.parse(structuredJson) as {document?:{root?:Node}};const root=record?.document?.root;if(!root)return "";
 const blocks:string[]=[],stack:Node[]=[root];
 while(stack.length){const node=stack.pop()!;if(node.kind!=="element")continue;const children=node.children??[];
  if(node.type&&textTypes.has(node.type)){blocks.push(children.map(child=>child.kind==="text"?child.text??"":"").join(""));continue;}
  for(let i=children.length-1;i>=0;i--)stack.push(children[i]!);}
 return blocks.join("\n");
}
/**
 * Import Markdown or HTML for a range replacement. The adapter parses with its own source/node budgets, removes
 * scripts, handlers, styles and unsafe links (reported as losses) and the native owner admits the result.
 * Nothing is inserted into the live DOM; grid (table-cell) transfers are refused for a text range.
 */
export function importAiSource(adapter:RichClipboardInterchange,kind:"markdown"|"html",source:string):RichAiImport {
 const result=kind==="markdown"?adapter.importMarkdown(source,{kind:"auto"}):adapter.importHtml(source,{kind:"auto"});
 const losses=notices(result?.losses??[]);
 if(result?.ok!==true){const error=typeof result?.error==="string"&&code.test(result.error)?result.error:"rejected";return Object.freeze({ok:false,error,losses});}
 const transfer=result.value;
 if(!transfer||transfer.format!=="breditor/rich-clipboard-transfer"||transfer.formatVersion!==1||typeof transfer.structuredJson!=="string")throw Error("Interchange transfer was invalid");
 if(transfer.kind!=="text"&&transfer.kind!=="flow")return Object.freeze({ok:false,error:"unsupported-content",losses});
 return Object.freeze({ok:true,transfer:Object.freeze({kind:transfer.kind,clipboardJson:transfer.structuredJson}),text:transferText(transfer.structuredJson),losses});
}
