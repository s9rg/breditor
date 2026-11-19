import {act,createRef} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({mount:vi.fn()}));
vi.mock("../src/slash_commands.js",()=>({mountSlashCommands:mocks.mount}));
import {BreditorSlashCommands,type BreditorSlashCommandsHandle} from "../src/slash_commands_react.js";
import type {SlashCommandEditor} from "../src/slash_commands.js";
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,container:HTMLDivElement;
beforeEach(()=>{mocks.mount.mockReset();container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
it("borrows the editor once per key, routes latest callbacks and disposes only its controller",async()=>{
 const controller={dispose:vi.fn(),cancel:vi.fn()},editor={} as SlashCommandEditor,ref=createRef<BreditorSlashCommandsHandle>();mocks.mount.mockReturnValue(controller);
 const first=vi.fn(),second=vi.fn();
 await act(async()=>root.render(<BreditorSlashCommands ref={ref} editor={null} initialOptions={{items:[]}}/>));expect(mocks.mount).not.toHaveBeenCalled();
 await act(async()=>root.render(<BreditorSlashCommands ref={ref} editor={editor} initialOptions={{items:[]}} onCancel={first}/>));expect(mocks.mount).toHaveBeenCalledOnce();expect(mocks.mount.mock.calls[0]![0]).toBe(editor);
 await act(async()=>root.render(<BreditorSlashCommands ref={ref} editor={editor} initialOptions={{items:[],maxItems:3}} onCancel={second}/>));expect(mocks.mount).toHaveBeenCalledOnce();
 mocks.mount.mock.calls[0]![1].onCancel("blur");expect(second).toHaveBeenCalledWith("blur");expect(first).not.toHaveBeenCalled();
 expect(ref.current?.getController()).toBe(controller);ref.current?.cancel();expect(controller.cancel).toHaveBeenCalledOnce();
 await act(async()=>root.render(<BreditorSlashCommands ref={ref} editor={null} initialOptions={{items:[]}}/>));expect(controller.dispose).toHaveBeenCalledOnce();expect(ref.current?.getController()).toBeNull();
});
it("reports startup failure without touching the editor",async()=>{
 const onError=vi.fn();mocks.mount.mockImplementation(()=>{throw Error("already has slash commands");});
 await act(async()=>root.render(<BreditorSlashCommands editor={{} as SlashCommandEditor} initialOptions={{items:[]}} onError={onError}/>));
 expect(onError).toHaveBeenCalledOnce();expect(container.querySelector("[role=alert]")!.textContent).toContain("already has slash commands");
});
