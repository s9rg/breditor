import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({compile:vi.fn(),runtime:vi.fn(),mount:vi.fn()}));
vi.mock("../src/runtime.js",()=>({initializeLocalRuntime:mocks.runtime}));
vi.mock("@breditor/experimental-rich-content",()=>({compileStandardRichProfileV1:mocks.compile,compileStandardStructuralRichProfileV2:mocks.compile,compileStandardLayoutRichProfileV3:mocks.compile,compileStandardRichProfileV4:mocks.compile,createRichToolbarV4:()=>[],createStandardRichInlinePresentationV1:()=>({}),createStandardRichToolbarV1:()=>[],createStructuralRichToolbarV2:()=>[],createLayoutRichToolbarV3:()=>[],mountRichEditor:mocks.mount,mountDocumentRichEditor:mocks.mount,insertImageFiles:vi.fn()}));
import {openLocalEditor} from "../src/local.js";
function setup(capable=true){
 const core={supportsRestrictedEditing:()=>capable,setRestrictedEditing:vi.fn(()=>true),supportsReadOnly:()=>true,setReadOnly:vi.fn(()=>true),dispose:vi.fn(),view:()=>({})};
 const profile={descriptor:()=>({schema:{name:"example/unit",version:1},schemaFingerprint:"test"}),inlineCatalogJson:()=>"[]",createEditor:vi.fn(()=>core),restoreEditor:vi.fn(()=>core),dispose:vi.fn()};
 const dom={surface:document.createElement("div"),toolbar:document.createElement("div"),status:document.createElement("p"),dispose:vi.fn(()=>core.dispose()),setRestrictedEditing:vi.fn(()=>true),navigateRestrictedRegion:vi.fn(()=>"selection")};
 mocks.compile.mockReturnValue(profile);mocks.mount.mockReturnValue(dom);const host=document.createElement("main"),original=document.createElement("button");host.append(original);document.body.append(host);
 return {host,original,core,dom};
}
beforeEach(()=>{vi.clearAllMocks();mocks.runtime.mockResolvedValue({});document.body.replaceChildren();});
it("applies the native policy before mount, after read-only, and forwards live changes",async()=>{
 const t=setup(),policy={editable:["field","tail"]};
 const editor=await openLocalEditor({host:t.host,readOnly:false,restrictedEditing:{policy},initial:{kind:"document",documentJson:"native"}});
 expect(t.core.setRestrictedEditing).toHaveBeenCalledWith({editable:["field","tail"]});
 expect(t.core.setReadOnly.mock.invocationCallOrder[0]).toBeLessThan(t.core.setRestrictedEditing.mock.invocationCallOrder[0]!);
 expect(t.core.setRestrictedEditing.mock.invocationCallOrder[0]).toBeLessThan(mocks.mount.mock.invocationCallOrder[0]!);
 expect(editor.setRestrictedEditing(null,"4")).toBe(true);expect(t.dom.setRestrictedEditing).toHaveBeenCalledWith(null,"4");
 expect(editor.navigateRestrictedRegion("previous")).toBe("selection");expect(t.dom.navigateRestrictedRegion).toHaveBeenCalledWith("previous",undefined);
 editor.dispose();
});
it("rejects malformed policies before runtime work and missing native enforcement before mount",async()=>{
 const bad=setup();
 for(const restrictedEditing of [null,{},{policy:null},{policy:{editable:"x"}},{policy:{editable:[1]}}]){
  await expect(openLocalEditor({host:bad.host,restrictedEditing:restrictedEditing as never})).rejects.toThrow("restrictedEditing");
 }
 expect(mocks.runtime).not.toHaveBeenCalled();expect(bad.host.firstChild).toBe(bad.original);
 const old=setup(false);
 await expect(openLocalEditor({host:old.host,restrictedEditing:{policy:{editable:[]}},initial:{kind:"document",documentJson:"native"}})).rejects.toThrow("restricted editing");
 expect(mocks.mount).not.toHaveBeenCalled();expect(old.core.dispose).toHaveBeenCalledOnce();expect(old.host.firstChild).toBe(old.original);
});
