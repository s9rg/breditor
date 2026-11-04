import test from 'node:test';
import {runJointReassociation} from './joint-reassociation-workload.mjs';
test('actual Native process restart re-associates seven cold clients before metadata and original protocol delivery',{timeout:14400000},()=>runJointReassociation());
