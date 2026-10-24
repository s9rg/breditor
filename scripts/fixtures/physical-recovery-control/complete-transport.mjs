/** Node-only Origin adapter for actual owned native operator endpoints. No
 * fabricated responses, credentials in evidence, or unrelated traffic allowed. */
import assert from 'node:assert/strict';
export function completeControlTransport(manifest){
 const original=globalThis.fetch,allowed=new Set(manifest.cases.flatMap(row=>[row.endpoint,row.endpoint.replace(/\/check$/,'/assets/check')])),requests=[];
 globalThis.fetch=(input,options={})=>{const url=String(input);if(url.startsWith('blob:nodedata:')){assert.equal(new Headers(options.headers).has('authorization'),false);return original(input,options);}assert.ok(allowed.has(url),'Only owned operator read routes may receive this adapter');const body=JSON.parse(options.body),assets=url.endsWith('/assets/check');requests.push({assets,references:assets?body.references.length:null,uploads:assets?body.uploads.length:null});const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return original(input,{...options,headers});};
 return{requests,restore(){globalThis.fetch=original;}};
}
