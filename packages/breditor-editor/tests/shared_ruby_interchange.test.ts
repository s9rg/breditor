import {describe,it,expect,vi} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../../breditor-interchange/src/index.js";
import {compileStandardRichProfileV4} from "../../breditor-experimental-rich-content/index.js";
import type {RichWasmModule} from "../../breditor-experimental-rich-content/src/core.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {sharedV4SliceVersions} from "../../breditor-collaboration/src/protocol.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";

// Ruby capability parity of the interchange boundary (docs/RUBY_ANNOTATIONS.md): a shared owner whose schema admits
// the exact `breditor-ruby/ruby` declaration reports `supportsRubyAnnotations()` exactly like a local owner, so both
// map `<ruby>` identically; without the declaration (or with another contract for the kind) both keep the original
// conversion. Both facades sit over the same identity staging admission; real native admission and shared paste are
// covered by the Rust contracts and `experiments/shared-browser/ruby.spec.mjs`.
const admit=(kind:string,root:string)=>JSON.stringify({format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""});
const validate=(source:string)=>JSON.stringify({format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:(JSON.parse(source) as {kind?:string}).kind??"flow",structuredJson:source,plainText:""});
const value=(text:string)=>({status:"value",takeValue:()=>text,free:vi.fn()});
const fingerprint="sha256:0000000000000000000000000000000000000000000000000000000000000000";
const v4Versions={listNumberingVersion:"1",textLanguageVersion:"1",imageLinkVersion:"1",detailsVersion:"1",mentionVersion:"1",tableCaptionVersion:"1",pageBreakVersion:"1",bookmarkVersion:"1"};
const annotation=(maximum:number)=>({kind:"breditor-ruby/ruby",revision:1,properties:[{name:"breditor-ruby/annotation",presence:"required",valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:maximum}}]});
const catalog=(formats:unknown[])=>JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"t",version:1,fingerprint},formats:[...formats,{kind:"breditor/strong",revision:1,properties:[]}]});
function localOwner(catalogJson:string){
 const observation={revision:"1",blockLayoutStateJson:vi.fn(),free:vi.fn()};
 const editor:Record<string,unknown>={observe:()=>observation,blockLayoutVersion:()=>"1",clipboardInterchangeVersion:()=>"1",admitClipboardRoot:(kind:string,root:string)=>value(admit(kind,root)),validateClipboard:(source:string)=>value(validate(source)),free:vi.fn()};
 for(const[name,version]of Object.entries(v4Versions))editor[name]=()=>version;
 const descriptor={kind:"rich",abiVersion:1,schema:{name:"t",version:1},schemaFingerprint:fingerprint,richLanguageVersion:4,taskStructureVersion:1,blockLayoutVersion:1,...Object.fromEntries(Object.keys(v4Versions).map(name=>[name,1]))};
 const raw={descriptorJson:()=>value(JSON.stringify(descriptor)),inlineCatalogJson:()=>value(catalogJson),createEditor:()=>({status:"editor",takeEditor:()=>editor,free:vi.fn()}),free:vi.fn()};
 const wasm={BreditorRichProfile:{fromStandardBootstrapJsonV4:vi.fn(()=>({status:"profile",takeProfile:()=>raw,free:vi.fn()}))}} as unknown as RichWasmModule;
 return compileStandardRichProfileV4(wasm,"bootstrap").createEditor("document");
}
const sliceMethods=["list_numbering_version","text_language_version","image_link_version","details_version","mention_version","table_caption_version","page_break_version","bookmark_version"];
function sharedOwner(catalogJson:string|undefined):SharedRichEditor{
 const binding={abiVersion:1,modelVersion:14,journalVersion:15,richLanguageVersion:4,blockLayoutVersion:1,...Object.fromEntries(sharedV4SliceVersions.map(name=>[name,1]))};
 const view={format:"breditor/shared-rich-view",formatVersion:1,revision:"1"};
 const raw:Record<string,unknown>={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",...binding}),observe:vi.fn(()=>({view_json:()=>JSON.stringify(view),free:vi.fn()})),
  block_layout_version:()=>"1",block_layout_state_json:vi.fn(()=>"{}"),change_selection_layout:vi.fn(()=>true),free:vi.fn(),
  selection_formatting_version:()=>"1",selection_coverage_json:vi.fn(),selection_format_state_json:vi.fn(),change_selection_formats:vi.fn(),
  clipboard_interchange_version:()=>"1",admit_clipboard_root:admit,validate_clipboard:validate,rich_language_version:()=>"4",
  v4_block_fields_version:()=>"1",set_details_open:vi.fn(),bookmark_index_json:vi.fn(),inline_commands_v4_version:()=>"1",set_text_language:vi.fn(),insert_mention:vi.fn(),set_image_link:vi.fn(),structure_commands_v4_version:()=>"1"};
 for(const name of sliceMethods)raw[name]=()=>"1";
 if(catalogJson!==undefined)raw["inline_catalog_json"]=()=>catalogJson;
 return new SharedRichEditor(raw as unknown as SharedRustOwner);
}
const html='<p>私は<ruby><b>東</b>京<rp>(</rp><rt>とうきょう</rt><rp>)</rp></ruby>と<ruby>漢<rt>かん</rt>字<rt>じ</rt></ruby></p>';
const outcome=(owner:InterchangeOwner)=>{
 const io=createRichInterchange(owner),imported=io.importHtml(html);if(!imported.ok)throw Error(imported.error);
 const exported=io.exportHtml(imported.value.structuredJson),markdown=io.exportMarkdown(imported.value.structuredJson);
 return {json:imported.value.structuredJson,losses:imported.losses,html:exported.ok?exported.value:exported.error,markdown:markdown.ok?markdown.value:markdown.error,markdownLosses:markdown.losses};
};

