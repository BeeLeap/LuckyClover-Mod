#include <windows.h>

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <ctime>

static HMODULE g_module = nullptr;
static std::uintptr_t g_fake_vtable[128]{};
static std::uintptr_t g_fake_object[128]{};

static void log_line(const char* format, ...);

#define FAKE_SLOT(N, RET) \
extern "C" std::uintptr_t __cdecl fake_slot_##N( \
    std::uintptr_t a1, \
    std::uintptr_t a2, \
    std::uintptr_t a3, \
    std::uintptr_t a4, \
    std::uintptr_t a5, \
    std::uintptr_t a6, \
    std::uintptr_t a7, \
    std::uintptr_t a8 \
) { \
    log_line( \
        "fake_slot_%d(a1=0x%llx, a2=0x%llx, a3=0x%llx, a4=0x%llx, " \
        "a5=0x%llx, a6=0x%llx, a7=0x%llx, a8=0x%llx) -> 0x%llx", \
        N, \
        static_cast<unsigned long long>(a1), \
        static_cast<unsigned long long>(a2), \
        static_cast<unsigned long long>(a3), \
        static_cast<unsigned long long>(a4), \
        static_cast<unsigned long long>(a5), \
        static_cast<unsigned long long>(a6), \
        static_cast<unsigned long long>(a7), \
        static_cast<unsigned long long>(a8), \
        static_cast<unsigned long long>(RET) \
    ); \
    return RET; \
}

FAKE_SLOT(0, 0)
FAKE_SLOT(1, 0x10)
FAKE_SLOT(2, 0)
FAKE_SLOT(3, 0)
FAKE_SLOT(4, 0)
FAKE_SLOT(5, 0)
FAKE_SLOT(6, 0)
FAKE_SLOT(7, 0)
FAKE_SLOT(8, 0)
FAKE_SLOT(9, 0)
FAKE_SLOT(10, 0)
FAKE_SLOT(11, 0)
FAKE_SLOT(12, 0)
FAKE_SLOT(13, 0)
FAKE_SLOT(14, 0)
FAKE_SLOT(15, 0)

static void init_fake_interface() {
    using fn = std::uintptr_t(__cdecl*)(
        std::uintptr_t,
        std::uintptr_t,
        std::uintptr_t,
        std::uintptr_t,
        std::uintptr_t,
        std::uintptr_t,
        std::uintptr_t,
        std::uintptr_t
    );
    fn slots[] = {
        fake_slot_0,
        fake_slot_1,
        fake_slot_2,
        fake_slot_3,
        fake_slot_4,
        fake_slot_5,
        fake_slot_6,
        fake_slot_7,
        fake_slot_8,
        fake_slot_9,
        fake_slot_10,
        fake_slot_11,
        fake_slot_12,
        fake_slot_13,
        fake_slot_14,
        fake_slot_15,
    };

    for (size_t i = 0; i < 128; ++i) {
        g_fake_vtable[i] = reinterpret_cast<std::uintptr_t>(slots[i % 16]);
        g_fake_object[i] = reinterpret_cast<std::uintptr_t>(slots[i % 16]);
    }

    // Make the first word look like a C++ vtable pointer while the remaining
    // words also look like a flat C function-pointer table.
    g_fake_object[0] = reinterpret_cast<std::uintptr_t>(g_fake_vtable);
}

