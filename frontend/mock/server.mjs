#!/usr/bin/env node
/**
 * StormLens Mock WebSocket Server
 * Serves ws://localhost:8787/ws/stream
 *
 * Contract: docs/WS_CONTRACT.md
 *
 * Usage:
 *   node mock/server.mjs          — start and replay scenario
 *   Press "r" + Enter in terminal — restart scenario from t=0
 *
 * Message types emitted (per contract):
 *   snapshot          — on every client connect
 *   alert.batch       — every 100ms flush of accumulated alerts
 *   alert.dedup       — dup_count update for existing alert
 *   incident.created  — new incident with member_alert_ids
 *   incident.updated  — diff with added_alert_ids / removed_alert_ids
 *   incident.summary  — async LLM/template summary arriving later
 *   stats             — every 2s, computed from live state
 */

import { WebSocketServer } from 'ws'
import { createReadStream } from 'fs'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createInterface } from 'readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 8787
const SCENARIO_PATH = join(__dirname, 'scenario-db-cascade.json')

// ── Colours for terminal output ────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  dim:   '\x1b[2m',
  green: '\x1b[32m',
  cyan:  '\x1b[36m',
  yellow:'\x1b[33m',
  red:   '\x1b[31m',
  bold:  '\x1b[1m',
}

function log(tag, msg, color = C.dim) {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`${C.dim}${ts}${C.reset} ${color}[${tag}]${C.reset} ${msg}`)
}

// ── Server-side live state ─────────────────────────────────────────────────
const state = {
  alerts: new Map(),          // id → alert object (with current dup_count)
  incidents: new Map(),       // id → incident object
  totalAlertsByVolume: 0,     // incl dup_count expansions
  uniqueAlerts: 0,            // unique alert count
  unclustered: 0,
  alertsEmittedLastWindow: 0, // for alerts_per_sec
  windowStart: Date.now(),
}

let scenarioBaseTs = null     // real Date when scenario started (t=0)
let scenarioTimers = []       // setTimeout handles for cleanup on restart
let statsTimer = null

// ── Load scenario ──────────────────────────────────────────────────────────
let scenario = null
async function loadScenario() {
  const raw = await readFile(SCENARIO_PATH, 'utf-8')
  scenario = JSON.parse(raw)
  log('SCENARIO', `Loaded "${scenario.meta.name}" — ${scenario.events.length} events`, C.green)
}

// ── Broadcast helpers ──────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: PORT })

function broadcast(msg) {
  const frame = JSON.stringify(msg)
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(frame)
    }
  }
}

function sendTo(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg))
}

// ── Snapshot (sent on every connect) ──────────────────────────────────────
function buildSnapshot() {
  const statsPayload = buildStats()
  return {
    type: 'snapshot',
    incidents: [...state.incidents.values()],
    stats: statsPayload,
  }
}

function buildStats() {
  const now = Date.now()
  const windowMs = Math.max(now - state.windowStart, 1)
  const alertsPerSec = (state.alertsEmittedLastWindow / (windowMs / 1000)).toFixed(1)

  const activeIncidents = [...state.incidents.values()].filter(i => i.status === 'active').length
  const compressionRatio =
    state.totalAlertsByVolume > 0
      ? parseFloat((1 - activeIncidents / state.totalAlertsByVolume).toFixed(4))
      : 0

  const scenarioElapsed = scenarioBaseTs ? (now - scenarioBaseTs) / 1000 : 0
  const progress = Math.min(scenarioElapsed / 90, 1)

  return {
    type: 'stats',
    total_alerts: state.totalAlertsByVolume,
    unique_alerts: state.uniqueAlerts,
    active_incidents: activeIncidents,
    unclustered: state.unclustered,
    compression_ratio: compressionRatio,
    alerts_per_sec: parseFloat(alertsPerSec),
    replay: {
      running: scenarioTimers.length > 0,
      dataset: 'db-cascade',
      speed: 1,
      progress: parseFloat(progress.toFixed(3)),
    },
  }
}

// ── Resolve __BASE_TS__ placeholders ───────────────────────────────────────
function resolveTs(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(resolveTs)
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.startsWith('__BASE_TS')) {
      const match = v.match(/\+(\d+)__$/)
      const offset = match ? parseInt(match[1], 10) : 0
      out[k] = new Date(scenarioBaseTs + offset).toISOString()
    } else if (typeof v === 'object') {
      out[k] = resolveTs(v)
    } else {
      out[k] = v
    }
  }
  return out
}

// ── Scenario replay ────────────────────────────────────────────────────────
function clearTimers() {
  for (const t of scenarioTimers) clearTimeout(t)
  scenarioTimers = []
}

function resetState() {
  state.alerts.clear()
  state.incidents.clear()
  state.totalAlertsByVolume = 0
  state.uniqueAlerts = 0
  state.unclustered = 0
  state.alertsEmittedLastWindow = 0
  state.windowStart = Date.now()
}

function startScenario() {
  clearTimers()
  resetState()
  scenarioBaseTs = Date.now()

  log('SCENARIO', 'Starting replay from t=0', C.green)

  for (const event of scenario.events) {
    const timer = setTimeout(() => {
      handleScenarioEvent(event)
    }, event.t)
    scenarioTimers.push(timer)
  }

  // After scenario ends (90s), clean up timers list so stats shows running=false
  const endTimer = setTimeout(() => {
    scenarioTimers = []
    log('SCENARIO', 'Scenario complete. Stats continue. Press "r" to restart.', C.yellow)
  }, 91000)
  scenarioTimers.push(endTimer)
}

