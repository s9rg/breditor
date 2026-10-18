import {StrictMode,act,createRef} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {SharedEditorSession} from "../src/shared_session.js";
const mocks=vi.hoisted(()=>({open:vi.fn(),search:vi.fn()}));
vi.mock("../src/shared_session.js",()=>({openSharedEditor:mocks.open,openSharedSearchEditor:mocks.search}));
import {BreditorSharedEditor,BreditorSharedSearchEditor,type BreditorSharedEditorHandle} from "../src/shared_react.js";
import {SharedEditorOpenError} from "../src/shared_open_error.js";
import type {SharedPersistentSession} from "@breditor/collaboration";
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;
const options={database:"react-test",room:"room",writer:"101"};
const editor=()=>({close:vi.fn(async()=>{}),discardAndClose:vi.fn(async()=>{}),focus:vi.fn(),checkpointJson:()=>"exact causal journal",execute:vi.fn(),setReadOnly:vi.fn(()=>true),closeTypingGroup:vi.fn(()=>true),flush:vi.fn(async()=>{})} as unknown as SharedEditorSession);
async function settle(){await act(async()=>{for(let i=0;i<12;i++)await Promise.resolve();});}
beforeEach(()=>{mocks.open.mockReset();mocks.search.mockReset();container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());await settle();container.remove();});
describe("durable React writer ownership",()=>{
 it("search startup is a separate immutable family and retains failed retirement before replacement",async()=>{
  const first=editor(),second=editor(),ref=createRef<BreditorSharedEditorHandle>(),failure=vi.fn(),initial={...options,richLanguage:3 as const,rangeEditing:"general-v1" as const,history:"typing-v1" as const,initial:{kind:"searchCheckpoint" as const,checkpointJson:"search journal"}};
  mocks.search.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const render=(key:string)=><BreditorSharedSearchEditor ref={ref} sessionKey={key} initialOptions={initial} onCloseError={failure}/>;
  await act(async()=>root.render(<StrictMode>{render("first")}</StrictMode>));await settle();expect(mocks.search).toHaveBeenCalledOnce();expect(mocks.open).not.toHaveBeenCalled();expect(mocks.search.mock.calls[0]![0]).toMatchObject(initial);
  await act(async()=>root.render(<StrictMode><BreditorSharedSearchEditor ref={ref} sessionKey="first" initialOptions={{...initial,history:"explicit"}} onCloseError={failure}/></StrictMode>));await settle();expect(mocks.search).toHaveBeenCalledOnce();expect(ref.current?.getEditor()).toBe(first);
  vi.mocked(first.close).mockRejectedValue(Error("Quota"));await act(async()=>root.render(<StrictMode>{render("second")}</StrictMode>));await settle();expect(ref.current?.getRecovery()).toBe(first);expect(first.discardAndClose).not.toHaveBeenCalled();expect(mocks.search).toHaveBeenCalledOnce();
  vi.mocked(first.close).mockResolvedValue(undefined);await act(async()=>ref.current?.retry());await settle();expect(ref.current?.getEditor()).toBe(second);expect(mocks.search).toHaveBeenCalledTimes(2);expect(mocks.open).not.toHaveBeenCalled();
 });
 it("general policy is immutable per key and failed retirement retains its exact family before replacement",async()=>{
  const first=editor(),second=editor(),ref=createRef<BreditorSharedEditorHandle>(),failed=vi.fn();Object.assign(first,{rangePolicy:()=>"general-v1",historyPolicy:()=>"typing-v1"});Object.assign(second,{rangePolicy:()=>"original",historyPolicy:()=>"explicit"});vi.mocked(first.close).mockRejectedValue(Error("Quota"));mocks.open.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await act(async()=>root.render(<BreditorSharedEditor ref={ref} sessionKey="general" initialOptions={{...options,rangeEditing:"general-v1",history:"typing-v1",initial:{kind:"generalTypingCheckpoint",checkpointJson:"exact causal journal"}}} onCloseError={failed}/>));await settle();expect(mocks.open.mock.calls[0]![0]).toMatchObject({rangeEditing:"general-v1",history:"typing-v1",initial:{kind:"generalTypingCheckpoint"}});
  await act(async()=>root.render(<BreditorSharedEditor ref={ref} sessionKey="general" initialOptions={{...options,rangeEditing:"original"}} onCloseError={failed}/>));await settle();expect(mocks.open).toHaveBeenCalledOnce();expect(ref.current?.getEditor()).toBe(first);
  await act(async()=>root.render(<BreditorSharedEditor ref={ref} sessionKey="replacement" initialOptions={{...options,rangeEditing:"original"}} onCloseError={failed}/>));await settle();expect(ref.current?.getRecovery()).toBe(first);expect(ref.current?.getRecovery()?.rangePolicy?.()).toBe("general-v1");expect(ref.current?.getRecovery()?.historyPolicy?.()).toBe("typing-v1");expect(ref.current?.checkpointJson()).toBe("exact causal journal");expect(mocks.open).toHaveBeenCalledOnce();expect(first.discardAndClose).not.toHaveBeenCalled();
  vi.mocked(first.close).mockResolvedValue(undefined);await act(async()=>ref.current?.retry());await settle();expect(first.close).toHaveBeenCalledTimes(3);expect(mocks.open).toHaveBeenCalledTimes(2);expect(mocks.open.mock.calls[1]![0].rangeEditing).toBe("original");expect(ref.current?.getEditor()).toBe(second);
 });
 it("history policy is initial owner configuration while the imperative boundary reaches the current owner",async()=>{
  const owned=editor(),ref=createRef<BreditorSharedEditorHandle>();mocks.open.mockResolvedValue(owned);
  await act(async()=>root.render(<BreditorSharedEditor ref={ref} initialOptions={{...options,history:"typing-v1"}} onCloseError={()=>{}}/>));await settle();expect(mocks.open.mock.calls[0]![0].history).toBe("typing-v1");expect(ref.current?.closeTypingGroup("9")).toBe(true);expect(owned.closeTypingGroup).toHaveBeenCalledWith("9");
  await act(async()=>root.render(<BreditorSharedEditor ref={ref} initialOptions={{...options,history:"explicit"}} onCloseError={()=>{}}/>));await settle();expect(mocks.open).toHaveBeenCalledOnce();expect(ref.current?.getEditor()).toBe(owned);
 });
 it("live readOnly updates preserve one durable writer and allow imperative policy control",async()=>{
  const owned=editor(),ref=createRef<BreditorSharedEditorHandle>();mocks.open.mockResolvedValue(owned);
  await act(async()=>root.render(<BreditorSharedEditor ref={ref} readOnly={true} initialOptions={options} onCloseError={()=>{}}/>));await settle();expect(mocks.open.mock.calls[0]![0].readOnly).toBe(true);expect(owned.setReadOnly).toHaveBeenCalledWith(true);
  await act(async()=>root.render(<BreditorSharedEditor ref={ref} readOnly={false} initialOptions={options} onCloseError={()=>{}}/>));expect(owned.setReadOnly).toHaveBeenLastCalledWith(false);expect(mocks.open).toHaveBeenCalledOnce();expect(ref.current?.checkpointJson()).toBe("exact causal journal");
  expect(ref.current?.setReadOnly(true,"9")).toBe(true);expect(owned.setReadOnly).toHaveBeenLastCalledWith(true,"9");
 });
 it("a late policy-update failure durably closes its unannounced owner",async()=>{
  let finish!:(value:SharedEditorSession)=>void;const owned=editor(),ready=vi.fn(),error=vi.fn(),failed=vi.fn();mocks.open.mockImplementation(()=>new Promise<SharedEditorSession>(resolve=>{finish=resolve;}));
  await act(async()=>root.render(<BreditorSharedEditor readOnly={false} initialOptions={options} onReady={ready} onError={error} onCloseError={failed}/>));await settle();await act(async()=>root.render(<BreditorSharedEditor readOnly={true} initialOptions={options} onReady={ready} onError={error} onCloseError={failed}/>));
  vi.mocked(owned.setReadOnly).mockImplementation(()=>{throw Error("Policy update failed");});await act(async()=>finish(owned));await settle();expect(owned.setReadOnly).toHaveBeenCalledWith(true);expect(owned.close).toHaveBeenCalledOnce();expect(owned.discardAndClose).not.toHaveBeenCalled();expect(ready).not.toHaveBeenCalled();expect(error).toHaveBeenCalled();expect(failed).not.toHaveBeenCalled();
 });
 it("StrictMode announces only one owner and awaits one durable close",async()=>{
  const owned=editor(),ref=createRef<BreditorSharedEditorHandle>(),failed=vi.fn();mocks.open.mockResolvedValue(owned);
  await act(async()=>root.render(<StrictMode><BreditorSharedEditor ref={ref} initialOptions={options} onCloseError={failed}/></StrictMode>));await settle();
  expect(mocks.open).toHaveBeenCalledTimes(1);expect(ref.current?.getEditor()).toBe(owned);
  await act(async()=>root.unmount());await settle();expect(owned.close).toHaveBeenCalledTimes(1);expect(owned.discardAndClose).not.toHaveBeenCalled();expect(failed).not.toHaveBeenCalled();
 });
 it("parent renders use latest callbacks without reopening or resetting history",async()=>{
  const owned=editor(),first=vi.fn(),latest=vi.fn(),save=vi.fn();mocks.open.mockResolvedValue(owned);
  await act(async()=>root.render(<BreditorSharedEditor initialOptions={options} onChange={first} onPasteLoss={first} onCloseError={()=>{}}/>));await settle();
  const initial=mocks.open.mock.calls[0]![0];
  await act(async()=>root.render(<BreditorSharedEditor initialOptions={{...options,writer:"202"}} onChange={latest} onPasteLoss={latest} onSaveState={save} onCloseError={()=>{}}/>));
  initial.onChange({source:"local"});initial.onPasteLoss({losses:["block-structure"]});initial.onSaveState({status:"saved"});expect(first).not.toHaveBeenCalled();expect(latest).toHaveBeenCalledTimes(2);expect(save).toHaveBeenCalledTimes(1);expect(mocks.open).toHaveBeenCalledTimes(1);
 });
 it("key change cannot open its replacement before the previous flush releases the lease",async()=>{
  const first=editor(),second=editor();let finish!:()=>void;vi.mocked(first.close).mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));mocks.open.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await act(async()=>root.render(<BreditorSharedEditor sessionKey="a" initialOptions={options} onCloseError={()=>{}}/>));await settle();
  await act(async()=>root.render(<BreditorSharedEditor sessionKey="b" initialOptions={options} onCloseError={()=>{}}/>));await settle();expect(first.close).toHaveBeenCalledTimes(1);expect(mocks.open).toHaveBeenCalledTimes(1);
  await act(async()=>finish());await settle();expect(mocks.open).toHaveBeenCalledTimes(2);
 });
 it("late factory success after unmount closes durably without readiness or automatic discard",async()=>{
  const owned=editor(),ready=vi.fn(),failed=vi.fn();let finish!:(editor:SharedEditorSession)=>void;mocks.open.mockImplementation(()=>new Promise<SharedEditorSession>(resolve=>{finish=resolve;}));
  await act(async()=>root.render(<BreditorSharedEditor initialOptions={options} onReady={ready} onCloseError={failed}/>));await settle();
  const signal=mocks.open.mock.calls[0]![0].signal;await act(async()=>root.unmount());expect(signal.aborted).toBe(true);
  await act(async()=>finish(owned));await settle();expect(owned.close).toHaveBeenCalledTimes(1);expect(owned.discardAndClose).not.toHaveBeenCalled();expect(ready).not.toHaveBeenCalled();expect(failed).not.toHaveBeenCalled();
 });
 it("failed retirement hands off the exact writer and blocks replacement until an explicit retry succeeds",async()=>{
  const first=editor(),second=editor(),failed=vi.fn(),ref=createRef<BreditorSharedEditorHandle>();vi.mocked(first.close).mockRejectedValue(Error("Quota exceeded"));mocks.open.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await act(async()=>root.render(<BreditorSharedEditor ref={ref} sessionKey="a" initialOptions={options} onCloseError={failed}/>));await settle();
  await act(async()=>root.render(<BreditorSharedEditor ref={ref} sessionKey="b" initialOptions={options} onCloseError={failed}/>));await settle();
  expect(failed).toHaveBeenCalled();expect(ref.current?.getRecovery()).toBe(first);expect(ref.current?.checkpointJson()).toBe("exact causal journal");expect(mocks.open).toHaveBeenCalledTimes(1);expect(first.discardAndClose).not.toHaveBeenCalled();expect(container.querySelector('[role="alert"]')).not.toBeNull();
  vi.mocked(first.close).mockResolvedValue(undefined);await act(async()=>ref.current?.retry());await settle();expect(mocks.open).toHaveBeenCalledTimes(2);expect(ref.current?.getRecovery()).toBeNull();expect(ref.current?.getEditor()).toBe(second);
 });
 it("unmounted close failure reaches the required recovery callback even if its reporter throws",async()=>{
  const owned=editor(),failed=vi.fn(()=>{throw Error("reporter failed");}),report=vi.fn();vi.mocked(owned.close).mockRejectedValue(Error("Storage unavailable"));mocks.open.mockResolvedValue(owned);
  await act(async()=>root.render(<BreditorSharedEditor initialOptions={options} onCloseError={failed} onError={report}/>));await settle();await act(async()=>root.unmount());await settle();expect(failed).toHaveBeenCalledWith(expect.any(Error),owned);expect(owned.discardAndClose).not.toHaveBeenCalled();expect(report).toHaveBeenCalled();
 });
 it("failed startup cleanup hands off its headless exact journal and retries closure before another opening",async()=>{
  const close=vi.fn(async()=>{}),rawSession={core:{checkpointJson:()=>"opening journal"},close,discardAndClose:vi.fn(async()=>{})},failure=new SharedEditorOpenError(Error("Cleanup quota"),rawSession as unknown as SharedPersistentSession),owned=editor(),failed=vi.fn(),ref=createRef<BreditorSharedEditorHandle>();mocks.open.mockRejectedValueOnce(failure).mockResolvedValueOnce(owned);
  await act(async()=>root.render(<BreditorSharedEditor ref={ref} initialOptions={options} onCloseError={failed}/>));await settle();expect(failed).toHaveBeenCalledWith(failure,failure.recovery);expect(ref.current?.checkpointJson()).toBe("opening journal");expect(ref.current?.getEditor()).toBeNull();
  await act(async()=>ref.current?.retry());await settle();expect(close).toHaveBeenCalledTimes(1);expect(ref.current?.getEditor()).toBe(owned);expect(rawSession.discardAndClose).not.toHaveBeenCalled();
 });
});
