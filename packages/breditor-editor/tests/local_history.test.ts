import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({compile:vi.fn(),compileV3:vi.fn(),compileV4:vi.fn(),runtime:vi.fn(),mount:vi.fn(),layoutToolbar:vi.fn(()=>[]),toolbarV4:vi.fn(()=>[])}));
vi.mock("../src/runtime.js",()=>({initializeLocalRuntime:mocks.runtime}));
vi.mock("@breditor/experimental-rich-content",()=>({compileStandardRichProfileV1:mocks.compile,compileStandardStructuralRichProfileV2:mocks.compile,compileStandardLayoutRichProfileV3:mocks.compileV3,compileStandardRichProfileV4:mocks.compileV4,createRichToolbarV4:mocks.toolbarV4,createStandardRichInlinePresentationV1:()=>({}),createStandardRichToolbarV1:()=>[],createStructuralRichToolbarV2:()=>[],createLayoutRichToolbarV3:mocks.layoutToolbar,mountRichEditor:mocks.mount,mountDocumentRichEditor:mocks.mount,insertImageFiles:vi.fn()}));
import {openLocalEditor} from "../src/local.js";
import {openLocalDocumentEditor} from "../src/local_document.js";
function setup(capable=true){
 let natural=false;
 const core={supportsGeneralRanges:()=>capable,supportsTypingHistory:()=>capable,enableTypingHistory:vi.fn(()=>{const changed=!natural;natural=true;return changed;}),supportsReadOnly:()=>true,setReadOnly:vi.fn(()=>true),dispose:vi.fn(),view:()=>({historyGrouping:natural?"typing-v1":undefined})};
 const profile={descriptor:()=>({schema:{name:"example/unit",version:1},schemaFingerprint:"test"}),inlineCatalogJson:()=>"[]",createEditor:vi.fn(()=>core),restoreEditor:vi.fn(()=>core),supportsTypingHistory:()=>capable,restoreTypingEditor:vi.fn(()=>{natural=true;return core;}),dispose:vi.fn()};
 const dom={surface:document.createElement("div"),toolbar:document.createElement("div"),status:document.createElement("p"),dispose:vi.fn(()=>core.dispose()),closeTypingGroup:vi.fn(()=>true)};
 mocks.compile.mockReturnValue(profile);mocks.compileV3.mockReturnValue(profile);mocks.compileV4.mockReturnValue(profile);mocks.mount.mockReturnValue(dom);const host=document.createElement("main"),original=document.createElement("button");host.append(original);document.body.append(host);
 return {host,original,core,profile,dom};
}
beforeEach(()=>{vi.clearAllMocks();mocks.runtime.mockResolvedValue({});document.body.replaceChildren();});
it("placeholder rejection precedes local owner creation/recovery in both scopes, without changing default startup",async()=>{
 for(const documentScope of [false,true]){const t=setup(),initial={kind:"document" as const,documentJson:"native"};const pending=documentScope?openLocalDocumentEditor({host:t.host,selectionEditing:"document-v1",placeholder:"Prompt",initial}):openLocalEditor({host:t.host,placeholder:"Prompt",initial});await expect(pending).rejects.toThrow("matching native placeholder profile");expect(t.profile.createEditor).not.toHaveBeenCalled();expect(t.profile.restoreEditor).not.toHaveBeenCalled();expect(t.profile.dispose).toHaveBeenCalledOnce();expect(t.core.dispose).not.toHaveBeenCalled();expect(t.host.firstChild).toBe(t.original);}
 const t=setup(),editor=await openLocalEditor({host:t.host,initial:{kind:"document",documentJson:"native"}});expect(t.profile.createEditor).toHaveBeenCalledOnce();editor.dispose();
 mocks.runtime.mockClear();const bad=setup();await expect(openLocalEditor({host:bad.host,placeholder:"\ud800"})).rejects.toThrow("placeholder");expect(mocks.runtime).not.toHaveBeenCalled();expect(bad.host.firstChild).toBe(bad.original);
});
it("validates the chrome catalog before runtime work and passes it to the DOM owner",async()=>{
 for(const documentScope of [false,true]){
  mocks.runtime.mockClear();const bad=setup(),ui={strings:{nope:"x"}} as never;
  const pending=documentScope?openLocalDocumentEditor({host:bad.host,selectionEditing:"document-v1",ui}):openLocalEditor({host:bad.host,ui});
  await expect(pending).rejects.toThrow("Unknown UI string");expect(mocks.runtime).not.toHaveBeenCalled();expect(bad.host.firstChild).toBe(bad.original);
 }
 mocks.mount.mockClear();const t=setup(),ui={lang:"ar",direction:"rtl" as const,strings:{slashEmpty:"لا شيء"}};
 const editor=await openLocalEditor({host:t.host,ui,initial:{kind:"document",documentJson:"native"}});expect(mocks.mount.mock.calls[0]![1]).toMatchObject({ui});editor.dispose();
});
it("general input routing is explicit, capability checked before mutation, and independent from local save family",async()=>{
 const t=setup(),editor=await openLocalEditor({host:t.host,rangeEditing:"general-v1",history:"typing-v1",initial:{kind:"typingCheckpoint",checkpointJson:"opaque natural local"}});expect(t.profile.restoreTypingEditor).toHaveBeenCalledWith("opaque natural local");expect(mocks.mount.mock.calls[0]![1].rangeEditing).toBe("general-v1");editor.dispose();
 const old=setup(false);mocks.mount.mockClear();await expect(openLocalEditor({host:old.host,rangeEditing:"general-v1",initial:{kind:"document",documentJson:"native"}})).rejects.toThrow("matching native general-range");expect(mocks.mount).not.toHaveBeenCalled();expect(old.core.setReadOnly).not.toHaveBeenCalled();expect(old.core.dispose).toHaveBeenCalledOnce();expect(old.host.firstChild).toBe(old.original);
 mocks.runtime.mockClear();await expect(openLocalEditor({host:old.host,rangeEditing:"auto" as "general-v1"})).rejects.toThrow("rangeEditing original or general-v1");expect(mocks.runtime).not.toHaveBeenCalled();
});
it("typing policy is enabled before readonly and mount while original checkpoint recovery remains explicit",async()=>{
 const t=setup(),editor=await openLocalEditor({host:t.host,history:"typing-v1",readOnly:true,initial:{kind:"checkpoint",checkpointJson:"old exact checkpoint"}});
 expect(t.profile.restoreEditor).toHaveBeenCalledWith("old exact checkpoint");expect(t.profile.restoreTypingEditor).not.toHaveBeenCalled();expect(t.core.enableTypingHistory).toHaveBeenCalledOnce();
 expect(t.core.enableTypingHistory.mock.invocationCallOrder[0]).toBeLessThan(t.core.setReadOnly.mock.invocationCallOrder[0]!);expect(t.core.setReadOnly.mock.invocationCallOrder[0]).toBeLessThan(mocks.mount.mock.invocationCallOrder[0]!);
 expect(editor.closeTypingGroup("7")).toBe(true);expect(t.dom.closeTypingGroup).toHaveBeenCalledWith("7");editor.dispose();t.host.remove();
});
it("declared typing checkpoints select only the grouped factory, never original fallback",async()=>{
 const t=setup(),editor=await openLocalEditor({host:t.host,initial:{kind:"typingCheckpoint",checkpointJson:"grouped exact checkpoint"}});
 expect(t.profile.restoreTypingEditor).toHaveBeenCalledWith("grouped exact checkpoint");expect(t.profile.restoreEditor).not.toHaveBeenCalled();expect(t.core.enableTypingHistory).toHaveBeenCalledOnce();editor.dispose();t.host.remove();
});
it("older runtimes reject grouping and rollback before mount; default openings need no new capability",async()=>{
 const t=setup(false);await expect(openLocalEditor({host:t.host,history:"typing-v1",initial:{kind:"document",documentJson:"admitted by mock"}})).rejects.toThrow("matching native typing history");expect(mocks.mount).not.toHaveBeenCalled();expect(t.host.firstChild).toBe(t.original);expect(t.core.dispose).toHaveBeenCalledOnce();
 const editor=await openLocalEditor({host:t.host,initial:{kind:"document",documentJson:"admitted by mock"}});expect(t.core.enableTypingHistory).not.toHaveBeenCalled();editor.dispose();t.host.remove();
});
it("conflicting or malformed mode rejects before claiming a host or loading Wasm",async()=>{
 const t=setup();await expect(openLocalEditor({host:t.host,history:"explicit",initial:{kind:"typingCheckpoint",checkpointJson:"grouped"}})).rejects.toThrow("requires");
 await expect(openLocalEditor({host:t.host,history:"other" as "explicit"})).rejects.toThrow("Expected history");expect(mocks.runtime).not.toHaveBeenCalled();expect(t.host.firstChild).toBe(t.original);t.host.remove();
});
it("V3 opening selects only bootstrap8 and its owner-bound layout toolbar",async()=>{
 const t=setup(),editor=await openLocalEditor({host:t.host,richLanguage:3,initial:{kind:"document",documentJson:"native document"}});
 expect(mocks.compile).not.toHaveBeenCalled();expect(JSON.parse(mocks.compileV3.mock.calls[0]![1])).toMatchObject({formatVersion:8,schema:{version:3}});expect(mocks.layoutToolbar).toHaveBeenCalledWith(t.core,{});editor.dispose();
 const other=setup();mocks.runtime.mockClear();await expect(openLocalEditor({host:other.host,richLanguage:5 as 3})).rejects.toThrow("1, 2, 3 or 4");expect(mocks.runtime).not.toHaveBeenCalled();expect(other.host.firstChild).toBe(other.original);
});
it("candidate V4 opening selects only bootstrap9 and its owner-bound V4 toolbar in both local scopes",async()=>{
 for(const documentScope of [false,true]){
  vi.clearAllMocks();mocks.runtime.mockResolvedValue({});
  const t=setup();(t.profile as Record<string,unknown>)["supportsDocumentSelection"]=()=>true;(t.profile as Record<string,unknown>)["createDocumentEditor"]=t.profile.createEditor;(t.profile as Record<string,unknown>)["restoreDocumentEditor"]=t.profile.restoreEditor;(t.profile as Record<string,unknown>)["restoreDocumentTypingEditor"]=t.profile.restoreTypingEditor;
  const initial={kind:"document" as const,documentJson:"native document"};
  const editor=documentScope?await openLocalDocumentEditor({host:t.host,selectionEditing:"document-v1",richLanguage:4,initial}):await openLocalEditor({host:t.host,richLanguage:4,initial});
  expect(mocks.compile).not.toHaveBeenCalled();expect(mocks.compileV3).not.toHaveBeenCalled();
  expect(JSON.parse(mocks.compileV4.mock.calls[0]![1])).toEqual({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"breditor-editor/standard",version:4},extensions:[]});
  expect(mocks.toolbarV4).toHaveBeenCalledWith(t.core,{});expect(mocks.layoutToolbar).not.toHaveBeenCalled();editor.dispose();
 }
});
