import {collaborationBrowserRuns} from "./collaboration-browser-runs.mjs";
/** Preserve the complete configured/discovered matrix while isolating process-lifetime WebKit. */
export function sharedBrowserRuns(configured,discovered){
 const runs=collaborationBrowserRuns(configured);
 if(!Array.isArray(discovered)||new Set(discovered).size!==discovered.length||[...configured].sort().join("\n")!==[...discovered].sort().join("\n"))throw Error("Shared browser plan must contain every discovered spec exactly once");
 return runs.map(run=>({...run,patterns:run.specs.map(spec=>`(^|/)${spec.replaceAll(".","\\.")}$`)}));
}
