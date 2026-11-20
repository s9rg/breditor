import {act,createRef} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({mount:vi.fn()}));
vi.mock("../src/shared_slash_commands.js",()=>({mountSlashCommands:mocks.mount}));
import {BreditorSharedSlashCommands,type BreditorSharedSlashCommandsHandle} from "../src/shared_slash_commands_react.js";
import type {SharedSlashCommandEditor} from "../src/shared_slash_commands.js";
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;
beforeEach(()=>{mocks.mount.mockReset();container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
it("borrows the shared session once per key, routes latest callbacks and disposes only its controller",async()=>{
 const controller={dispose:vi.fn(),cancel:vi.fn()},editor={} as SharedSlashCommandEditor,ref=createRef<BreditorSharedSlashCommandsHandle>();mocks.mount.mockReturnValue(controller);
 const first=vi.fn(),second=vi.fn();
 await act(async()=>root.render(<BreditorSharedSlashCommands ref={ref} editor={null}/>));expect(mocks.mount).not.toHaveBeenCalled();
 await act(async()=>root.render(<BreditorSharedSlashCommands ref={ref} editor={editor} onCancel={first}/>));expect(mocks.mount).toHaveBeenCalledOnce();expect(mocks.mount.mock.calls[0]![0]).toBe(editor);
 // Omitted initialOptions leave `items` to the session's own toolbar.
 expect(mocks.mount.mock.calls[0]![1].items).toBeUndefined();
 await act(async()=>root.render(<BreditorSharedSlashCommands ref={ref} editor={editor} initialOptions={{maxItems:3}} onCancel={second}/>));expect(mocks.mount).toHaveBeenCalledOnce();
 mocks.mount.mock.calls[0]![1].onCancel("trigger-invalidated");expect(second).toHaveBeenCalledWith("trigger-invalidated");expect(first).not.toHaveBeenCalled();
 expect(ref.current?.getController()).toBe(controller);ref.current?.cancel();expect(controller.cancel).toHaveBeenCalledOnce();
 await act(async()=>root.render(<BreditorSharedSlashCommands ref={ref} editor={editor} sessionKey="next"/>));expect(mocks.mount).toHaveBeenCalledTimes(2);expect(controller.dispose).toHaveBeenCalledOnce();
 await act(async()=>root.render(<BreditorSharedSlashCommands ref={ref} editor={null}/>));expect(controller.dispose).toHaveBeenCalledTimes(2);expect(ref.current?.getController()).toBeNull();
});
it("reports startup failure without touching the session",async()=>{
 const onError=vi.fn();mocks.mount.mockImplementation(()=>{throw Error("Pass slash-command items, or an editor that exposes toolbarControls()");});
 await act(async()=>root.render(<BreditorSharedSlashCommands editor={{} as SharedSlashCommandEditor} onError={onError}/>));
 expect(onError).toHaveBeenCalledOnce();expect(container.querySelector("[role=alert]")!.textContent).toContain("toolbarControls");
});
