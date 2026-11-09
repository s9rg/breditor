/** Run fixture teardown in order and preserve the original test failure. */
export async function withFixtureCleanup(run, ...cleanup) {
 const failures = [];
 let result;
 try {
  result = await run();
 } catch (error) {
  failures.push(error);
 }
 for (const close of cleanup) {
  try {
   await close();
  } catch (error) {
   failures.push(error);
  }
 }
 if (failures.length === 1) throw failures[0];
 if (failures.length > 1) {
  throw new AggregateError(failures, 'Fixture body or teardown failed', {cause: failures[0]});
 }
 return result;
}
