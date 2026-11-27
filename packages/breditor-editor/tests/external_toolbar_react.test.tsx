import {StrictMode,act,createRef} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {BreditorToolbarSlot,type BreditorToolbarSlotHandle} from "../src/context_ui_react.js";
import type {RichContextUiHost,RichExternalToolbar} from "@breditor/experimental-rich-content";
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;
beforeEach(()=>{container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
function host(){
 const leases:{container:HTMLElement;dispose:ReturnType<typeof vi.fn>}[]=[];
 const mountToolbar=vi.fn((slot:HTMLElement):RichExternalToolbar=>{const lease={container:slot,dispose:vi.fn()};leases.push(lease);return {container:slot,element:slot,state:()=>({mounted:true}),focus:()=>true,dispose:lease.dispose};});
 return {editor:{surface:document.createElement("div"),mountToolbar} as unknown as RichContextUiHost,mountToolbar,leases};
}
describe("BreditorToolbarSlot",()=>{
 it("mounts the borrowed editor's toolbar into its own div and disposes on unmount or session change",async()=>{
  const h=host(),ref=createRef<BreditorToolbarSlotHandle>();
  await act(async()=>root.render(<StrictMode><BreditorToolbarSlot ref={ref} editor={h.editor} className="bar" sessionKey="a"/></StrictMode>));
  const slot=container.querySelector<HTMLDivElement>("[data-breditor-toolbar-slot]")!;
  expect(slot.className).toBe("bar");
  // StrictMode replays the effect: every lease but the live one is disposed, and all used the rendered slot.
  expect(h.leases.every(lease=>lease.container===slot)).toBe(true);
  expect(h.leases.filter(lease=>lease.dispose.mock.calls.length===0)).toHaveLength(1);
  expect(ref.current!.getToolbar()?.container).toBe(slot);expect(ref.current!.focus()).toBe(true);
  const before=h.leases.length;
  await act(async()=>root.render(<StrictMode><BreditorToolbarSlot ref={ref} editor={h.editor} className="bar" sessionKey="b"/></StrictMode>));
  expect(h.leases.length).toBeGreaterThan(before);expect(h.leases.filter(lease=>lease.dispose.mock.calls.length===0)).toHaveLength(1);
  await act(async()=>root.render(<></>));
  expect(h.leases.every(lease=>lease.dispose.mock.calls.length===1)).toBe(true);
 });
 it("reports a startup failure without throwing out of render",async()=>{
  const onError=vi.fn(),editor={surface:document.createElement("div")} as unknown as RichContextUiHost;
  await act(async()=>root.render(<BreditorToolbarSlot editor={editor} onError={onError}/>));
  expect(container.querySelector("[role=alert]")!.textContent).toContain("Toolbar could not start");
  expect(onError).toHaveBeenCalledTimes(1);
 });
});
