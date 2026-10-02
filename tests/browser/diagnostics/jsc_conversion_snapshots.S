/* Register-only observations around original FCSEL instructions. No extra
 * conditional branches or comparisons; NZCV is copied, never changed.
 * These snippets are inserted into the relocated original numeric path.
 * All destinations are caller-clobbered and unused by that path.
 */
.text
.globl _breditor_snapshot_left_candidate
_breditor_snapshot_left_candidate:
    fmov x5, d0
.globl _breditor_snapshot_left_before_select
_breditor_snapshot_left_before_select:
    fmov x4, d1
    mrs x7, nzcv
.globl _breditor_snapshot_left_result
_breditor_snapshot_left_result:
    mrs x11, nzcv
    fmov x12, d0
    fmov x13, d1
.globl _breditor_snapshot_right_candidate
_breditor_snapshot_right_candidate:
    fmov x6, d1
.globl _breditor_snapshot_right_result
_breditor_snapshot_right_result:
    mrs x14, nzcv
    fmov x15, d1
    fmov x17, d2
