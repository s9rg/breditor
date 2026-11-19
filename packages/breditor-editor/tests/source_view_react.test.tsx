import {act,createRef} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({mount:vi.fn()}));
vi.mock("@breditor/experimental-rich-content",()=>({mountRichSourceView:mocks.mount}));
import {BreditorSourceView,type BreditorSourceViewHandle} from "../src/source_view_react.js";
import type {RichDocumentSourceHost} from "../../breditor-experimental-rich-content/src/source_view_types.js";
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;
beforeEach(()=>{mocks.mount.mockReset();container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
it("borrows the source host once per key, routes latest callbacks and disposes only its panel",async()=>{
 const panel={dispose:vi.fn(),open:vi.fn(),review:vi.fn(()=>null),apply:vi.fn(()=>"content"),cancel:vi.fn()},editor={} as RichDocumentSourceHost,ref=createRef<BreditorSourceViewHandle>();mocks.mount.mockReturnValue(panel);
 const first=vi.fn(),second=vi.fn();
 await act(async()=>root.render(<BreditorSourceView ref={ref} editor={editor} onApply={first}/>));expect(mocks.mount).toHaveBeenCalledOnce();expect(mocks.mount.mock.calls[0]![1]).toBe(editor);
 await act(async()=>root.render(<BreditorSourceView ref={ref} editor={editor} onApply={second}/>));expect(mocks.mount).toHaveBeenCalledOnce();
 mocks.mount.mock.calls[0]![2].onApply("content");expect(second).toHaveBeenCalledWith("content");expect(first).not.toHaveBeenCalled();
 ref.current!.open();expect(panel.open).toHaveBeenCalledOnce();expect(ref.current!.apply()).toBe("content");ref.current!.cancel();expect(panel.cancel).toHaveBeenCalledOnce();
 await act(async()=>root.render(<BreditorSourceView ref={ref} editor={editor} sessionKey="next"/>));expect(panel.dispose).toHaveBeenCalledOnce();expect(mocks.mount).toHaveBeenCalledTimes(2);
});
it("reports startup failure without touching the editor",async()=>{
 const onError=vi.fn();mocks.mount.mockImplementation(()=>{throw Error("requires an explicit clipboard interchange adapter");});
 await act(async()=>root.render(<BreditorSourceView editor={{} as RichDocumentSourceHost} onError={onError}/>));
 expect(onError).toHaveBeenCalledOnce();expect(container.querySelector("[role=alert]")!.textContent).toContain("explicit clipboard interchange adapter");
});
