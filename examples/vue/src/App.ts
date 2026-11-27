import {defineComponent,h,nextTick,ref,type PropType} from "vue";
import type {LocalEditor} from "@breditor/editor";
import {BreditorVueEditor} from "./BreditorVueEditor.js";

/** Plain (non-reactive) test log. Never wrap a native owner in a Vue reactive proxy. */
export interface VueDemoLog {ready:number;changes:number;errors:string[];editors:LocalEditor[]}

/** Demo shell: mount/unmount, key-based document replacement and a live read-only prop. */
export const App=defineComponent({
 name:"BreditorVueExample",
 props:{
  seed:{type:Function as PropType<(documentId:string,text:string)=>string>,required:true},
  log:{type:Object as PropType<VueDemoLog>,required:true},
 },
 setup(props){
  const shown=ref(true),readOnly=ref(false),documentNumber=ref(1),phase=ref("starting");
  const toggle=():void=>{shown.value=!shown.value;phase.value="starting";};
  // Unmount and mount again before the first opening can finish, as HMR or a fast
  // v-if flip does: the pending opening is aborted and exactly one owner remains.
  const remount=async():Promise<void>=>{shown.value=false;phase.value="starting";await nextTick();shown.value=true;};
  const next=():void=>{documentNumber.value+=1;phase.value="starting";};
  return ()=>h("main",[
   h("h1","Breditor Vue 3 example"),
   h("p",["Document ",h("output",{id:"document"},String(documentNumber.value))," · Phase: ",h("output",{id:"status","aria-live":"polite"},shown.value?phase.value:"unmounted")]),
   h("p",[
    h("label",[h("input",{id:"read-only",type:"checkbox",checked:readOnly.value,onChange:(event:Event)=>{readOnly.value=(event.target as HTMLInputElement).checked;}})," Read-only"]),
    " ",h("button",{id:"toggle",type:"button",onClick:toggle},shown.value?"Unmount":"Mount"),
    " ",h("button",{id:"remount",type:"button",onClick:remount},"Remount during startup"),
    " ",h("button",{id:"next",type:"button",onClick:next},"Open another document"),
   ]),
   shown.value?h(BreditorVueEditor,{
    // A new key is the only way to apply a new initial document: it disposes the old owner.
    key:documentNumber.value,
    documentJson:props.seed(`vue-example-${documentNumber.value}`,`Hello from Vue document ${documentNumber.value}.`),
    readOnly:readOnly.value,label:"Document",
    onReady:(editor:LocalEditor)=>{props.log.ready+=1;props.log.editors.push(editor);phase.value="ready";},
    onChange:()=>{props.log.changes+=1;},
    onError:(error:unknown)=>{props.log.errors.push(String(error));phase.value="failed";},
   }):null,
  ]);
 },
});
