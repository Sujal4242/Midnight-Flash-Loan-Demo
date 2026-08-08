const browserWebSocket = globalThis.WebSocket;

if (!browserWebSocket) {
  throw new Error('WebSocket is not available in this environment');
}

export default browserWebSocket;
export const WebSocket = browserWebSocket;