function handleScenarioEvent(event) {
  const resolved = resolveTs(event)

  switch (resolved.type) {
    case 'alert.batch': {
      const baseDate = new Date(scenarioBaseTs + (event.t || 0))
      const enrichedAlerts = resolved.alerts.map((a) => {
        const ts = new Date(baseDate.getTime() + (a.ts_offset || 0)).toISOString()
        const alert = { ...a, ts }
        delete alert.ts_offset
        state.alerts.set(alert.id, alert)
        state.uniqueAlerts++
        if (!alert.cluster_id) state.unclustered++
        // dup_count expansion for volume count
        state.totalAlertsByVolume += alert.dup_count || 1
        return alert
      })
      state.alertsEmittedLastWindow += enrichedAlerts.length

      broadcast({ type: 'alert.batch', alerts: enrichedAlerts })
      log('BATCH', `+${enrichedAlerts.length} alerts (total vol: ${state.totalAlertsByVolume})`, C.dim)
      break
    }

    case 'alert.dedup': {
      const existing = state.alerts.get(resolved.alert_id)
      if (existing) {
        const oldDup = existing.dup_count || 1
        const newDup = resolved.dup_count
        const delta = newDup - oldDup
        existing.dup_count = newDup
        state.totalAlertsByVolume += Math.max(delta, 0)
      }
      broadcast({ type: 'alert.dedup', alert_id: resolved.alert_id, dup_count: resolved.dup_count })
      log('DEDUP', `${resolved.alert_id} → ×${resolved.dup_count}`, C.dim)
      break
    }

    case 'incident.created': {
      state.incidents.set(resolved.incident.id, { ...resolved.incident })
      broadcast({
        type: 'incident.created',
        incident: resolved.incident,
        member_alert_ids: resolved.member_alert_ids,
      })
      log('INC+', `Created: ${resolved.incident.id} — "${resolved.incident.title}"`, C.cyan)
      break
    }

    case 'incident.updated': {
      state.incidents.set(resolved.incident.id, { ...resolved.incident })
      broadcast({
        type: 'incident.updated',
        incident: resolved.incident,
        added_alert_ids: resolved.added_alert_ids,
        removed_alert_ids: resolved.removed_alert_ids,
      })
      log('INC~', `Updated: ${resolved.incident.id} (${resolved.incident.alert_count} vol, ${resolved.incident.unique_count} uniq)`, C.cyan)
      break
    }

    case 'incident.summary': {
      const inc = state.incidents.get(resolved.incident_id)
      if (inc) {
        inc.summary = resolved.summary
        inc.first_action = resolved.first_action
        inc.title = resolved.title
      }
      broadcast({
        type: 'incident.summary',
        incident_id: resolved.incident_id,
        title: resolved.title,
        summary: resolved.summary,
        first_action: resolved.first_action,
        generated_by: resolved.generated_by,
      })
      log('SUMM', `Summary for ${resolved.incident_id}`, C.green)
      break
    }

    default:
      break
  }

  // Reset per-window counter every 2s
  const now = Date.now()
  if (now - state.windowStart >= 2000) {
    state.alertsEmittedLastWindow = 0
    state.windowStart = now
  }
}

// ── Stats broadcast every 2s ───────────────────────────────────────────────
function startStatsBroadcast() {
  if (statsTimer) clearInterval(statsTimer)
  statsTimer = setInterval(() => {
    const stats = buildStats()
    broadcast(stats)
    // Reset window counters after building stats
    state.alertsEmittedLastWindow = 0
    state.windowStart = Date.now()
  }, 2000)
}

// ── WebSocket connection handler ───────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const addr = req.socket.remoteAddress
  log('CONNECT', `Client connected from ${addr} (${wss.clients.size} total)`, C.green)

  // Send snapshot immediately
  sendTo(ws, buildSnapshot())
  log('SNAPSHOT', `Sent snapshot: ${state.incidents.size} incidents`, C.cyan)

  ws.on('close', () => {
    log('DISCONNECT', `Client disconnected (${wss.clients.size} remaining)`, C.yellow)
  })

  ws.on('error', (err) => {
    log('WS-ERR', err.message, C.red)
  })
})

wss.on('listening', () => {
  console.log(`\n${C.bold}${C.green}⚡ StormLens Mock WS Server${C.reset}`)
  console.log(`   Listening: ${C.cyan}ws://localhost:${PORT}/ws/stream${C.reset}`)
  console.log(`   Scenario:  ${C.dim}${SCENARIO_PATH}${C.reset}`)
  console.log(`   Press ${C.bold}r${C.reset} + Enter to restart scenario\n`)
})

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`${C.red}Port ${PORT} already in use. Kill the existing server first.${C.reset}`)
    process.exit(1)
  }
  console.error(err)
})

// ── Keyboard input for restart ─────────────────────────────────────────────
const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  if (line.trim().toLowerCase() === 'r') {
    log('CTRL', 'Restarting scenario...', C.yellow)
    startScenario()
    // Broadcast snapshot to all connected clients after short delay
    setTimeout(() => {
      for (const client of wss.clients) {
        if (client.readyState === 1) {
          sendTo(client, buildSnapshot())
        }
      }
    }, 50)
  }
})

// ── Boot ───────────────────────────────────────────────────────────────────
await loadScenario()
startStatsBroadcast()
startScenario()
