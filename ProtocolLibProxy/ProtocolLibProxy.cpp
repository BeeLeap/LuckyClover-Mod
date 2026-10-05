#include <windows.h>

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <ctime>

static HMODULE g_module = nullptr;
static HMODULE g_real_module = nullptr;
static std::uintptr_t g_real_object = 0;
static std::uintptr_t* g_real_vtable = nullptr;
static std::uintptr_t g_proxy_object[4]{};
static std::uintptr_t g_proxy_vtable[64]{};

using ExportFn = std::uintptr_t(__cdecl*)(
    std::uintptr_t,
    std::uintptr_t,
    std::uintptr_t,
    std::uintptr_t,
    std::uintptr_t,
    std::uintptr_t,
    std::uintptr_t,
    std::uintptr_t
);

static void log_line(const char* format, ...) {
    wchar_t module_path[MAX_PATH]{};
    GetModuleFileNameW(g_module, module_path, MAX_PATH);

    wchar_t* slash = wcsrchr(module_path, L'\\');
    if (slash) {
        slash[1] = L'\0';
    } else {
        module_path[0] = L'\0';
    }

    wcscat_s(module_path, L"ProtocolLib.proxy.log");

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

    char line[4096]{};
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

    if (offset < 0) {
        CloseHandle(file);
        return;
    }
    if (offset >= static_cast<int>(sizeof(line))) {
        offset = static_cast<int>(sizeof(line)) - 1;
    }

    va_list args;
    va_start(args, format);
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

static HMODULE load_real_module() {
    if (g_real_module) {
        return g_real_module;
    }

    wchar_t module_path[MAX_PATH]{};
    GetModuleFileNameW(g_module, module_path, MAX_PATH);
    wchar_t* slash = wcsrchr(module_path, L'\\');
    if (slash) {
        slash[1] = L'\0';
    } else {
        module_path[0] = L'\0';
    }
    wcscat_s(module_path, L"ProtocolLib.real.dll");

    g_real_module = LoadLibraryW(module_path);
    log_line("LoadLibraryW(real) -> 0x%llx", static_cast<unsigned long long>(reinterpret_cast<std::uintptr_t>(g_real_module)));
    return g_real_module;
}

static bool is_readable_pointer(std::uintptr_t value) {
    if (value < 0x10000) {
        return false;
    }

    MEMORY_BASIC_INFORMATION mbi{};
    if (!VirtualQuery(reinterpret_cast<void*>(value), &mbi, sizeof(mbi))) {
        return false;
    }

    if (mbi.State != MEM_COMMIT || (mbi.Protect & PAGE_NOACCESS) || (mbi.Protect & PAGE_GUARD)) {
        return false;
    }

    return true;
}

static void dump_pointer(const char* label, std::uintptr_t value) {
    if (!is_readable_pointer(value)) {
        return;
    }

    auto* ptr = reinterpret_cast<unsigned char*>(value);
    char hex[3 * 32 + 1]{};
    char ascii[33]{};
    for (int i = 0; i < 32; ++i) {
        unsigned char byte = ptr[i];
        std::snprintf(hex + i * 3, 4, "%02X ", byte);
        ascii[i] = byte >= 32 && byte < 127 ? static_cast<char>(byte) : '.';
    }
    ascii[32] = '\0';

    log_line("%s @0x%llx bytes: %s ascii: %s", label, static_cast<unsigned long long>(value), hex, ascii);
}

static std::uintptr_t call_real_slot(
    int slot,
    std::uintptr_t,
    std::uintptr_t a2,
    std::uintptr_t a3,
    std::uintptr_t a4,
    std::uintptr_t a5,
    std::uintptr_t a6,
    std::uintptr_t a7,
    std::uintptr_t a8
) {
    if (!g_real_vtable || !g_real_vtable[slot]) {
        log_line("proxy_slot_%d missing real function", slot);
        return 0;
    }

    auto fn = reinterpret_cast<ExportFn>(g_real_vtable[slot]);
    log_line(
        "proxy_slot_%d -> real 0x%llx(a2=0x%llx, a3=0x%llx, a4=0x%llx, a5=0x%llx, a6=0x%llx, a7=0x%llx, a8=0x%llx)",
        slot,
        static_cast<unsigned long long>(g_real_vtable[slot]),
        static_cast<unsigned long long>(a2),
        static_cast<unsigned long long>(a3),
        static_cast<unsigned long long>(a4),
        static_cast<unsigned long long>(a5),
        static_cast<unsigned long long>(a6),
        static_cast<unsigned long long>(a7),
        static_cast<unsigned long long>(a8)
    );

    std::uintptr_t result = fn(g_real_object, a2, a3, a4, a5, a6, a7, a8);
    log_line("proxy_slot_%d <- 0x%llx", slot, static_cast<unsigned long long>(result));
    dump_pointer("  result", result);
    dump_pointer("  arg2", a2);
    dump_pointer("  arg3", a3);
    return result;
}

#define PROXY_SLOT(N) \
extern "C" std::uintptr_t __cdecl proxy_slot_##N( \
    std::uintptr_t a1, std::uintptr_t a2, std::uintptr_t a3, std::uintptr_t a4, \
    std::uintptr_t a5, std::uintptr_t a6, std::uintptr_t a7, std::uintptr_t a8 \
) { \
    return call_real_slot(N, a1, a2, a3, a4, a5, a6, a7, a8); \
}

