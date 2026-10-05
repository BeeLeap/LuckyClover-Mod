# ProtocolLib Probe

This builds a diagnostic `ProtocolLib.dll` for local ABI probing.

It exports the two entry points Glacie looks up:

- `bedrock_protocol_allocator_set`
- `bedrock_protocol_library_init`

The DLL writes calls to `ProtocolLib.probe.log` beside itself and deliberately
returns an initialization failure so Glacie does not continue with a fake
protocol implementation.

## Build

Run from a Visual Studio x64 developer shell:

```powershell
cl /nologo /std:c++20 /EHsc /LD ProtocolLibProbe.cpp /link /DEF:ProtocolLibProbe.def /OUT:ProtocolLib.dll
```

## Use

Back up the real `ProtocolLib.dll`, place this probe where Glacie expects
`ProtocolLib.dll`, start the server, then inspect `ProtocolLib.probe.log`.
