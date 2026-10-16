import {StrictMode,act,createRef} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {LocalEditor} from "../src/local.js";
const mocks=vi.hoisted(()=>({open:vi.fn()}));
vi.mock("../src/local.js",()=>({openLocalEditor:mocks.open}));
import {BreditorEditor,type BreditorEditorHandle} from "../src/react.js";
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;
const editor=()=>({dispose:vi.fn(),focus:vi.fn(),checkpointJson:()=>"exact checkpoint",execute:vi.fn(()=>"content"),setReadOnly:vi.fn(()=>true),closeTypingGroup:vi.fn(()=>true),view:vi.fn()} as unknown as LocalEditor);
async function settle(){await act(async()=>{await Promise.resolve();await Promise.resolve();});}
beforeEach(()=>{mocks.open.mockReset();container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
describe("React Rust-owner lifecycle",()=>{
 it("natural history is initial per key and imperative boundaries retain the same owner",async()=>{
  const owned=editor(),ref=createRef<BreditorEditorHandle>();mocks.open.mockResolvedValue(owned);
  await act(async()=>root.render(<BreditorEditor ref={ref} initialOptions={{history:"typing-v1"}}/>));await settle();expect(mocks.open.mock.calls[0]![0].history).toBe("typing-v1");
  await act(async()=>root.render(<BreditorEditor ref={ref} initialOptions={{history:"explicit"}}/>));expect(mocks.open).toHaveBeenCalledOnce();expect(ref.current?.getEditor()).toBe(owned);
  expect(ref.current?.closeTypingGroup("9")).toBe(true);expect(owned.closeTypingGroup).toHaveBeenCalledWith("9");
 });
 it("live readOnly props and imperative control retain one owner and its history",async()=>{
  const owned=editor(),ref=createRef<BreditorEditorHandle>();mocks.open.mockResolvedValue(owned);
  await act(async()=>root.render(<BreditorEditor ref={ref} readOnly={true}/>));await settle();expect(mocks.open.mock.calls[0]![0].readOnly).toBe(true);expect(owned.setReadOnly).toHaveBeenCalledWith(true);
  await act(async()=>root.render(<BreditorEditor ref={ref} readOnly={false}/>));expect(owned.setReadOnly).toHaveBeenLastCalledWith(false);expect(mocks.open).toHaveBeenCalledOnce();expect(ref.current?.checkpointJson()).toBe("exact checkpoint");
  expect(ref.current?.setReadOnly(true,"7")).toBe(true);expect(owned.setReadOnly).toHaveBeenLastCalledWith(true,"7");
 });
 it("latest policy applies before readiness after a pending open; a failed update disposes the unannounced owner",async()=>{
  let finish!:(value:LocalEditor)=>void;const owned=editor(),ready=vi.fn(),error=vi.fn();mocks.open.mockImplementation(()=>new Promise<LocalEditor>(resolve=>{finish=resolve;}));
  await act(async()=>root.render(<BreditorEditor readOnly={false} onReady={ready} onError={error}/>));await settle();await act(async()=>root.render(<BreditorEditor readOnly={true} onReady={ready} onError={error}/>));
  vi.mocked(owned.setReadOnly).mockImplementation(()=>{throw Error("Policy update failed");});await act(async()=>finish(owned));await settle();expect(owned.setReadOnly).toHaveBeenCalledWith(true);expect(owned.dispose).toHaveBeenCalledOnce();expect(ready).not.toHaveBeenCalled();expect(error).toHaveBeenCalled();
 });
 it("StrictMode mounts one active owner and cleanup disposes it once",async()=>{
  const owned=editor();mocks.open.mockResolvedValue(owned);const ref=createRef<BreditorEditorHandle>();await act(async()=>root.render(<StrictMode><BreditorEditor ref={ref}/></StrictMode>));await settle();expect(mocks.open).toHaveBeenCalledTimes(1);expect(ref.current?.getEditor()).toBe(owned);expect(ref.current?.checkpointJson()).toBe("exact checkpoint");await act(async()=>root.unmount());expect(owned.dispose).toHaveBeenCalledTimes(1);
 });
 it("parent callbacks update without resetting history; sessionKey retires the previous owner",async()=>{
  const first=editor(),second=editor(),a=vi.fn(),b=vi.fn();mocks.open.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await act(async()=>root.render(<BreditorEditor sessionKey="one" initialOptions={{label:"First"}} onChange={a}/>));await settle();const options=mocks.open.mock.calls[0]![0];
  await act(async()=>root.render(<BreditorEditor sessionKey="one" initialOptions={{label:"Ignored until a new key"}} onChange={b}/>));options.onChange({},"content");expect(a).not.toHaveBeenCalled();expect(b).toHaveBeenCalledTimes(1);expect(mocks.open).toHaveBeenCalledTimes(1);
  await act(async()=>root.render(<BreditorEditor sessionKey="two" onChange={b}/>));await settle();expect(first.dispose).toHaveBeenCalledTimes(1);expect(mocks.open).toHaveBeenCalledTimes(2);expect(second.dispose).not.toHaveBeenCalled();
 });
 it("late startup after unmount is disposed and never announced ready",async()=>{
  let finish!:(value:LocalEditor)=>void;const owned=editor(),ready=vi.fn();mocks.open.mockImplementation(()=>new Promise<LocalEditor>(resolve=>{finish=resolve;}));await act(async()=>root.render(<BreditorEditor onReady={ready}/>));await settle();const signal=mocks.open.mock.calls[0]![0].signal;await act(async()=>root.unmount());expect(signal.aborted).toBe(true);await act(async()=>finish(owned));expect(owned.dispose).toHaveBeenCalledTimes(1);expect(ready).not.toHaveBeenCalled();
 });
 it("a failed startup can retry without retaining a dead owner",async()=>{
  const owned=editor(),failed=vi.fn(),ref=createRef<BreditorEditorHandle>();mocks.open.mockRejectedValueOnce(Error("load failed")).mockResolvedValueOnce(owned);await act(async()=>root.render(<BreditorEditor ref={ref} onError={failed}/>));await settle();expect(container.querySelector('[role="alert"]')).not.toBeNull();expect(failed).toHaveBeenCalledTimes(1);await act(async()=>ref.current?.retry());await settle();expect(ref.current?.getEditor()).toBe(owned);expect(container.querySelector('[role="alert"]')).toBeNull();
  await act(async()=>ref.current?.retry());expect(mocks.open).toHaveBeenCalledTimes(2);expect(owned.dispose).not.toHaveBeenCalled();
 });
});
