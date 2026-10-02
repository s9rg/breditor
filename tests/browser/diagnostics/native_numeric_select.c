/* Bounded native control for the captured JSC numeric-selection sequence.
 * Build with native_numeric_select.S using the macOS arm64 compiler. Runs on
 * synthetic values only; never loads, attaches to, or modifies JavaScriptCore.
 * Usage: native_numeric_select fcsel|branch ROUNDS yield|sleep|none
 * Exit 0 means all comparisons passed, 1 retains the first rejection, 2 is
 * invalid input. Raw hexadecimal strings permit independent result checking.
 * A passing relocated sequence does NOT qualify the original engine site.
 */
#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sched.h>
#include <time.h>

#if !defined(__APPLE__) || !defined(__aarch64__)
#error This instruction diagnostic requires arm64 macOS.
#endif

extern uint64_t breditor_numeric_select_fcsel(uint64_t);
extern uint64_t breditor_numeric_select_branch(uint64_t);

struct numeric_case { uint64_t encoded, expected; };
static const struct numeric_case cases[] = {
    {UINT64_C(0x3ff2000000000000), UINT64_C(0x3ff0000000000000)}, /* double 1 */
    {UINT64_C(0x40a2000000000000), UINT64_C(0x40a0000000000000)}, /* double 2048 */
    {UINT64_C(0x0002000000000000), UINT64_C(0x0000000000000000)}, /* +0 */
    {UINT64_C(0x8002000000000000), UINT64_C(0x8000000000000000)}, /* -0 */
    {UINT64_C(0x3ffa000000000000), UINT64_C(0x3ff8000000000000)}, /* double 1.5 */
    {UINT64_C(0xfffe000000000001), UINT64_C(0x3ff0000000000000)}, /* int32 1 */
    {UINT64_C(0xfffe000000000800), UINT64_C(0x40a0000000000000)}, /* int32 2048 */
    {UINT64_C(0xfffe0000ffffffff), UINT64_C(0xbff0000000000000)}, /* int32 -1 */
    {UINT64_C(0xfffe000080000000), UINT64_C(0xc1e0000000000000)}, /* INT32_MIN */
    {UINT64_C(0xfffe00007fffffff), UINT64_C(0x41dfffffffc00000)}, /* INT32_MAX */
};

int main(int argc, char **argv) {
    if (argc != 4 || (strcmp(argv[1], "fcsel") && strcmp(argv[1], "branch")) ||
        (strcmp(argv[3], "yield") && strcmp(argv[3], "sleep") && strcmp(argv[3], "none"))) return 2;
    char *end = NULL;
    errno = 0;
    uint64_t rounds = strtoull(argv[2], &end, 10);
    if (errno || !*argv[2] || *end || rounds < 1 || rounds > UINT64_C(10000000)) return 2;
    uint64_t (*select_value)(uint64_t) = strcmp(argv[1], "fcsel") == 0
        ? breditor_numeric_select_fcsel : breditor_numeric_select_branch;
    uint64_t checks = 0;
    const size_t case_count = sizeof(cases) / sizeof(cases[0]);
    for (uint64_t round = 0; round < rounds; round++) {
        for (size_t index = 0; index < case_count; index++) {
            const uint64_t actual = select_value(cases[index].encoded);
            if (actual != cases[index].expected) {
                printf("{\"format\":\"breditor/native-numeric-select\",\"outcome\":\"comparison-rejected\","
                    "\"variant\":\"%s\",\"scheduling\":\"%s\",\"round\":\"%" PRIu64 "\",\"case\":\"%zu\","
                    "\"encoded\":\"%016" PRIx64 "\",\"expected\":\"%016" PRIx64 "\",\"actual\":\"%016" PRIx64 "\"}\n",
                    argv[1], argv[3], round, index, cases[index].encoded, cases[index].expected, actual);
                return 1;
            }
            checks++;
        }
        if (round % 1024 == 0) {
            if (strcmp(argv[3], "yield") == 0) {
                if (sched_yield() != 0) return 2;
            } else if (strcmp(argv[3], "sleep") == 0) {
                struct timespec duration = {.tv_sec = 0, .tv_nsec = 1};
                while (nanosleep(&duration, &duration) != 0) if (errno != EINTR) return 2;
            }
        }
    }
    printf("{\"format\":\"breditor/native-numeric-select\",\"outcome\":\"passed\","
        "\"variant\":\"%s\",\"scheduling\":\"%s\",\"rounds\":\"%" PRIu64 "\",\"checks\":\"%" PRIu64 "\"}\n",
        argv[1], argv[3], rounds, checks);
    return 0;
}
