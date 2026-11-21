import {describe,it,expect,vi} from "vitest";
import {createRichInterchange,type InterchangeOwner,type RichInterchange} from "../../breditor-interchange/src/index.js";
import {compileStandardRichProfileV4,compileStandardLayoutRichProfileV3} from "../../breditor-experimental-rich-content/index.js";
import type {RichWasmModule} from "../../breditor-experimental-rich-content/src/core.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {sharedV4SliceVersions} from "../../breditor-collaboration/src/protocol.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
import {clipboardInterchangeOptions} from "../src/clipboard_interchange.js";

// Capability parity of the interchange boundary: a shared V4 owner must drive `@breditor/interchange` exactly
// like a local V4 owner, and a shared V3 owner exactly like a local V3 owner. Both facades sit over the same
// staging admission here (an identity transfer), so any difference is the facade's capability reporting; real
// native admission and shared paste are covered by `shared_v4_interchange_contracts.rs` and the shared-browser
// spec `v4-interchange.spec.mjs`.
const admit=(kind:string,root:string)=>JSON.stringify({format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""});
const validate=(source:string)=>JSON.stringify({format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:(JSON.parse(source) as {kind?:string}).kind??"flow",structuredJson:source,plainText:""});
const value=(text:string)=>({status:"value",takeValue:()=>text,free:vi.fn()});
const fingerprint="sha256:0000000000000000000000000000000000000000000000000000000000000000";
const v4Versions={listNumberingVersion:"1",textLanguageVersion:"1",imageLinkVersion:"1",detailsVersion:"1",mentionVersion:"1",tableCaptionVersion:"1",pageBreakVersion:"1",bookmarkVersion:"1"};
function localOwner(language:3|4){
 const observation={revision:"1",blockLayoutStateJson:vi.fn(),free:vi.fn()};
 const editor:Record<string,unknown>={observe:()=>observation,blockLayoutVersion:()=>"1",clipboardInterchangeVersion:()=>"1",admitClipboardRoot:(kind:string,root:string)=>value(admit(kind,root)),validateClipboard:(source:string)=>value(validate(source)),free:vi.fn()};
 if(language===4)for(const[name,version]of Object.entries(v4Versions))editor[name]=()=>version;
 const descriptor={kind:"rich",abiVersion:1,schema:{name:"t",version:1},schemaFingerprint:fingerprint,richLanguageVersion:language,taskStructureVersion:1,blockLayoutVersion:1,...(language===4?Object.fromEntries(Object.keys(v4Versions).map(name=>[name,1])):{})};
 const raw={descriptorJson:()=>value(JSON.stringify(descriptor)),createEditor:()=>({status:"editor",takeEditor:()=>editor,free:vi.fn()}),free:vi.fn()};
 const factory=vi.fn(()=>({status:"profile",takeProfile:()=>raw,free:vi.fn()}));
 const wasm={BreditorRichProfile:{fromStandardBootstrapJsonV4:factory,fromStandardLayoutBootstrapJsonV3:factory}} as unknown as RichWasmModule;
 return (language===4?compileStandardRichProfileV4(wasm,"bootstrap"):compileStandardLayoutRichProfileV3(wasm,"bootstrap")).createEditor("document");
}
const sliceMethods=["list_numbering_version","text_language_version","image_link_version","details_version","mention_version","table_caption_version","page_break_version","bookmark_version"];
function sharedOwner(language:3|4,omit?:string):SharedRichEditor{
 const binding={abiVersion:1,modelVersion:language===4?14:13,journalVersion:language===4?15:14,richLanguageVersion:language,blockLayoutVersion:1,...(language===4?Object.fromEntries(sharedV4SliceVersions.map(name=>[name,1])):{})};
 const view={format:"breditor/shared-rich-view",formatVersion:1,revision:"1"};
 const raw:Record<string,unknown>={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",...binding}),observe:vi.fn(()=>({view_json:()=>JSON.stringify(view),free:vi.fn()})),
  block_layout_version:()=>"1",block_layout_state_json:vi.fn(()=>"{}"),change_selection_layout:vi.fn(()=>true),free:vi.fn(),
  selection_formatting_version:()=>"1",selection_coverage_json:vi.fn(),selection_format_state_json:vi.fn(),change_selection_formats:vi.fn(),
  clipboard_interchange_version:()=>"1",admit_clipboard_root:admit,validate_clipboard:validate};
 if(language===4){
  raw["rich_language_version"]=()=>"4";for(const name of sliceMethods)raw[name]=()=>"1";
  Object.assign(raw,{v4_block_fields_version:()=>"1",set_details_open:vi.fn(),bookmark_index_json:vi.fn(),inline_commands_v4_version:()=>"1",set_text_language:vi.fn(),insert_mention:vi.fn(),set_image_link:vi.fn(),structure_commands_v4_version:()=>"1"});
  if(omit)raw[omit]=()=>"0";
 }
 return new SharedRichEditor(raw as unknown as SharedRustOwner);
}
const policy={resolveImage:({src}:{src:string})=>({asset:src.replace(/[^A-Za-z0-9]/g,"-"),generation:"g"}),exportImage:()=>"https://cdn.example/a.png"};
const capabilityNames=["supportsListNumbering","supportsTextLanguage","supportsImageLinks","supportsDetails","supportsMentions","supportsTableCaptions","supportsPageBreaks","supportsBookmarks"] as const;
const capabilities=(owner:InterchangeOwner)=>capabilityNames.map(name=>owner[name]?.()===true);
const types=(result:ReturnType<RichInterchange["importHtml"]>)=>{if(!result.ok)throw Error(result.error);return result.value.structuredJson;};
type Tree={type:string;children:Tree[];kind:string;text?:string};
const roots=(json:string)=>(JSON.parse(json) as {document:{root:Tree}}).document.root.children;
const top=(json:string)=>roots(json).map(node=>node.type.slice(9));
/** Text of the table's trailing caption paragraph (a paragraph after its rows), if any. */
const caption=(json:string)=>{const table=roots(json).find(node=>node.type==="breditor/table"),last=table?.children.at(-1);return last?.type==="breditor/paragraph"?last.children.map(child=>child.text).join(""):undefined;};
const codes=(result:{readonly losses:readonly {readonly code:string}[]})=>result.losses.map(loss=>loss.code);

