/** Node Origin adaptation for precisely this fixture's accepted-state route.
 * Existing control/asset adaptation stays unchanged; no responses are mocked. */
import assert from 'node:assert/strict';
import {completeControlTransport} from '../physical-recovery-control/complete-transport.mjs';
export function acceptedControlTransport(manifest){
 const original=globalThis.fetch,base=completeControlTransport(manifest),existing=globalThis.fetch,allowed=new Set(manifest.cases.map(row=>row.endpoint.replace(/\/check$/,'/accepted/read'))),accepted=[];
 globalThis.fetch=(input,options={})=>{const url=String(input);if(!allowed.has(url))return existing(input,options);const body=JSON.parse(options.body);assert.equal(body.format,'breditor/server-log-generation-recovery-accepted-native-request');accepted.push({document:body.document,review:structuredClone(body.review),selection:structuredClone(body.selection)});const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return original(input,{...options,headers});};
 return{requests:base.requests,accepted,restore:()=>base.restore()};
}
