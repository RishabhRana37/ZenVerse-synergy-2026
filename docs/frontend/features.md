# Frontend Features Overview

The frontend application is divided into several major feature modules under `src/features/`. Each handles a specific aspect of the monitoring and evaluation experience.

## 1. Incidents (`src/features/incidents`)

The heart of the application. This module visualizes high-level incidents inferred from raw alerts.

- **`IncidentPanel.tsx`**: Displays a list of active and resolved incidents. Cards are designed to update in-place (without flickering) as new alerts join an incident. When an incident is selected, it can trigger drill-down views.
- **`TopologyHealthMap.tsx`**: Renders an interactive dependency graph (powered by Cytoscape) showing microservices. Nodes flash and edges pulse to show the blast radius and root cause propagation as alerts come in.

## 2. Storm Stream (`src/features/storm`)

Visualizes the incoming barrage of raw alert data before it is clustered into incidents.

- **`RawStreamPanel.tsx`**: A high-performance scrolling log of incoming alerts. It uses a capped ring buffer to ensure the DOM doesn't crash when thousands of alerts stream in.
- **`StormTimeline.tsx`**: A time-series chart mapping the frequency of alerts over time.

## 3. Drill-Down (`src/features/drilldown`)

- **`DrillDownSlideOver.tsx`**: A sliding overlay that appears when an incident is clicked. It queries the backend for deep metrics on a specific incident, including LLM-generated summaries, root cause confidence scoring, and impacted services. It also allows responders to `acknowledge` or `resolve` incidents.

## 4. Evaluation Dashboard (`src/features/eval`)

- **`EvalDashboard.tsx`**: A standalone route used by ML/AI engineers to evaluate the clustering and root-cause analysis models. It fetches evaluation metrics (`/eval/results`) and displays precision/recall scores, latency, and ablation study results.

## 5. Demo Driver (`src/features/demo-driver`)

- **`DemoDriver.tsx`**: A hidden or dedicated panel for presenters to control the mock backend. It allows the user to trigger specific catastrophic scenarios (e.g., `db-cascade`) and configure the replay speed for demonstrations.

## 6. Keyboard Shortcuts

The app has global keyboard shortcuts configured via `src/hooks/useKeyboardShortcuts.ts` to aid in quick demos and navigation:
- `s` - Start Replay
- `x` - Stop Replay
- `r` - Reset and Restart Replay
- `w` - Go to War Room
- `e` - Toggle Eval Dashboard
- `m` - Mute / Unmute Ambience
- `?` - Toggle Help Overlay