// One fixture per frozen V4 slice: the V4 conversion it must take and the V1–V3 conversion it keeps otherwise.
const slices:readonly {name:string;html:string;markdown?:string;v4:(json:string)=>boolean;v3:(json:string,losses:string[])=>boolean}[]=[
 {name:"list numbering",html:'<ol type="i" reversed start="4"><li>one</li><li>two</li></ol>',v4:json=>json.includes('"breditor/list-reversed":true')&&json.includes('"breditor/list-style"'),v3:(json,losses)=>losses.includes("list-numbering")&&!json.includes("list-style")},
 {name:"text language",html:'<p>Hi <span lang="FR-ca">bonjour</span></p>',v4:json=>json.includes('"breditor/language-tag":"fr-CA"'),v3:(json,losses)=>!json.includes("language-tag")&&losses.length===0},
 {name:"image links",html:'<p><a href="https://example.com/x"><img src="a.png" alt="Chart"></a></p>',markdown:"[![Chart](a.png)](https://example.com/x)",v4:json=>json.includes('"breditor/image-href":"https://example.com/x"'),v3:json=>!json.includes("image-href")},
 {name:"sections",html:"<details open><summary>More</summary><p>Body</p></details>",v4:json=>json.includes('"breditor/details"')&&json.includes('"breditor/details-open":true'),v3:json=>!json.includes("breditor/details")},
 {name:"mentions",html:'<p>Hi <span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">@Ann</span></p>',v4:json=>json.includes('"breditor/mention-label":"Ann"'),v3:json=>!json.includes("breditor/mention")&&json.includes("@Ann")},
 {name:"table captions",html:"<table><caption>Totals</caption><tr><td>x</td></tr></table>",v4:json=>caption(json)==="Totals",v3:(json,losses)=>losses.includes("block-structure")&&top(json).join()==="paragraph,table"&&caption(json)===undefined},
 {name:"page breaks (CSS, Word and Google Docs)",html:"<p>One</p><div style=\"break-after:page\"></div><p class=MsoNormal><br clear=all style='page-break-before:always'></p><hr style=\"page-break-before:always;display:none;\"><p>Two</p>",v4:json=>json.split('"breditor/page-break"').length===4,v3:(json,losses)=>!json.includes("page-break")&&losses.includes("unsupported-style")},
 {name:"bookmarks and internal links",html:'<h2 id="intro">Intro</h2><p><a href="#intro">see</a></p>',markdown:"[see](#intro)",v4:json=>json.includes('"breditor-inline/href":"#intro"')&&(json.includes('"breditor/bookmark":"intro"')||!json.includes('"breditor/heading"')),v3:(json,losses)=>!json.includes("bookmark")&&losses.includes("unsafe-link")},
];
const exportSource=JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children:[
 {kind:"element",type:"breditor/heading",entityId:null,properties:{"breditor/block-id":"h","breditor/level":2,"breditor/bookmark":"intro"},children:[{kind:"text",text:"Intro",formats:[]}]},
 {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"p"},children:[{kind:"text",text:"see",formats:[{type:"breditor-inline/link",properties:{"breditor-inline/href":"#intro","breditor-inline/new-window":false}}]}]},
]}}});

