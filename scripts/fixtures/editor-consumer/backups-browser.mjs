/** Real browser IndexedDB, Web Locks, Web Crypto and the installed native shared runtime. */
import init,* as wasm from "@breditor/collaboration/wasm";
import wasmUrl from "@breditor/collaboration/wasm-binary?url";
import {runBackupAcceptance,reopenBackupAcceptance} from "./backups-acceptance.mjs";
await init({module_or_path:wasmUrl});
globalThis.backupExample={async run(){const {reloadRecords,...result}=await runBackupAcceptance(wasm);sessionStorage.setItem("breditor-backup-reload",JSON.stringify(reloadRecords));return result;},async reopen(){return reopenBackupAcceptance(wasm,JSON.parse(sessionStorage.getItem("breditor-backup-reload")));}};
