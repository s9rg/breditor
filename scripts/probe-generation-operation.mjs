/** The full retained workflow additionally crosses whole-participant recovery and operational custody. */
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {probeSegmentedRetained} from './probe-segmented-retained.mjs';
export async function probeGenerationOperation(directory,executable,options={}){
 return probeSegmentedRetained(directory,executable,{...options,generationOperation:true});
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length<2||args.length>3||args[2]!==undefined&&args[2]!=='--smoke')throw Error('Expected shared runtime, native revision host and optional --smoke');
 console.log(JSON.stringify(await probeGenerationOperation(args[0],args[1],{smoke:args[2]==='--smoke'}),null,2));
}
