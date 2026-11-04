import test from 'node:test';
import {runJointReassociation} from './joint-reassociation-workload.mjs';
test('two actual Native deaths retain an earlier complete metadata continuation through a new association and final delivery',{timeout:21600000},()=>runJointReassociation({repeatAfterMetadata:true}));
