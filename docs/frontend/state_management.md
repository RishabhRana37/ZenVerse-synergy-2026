# State Management

The frontend of ZenVerse Synergy 2026 relies heavily on **Zustand** for global state management. Since the application handles a high volume of real-time data streaming over WebSockets, the state architecture is optimized for performance and O(1) lookups.

## The Stream Store (`src/store/stream.ts`)

The primary store is defined in `stream.ts`. It acts as the single source of truth for the entire WebSocket connection lifecycle and data stream.

### State Shape

- **`alerts`**: A ring buffer (array) of `Alert` objects. It is strictly capped (e.g., at 500 alerts) so that the DOM does not crash during an alert storm. New alerts are prepended, and older alerts drop off the tail.
- **`alertIndex`**: A `Map<string, Alert>` used to look up alerts by their ID in `O(1)` time. This is critical for updating `dup_count` (deduplication count) instantly without iterating through arrays.
- **`incidents`**: A `Map<string, Incident>` that stores active and resolved incidents. As new alerts are correlated into an incident, this map updates in-place so incident cards never unmount or flicker.
- **`lastDiff`**: Tracks the latest delta of added/removed alerts for a given incident. The animation layer (Framer Motion) consumes this to show alerts visually flying into the incident cards.
- **`stats`**: Holds the latest system health and replay metrics sent by the backend.
- **`connection`**: Tracks the WebSocket connection status (`open`, `connecting`, `closed`).

### Actions and Reducers

The store provides specific actions that map 1-to-1 with the events emitted by the backend over the WebSocket (as defined in the Backend Contract):

- `applySnapshot` - Replaces the entire local state with a fresh truth from the server.
- `applyAlertBatch` - Prepends an array of new alerts to the buffer.
- `applyAlertDedup` - Patches an existing alert's duplicate count.
- `applyIncidentCreated` & `applyIncidentUpdated` - Upserts incidents in the `incidents` Map and updates `lastDiff`.
- `applyIncidentSummary` - Patches an incident with LLM insights.

### Global Store vs React Context

We strictly use Zustand instead of React Context because Zustand allows components to subscribe to **only specific slices** of the state. For example, the `Odometer` component tracking the alert count will only re-render when `alert_count` changes, entirely bypassing a re-render of the overall `IncidentPanel` or `TopologyHealthMap`.
