import {createApp} from "vue";
import {createLocalProfile} from "@breditor/editor";
import {App,type VueDemoLog} from "./App.js";

// Read the exact compiled schema binding once, then build seed documents synchronously.
const profile=await createLocalProfile();
const {schema,schemaFingerprint}=profile.descriptor();
profile.dispose();
const seed=(documentId:string,text:string):string=>JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":documentId},children:[
 {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"intro"},children:[{kind:"text",text,formats:[]}]},
]}});

const log:VueDemoLog={ready:0,changes:0,errors:[],editors:[]};
declare global {interface Window {vueDemo:VueDemoLog}}
window.vueDemo=log;

const app=createApp(App,{seed,log});
app.mount("#app");
// HMR: unmounting the old app runs every BreditorVueEditor cleanup (abort a pending
// opening, dispose a live owner) before the updated module mounts a fresh tree.
if(import.meta.hot){
 import.meta.hot.dispose(()=>app.unmount());
 import.meta.hot.accept();
}
