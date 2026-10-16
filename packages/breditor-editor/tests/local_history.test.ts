import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({compile:vi.fn(),runtime:vi.fn(),mount:vi.fn()}));
vi.mock("../src/runtime.js",()=>({initializeLocalRuntime:mocks.runtime}));
vi.mock("@breditor/experimental-rich-content",()=>({compileStandardRichProfileV1:mocks.compile,compileStandardStructuralRichProfileV2:mocks.compile,createStandardRichInlinePresentationV1:()=>({}),createStandardRichToolbarV1:()=>[],createStructuralRichToolbarV2:()=>[],mountRichEditor:mocks.mount,insertImageFiles:vi.fn()}));
import {openLocalEditor} from "../src/local.js";
function setup(capable=true){
 let natural=false;
 const core={supportsTypingHistory:()=>capable,enableTypingHistory:vi.fn(()=>{const changed=!natural;natural=true;return changed;}),supportsReadOnly:()=>true,setReadOnly:vi.fn(()=>true),dispose:vi.fn(),view:()=>({historyGrouping:natural?"typing-v1":undefined})};
 const profile={descriptor:()=>({schema:{name:"example/unit",version:1},schemaFingerprint:"test"}),inlineCatalogJson:()=>"[]",createEditor:vi.fn(()=>core),restoreEditor:vi.fn(()=>core),supportsTypingHistory:()=>capable,restoreTypingEditor:vi.fn(()=>{natural=true;return core;}),dispose:vi.fn()};
 const dom={surface:document.createElement("div"),toolbar:document.createElement("div"),status:document.createElement("p"),dispose:vi.fn(()=>core.dispose()),closeTypingGroup:vi.fn(()=>true)};
 mocks.compile.mockReturnValue(profile);mocks.mount.mockReturnValue(dom);const host=document.createElement("main"),original=document.createElement("button");host.append(original);document.body.append(host);
 return {host,original,core,profile,dom};
}
beforeEach(()=>{vi.clearAllMocks();mocks.runtime.mockResolvedValue({});document.body.replaceChildren();});
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
