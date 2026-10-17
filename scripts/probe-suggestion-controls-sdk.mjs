import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {probeSuggestionSyncSdk} from "./probe-suggestion-sync-sdk.mjs";
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4)throw Error("Expected actual application Wasm directory and isolated suggestion host");
 console.log(JSON.stringify(await probeSuggestionSyncSdk(process.argv[2],process.argv[3],{ownedHistory:true,controls:true}),null,2));
}
