# Frontend-Backend Integration Contract

This document provides a comprehensive reference of the REST APIs, WebSocket events, and data models expected by the frontend. You can use this as a direct blueprint for implementing the backend.

## 1. WebSocket Protocol (Real-time Stream)

**Endpoint:** `ws://<host>:<port>/ws/stream`

The frontend connects to this WebSocket to receive real-time alerts, incident updates, and system stats. All messages from the server should be JSON encoded and include a `type` field to distinguish the event.

### Server-to-Client Messages

#### 1. `snapshot`
Replaces the entire local state with a fresh snapshot.
```json
{
  "type": "snapshot",
  "incidents": [ /* Array of Incident objects */ ],
  "stats": { "replay": { "running": true, "dataset": "string", "speed": 1 } }
}
```

#### 2. `alert.batch`
Streams a batch of new raw alerts into the ring buffer.
```json
{
  "type": "alert.batch",
  "alerts": [
    {
      "id": "string",
      "dup_count": 0,
      "service": "string",
      "message": "string",
      "severity": "info",
      "timestamp": "2026-07-16T12:00:00Z"
    }
  ]
}
```

#### 3. `alert.dedup`
Updates the duplicate count of an existing alert.
```json
{
  "type": "alert.dedup",
  "alert_id": "string",
  "dup_count": 5
}
```

#### 4. `incident.created`
Fired when the backend identifies a new incident cluster.
```json
{
  "type": "incident.created",
  "incident": { /* Incident object */ },
  "member_alert_ids": ["alert-id-1", "alert-id-2"]
}
```

#### 5. `incident.updated`
Fired when an incident aggregates more alerts or its state changes.
```json
{
  "type": "incident.updated",
  "incident": { /* Updated Incident object */ },
  "added_alert_ids": ["alert-id-3"],
  "removed_alert_ids": []
}
```

#### 6. `incident.summary`
Fired when the LLM/backend finishes generating a summary.
```json
{
  "type": "incident.summary",
  "incident_id": "string",
  "title": "string",
  "summary": "string",
  "first_action": "string"
}
```

#### 7. `stats`
Periodic payload containing system metrics.
```json
{
  "type": "stats",
  "replay": {
    "running": true,
    "dataset": "db-cascade",
    "speed": 1
  }
}
```

---

## 2. REST API Endpoints

- **`POST /replay/start`**: `{ "scenario": "db-cascade", "speed": 1 }`
- **`POST /replay/stop`**: Stops the replay.
- **`GET /topology`**: Fetches dependency graph (`nodes`, `edges`).
- **`GET /incidents/:incidentId`**: Fetches detailed `Incident` object.
- **`GET /eval/results`**: Fetches evaluation metrics.

---

## 3. Core Data Models

### `Incident`
```typescript
{
  id: string;
  status: 'active' | 'resolved';
  created_at: string; // ISO 8601 Date
  resolved_at?: string; // ISO 8601 Date
  alert_count: number;
  services: string[];
  acknowledged: boolean;
  title?: string;
  summary?: string;
  first_action?: string;
}
```

### `Alert`
```typescript
{
  id: string;
  dup_count: number;
  service: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: string; // ISO 8601 Date
}
```
