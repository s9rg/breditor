/** Exact-source actual native operator/client joint continuity, with no browser or stored tokens. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {probePhysicalRoomOperation} from './probe-physical-room-operation.mjs';
import {probePhysicalRecoveryControl} from './probe-physical-recovery-control.mjs';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');if(process.argv.length!==2)throw Error('No substituted native/runtime arguments accepted');
const source=sourceEvidence(root),cargo=process.env.BREDITOR_CARGO??process.env.CARGO_BIN??resolve(homedir(),'.cargo/bin/cargo'),target=resolve(root,'target/owned-history-relay-native');
execFileSync(cargo,['build','--manifest-path','experiments/relay/Cargo.toml','--features','server','--locked','--offline','--release','--example','physical_recovery_control_functional'],{cwd:root,env:{...process.env,CARGO_TARGET_DIR:target},stdio:'inherit'});
const directory=mkdtempSync(resolve(root,'target/physical-recovery-control-sdk-')),acceptance=await probePhysicalRecoveryControl({api,operationProbe:probePhysicalRoomOperation,root,runtime:resolve(root,'target/promoted-shared-web'),binary:resolve(target,'release/examples/physical_recovery_control_functional'),directory});
assert.equal(acceptance.passed,true);assert.deepEqual(sourceEvidence(root),source);for(const file of acceptance.publicFixtureFiles)assert.deepEqual(fileEvidence(root,file.path),file);
const report={format:'breditor/physical-recovery-control-sdk-check',formatVersion:1,passed:true,source,acceptance};saveEvidence(resolve(root,'target/physical-recovery-control-sdk.json'),report);console.log(JSON.stringify(report,null,2));