PROXY_SLOT(0)  PROXY_SLOT(1)  PROXY_SLOT(2)  PROXY_SLOT(3)
PROXY_SLOT(4)  PROXY_SLOT(5)  PROXY_SLOT(6)  PROXY_SLOT(7)
PROXY_SLOT(8)  PROXY_SLOT(9)  PROXY_SLOT(10) PROXY_SLOT(11)
PROXY_SLOT(12) PROXY_SLOT(13) PROXY_SLOT(14) PROXY_SLOT(15)
PROXY_SLOT(16) PROXY_SLOT(17) PROXY_SLOT(18) PROXY_SLOT(19)
PROXY_SLOT(20) PROXY_SLOT(21) PROXY_SLOT(22) PROXY_SLOT(23)
PROXY_SLOT(24) PROXY_SLOT(25) PROXY_SLOT(26) PROXY_SLOT(27)
PROXY_SLOT(28) PROXY_SLOT(29) PROXY_SLOT(30) PROXY_SLOT(31)

static void init_proxy_vtable() {
    void* slots[] = {
        reinterpret_cast<void*>(proxy_slot_0),
        reinterpret_cast<void*>(proxy_slot_1),
        reinterpret_cast<void*>(proxy_slot_2),
        reinterpret_cast<void*>(proxy_slot_3),
        reinterpret_cast<void*>(proxy_slot_4),
        reinterpret_cast<void*>(proxy_slot_5),
        reinterpret_cast<void*>(proxy_slot_6),
        reinterpret_cast<void*>(proxy_slot_7),
        reinterpret_cast<void*>(proxy_slot_8),
        reinterpret_cast<void*>(proxy_slot_9),
        reinterpret_cast<void*>(proxy_slot_10),
        reinterpret_cast<void*>(proxy_slot_11),
        reinterpret_cast<void*>(proxy_slot_12),
        reinterpret_cast<void*>(proxy_slot_13),
        reinterpret_cast<void*>(proxy_slot_14),
        reinterpret_cast<void*>(proxy_slot_15),
        reinterpret_cast<void*>(proxy_slot_16),
        reinterpret_cast<void*>(proxy_slot_17),
        reinterpret_cast<void*>(proxy_slot_18),
        reinterpret_cast<void*>(proxy_slot_19),
        reinterpret_cast<void*>(proxy_slot_20),
        reinterpret_cast<void*>(proxy_slot_21),
        reinterpret_cast<void*>(proxy_slot_22),
        reinterpret_cast<void*>(proxy_slot_23),
        reinterpret_cast<void*>(proxy_slot_24),
        reinterpret_cast<void*>(proxy_slot_25),
        reinterpret_cast<void*>(proxy_slot_26),
        reinterpret_cast<void*>(proxy_slot_27),
        reinterpret_cast<void*>(proxy_slot_28),
        reinterpret_cast<void*>(proxy_slot_29),
        reinterpret_cast<void*>(proxy_slot_30),
        reinterpret_cast<void*>(proxy_slot_31),
    };

    for (size_t i = 0; i < 64; ++i) {
        g_proxy_vtable[i] = reinterpret_cast<std::uintptr_t>(slots[i % 32]);
    }
    g_proxy_object[0] = reinterpret_cast<std::uintptr_t>(g_proxy_vtable);
}

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        g_module = module;
        init_proxy_vtable();
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
        "bedrock_protocol_allocator_set(a1=0x%llx, a2=0x%llx, a3=0x%llx, a4=0x%llx, a5=0x%llx, a6=0x%llx, a7=0x%llx, a8=0x%llx)",
        static_cast<unsigned long long>(a1),
        static_cast<unsigned long long>(a2),
        static_cast<unsigned long long>(a3),
        static_cast<unsigned long long>(a4),
        static_cast<unsigned long long>(a5),
        static_cast<unsigned long long>(a6),
        static_cast<unsigned long long>(a7),
        static_cast<unsigned long long>(a8)
    );

    HMODULE real = load_real_module();
    if (!real) {
        return 0;
    }

    auto fn = reinterpret_cast<ExportFn>(GetProcAddress(real, "bedrock_protocol_allocator_set"));
    log_line("GetProcAddress(allocator_set) -> 0x%llx", static_cast<unsigned long long>(reinterpret_cast<std::uintptr_t>(fn)));
    if (!fn) {
        return 0;
    }

    std::uintptr_t result = fn(a1, a2, a3, a4, a5, a6, a7, a8);
    log_line("bedrock_protocol_allocator_set real returned 0x%llx", static_cast<unsigned long long>(result));
    return result;
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
        "bedrock_protocol_library_init(a1=0x%llx, a2=0x%llx, a3=0x%llx, a4=0x%llx, a5=0x%llx, a6=0x%llx, a7=0x%llx, a8=0x%llx)",
        static_cast<unsigned long long>(a1),
        static_cast<unsigned long long>(a2),
        static_cast<unsigned long long>(a3),
        static_cast<unsigned long long>(a4),
        static_cast<unsigned long long>(a5),
        static_cast<unsigned long long>(a6),
        static_cast<unsigned long long>(a7),
        static_cast<unsigned long long>(a8)
    );

    HMODULE real = load_real_module();
    if (!real) {
        return 0;
    }

    auto fn = reinterpret_cast<ExportFn>(GetProcAddress(real, "bedrock_protocol_library_init"));
    log_line("GetProcAddress(library_init) -> 0x%llx", static_cast<unsigned long long>(reinterpret_cast<std::uintptr_t>(fn)));
    if (!fn) {
        return 0;
    }

    g_real_object = fn(a1, a2, a3, a4, a5, a6, a7, a8);
    g_real_vtable = g_real_object ? *reinterpret_cast<std::uintptr_t**>(g_real_object) : nullptr;

    log_line(
        "bedrock_protocol_library_init real returned object=0x%llx vtable=0x%llx; returning proxy=0x%llx proxy_vtable=0x%llx",
        static_cast<unsigned long long>(g_real_object),
        static_cast<unsigned long long>(reinterpret_cast<std::uintptr_t>(g_real_vtable)),
        static_cast<unsigned long long>(reinterpret_cast<std::uintptr_t>(g_proxy_object)),
        static_cast<unsigned long long>(reinterpret_cast<std::uintptr_t>(g_proxy_vtable))
    );

    for (int i = 0; i < 16 && g_real_vtable; ++i) {
        log_line("real_vtable[%d]=0x%llx", i, static_cast<unsigned long long>(g_real_vtable[i]));
    }

    return reinterpret_cast<std::uintptr_t>(g_proxy_object);
}
