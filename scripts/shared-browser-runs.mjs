import {collaborationBrowserRuns} from "./collaboration-browser-runs.mjs";
/** Preserve the complete configured/discovered matrix while isolating process-lifetime WebKit. */
export function sharedBrowserRuns(configured,discovered){
 const runs=collaborationBrowserRuns(configured);
 if(!Array.isArray(discovered)||new Set(discovered).size!==discovered.length||[...configured].sort().join("\n")!==[...discovered].sort().join("\n"))throw Error("Shared browser plan must contain every discovered spec exactly once");
 // The config splits WebKit into webkit-1..N browser groups and each spec is in exactly one of them,
 // so the wildcard runs the single file once, in its own fresh process.
 return runs.map(run=>({...run,projects:run.projects.map(project=>project==="webkit"?"webkit*":project),patterns:run.specs.map(spec=>`(^|[/\\\\])${spec.replaceAll(".","\\.")}$`)}));
}

export function sharedBrowserWebKitGroups(files){
 const sorted=[...files].sort(),groups=Math.max(1,Math.ceil(sorted.length/5));
 return Array.from({length:groups},(_,group)=>({
  name:`webkit-${group+1}`,testMatch:sorted.filter((_,index)=>index%groups===group).map(name=>`**/${name}`),
 }));
}
