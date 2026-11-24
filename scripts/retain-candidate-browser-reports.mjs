/** Preserve bounded Playwright reports even when a stage fails before its normal receipt. */
import {lstatSync,mkdirSync,readdirSync,realpathSync} from "node:fs";
import {join,relative} from "node:path";
import {fileURLToPath} from "node:url";
import {fileEvidence,retainStageArtifact,saveEvidence} from "./candidate-release/evidence.mjs";

const fixedReports=[
 "target/rich-browser-chromium-report.json",
 "target/rich-browser-firefox-report.json",
 "target/rich-browser-webkit-report.json",
 "target/shared-application-browser-playwright.json",
];
const sharedDirectory="target/shared-browser-results";
const maximumFileBytes=8*1024*1024;
const maximumTotalBytes=32*1024*1024;

function localStat(path){
 try{return lstatSync(path);}
 catch(error){if(error.code!=="ENOENT")throw error;}
}

export function retainCandidateBrowserReports(root){
 const directory=join(root,"target/v1-candidate-runs");
 const specs=readdirSync(join(root,"experiments/shared-browser"),{withFileTypes:true})
  .filter(entry=>entry.isFile()&&/^[a-z0-9-]+\.spec\.mjs$/.test(entry.name))
  .map(entry=>entry.name).sort();
 const sharedReports=["chromium-firefox",...specs].map(suite=>`${sharedDirectory}/${suite}.json`);
 const reports=[],omitted=[];
 let total=0;
 for(const path of [...fixedReports,...sharedReports]){
  const full=join(root,path),info=localStat(full);
  if(!info)continue;
  if(!info.isFile()||relative(realpathSync(root),realpathSync(full)).split(/[\\/]/)[0]===".."){
   omitted.push({path,reason:"non-regular-or-outside-workspace"});
   continue;
  }
  if(info.size>maximumFileBytes||total+info.size>maximumTotalBytes){
   omitted.push({path,reason:"size-bound"});
   continue;
  }
  const evidence=fileEvidence(root,path);
  if(evidence.bytes!==info.size)throw Error(`Browser diagnostic changed during retention: ${path}`);
  reports.push(retainStageArtifact(root,directory,"browser-failure",evidence));
  total+=evidence.bytes;
 }
 mkdirSync(directory,{recursive:true});
 const index={format:"breditor/candidate-browser-failure-reports",formatVersion:1,reports,omitted};
 saveEvidence(join(directory,"browser-failure-reports.json"),index);
 return index;
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const index=retainCandidateBrowserReports(fileURLToPath(new URL("../",import.meta.url)));
 console.log(`Retained ${index.reports.length} browser reports. Omitted ${index.omitted.length} unsupported reports.`);
}
