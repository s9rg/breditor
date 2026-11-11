import test from 'node:test';
import {testCompleteJointActivation} from './fixtures/native-publication/complete-joint.mjs';

test('restarted sealed relay reconstructs and publishes the entire cold SDK room',
 {timeout:14400000},()=>testCompleteJointActivation(true,true,true));
