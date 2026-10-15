// Functional-test host only; neither resource depends on the other.
// Preserve exact native fixtures without serializing their download behind Wasm compilation.
export async function loadContractResources(initialize,loadVector){
 const [,vector]=await Promise.all([initialize(),loadVector()]);
 return vector;
}
