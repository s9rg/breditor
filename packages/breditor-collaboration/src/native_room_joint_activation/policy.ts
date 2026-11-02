/** Runtime ownership errors; these are not stored phases or serving grants. */
export class JointSourceSessionError extends Error {
 constructor(readonly code:'joint_source_busy'|'joint_source_closed'|'joint_source_aborted'|'joint_source_state'){
  super('Keep the actual source session held until durable suspension or verified retirement completes');this.name='JointSourceSessionError';
 }
}
export const fail=(code:JointSourceSessionError['code']='joint_source_state')=>new JointSourceSessionError(code);
