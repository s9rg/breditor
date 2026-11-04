import test from 'node:test';
import {runJointReassociation} from './joint-reassociation-workload.mjs';
test('a pending Native checkpoint and later committed restart preserve existing metadata and all offline work through final delivery',{timeout:21600000},()=>runJointReassociation({initialNativeStage:'pending',repeatAfterMetadata:true}));
