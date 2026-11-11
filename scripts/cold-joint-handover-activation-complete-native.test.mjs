import test from 'node:test';
import {testCompleteJointActivation} from './fixtures/native-publication/complete-joint.mjs';

test('sealed handover cold recovery reconstructs private clients and confirms the existing Native owner before publication',
 {timeout:14400000},()=>testCompleteJointActivation(true,true));
