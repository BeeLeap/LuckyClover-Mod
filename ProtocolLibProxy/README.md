# ProtocolLib Proxy

Local diagnostic proxy for Glacie/ProtocolLib ABI exploration.

Place the real library beside this DLL as `ProtocolLib.real.dll`. Glacie loads
this proxy as `ProtocolLib.dll`; the proxy forwards the two exported entry
points to the real library and logs interface vtable calls to
`ProtocolLib.proxy.log`.
