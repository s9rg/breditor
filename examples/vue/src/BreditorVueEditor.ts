import {defineComponent,h,onBeforeUnmount,onMounted,ref,watch,type PropType} from "vue";
import {openLocalEditor,type LocalEditor,type LocalEditorOptions,type RichView} from "@breditor/editor";

type RichCommandOutcome=Parameters<NonNullable<LocalEditorOptions["onChange"]>>[1];

export type BreditorVuePhase="starting"|"ready"|"failed";
export interface BreditorVueEditorExposed {getEditor():LocalEditor|null;retry():void}

/**
 * Vue 3 adapter around the vanilla local owner. Written with a render function so the
 * example needs only the `vue` package (no SFC compiler plugin).
 *
 * - `documentJson` and `label` are initial, read once per component instance like an
 *   uncontrolled input's default value. Change the parent's `:key` to open another document.
 * - `readOnly` is live and goes through `setReadOnly`, never a re-mount.
 * - Unmount (including Vite HMR, `v-if` and key changes) aborts a pending opening and
 *   disposes a live owner. A late resolution after unmount is disposed, never announced.
 * - Vue never renders children into the host element; the editor owns that subtree.
 */
export const BreditorVueEditor=defineComponent({
 name:"BreditorVueEditor",
 props:{
  documentJson:{type:String as PropType<string|null>,default:null},
  readOnly:{type:Boolean,default:false},
  label:{type:String,default:"Document"},
 },
 emits:{
  ready:(_editor:LocalEditor)=>true,
  change:(_view:RichView,_outcome:RichCommandOutcome)=>true,
  error:(_error:unknown)=>true,
 },
 setup(props,{emit,expose}){
  const host=ref<HTMLDivElement|null>(null),phase=ref<BreditorVuePhase>("starting");
  const initial=props.documentJson,label=props.label;
  let editor:LocalEditor|null=null,controller:AbortController|null=null,mounted=false;
  const fail=(error:unknown):void=>{controller=null;phase.value="failed";emit("error",error);};
  const start=():void=>{
   const element=host.value;
   if(!mounted||element===null||controller!==null||editor!==null)return;
   const current=new AbortController(),policy=props.readOnly;controller=current;phase.value="starting";
   openLocalEditor({host:element,signal:current.signal,label,readOnly:policy,
    initial:initial!==null?{kind:"document",documentJson:initial}:{kind:"empty"},
    // Callbacks after unmount are dropped: the owner is already disposed by then.
    onChange:(view,outcome)=>{if(mounted)emit("change",view,outcome);},
    onError:error=>{if(mounted)emit("error",error);}})
    .then(next=>{
     if(current.signal.aborted){next.dispose();return;}
     try{if(props.readOnly!==policy)next.setReadOnly(props.readOnly);}catch(error){next.dispose();fail(error);return;}
     editor=next;controller=null;phase.value="ready";emit("ready",next);
    },error=>{if(!current.signal.aborted)fail(error);});// Cancellation is not an error.
  };
  const stop=():void=>{
   mounted=false;controller?.abort();controller=null;
   const owned=editor;editor=null;owned?.dispose();// Idempotent.
  };
  onMounted(()=>{mounted=true;start();});
  onBeforeUnmount(stop);
  watch(()=>props.readOnly,value=>{
   if(editor===null)return;// A pending opening re-reads the prop when it resolves.
   try{editor.setReadOnly(value);}catch(error){emit("error",error);}
  });
  const retry=():void=>{if(phase.value==="failed")start();};
  expose({getEditor:()=>editor,retry} satisfies BreditorVueEditorExposed);
  return ()=>h("div",{class:"breditor-vue-editor","data-breditor-phase":phase.value,"aria-busy":phase.value==="starting"?"true":undefined},[
   h("div",{ref:host}),
   phase.value==="failed"?h("p",{role:"alert"},["The editor could not start. ",h("button",{type:"button",onClick:retry},"Retry")]):null,
  ]);
 },
});
