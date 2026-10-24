/** Fresh normal-source image-bearing registrations and genuine native/provider
 * preparation. Stop the private controls before publishing redacted inputs. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync,statSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {pixel,secondPixel} from './fixtures/review-assets/pixels.mjs';
import {startNativeCompleteControls} from './fixtures/physical-recovery-control/complete-native-host.mjs';
if(process.argv.length!==2)throw Error('No substituted source, native author domain or producer input');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),cargo=process.env.BREDITOR_CARGO??resolve(homedir(),'.cargo/bin/cargo'),target=join(root,'target/owned-history-relay-native'),environment={...process.env,CARGO_TARGET_DIR:target,CARGO_BUILD_JOBS:'2'},directory=mkdtempSync(join(root,'target/complete-image-cohort-source-')),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),started=Date.now();
try{const output=execFileSync(cargo,['build','--manifest-path','experiments/relay/Cargo.toml','--features','server','--locked','--offline','--release','--example','complete_cohort_control_functional'],{cwd:root,env:environment,encoding:'utf8',timeout:1800000,maxBuffer:8*1024*1024});writeFileSync(join(directory,'build.log'),output);}catch(error){writeFileSync(join(directory,'build.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}
for(const[name,bytes]of[['seed-a.png',pixel],['seed-b.png',secondPixel]])writeFileSync(join(directory,name),bytes,{mode:0o600,flag:'wx'});
const binary=join(target,'release/examples/complete_cohort_control_functional'),controls=await startNativeCompleteControls(root,binary,directory);let stopped=false;
try{const manifest=controls.manifest;assert.equal(manifest.cases.length,10);assert.equal(controls.files.length,50);assert.deepEqual(manifest.cases.map(row=>{const data=JSON.parse(readFileSync(row.path));assert.equal(JSON.parse(data.inventoryJson).writers.length,7);return[data.language,data.standard,data.atomic];}),[1,2,3].flatMap(language=>(language===1?[false]:[false,true]).flatMap(standard=>[false,true].map(atomic=>[language,standard,atomic]))));
 for(const row of controls.files){assert.deepEqual(fileEvidence(root,row.path),row);if(process.platform!=='win32')assert.equal(statSync(join(root,row.path)).mode&0o777,0o600);}
 await controls.stop();stopped=true;for(const row of controls.files)assert.deepEqual(fileEvidence(root,row.path),row);assert.deepEqual(sourceEvidence(root),source);
 const result={format:'breditor/native-complete-image-cohort-check',formatVersion:1,passed:true,source,manifest:controls.path,manifestSha256:sha(readFileSync(controls.path)),producerBinarySha256:sha(readFileSync(binary)),cases:10,registeredWritersPerRoom:7,reviewActorsPerRoom:7,protectedStreamsPerRoom:14,rawCredentialsExported:false,controlsStopped:true,files:controls.files,elapsedMs:Date.now()-started,scope:'Actual Rust seven-writer image-bearing source/protected-stream/provider preparation across ten profile/wire rooms. Redacted immutable inputs only, with private operator controls stopped. SDK mutation/recovery and authenticated activation are separate.'};saveEvidence(join(root,'target/complete-image-cohort-native.json'),result);console.log(JSON.stringify({...result,files:result.files.length}));
}finally{if(!stopped)await controls.stop();}
