import {act,createRef} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {mountAiTools,mountLanguageCheck,aiToolsHost} from "../src/ai_tools.js";
import {BreditorAiTools,BreditorLanguageCheck,type BreditorAiToolsHandle,type BreditorLanguageCheckHandle} from "../src/ai_tools_react.js";
import type {SlashCommandEditor} from "../src/slash_commands.js";
import type {RichCommand} from "../../breditor-experimental-rich-content/src/core.js";
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;

/** Minimal local SDK editor shape (`LocalEditor` satisfies it); the real owner runs in the browser suite. */
function editor(text="Hello wrold"){
 let revision=1,value=text;const listeners=new Set<()=>void>(),commands:{command:RichCommand;revision:string|undefined}[]=[];
 const surface=document.createElement("div");document.body.append(surface);
 const documentJson=()=>JSON.stringify({root:{kind:"element",type:"breditor/document",properties:{},children:[{kind:"element",type:"breditor/paragraph",properties:{"breditor/block-id":"p"},children:[{kind:"text",text:value,formats:[]}]}]}});
 const selection={kind:"text" as const,anchor:{block:"p",offset:"6",affinity:"after" as const},focus:{block:"p",offset:"11",affinity:"after" as const}};
 const state=()=>({revision:String(revision),closed:false,busy:false,composing:false,available:true,readOnly:false,canReplace:true});
 const sdk={surface,focus:vi.fn(),
  search:()=>({searchState:state,subscribeSearch:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);}}),
  view:()=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson:documentJson(),selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]}),
  execute:vi.fn((command:RichCommand,_focus?:boolean,expected?:string)=>{
   commands.push({command,revision:expected});if(expected!==String(revision))throw Error("stale");
   if(command.kind==="replaceTextRange"){const s=command.data.selection;value=value.slice(0,Number(s.anchor.offset))+command.data.text+value.slice(Number(s.focus.offset));}
   revision++;for(const listener of listeners)listener();return "content" as const;
  }),
 };
 return {sdk:sdk as unknown as SlashCommandEditor,commands,value:()=>value};
}
let root:Root,container:HTMLDivElement;
beforeEach(()=>{container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());document.body.replaceChildren();});

it("borrows a local editor through its search/execute port and applies one guarded command",async()=>{
 const e=editor(),panel=document.createElement("aside");document.body.append(panel);
 const host=aiToolsHost(e.sdk);expect(host.aiState()).toEqual({revision:"1",closed:false,busy:false,composing:false,readOnly:false});
 const tools=mountAiTools(panel,e.sdk,{provider:async({text})=>({text:text==="wrold"?"world":text})});
 expect(await tools.requestRewrite({scope:"selection",instruction:"spelling"})).toMatchObject({original:"wrold",proposed:"world"});
 expect(e.commands).toHaveLength(0);tools.accept();
 expect(e.commands).toEqual([{command:{kind:"replaceTextRange",data:{selection:{kind:"text",anchor:{block:"p",offset:"6",affinity:"after"},focus:{block:"p",offset:"11",affinity:"after"}},text:"world"}},revision:"1"}]);
 expect(e.value()).toBe("Hello world");tools.dispose();expect(panel.childElementCount).toBe(0);
 const check=mountLanguageCheck(panel,e.sdk,{decorations:false,provider:()=>[{range:{block:"p",start:0,end:5},message:"Greeting",suggestions:["Hi"]}]});
 const [issue]=(await check.check({scope:"document"}))!;check.applySuggestion(issue!.key,0);expect(e.value()).toBe("Hi world");check.dispose();
});
it("React panels mount once per editor/session, route the latest callbacks and abort on retirement",async()=>{
 const e=editor(),ref=createRef<BreditorAiToolsHandle>(),signals:AbortSignal[]=[],first=vi.fn(),second=vi.fn();
 const initialOptions={provider:({signal}:{signal:AbortSignal})=>{signals.push(signal);return new Promise<{text:string}>(()=>{});}};
 await act(async()=>root.render(<BreditorAiTools ref={ref} editor={e.sdk} initialOptions={initialOptions} onError={first}/>));
 expect(container.querySelector("[data-breditor-ai]")).not.toBeNull();
 await act(async()=>root.render(<BreditorAiTools ref={ref} editor={e.sdk} initialOptions={initialOptions} onError={second}/>));
 expect(container.querySelectorAll("[data-breditor-ai]")).toHaveLength(1);
 void ref.current!.requestRewrite({scope:"selection",instruction:"x"});expect(signals).toHaveLength(1);
 await act(async()=>root.render(<BreditorAiTools ref={ref} editor={e.sdk} initialOptions={initialOptions} sessionKey="next"/>));
 expect(signals[0]!.aborted).toBe(true);expect(container.querySelectorAll("[data-breditor-ai]")).toHaveLength(1);
 await act(async()=>root.render(<BreditorAiTools ref={ref} editor={null}/>));expect(ref.current!.getTools()).toBeNull();
 expect(()=>ref.current!.accept()).toThrow("not ready");
 const lang=createRef<BreditorLanguageCheckHandle>();
 await act(async()=>root.render(<BreditorLanguageCheck ref={lang} editor={e.sdk} initialOptions={{decorations:false,provider:()=>[]}}/>));
 expect(await lang.current!.check({scope:"document"})).toEqual([]);expect(container.querySelector("[data-language-status]")!.textContent).toBe("No issues found");
 expect(first).not.toHaveBeenCalled();expect(second).not.toHaveBeenCalled();
});
