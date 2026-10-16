/** Clean-installed SDK qualification in complete bounded editing/network matrices. Never publishes. */
import {execFileSync} from "node:child_process";
import {readdirSync,realpathSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),configuration="experiments/editor-browser/playwright.config.mjs";
/** Every discovered file appears once; all three configured engines remain in each invocation. */
export function editorBrowserRuns(discovered){
 if(!Array.isArray(discovered)||!discovered.length||discovered.some(name=>typeof name!=="string"||!/^[a-z0-9-]+\.spec\.mjs$/.test(name))||new Set(discovered).size!==discovered.length)throw Error("Invalid installed SDK browser inventory");
 const network="shared-structural-network.spec.mjs";
 if(!discovered.includes(network)||discovered.length<2)throw Error("Missing installed SDK editing/network coverage");
 return [discovered.filter(name=>name!==network).sort(),[network]];
}
export function editorBrowserPlan(){
 const names=readdirSync(resolve(root,"experiments/editor-browser")).filter(name=>name.endsWith(".spec.mjs"));
 return {build:[process.execPath,["scripts/check-editor-package.mjs"]],runs:editorBrowserRuns(names).map(names=>[resolve(root,"node_modules/.bin/playwright"),["test","-c",configuration,...names]])};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),plan=editorBrowserPlan();
 if(args.length===1&&args[0]==="--dry-run")console.log(JSON.stringify({executed:false,...plan},null,2));
 else if(!args.length){for(const [command,arguments_] of [plan.build,...plan.runs])execFileSync(command,arguments_,{cwd:root,stdio:"inherit",shell:false});}
 else throw Error("Usage: node scripts/check-editor-browser.mjs [--dry-run]");
}
