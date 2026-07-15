# StormLens — WebSocket Event Contract (`WS /ws/stream`)

Frontend ⇄ backend contract for the war-room UI. **Frontend builds against a mock server implementing exactly this; backend implements exactly this; integration = swapping a URL.**

All messages are JSON: `{ "type": string, ...payload }`. Server → client only (client control goes through REST: `/replay/start`, `/replay/stop`).

---

## 1. `alert.batch`

Raw stream events. **Always batched** — at 100 alerts/s, one WS frame per alert wastes CPU on both ends. Backend flushes every **100 ms** or **50 alerts**, whichever first.

```json
{
  "type": "alert.batch",
  "alerts": [
    {
      "id": "a-uuid",
      "ts": "2026-07-31T10:15:03.120Z",
      "source": "replay:aiops",
      "host": "host-42",
      "service": "order-svc",
      "severity": "critical",          // "critical" | "warning" | "info"
      "message": "disk full on host-42",
      "template": "disk full on <HOST>",
      "dup_count": 1,                   // >1 = collapsed repeat, UI shows ×N
      "cluster_id": null                // null = unclustered at emit time
    }
  ]
}
```

Note: when an existing alert's `dup_count` increments (fingerprint dedup hit), do **not** re-send the alert. Send `alert.dedup` instead:

```json
{ "type": "alert.dedup", "alert_id": "a-uuid", "dup_count": 47 }
```

(UI animates the ×N badge ticking up — a visible dedup story for free.)

## 2. `incident.created`

```json
{
  "type": "incident.created",
  "incident": { /* full Incident object, §6 */ },
  "member_alert_ids": ["a1", "a2", "a3"]
}
```

## 3. `incident.updated`

**The critical event.** Must include the diff — the convergence animation (alerts flying from the raw stream into the card) depends on knowing *which* alerts just joined.

```json
{
  "type": "incident.updated",
  "incident": { /* full Incident object, refreshed */ },
  "added_alert_ids": ["a7", "a9"],
  "removed_alert_ids": []
}
```

Emitted on each 2 s reconciliation tick, only for incidents that changed. Incident `id` must be **stable across ticks** (per the reconciliation design in ARCHITECTURE §4).

## 4. `incident.summary`

Async LLM (or template-fallback) summary arriving after the card already rendered:

```json
{
  "type": "incident.summary",
  "incident_id": "i-uuid",
  "title": "postgres-primary failure cascading through order path",
  "summary": "…one paragraph…",
  "first_action": "Check postgres-primary disk and failover status",
  "generated_by": "llm"                 // "llm" | "template"
}
```

## 5. `stats`

Every 2 s tick. Backend-computed so the hero numbers are authoritative and match the eval page.

```json
{
  "type": "stats",
  "total_alerts": 2143,                 // incl. dup counts
  "unique_alerts": 512,                 // post-dedup
  "active_incidents": 3,
  "unclustered": 14,                    // noise points
  "compression_ratio": 0.9986,
  "alerts_per_sec": 96.4,
  "replay": { "running": true, "dataset": "aiops-scn1", "speed": 50, "progress": 0.42 }
}
```

## 6. `Incident` object

```json
{
  "id": "i-uuid",
  "created_at": "2026-07-31T10:15:05Z",
  "updated_at": "2026-07-31T10:15:11Z",
  "status": "active",                   // "active" | "resolved"
  "title": "postgres-primary failure",  // template title until summary arrives
  "alert_count": 847,                   // incl. dups
  "unique_count": 41,
  "services": ["postgres-primary", "order-svc", "auth-svc", "api-gateway"],
  "root_candidates": [
    { "alert_id": "a1", "service": "postgres-primary",
      "template": "disk full on <HOST>", "score": 0.83, "confidence": 0.74 },
    { "alert_id": "a4", "service": "order-svc",
      "template": "connection timeout to <HOST>", "score": 0.41, "confidence": 0.18 }
  ],                                     // top-3, sorted desc
  "sparkline": [0, 3, 41, 120, 340, 847],  // alert count per 10s bucket, last 6 buckets
  "summary": null,
  "first_action": null
}
```

## 7. REST used by the frontend (from ARCHITECTURE §7, unchanged)

- `GET /incidents`, `GET /incidents/{id}` — drill-down: full members, root candidates, **topology path** (list of edges to highlight)
- `GET /topology` — `{ nodes: [{id}], edges: [{source, target}] }` for Cytoscape
- `GET /eval/results` — eval dashboard JSON
- `POST /replay/start` `{dataset, speed, scenario}` / `POST /replay/stop`

`GET /incidents/{id}` additionally returns:

```json
{
  "members": [ /* full Alert objects, dups collapsed with dup_count */ ],
  "topology_path": [ ["postgres-primary","order-svc"], ["order-svc","api-gateway"] ]
}
```

`topology_path` = edges on the propagation path from root outward, **ordered by propagation sequence** (frontend animates them in order).

## 8. Reconnect behavior

On WS (re)connect, server sends one `snapshot` before streaming resumes:

```json
{ "type": "snapshot", "incidents": [ /* all active */ ], "stats": { /* §5 */ } }
```

Frontend replaces local state with the snapshot. Raw-stream history is not replayed (ring buffer refills naturally).
