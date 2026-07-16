# Frontend Documentation

Welcome to the frontend documentation for ZenVerse Synergy 2026. This documentation is intended to help developers understand the architecture, features, and real-time state management used in the frontend application.

## Overview

The frontend is a React + Vite + TypeScript application designed as a "War Room" for monitoring incidents and alerts in real-time. It prioritizes high-performance rendering (up to 500+ alerts streaming in without lag), dynamic visual choreography, and in-place updates.

### Key Technologies
- **React 18** (UI)
- **Vite** (Build Tool)
- **Zustand** (Global State Management)
- **Framer Motion** (Animations and visual choreography)
- **Cytoscape.js** (Dependency graph / Topology rendering)
- **Tailwind CSS** (Styling)

## Documentation Index

- [Features Overview](./features.md) - Detailed breakdown of all panels, views, and features.
- [State Management](./state_management.md) - How we handle the high-throughput WebSocket stream using Zustand.
- [Backend Contract](../backend_contract.md) - The API and WebSocket events the backend must fulfill.
