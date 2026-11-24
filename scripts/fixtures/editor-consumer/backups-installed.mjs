/** Installed package entry points only; storage/locks in this Node fixture are synthetic. */
import {readFileSync} from "node:fs";
import {IDBFactory} from "fake-indexeddb";
import init,* as wasm from "@breditor/collaboration/wasm";
import {runBackupAcceptance,reopenBackupAcceptance,recoverFreshOpenRaces} from "./backups-acceptance.mjs";
await init({module_or_path:readFileSync(new URL(import.meta.resolve("@breditor/collaboration/wasm-binary")))});
const held=new Set();Object.defineProperty(globalThis,"indexedDB",{value:new IDBFactory(),configurable:true});Object.defineProperty(globalThis,"navigator",{value:{locks:{request(name,_options,run){return Promise.resolve().then(async()=>{if(held.has(name))return run(null);held.add(name);try{return await run({name});}finally{held.delete(name);}});}}},configurable:true});
const {reloadRecords,...result}=await runBackupAcceptance(wasm),races=await recoverFreshOpenRaces(wasm),reopened=await reopenBackupAcceptance(wasm,reloadRecords);if(held.size)throw Error("Installed recovery leaked a writer lease");console.log(JSON.stringify({...result,...races,...reopened,heldWriterLeases:held.size}));
