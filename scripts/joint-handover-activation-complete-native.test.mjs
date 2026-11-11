import test from 'node:test';
import {testCompleteJointActivation} from './fixtures/native-publication/complete-joint.mjs';

test('a sealed handover activates the whole room, retains actors and metadata, and delivers every offline suffix',
 {timeout:14400000},()=>testCompleteJointActivation(true));
