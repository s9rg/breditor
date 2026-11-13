/** Node-only Origin adapter for actual owned native operator endpoints. No
 * fabricated responses, credentials in evidence, or unrelated traffic allowed. */
import assert from 'node:assert/strict';
export function completeControlTransport(manifest,{readAccepted=false,readRaster=false}={}){
 const original=globalThis.fetch,allowed=new Set(manifest.cases.flatMap(row=>[row.endpoint,row.endpoint.replace(/\/check$/,'/assets/check')])),requests=[];
 const dependencies=new Set(manifest.cases.map(row=>row.endpoint.replace(/\/check$/,'/native-dependencies/read')));
 const accepted=new Set(readAccepted?manifest.cases.map(row=>row.endpoint.replace(/\/check$/,'/accepted/read')):[]);
 const raster=new Set(readRaster?manifest.cases.map(row=>row.endpoint.replace(/\/check$/,'/assets/bytes/read')):[]);
 globalThis.fetch=(input,options={})=>{
  const url=String(input),headers=new Headers(options.headers);
  if(url.startsWith('blob:nodedata:')){assert.equal(headers.has('authorization'),false);return original(input,options);}
  assert.ok(allowed.has(url)||dependencies.has(url)||accepted.has(url)||raster.has(url),'Only owned operator read routes may receive this adapter');
  const body=JSON.parse(options.body),assets=url.endsWith('/assets/check');
  requests.push({assets,references:assets?body.references.length:null,uploads:assets?body.uploads.length:null,
   ...(dependencies.has(url)?{dependencies:true}:{}),...(accepted.has(url)?{accepted:true}:{}),...(raster.has(url)?{raster:body.asset}:{})});
  headers.set('Origin','http://127.0.0.1:4187');
  return original(input,{...options,headers});
 };
 return{requests,restore(){globalThis.fetch=original;}};
}