static void log_line(const char* format, ...) {
    wchar_t module_path[MAX_PATH]{};
    GetModuleFileNameW(g_module, module_path, MAX_PATH);

    wchar_t* slash = wcsrchr(module_path, L'\\');
    if (slash) {
        slash[1] = L'\0';
    } else {
        module_path[0] = L'\0';
    }

    wcscat_s(module_path, L"ProtocolLib.probe.log");

    HANDLE file = CreateFileW(
        module_path,
        FILE_APPEND_DATA,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr,
        OPEN_ALWAYS,
        FILE_ATTRIBUTE_NORMAL,
        nullptr
    );
    if (file == INVALID_HANDLE_VALUE) {
        return;
    }

    std::time_t now = std::time(nullptr);
    std::tm tm{};
    localtime_s(&tm, &now);

    char line[2048]{};
    int offset = std::snprintf(
        line,
        sizeof(line),
        "%04d-%02d-%02d %02d:%02d:%02d ",
        tm.tm_year + 1900,
        tm.tm_mon + 1,
        tm.tm_mday,
        tm.tm_hour,
        tm.tm_min,
        tm.tm_sec
    );

    va_list args;
    va_start(args, format);
    if (offset < 0) {
        CloseHandle(file);
        return;
    }
    if (offset >= static_cast<int>(sizeof(line))) {
        offset = static_cast<int>(sizeof(line)) - 1;
    }

    std::vsnprintf(line + offset, sizeof(line) - offset, format, args);
    va_end(args);

    size_t length = std::strlen(line);
    if (length + 1 < sizeof(line)) {
        line[length++] = '\n';
    }

    DWORD written = 0;
    WriteFile(file, line, static_cast<DWORD>(length), &written, nullptr);
    CloseHandle(file);
}

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        g_module = module;
        init_fake_interface();
        DisableThreadLibraryCalls(module);
        log_line("DllMain PROCESS_ATTACH");
    } else if (reason == DLL_PROCESS_DETACH) {
        log_line("DllMain PROCESS_DETACH");
    }
    return TRUE;
}

extern "C" __declspec(dllexport) std::uintptr_t bedrock_protocol_allocator_set(
    std::uintptr_t a1,
    std::uintptr_t a2,
    std::uintptr_t a3,
    std::uintptr_t a4,
    std::uintptr_t a5,
    std::uintptr_t a6,
    std::uintptr_t a7,
    std::uintptr_t a8
) {
    log_line(
        "bedrock_protocol_allocator_set("
        "a1=0x%llx, a2=0x%llx, a3=0x%llx, a4=0x%llx, "
        "a5=0x%llx, a6=0x%llx, a7=0x%llx, a8=0x%llx)",
        static_cast<unsigned long long>(a1),
        static_cast<unsigned long long>(a2),
        static_cast<unsigned long long>(a3),
        static_cast<unsigned long long>(a4),
        static_cast<unsigned long long>(a5),
        static_cast<unsigned long long>(a6),
        static_cast<unsigned long long>(a7),
        static_cast<unsigned long long>(a8)
    );

    return 0;
}

extern "C" __declspec(dllexport) std::uintptr_t bedrock_protocol_library_init(
    std::uintptr_t a1,
    std::uintptr_t a2,
    std::uintptr_t a3,
    std::uintptr_t a4,
    std::uintptr_t a5,
    std::uintptr_t a6,
    std::uintptr_t a7,
    std::uintptr_t a8
) {
    log_line(
        "bedrock_protocol_library_init("
        "a1=0x%llx, a2=0x%llx, a3=0x%llx, a4=0x%llx, "
        "a5=0x%llx, a6=0x%llx, a7=0x%llx, a8=0x%llx)",
        static_cast<unsigned long long>(a1),
        static_cast<unsigned long long>(a2),
        static_cast<unsigned long long>(a3),
        static_cast<unsigned long long>(a4),
        static_cast<unsigned long long>(a5),
        static_cast<unsigned long long>(a6),
        static_cast<unsigned long long>(a7),
        static_cast<unsigned long long>(a8)
    );

    log_line(
        "bedrock_protocol_library_init returning fake interface at 0x%llx "
        "(vtable=0x%llx)",
        static_cast<unsigned long long>(reinterpret_cast<std::uintptr_t>(g_fake_object)),
        static_cast<unsigned long long>(reinterpret_cast<std::uintptr_t>(g_fake_vtable))
    );

    return reinterpret_cast<std::uintptr_t>(g_fake_object);
}
