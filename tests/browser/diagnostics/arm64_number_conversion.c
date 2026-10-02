/* Bounded native-only control; not a replacement JSValue implementation.
 * Build on arm64 macOS:
 * clang -O2 -Wall -Wextra -Werror arm64_number_conversion.c \
 *   arm64_number_conversion.S -o /absolute/temporary/path/conversion
 * Usage: conversion fcsel|branch 1..100000000 [pause-every:1..100000]
 * Verifies both operand directions, equal/unequal values and signed integers.
 * Prints the FIRST mismatch; a passing run does not exonerate engine context.
 */
#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

extern void breditor_conversion_fcsel(uint64_t, uint64_t, uint64_t *);
extern void breditor_conversion_branch(uint64_t, uint64_t, uint64_t *);

int main(int argc, char **argv) {
    if ((argc != 3 && argc != 4) || (strcmp(argv[1], "fcsel") && strcmp(argv[1], "branch"))) return 2;
    if (!argv[2][0] || strspn(argv[2], "0123456789") != strlen(argv[2])) return 2;
    errno = 0;
    char *end;
    unsigned long count = strtoul(argv[2], &end, 10);
    if (errno || *end || !count || count > 100000000) return 2;
    unsigned long pause_every = 100000;
    if (argc == 4) {
        if (!argv[3][0] || strspn(argv[3], "0123456789") != strlen(argv[3])) return 2;
        errno = 0;
        pause_every = strtoul(argv[3], &end, 10);
        if (errno || *end || !pause_every || pause_every > 100000) return 2;
    }
    void (*convert)(uint64_t, uint64_t, uint64_t *) =
        !strcmp(argv[1], "fcsel") ? breditor_conversion_fcsel : breditor_conversion_branch;
    const uint64_t cases[][4] = {
        {0x40a2000000000000, 0xfffe000000000800, 0x40a0000000000000, 0x40a0000000000000},
        {0xfffe000000000800, 0x40a2000000000000, 0x40a0000000000000, 0x40a0000000000000},
        {0x40a2020000000000, 0xfffe000000000800, 0x40a0020000000000, 0x40a0000000000000},
        {0xfffe0000ffffffff, 0xbff2000000000000, 0xbff0000000000000, 0xbff0000000000000},
        {0x8002000000000000, 0xfffe000000000000, 0x8000000000000000, 0x0000000000000000},
    };
    const struct timespec pause = {.tv_sec = 0, .tv_nsec = 4000000};
    for (unsigned long i = 0; i < count; i++) {
        unsigned k = i % (sizeof(cases) / sizeof(cases[0]));
        uint64_t out[2] = {UINT64_MAX, UINT64_MAX};
        convert(cases[k][0], cases[k][1], out);
        if (out[0] != cases[k][2] || out[1] != cases[k][3]) {
            printf("{\"outcome\":\"failed\",\"variant\":\"%s\",\"iteration\":%lu,\"case\":%u,"
                   "\"actualBits\":[\"%016" PRIx64 "\",\"%016" PRIx64 "\"],"
                   "\"expectedBits\":[\"%016" PRIx64 "\",\"%016" PRIx64 "\"]}\n",
                   argv[1], i, k, out[0], out[1], cases[k][2], cases[k][3]);
            return 1;
        }
        // Periodic scheduling opportunities, not browser timer emulation.
        if (i % pause_every == pause_every - 1) {
            struct timespec remaining = pause;
            while (nanosleep(&remaining, &remaining) == -1) if (errno != EINTR) return 3;
        }
    }
    printf("{\"outcome\":\"passed\",\"variant\":\"%s\",\"iterations\":%lu,\"cases\":5,\"pauseEvery\":%lu}\n", argv[1], count, pause_every);
    return 0;
}
