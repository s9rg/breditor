import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {checkOwnedReviewInstalled} from "./check-owned-review-installed.mjs";
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4)throw Error("Expected old suggestion host and separate opt-in revision host; build candidate packages first");
 console.log(JSON.stringify(await checkOwnedReviewInstalled(process.argv[2],{includeObserver:true,includeControls:true,revisionExecutable:process.argv[3]}),null,2));
}
