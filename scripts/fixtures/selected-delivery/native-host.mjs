/** Dedicated real native serving/recovery fixture. Private IPC replies are
 * consumed here and never persisted, logged, or included in public manifests. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,realpathSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {pixel,secondPixel} from '../review-assets/pixels.mjs';
import {nativeActivationSelection} from '../../../packages/breditor-collaboration/dist/native_activation_control/identity.js';
import {generationControlSelection} from '../../../packages/breditor-collaboration/dist/generation_recovery_control/identity.js';
const processCapsules=new WeakMap();
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export async function selectedDeliveryNativeHost(root,{language=3,standard=true,atomic=true,suggestionGrants=false,nativeActivation=false,inactiveRasters=false,processRecovery=false,resume}={}){
 root=realpathSync(root);const resumed=resume?processCapsules.get(resume):undefined;if(resume&&(!resumed||!resumed.crashed||resumed.used||resumed.root!==root))throw Error('Actual terminated process and independently retained private bootstrap required');if(resumed)resumed.used=true;
 const directory=resumed?.directory??mkdtempSync(join(root,'target/selected-delivery-native-'));
 assert.equal(realpathSync(directory),directory);if(!resumed)for(const[name,bytes]of[['seed-a.png',pixel],['seed-b.png',secondPixel]])writeFileSync(join(directory,name),bytes,{mode:0o600,flag:'wx'});
 if(inactiveRasters&&!nativeActivation)throw Error('Inactive recovery requires the actual Native activation fixture');
 if(processRecovery&&(!inactiveRasters||!nativeActivation))throw Error('Process recovery requires actual inactive Native controls');
 const binary=processRecovery?join(root,'target/reconciled-packet-native/release/examples/native_process_recovery_functional'):inactiveRasters?join(root,'target/reconciled-packet-native/release/examples/inactive_recovery_raster_functional'):nativeActivation?join(root,'target/reconciled-packet-native/release/examples/native_activation_sdk_functional'):join(root,'target/owned-history-relay-native/release/examples',suggestionGrants?'selected_suggestion_delivery_functional':'selected_delivery_functional'),child=spawn(binary,resumed?['--reopen']:[directory,String(language),standard?'1':'0',atomic?'1':'0',...(suggestionGrants?['suggestion-grants-v1']:[])],{cwd:root,stdio:['pipe','pipe','pipe']});
 let buffer='',errors='',sequence=resumed?.bootstrap.nextSequence??0,closed=false,stopping,initialResolve,initialReject,initialOffer;
 const observed=new WeakMap(),cuts=new Map(),pending=new Map(),operators=new Map(),secrets=new Set(),offers=new WeakMap(),snapshots=resumed?[...resumed.snapshots]:[],initial=new Promise((a,b)=>{initialResolve=a;initialReject=b;});
 for(const item of snapshots){const pin=structuredClone(item);cuts.set(item.sequence,pin);observed.set(item,pin);}
 // Failed spawn emits error/close without exit. Settle this actual lifecycle
 // too, so startup cleanup preserves its refusal instead of waiting forever.
 const exited=new Promise(done=>{child.once('exit',(code,signal)=>done({code,signal}));child.once('error',()=>done({code:null,signal:null,startFailed:true}));});let terminal;
 exited.then(result=>{terminal=result;const error=Error('Native selected-delivery process ended before its pending operation: '+errors.replace(/[a-f0-9]{64}/g,'[redacted]'));initialReject(error);for(const row of pending.values()){clearTimeout(row.timer);row.reject(error);}pending.clear();});
 child.once('error',()=>initialReject(Error('Native selected-delivery process could not start')));
 child.stderr.on('data',bytes=>{errors=(errors+bytes.toString('utf8')).slice(-4096);});
 function verifyFiles(item){
  const folder=dirname(item.path);assert.equal(folder,join(directory,'language-'+language+'-standard-'+standard+'-atomic-'+atomic,'snapshots','cut-'+item.sequence));assert.equal(realpathSync(folder),folder);
  const fixture=JSON.parse(readFileSync(item.path));assert.equal(fixture.format,'breditor/native-selected-delivery-fixture');assert.equal(fixture.formatVersion,1);assert.equal(fixture.clients.length,7);assert.equal(new Set(fixture.clients.map(row=>row.writer)).size,7);assert.equal(new Set(fixture.clients.map(row=>row.actor)).size,7);assert.equal(fixture.clientEndpoint,item.clientEndpoint);assert.equal(fixture.retiredEndpoint,item.retiredEndpoint);assert.deepEqual(fixture.deliveryContinuation.current,fixture.generationRecoveryState);assert.deepEqual(fixture.deliveryContinuation.previous,cuts.get(item.previousSequence)?.selection.source.server??item.selection.source.server);assert.equal(fixture.deliveryContinuation.format,'breditor/server-log-generation-delivery-continuation');assert.equal(fixture.deliveryContinuation.formatVersion,1);assert.deepEqual(item.deliverySelection.current,item.selection);assert.deepEqual(item.deliverySelection.continuation,fixture.deliveryContinuation);
  const ordered=[...cuts.entries()].filter(([sequence])=>sequence<item.sequence).sort(([a],[b])=>a-b).map(([,value])=>value.selection.source.server);assert.equal(fixture.deliveryPath.format,'breditor/server-log-generation-delivery-path');assert.equal(fixture.deliveryPath.formatVersion,1);assert.deepEqual(fixture.deliveryPath.current,fixture.generationRecoveryState);assert.deepEqual(fixture.deliveryPath.ancestors,ordered.length?ordered:[item.selection.source.server]);
  assert.deepEqual(item.deliveryPathSelection.path,fixture.deliveryPath);assert.deepEqual(item.deliveryPathSelection.current,item.deliverySelection);assert.equal(item.deliveryPathSelection.format,'breditor/server-log-generation-delivery-path-recovery-control');assert.equal(item.deliveryPathSelection.formatVersion,1);
  for(const name of['fixture.json','inventory.json','inventory-after.json','server.backup','older-server.backup','server-after.backup']){const value=readFileSync(join(folder,name));for(const secret of secrets)if(value.includes(Buffer.from(secret)))throw Error('Private generated credential entered public fixture data');}
  return fixture;
 }
 function snapshot(message){
  if(message.format!=='breditor/native-selected-delivery-host'||message.formatVersion!==1||!hex(message.privateOperatorToken))throw Error('Invalid native selected-delivery handshake');
  const selected=message.case;if(!selected||selected.nativeProtectedStreamsVerified!==true||selected.nativeProviderVerified!==true||selected.nativeDeliveryContinuationVerified!==true||selected.nativeDeliveryPathVerified!==true||!Number.isSafeInteger(selected.sequence)||selected.sequence!==message.request)throw Error('Invalid complete selected-delivery cut');
  if(snapshots.length&&(selected.clientEndpoint!==snapshots[0].clientEndpoint||selected.retiredEndpoint!==snapshots[0].retiredEndpoint))throw Error('Native endpoint changed after source binding');
  const expectedPrevious=pending.get(message.request)?.previous??(resumed&&message.request===resumed.bootstrap.nextSequence?resumed.bootstrap.previousSequence:0);if(selected.previousSequence!==expectedPrevious||selected.sequence!==0&&!cuts.has(expectedPrevious))throw Error('Actual predecessor selection differs');
  secrets.add(message.privateOperatorToken);operators.set(selected.path,message.privateOperatorToken);
  const publicCase=Object.freeze({path:selected.path,selection:selected.selection,sequence:selected.sequence,previousSequence:selected.previousSequence,clientEndpoint:selected.clientEndpoint,retiredEndpoint:selected.retiredEndpoint,endpoint:selected.endpoint,deliveryEndpoint:selected.deliveryEndpoint,deliverySelection:selected.deliverySelection,deliveryPathSelection:selected.deliveryPathSelection,deliveryPathEndpoint:selected.deliveryPathEndpoint,nativeProtectedStreamsVerified:true,nativeProviderVerified:true,nativeDeliveryContinuationVerified:true,nativeDeliveryPathVerified:true});verifyFiles(publicCase);snapshots.push(publicCase);const pinned=structuredClone(publicCase);observed.set(publicCase,pinned);cuts.set(publicCase.sequence,pinned);
  writeFileSync(join(dirname(selected.path),'public-case.json'),JSON.stringify(publicCase,null,2),{mode:0o600,flag:'wx'});return publicCase;
 }
 /** Only a genuine prepared Native control can supply a live private token. */
 function activation(message,row){
  assert.equal(nativeActivation,true);assert.equal(row?.kind,'prepareActivation');
  assert.ok(hex(message.privateActivationToken));secrets.add(message.privateActivationToken);
  const item=snapshot(message),selection=nativeActivationSelection(message.activationSelection);
  assert.deepEqual(selection.current,row.source);assert.deepEqual(selection.current,item.selection.source);
  const endpoint=new URL(message.activationEndpoint);assert.equal(endpoint.protocol,'http:');assert.equal(endpoint.hostname,'127.0.0.1');assert.ok(endpoint.port);assert.equal(endpoint.pathname,'/recovery/native-activation/v1/commit');assert.equal(endpoint.search,'');assert.equal(endpoint.hash,'');assert.equal(endpoint.username,'');assert.equal(endpoint.password,'');
  const offer=Object.freeze({case:item,selection,endpoint:endpoint.href});offers.set(offer,message.privateActivationToken);return offer;
 }
 function inspection(message,row){
  assert.equal(row?.kind,'inspect');assert.equal(message.source,row.source);assert.ok(hex(message.privateOperatorToken));
  assert.deepEqual(Object.keys(message).sort(),['endpoint','kind','privateOperatorToken','request','selection','source']);
  const source=cuts.get(message.source);assert.ok(source);const selection=generationControlSelection(message.selection);
  assert.deepEqual(selection.source.origin,source.selection.source.server);assert.deepEqual(selection.source.server,source.selection.source.server);assert.deepEqual(selection.source.participants,source.selection.source.participants);assert.notDeepEqual(selection,source.selection);
  const endpoint=new URL(message.endpoint);assert.equal(endpoint.protocol,'http:');assert.equal(endpoint.hostname,'127.0.0.1');assert.equal(endpoint.pathname,'/recovery/generations/v1/check');assert.ok(endpoint.port);assert.equal(endpoint.search,'');assert.equal(endpoint.hash,'');assert.equal(endpoint.username,'');assert.equal(endpoint.password,'');
  secrets.add(message.privateOperatorToken);const path='inspection:'+message.request;operators.set(path,message.privateOperatorToken);
  return Object.freeze({path,endpoint:message.endpoint,selection,source:message.source});
 }
 child.stdout.on('data',bytes=>{
  buffer+=bytes.toString('utf8');if(Buffer.byteLength(buffer)>1024*1024){const error=Error('Native private IPC response budget');initialReject(error);for(const row of pending.values())row.reject(error);return;}
  let newline;while((newline=buffer.indexOf('\n'))>=0){const raw=buffer.slice(0,newline);buffer=buffer.slice(newline+1);try{const value=JSON.parse(raw),row=pending.get(value.request);if(value.kind==='snapshot'){const result=snapshot(value);if(value.request===0)initialResolve(result);else if(row){clearTimeout(row.timer);pending.delete(value.request);row.resolve(result);}else throw Error('Unrequested native snapshot');}
    else if(value.kind==='activationPrepared'&&resumed&&value.request===resumed.bootstrap.nextSequence&&!row){initialOffer=activation(value,{kind:'prepareActivation',source:resumed.source});initialResolve(initialOffer.case);}
    else if(value.kind==='activationPrepared'&&row){const result=activation(value,row);clearTimeout(row.timer);pending.delete(value.request);row.resolve(result);}
    else if(value.kind==='activationRefused'&&row&&nativeActivation){assert.deepEqual(Object.keys(value).sort(),['kind','reason','request']);assert.equal(typeof value.reason,'string');clearTimeout(row.timer);pending.delete(value.request);row.reject(Error('Native activation fixture refused: '+value.reason));}
    else if(value.kind==='inspection'&&row){const result=inspection(value,row);clearTimeout(row.timer);pending.delete(value.request);row.resolve(result);}
    else if(value.kind==='credentials'&&row){for(const key of['privateAccountToken','privateDocumentCredential','privateReviewCredential']){if(!hex(value[key]))throw Error('Invalid private fixture credential shape');secrets.add(value[key]);}clearTimeout(row.timer);pending.delete(value.request);row.resolve(value);}
    else throw Error('Unexpected native fixture response');
   }catch{const error=Error('Native selected-delivery IPC admission failed');initialReject(error);for(const row of pending.values()){clearTimeout(row.timer);row.reject(error);}pending.clear();}
  }
 });
 function request(kind,data={},local={}){if(closed||terminal)return Promise.reject(Error('Native fixture is closed'));if(pending.size>=2)return Promise.reject(Error('Native fixture request budget'));const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Native fixture request did not complete within its budget'));},60000);pending.set(id,{resolve,reject,timer,kind,...data,...local});child.stdin.write(JSON.stringify({kind,request:id,...data})+'\n',error=>{if(error){clearTimeout(timer);pending.delete(id);reject(Error('Native fixture command write failed'));}});});}
 if(resumed){const bytes=JSON.stringify(resumed.bootstrap)+'\n';if(Buffer.byteLength(bytes)>16*1024*1024)throw Error('Private process bootstrap byte budget');child.stdin.write(bytes);}
 let timer;try{const publishedFirst=await Promise.race([initial,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native fixture did not prepare: '+errors)),120000);})]);clearTimeout(timer);const first=resumed?snapshots[0]:publishedFirst;
  return{directory,binary,initial:first,reopenedOffer:initialOffer,processId:child.pid,snapshots,fixture:verifyFiles,operatorToken:item=>{const value=operators.get(item.path);if(!value)throw Error('Choose the actual observed native cut');return value;},async refresh(){return request('snapshot');},async refreshAfter(previous){const selected=observed.get(previous);if(!selected)throw Error('Select an actual observed complete predecessor');return request('snapshotAfter',{previous:selected.sequence});},
   async prepareActivation(source){if(!nativeActivation)throw Error('Native activation fixture mode required');const previous=snapshots.at(-1).sequence;return request('prepareActivation',{source},{previous});},
   activationToken(offer){const token=offers.get(offer);if(!token)throw Error('Select the actual prepared Native offer');return token;},
   async finishActivation(offer){if(!offers.has(offer))throw Error('Select the actual prepared Native offer');return request('finishActivation',{},{previous:inactiveRasters?snapshots.at(-1).sequence:offer.case.sequence});},
   async reconstruct(item){const selected=observed.get(item);if(!selected)throw Error('Select an actual observed Native source for inactive reconstruction');return request('inspect',{source:selected.sequence});},
   async authentication(client,{retired=false}={}){const original=verifyFiles(first).clients.find(row=>row.writer===client.writer&&row.actor===client.actor&&row.principal===client.principal);if(!original)throw Error('Choose one actual native registration');const value=await request('credentials',{writer:client.writer,actor:client.actor,retired});if(value.writer!==client.writer||value.actor!==client.actor||value.principal!==client.principal)throw Error('Native fixture registration differs');for(const item of snapshots)verifyFiles(item);const fixture=verifyFiles(first),metadata=JSON.parse(fixture.inventoryJson),endpoint=retired?first.retiredEndpoint:first.clientEndpoint,transport=fixture.atomic?{writerTransport:'atomic-v2'}:{};
    return Object.freeze({getToken:()=>value.privateAccountToken,document:Object.freeze({endpoint,principal:value.principal,room:metadata.room.document,writer:value.writer,credential:value.privateDocumentCredential,...transport}),review:Object.freeze({endpoint,principal:value.principal,room:metadata.room.document,actor:value.actor,binding:metadata.review.binding,documentWriter:value.writer,...transport,credential:value.privateReviewCredential})});},
   async prepareProcessRecovery(offer){
    if(!processRecovery||resumed||!offers.has(offer)||pending.size)throw Error('Actual warm process offer required');
    const clients=verifyFiles(first).clients,documents=[],reviews=[];let oldAliceToken;
    for(const client of clients){const credentials=await request('credentials',{writer:client.writer,actor:client.actor,retired:false});assert.equal(credentials.principal,client.principal);assert.equal(credentials.writer,client.writer);assert.equal(credentials.actor,client.actor);documents.push([client.principal,client.writer,credentials.privateDocumentCredential]);reviews.push([client.principal,client.actor,credentials.privateReviewCredential]);oldAliceToken=credentials.privateAccountToken;}
    const nativeRoot=join(directory,'language-'+language+'-standard-'+standard+'-atomic-'+atomic),checkpointName='native-checkpoint-restart-'+offer.case.sequence,checkpointJson=readFileSync(join(nativeRoot,checkpointName+'-choice.json'),'utf8'),last=snapshots.at(-1);
    const bootstrap={format:'breditor/private-native-process-recovery',formatVersion:1,root:nativeRoot,checkpointName,checkpointJson,checkpointSha256:'sha256:'+createHash('sha256').update(checkpointJson).digest('hex'),initialSequence:first.sequence,nextSequence:sequence+1,previousSequence:last.sequence,observed:snapshots.map(row=>({sequence:row.sequence,identity:row.selection.source.server})),protected:{documents,reviews},oldAliceToken,clientAddress:new URL(first.clientEndpoint).host,retiredAddress:new URL(first.retiredEndpoint).host};
    assert.ok(Buffer.byteLength(JSON.stringify(bootstrap))<16*1024*1024);const capsule=Object.freeze({});processCapsules.set(capsule,{root,directory,bootstrap,source:last.selection.source,snapshots:[...snapshots],issuedSequence:sequence,processId:child.pid,crashed:false,used:false});return capsule;
   },
   async crashForRecovery(capsule){const value=processCapsules.get(capsule);if(!value||value.processId!==child.pid||value.issuedSequence!==sequence||pending.size||closed||terminal)throw Error('Actual current process capsule required before crash');closed=true;assert.equal(child.kill('SIGKILL'),true);const result=await exited;assert.equal(result.signal,'SIGKILL');assert.equal(result.code,null);value.crashed=true;operators.clear();secrets.clear();return{processId:child.pid,signal:result.signal};},
   stop(){if(stopping)return stopping;closed=true;stopping=(async()=>{child.stdin.end();const result=await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Native fixture shutdown still pending')),30000);timer.unref();})]);assert.equal(result.code,0,'Native selected-delivery shutdown: '+errors.replace(/[a-f0-9]{64}/g,'[redacted]'));buffer='';operators.clear();secrets.clear();})().finally(()=>{stopping=undefined;});return stopping;},
  };
 }catch(error){closed=true;child.stdin.end();if(child.exitCode===null&&child.signalCode===null)child.kill('SIGINT');await exited;throw error;}finally{clearTimeout(timer);}
}

/** Test-only fresh owner bootstrap; only an actual killed process can issue this capsule. */
export function reopenSelectedDeliveryNativeHost(root,capsule){return selectedDeliveryNativeHost(root,{nativeActivation:true,inactiveRasters:true,processRecovery:true,resume:capsule});}