describe("shared V4 interchange reports exactly the local V4 capabilities",()=>{
 it("reports every frozen V4 interchange capability on a complete shared V4 owner, none on V3",()=>{
  const local4=localOwner(4),shared4=sharedOwner(4),local3=localOwner(3),shared3=sharedOwner(3);
  expect(capabilities(shared4)).toEqual(capabilities(local4));expect(capabilities(shared4)).toEqual(capabilityNames.map(()=>true));
  expect(capabilities(shared3)).toEqual(capabilities(local3));expect(capabilities(shared3)).toEqual(capabilityNames.map(()=>false));
  // Structure capabilities follow the shared structure commands, like the inline and block-field ones follow theirs.
  const partial=sharedOwner(4,"structure_commands_v4_version");
  expect([partial.supportsTableCaptions(),partial.supportsPageBreaks(),partial.supportsListNumbering(),partial.supportsMentions()]).toEqual([false,false,true,true]);
  for(const core of [local4,shared4,local3,shared3,partial])core.dispose();
 });
 for(const slice of slices)it(`imports ${slice.name} identically in local and shared owners of the same language`,()=>{
  const local4=localOwner(4),shared4=sharedOwner(4),local3=localOwner(3),shared3=sharedOwner(3);
  const [l4,s4,l3,s3]=[local4,shared4,local3,shared3].map(core=>createRichInterchange(core,policy));
  const shared=s4!.importHtml(slice.html);
  expect(shared).toEqual(l4!.importHtml(slice.html));expect(slice.v4(types(shared))).toBe(true);
  const old=s3!.importHtml(slice.html);
  expect(old).toEqual(l3!.importHtml(slice.html));expect(slice.v3(types(old),codes(old))).toBe(true);
  // V3 shared owners stay byte-identical to the original conversion (an owner reporting no V4 capability).
  const original=createRichInterchange({supportsClipboardInterchange:()=>true,admitClipboardRoot:(kind,root)=>JSON.parse(admit(kind,root)),validateClipboard:source=>JSON.parse(validate(source))},policy);
  expect(old).toEqual(original.importHtml(slice.html));
  if(slice.markdown){expect(s4!.importMarkdown(slice.markdown)).toEqual(l4!.importMarkdown(slice.markdown));expect(slice.v4(types(s4!.importMarkdown(slice.markdown)))).toBe(true);expect(s3!.importMarkdown(slice.markdown)).toEqual(l3!.importMarkdown(slice.markdown));}
  for(const core of [local4,shared4,local3,shared3])core.dispose();
 });
 it("imports one document carrying every slice identically and exports bookmarks the same way",()=>{
  const local4=localOwner(4),shared4=sharedOwner(4),local3=localOwner(3),shared3=sharedOwner(3);
  const [l4,s4,l3,s3]=[local4,shared4,local3,shared3].map(core=>createRichInterchange(core,policy));
  const html=slices.map(slice=>slice.html).join("");
  const shared=s4!.importHtml(html);expect(shared).toEqual(l4!.importHtml(html));
  for(const slice of slices)expect(slice.v4(types(shared))).toBe(true);
  expect(s4!.importHtml(html,{kind:"flow"})).toEqual(l4!.importHtml(html,{kind:"flow"}));
  for(const exporter of ["exportHtml","exportMarkdown"] as const){
   expect(s4![exporter](exportSource)).toEqual(l4![exporter](exportSource));expect(s3![exporter](exportSource)).toEqual(l3![exporter](exportSource));
  }
  const exported=s4!.exportHtml(exportSource);expect(exported.ok&&exported.value).toMatch(/^<h2 id="bm-intro"[^>]*>Intro<\/h2><p[^>]*><a href="#bm-intro">see<\/a><\/p>$/);
  const old=s3!.exportHtml(exportSource);expect(old.ok&&old.value).not.toContain("bm-intro");
  // The exported HTML reimports to the same native content in both owners.
  if(exported.ok)expect(s4!.importHtml(exported.value)).toEqual(l4!.importHtml(exported.value));
  for(const core of [local4,shared4,local3,shared3])core.dispose();
 });
 it("hands SDK interchange factories the shared V4 owner with the V4 capabilities",()=>{
  const core=sharedOwner(4),seen:boolean[][]=[];
  const options=clipboardInterchangeOptions(owner=>{seen.push(capabilities(owner));return createRichInterchange(owner);},core);
  expect(options.clipboardInterchange).toBeDefined();expect(seen).toEqual([capabilityNames.map(()=>true)]);core.dispose();
 });
});
