/* Diagnostic, not editor code or an engine patch.
 * Usage: native-engine-array-fragment ABSOLUTE_FRAMEWORK ROUNDS none|yield|sleep|timer
 * Calls the original WebKit 2336 finite-number conversion/store fragment after
 * checking its exact bytes and loaded-image identity. Does not construct JS
 * objects or run JS. The synthetic input set MUST stay finite: the NaN branch
 * requires real engine object state and is outside this diagnostic's contract.
 * A passing run does not qualify browser execution or identify a root cause.
 */
#include <dlfcn.h>
#include <CommonCrypto/CommonDigest.h>
#include <errno.h>
#include <inttypes.h>
#include <limits.h>
#include <sched.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#if !defined(__APPLE__) || !defined(__aarch64__)
#error This diagnostic requires arm64 macOS.
#endif

extern void breditor_engine_array_fragment(void *, uint64_t, uint64_t *);
// Reject a different framework before computing a private instruction offset.
static int pinned_framework(const char *path) {
    static const char expected[] = "7f5f6858e7c990f616850c129757548483f56041f9cc7acff2771581ecfa903d";
    FILE *file = fopen(path, "rb");
    if (!file) return 0;
    CC_SHA256_CTX context;
    CC_SHA256_Init(&context);
    unsigned char buffer[65536], digest[CC_SHA256_DIGEST_LENGTH];
    size_t count;
    while ((count = fread(buffer, 1, sizeof(buffer), file))) CC_SHA256_Update(&context, buffer, (CC_LONG)count);
    int failed = ferror(file);
    fclose(file);
    CC_SHA256_Final(digest, &context);
    char hex[CC_SHA256_DIGEST_LENGTH * 2 + 1];
    for (size_t i = 0; i < sizeof(digest); i++) snprintf(hex + i * 2, 3, "%02x", digest[i]);
    return !failed && !strcmp(hex, expected);
}
static const uint32_t fragment_words[] = {
    0x1e620060, 0xd2ffffc9, 0x8b090069, 0x9e670121, 0x92e00049,
    0xeb09007f, 0x1e618c00, 0x1e602000, 0x54000066, 0xfc225900, 0xd65f03c0,
};
static const struct { uint64_t encoded, expected; } cases[] = {
    {UINT64_C(0x3ff2000000000000), UINT64_C(0x3ff0000000000000)},
    {UINT64_C(0x40a2000000000000), UINT64_C(0x40a0000000000000)},
    {UINT64_C(0x0002000000000000), UINT64_C(0x0000000000000000)},
    {UINT64_C(0x8002000000000000), UINT64_C(0x8000000000000000)},
    {UINT64_C(0x3ffa000000000000), UINT64_C(0x3ff8000000000000)},
    {UINT64_C(0xfffe000000000001), UINT64_C(0x3ff0000000000000)},
    {UINT64_C(0xfffe000000000800), UINT64_C(0x40a0000000000000)},
    {UINT64_C(0xfffe0000ffffffff), UINT64_C(0xbff0000000000000)},
    {UINT64_C(0xfffe000080000000), UINT64_C(0xc1e0000000000000)},
    {UINT64_C(0xfffe00007fffffff), UINT64_C(0x41dfffffffc00000)},
};

int main(int argc, char **argv) {
    if (argc != 4 || argv[1][0] != '/' ||
        (strcmp(argv[3], "none") && strcmp(argv[3], "yield") && strcmp(argv[3], "sleep") && strcmp(argv[3], "timer"))) return 2;
    char *end = NULL;
    errno = 0;
    uint64_t rounds = strtoull(argv[2], &end, 10);
    if (errno || !*argv[2] || *end || rounds < 1 || rounds > UINT64_C(10000000)) return 2;
    const int timer = !strcmp(argv[3], "timer");
    if (timer && rounds > 100000) return 2; // Bound timer-paced runs to about 40 seconds.
    if (!pinned_framework(argv[1])) { fprintf(stderr, "Framework hash differs\n"); return 2; }
    void *handle = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (!handle) { fprintf(stderr, "dlopen: %s\n", dlerror()); return 2; }
    void *symbol = dlsym(handle, "JSContextGetGlobalObject");
    Dl_info info;
    char requested[PATH_MAX], loaded[PATH_MAX];
    if (!symbol || !dladdr(symbol, &info) || !realpath(argv[1], requested) ||
        !realpath(info.dli_fname, loaded) || strcmp(requested, loaded)) {
        fprintf(stderr, "Loaded image identity mismatch\n"); return 2;
    }
    void *fragment = (char *)info.dli_fbase + 0xf7c118;
    if (memcmp(fragment, fragment_words, sizeof(fragment_words))) {
        fprintf(stderr, "Pinned fragment bytes differ; refusing execution\n"); return 2;
    }
    uint64_t checks = 0;
    for (uint64_t round = 0; round < rounds; round++) {
        for (size_t index = 0; index < sizeof(cases) / sizeof(cases[0]); index++) {
            uint64_t actual = UINT64_C(0xdeadbeefdeadbeef);
            breditor_engine_array_fragment(fragment, cases[index].encoded, &actual);
            if (actual != cases[index].expected) {
                printf("{\"format\":\"breditor/native-engine-fragment\",\"outcome\":\"comparison-rejected\","
                    "\"scheduling\":\"%s\",\"round\":\"%" PRIu64 "\",\"case\":\"%zu\","
                    "\"encoded\":\"%016" PRIx64 "\",\"expected\":\"%016" PRIx64 "\",\"actual\":\"%016" PRIx64 "\"}\n",
                    argv[3], round, index, cases[index].encoded, cases[index].expected, actual);
                return 1;
            }
            checks++;
        }
        if (round % (timer ? 10 : 1024) == 0) {
            if (!strcmp(argv[3], "yield")) { if (sched_yield()) return 2; }
            else if (timer || !strcmp(argv[3], "sleep")) {
                struct timespec duration = {.tv_sec = 0, .tv_nsec = timer ? 4000000 : 1};
                while (nanosleep(&duration, &duration)) if (errno != EINTR) return 2;
            }
        }
    }
    if (memcmp(fragment, fragment_words, sizeof(fragment_words))) return 2;
    printf("{\"format\":\"breditor/native-engine-fragment\",\"outcome\":\"passed\","
        "\"scheduling\":\"%s\",\"rounds\":\"%" PRIu64 "\",\"checks\":\"%" PRIu64 "\","
        "\"fragmentOffset\":\"0xf7c118\",\"fragmentAddress\":\"%p\"}\n", argv[3], rounds, checks, fragment);
    dlclose(handle);
    return 0;
}
