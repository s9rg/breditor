/** Node-only Origin adapter for actual owned native operator endpoints. No
 * fabricated responses, credentials in evidence, or unrelated traffic allowed. */
import assert from 'node:assert/strict';
export function completeControlTransport(manifest,{readAccepted=false,readRaster=false,commitActivation=false}={}){
 const original=globalThis.fetch,allowed=new Set(manifest.cases.flatMap(row=>[row.endpoint,row.endpoint.replace(/\/check$/,'/assets/check')])),requests=[];
 const dependencies=new Set(manifest.cases.map(row=>row.endpoint.replace(/\/check$/,'/native-dependencies/read')));
 const accepted=new Set(readAccepted?manifest.cases.map(row=>row.endpoint.replace(/\/check$/,'/accepted/read')):[]);
 const raster=new Set(readRaster?manifest.cases.map(row=>row.endpoint.replace(/\/check$/,'/assets/bytes/read')):[]);
 const activation=new Set(commitActivation?manifest.cases.flatMap(row=>row.activation?[row.activation.endpoint]:[]):[]);
 const publication=new Set(commitActivation?manifest.cases.flatMap(row=>row.publication?[row.publication.endpoint]:[]):[]);
 const health=new Set(commitActivation?manifest.cases.flatMap(row=>row.publication?['http://'+row.publication.selection.listener+'/health']:[]):[]);
 globalThis.fetch=(input,options={})=>{
  const url=String(input),headers=new Headers(options.headers);
  if(url.startsWith('blob:nodedata:')){assert.equal(headers.has('authorization'),false);return original(input,options);}
  if(health.has(url)){assert.equal(headers.has('authorization'),false);return original(input,options);}
  assert.ok(allowed.has(url)||dependencies.has(url)||accepted.has(url)||raster.has(url)||activation.has(url)||publication.has(url),'Only owned operator routes may receive this adapter');
  const body=JSON.parse(options.body),assets=url.endsWith('/assets/check');
  requests.push({assets,references:assets?body.references.length:null,uploads:assets?body.uploads.length:null,
   ...(dependencies.has(url)?{dependencies:true}:{}),...(accepted.has(url)?{accepted:true}:{}),
   ...(raster.has(url)?{raster:body.asset}:{}),...(activation.has(url)?{activation:true}:{}),...(publication.has(url)?{publication:true}:{})});
  headers.set('Origin','http://127.0.0.1:4187');
  return original(input,{...options,headers});
 };
 return{requests,restore(){globalThis.fetch=original;}};
}
