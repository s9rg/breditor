/** Cover both complete unaffected engines, then every WebKit file once in a fresh process. */
export function collaborationBrowserRuns(specs){
 if(!Array.isArray(specs)||specs.length===0||new Set(specs).size!==specs.length||specs.some(spec=>typeof spec!=="string"||!/^[-a-z]+\.spec\.mjs$/.test(spec)))throw Error("Expected an explicit unique collaboration spec allowlist");
 return[{projects:["chromium","firefox"],specs:[]},...specs.map(spec=>({projects:["webkit"],specs:[spec]}))];
}
