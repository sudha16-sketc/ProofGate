const BrowserWebSocket =
  typeof WebSocket !== 'undefined'
    ? WebSocket
    : typeof globalThis.WebSocket !== 'undefined'
      ? globalThis.WebSocket
      : undefined;

export default BrowserWebSocket;
export { BrowserWebSocket as WebSocket };
