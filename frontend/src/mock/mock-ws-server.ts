/**
 * Mock WebSocket server — replays fixture data into the store at configurable speed.
 * Used when the backend is unavailable.
 *
 * Status: skeleton — fixture replay logic in next sprint.
 */

export function createMockWsServer() {
  // TODO: import fixture JSON and replay with configurable speed
  return {
    start: (_speed: number) => { /* noop */ },
    stop:  () => { /* noop */ },
  }
}