describe("ruby interchange: shared owners report the capability exactly like local owners",()=>{
 it("reports supportsRubyAnnotations() from the owner schema's exact declaration",()=>{
  for(const [formats,expected] of [[[annotation(256)],true],[[],false],[[annotation(64)],false]] as const){
   const json=catalog([...formats]);
   expect(localOwner(json).supportsRubyAnnotations?.()).toBe(expected);
   expect(sharedOwner(json).supportsRubyAnnotations()).toBe(expected);
  }
  // An older shared owner without the additive catalog read keeps the original conversion.
  expect(sharedOwner(undefined).supportsRubyAnnotations()).toBe(false);
 });
 it("maps <ruby> import, export and Markdown identically for local and shared ruby owners",()=>{
  const local=outcome(localOwner(catalog([annotation(256)]))),shared=outcome(sharedOwner(catalog([annotation(256)])));
  expect(shared).toEqual(local);
  expect(local.losses).toEqual([]);
  expect(local.json).toContain('"breditor-ruby/annotation":"とうきょう"');
  expect(local.html).toBe('<p style="white-space:pre-wrap">私は<ruby><strong>東</strong>京<rp>(</rp><rt>とうきょう</rt><rp>)</rp></ruby>と<ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp></ruby><ruby>字<rp>(</rp><rt>じ</rt><rp>)</rp></ruby></p>');
  expect(local.markdown).toBe(local.html);expect(local.markdownLosses.map(loss=>loss.code)).toEqual(["markdown-feature"]);
 });
 it("keeps the original conversion identically for local and shared owners without ruby",()=>{
  const local=outcome(localOwner(catalog([]))),shared=outcome(sharedOwner(catalog([])));
  expect(shared).toEqual(local);
  expect(local.json).not.toContain("breditor-ruby");expect(local.json).toContain("京(とうきょう)と漢かん字じ");
  expect(local.losses.map(loss=>loss.code)).toContain("unsupported-element");
 });
});
