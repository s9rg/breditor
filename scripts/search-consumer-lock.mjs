/** Seed independent npm resolution from the producer's exact registry lock, never workspace links. */
export function searchConsumerLock(producer,archives){
 if(producer?.lockfileVersion!==3||!producer.packages||typeof producer.packages!=="object")throw Error("Expected producer npm lock v3");
 const external={react:"19.2.8","react-dom":"19.2.8","@types/react":"19.2.18",jsdom:"29.1.1","fake-indexeddb":"6.2.6"};
 for(const [name,version]of Object.entries(external))if(producer.packages[`node_modules/${name}`]?.version!==version)throw Error(`Consumer fixture version differs from producer lock: ${name}`);
 const dependencies={...external};for(const {name,path}of archives){if(typeof name!=="string"||!name.startsWith("@breditor/")||typeof path!=="string"||!path.endsWith(".tgz")||Object.hasOwn(dependencies,name))throw Error("Expected distinct candidate archives");dependencies[name]=`file:${path}`;}
 const manifest={name:"breditor-search-installed-proof",version:"0.0.0",private:true,type:"module",dependencies};
 const packages={"":{name:manifest.name,version:manifest.version,dependencies}};
 for(const [path,entry]of Object.entries(producer.packages)){
  if(!path.startsWith("node_modules/")||!entry||entry.link||typeof entry.resolved!=="string"||!entry.resolved.startsWith("https://registry.npmjs.org/")||typeof entry.integrity!=="string")continue;
  packages[path]=structuredClone(entry);
 }
 return{manifest,lock:{name:manifest.name,version:manifest.version,lockfileVersion:3,requires:true,packages}};
}
/** Npm may rearrange paths, but no registry artifact may drift beyond the exact producer lock. */
export function verifySearchConsumerRegistry(producer,consumer){
 if(producer?.lockfileVersion!==3||consumer?.lockfileVersion!==3)throw Error("Expected npm lock v3");
 const identity=entry=>JSON.stringify([entry.version,entry.resolved,entry.integrity]),known=new Set(Object.values(producer.packages).filter(p=>p&&typeof p.resolved==="string"&&p.resolved.startsWith("https://registry.npmjs.org/")).map(identity));let count=0;
 for(const [path,entry]of Object.entries(consumer.packages)){
  if(entry.link)throw Error(`Installed consumer retained a workspace link: ${path}`);
  if(typeof entry.resolved!=="string"||!entry.resolved.startsWith("https://registry.npmjs.org/"))continue;
  if(!known.has(identity(entry)))throw Error(`Installed consumer registry artifact drifted: ${path}`);count++;
 }
 if(!count)throw Error("Installed consumer has no pinned registry artifacts");return count;
}
