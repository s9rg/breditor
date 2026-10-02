/* Diagnostic ONLY: call the numeric fast path in the hash-pinned arm64 JSC.
 * No JS VM, Rust, Wasm, event loop or application code is created. The fake
 * frame is valid ONLY for this disassembled leaf numeric path. Never pass
 * cells/non-numbers or change the pinned image without re-auditing the ABI.
 * This does not patch the library or change installed browsers.
 * Build: clang -O2 -Wall -Wextra -Werror jsc_direct_object_is.c -o /tmp/...
 * Usage: executable /absolute/path/to/JavaScriptCore iterations pause-every
 * Counts: 1..1000000; pauses: 1..100000 calls, each 4 ms.
 */
#include <CommonCrypto/CommonDigest.h>
#include <dlfcn.h>
#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#if !defined(__aarch64__) || !defined(__APPLE__)
#error "This diagnostic requires the pinned arm64 macOS ABI"
#endif

static int pinned(const char *path) {
    FILE *file = fopen(path, "rb");
    if (!file) return 0;
    CC_SHA256_CTX ctx;
    CC_SHA256_Init(&ctx);
    unsigned char buffer[16384], digest[CC_SHA256_DIGEST_LENGTH];
    size_t size;
    while ((size = fread(buffer, 1, sizeof(buffer), file))) CC_SHA256_Update(&ctx, buffer, (CC_LONG)size);
    int valid = !ferror(file);
    fclose(file);
    CC_SHA256_Final(digest, &ctx);
    char hex[65];
    for (unsigned i = 0; i < sizeof(digest); ++i) snprintf(hex + i * 2, 3, "%02x", digest[i]);
    return valid && !strcmp(hex, "7f5f6858e7c990f616850c129757548483f56041f9cc7acff2771581ecfa903d");
}

static unsigned long bounded(const char *text, unsigned long max) {
    if (!text[0] || strspn(text, "0123456789") != strlen(text)) return 0;
    errno = 0;
    char *end;
    unsigned long value = strtoul(text, &end, 10);
    return errno || *end || value > max ? 0 : value;
}

int main(int argc, char **argv) {
    if (argc != 4 || argv[1][0] != '/') return 2;
    unsigned long count = bounded(argv[2], 1000000), pause_every = bounded(argv[3], 100000);
    if (!count || !pause_every || !pinned(argv[1])) return 2;
    void *handle = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (!handle) { fprintf(stderr, "%s\n", dlerror()); return 3; }
    Dl_info image;
    if (!dladdr(dlsym(handle, "JSGlobalContextCreate"), &image) || !pinned(image.dli_fname)) return 3;
    uint64_t (*compare)(void *, void *) = (void *)((uintptr_t)image.dli_fbase + 0x112ce24);
    const uint64_t cases[][3] = {
        {0x40a2000000000000, 0xfffe000000000800, 7},
        {0xfffe000000000800, 0x40a2000000000000, 7},
        {0x40a2020000000000, 0xfffe000000000800, 6},
        {0xfffe0000ffffffff, 0xbff2000000000000, 7},
        {0x8002000000000000, 0xfffe000000000000, 6},
    };
    for (unsigned long i = 0; i < count; ++i) {
        unsigned k = i % 5;
        _Alignas(16) uint64_t frame[8] = {0};
        frame[4] = 3; /* argument count including this, read with ldrsw */
        frame[6] = cases[k][0];
        frame[7] = cases[k][1];
        uint64_t actual = compare(NULL, frame);
        if (actual != cases[k][2]) {
            printf("{\"outcome\":\"failed\",\"iteration\":%lu,\"case\":%u,\"actual\":%" PRIu64 ",\"expected\":%" PRIu64 "}\n", i, k, actual, cases[k][2]);
            return 1;
        }
        if (i % pause_every == pause_every - 1) {
            struct timespec pause = {.tv_sec = 0, .tv_nsec = 4000000};
            while (nanosleep(&pause, &pause) == -1) if (errno != EINTR) return 3;
        }
    }
    printf("{\"outcome\":\"passed\",\"iterations\":%lu,\"pauseEvery\":%lu,\"cases\":5}\n", count, pause_every);
    dlclose(handle);
    return 0;
}
