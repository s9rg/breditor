/** Same actual-host acceptance matrix with explicitly selected native owned history and recovery. */
import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {probeSuggestionSyncSdk} from "./probe-suggestion-sync-sdk.mjs";
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4)throw Error("Expected application Wasm directory and native suggestion host");
 console.log(JSON.stringify(await probeSuggestionSyncSdk(process.argv[2],process.argv[3],{ownedHistory:true}),null,2));
}
