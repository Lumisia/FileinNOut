// Browser shim for Node-only modules that the legacy `stompjs` package pulls in.
//
// `stompjs/index.js` unconditionally loads `lib/stomp-node.js`, which `require()`s the
// Node built-in `net` (top level) and the Node `websocket` package (in `wrapWS`) for its
// TCP / WS transports. The browser build only ever calls `Stomp.over(new SockJS(...))`
// with the native WebSocket, so those Node transports (`overTCP` / `overWS`) are never
// invoked. Without this shim Vite leaves bare "net" / "websocket" specifiers in the
// browser bundle, and the browser's ESM loader throws:
//   TypeError: Failed to resolve module specifier "websocket".
//
// Aliasing those specifiers to this empty module keeps them out of the bundle while
// preserving all real STOMP behaviour (the shimmed members are never read at runtime).
export const client = undefined
export const w3cwebsocket = undefined
export default {}
