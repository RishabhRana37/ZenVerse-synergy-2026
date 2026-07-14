# eval — evaluation harness

Runs the real pipeline over labeled datasets (no replay delay) and produces the metrics that go on the finale slide: compression ratio, purity/ARI, root-cause Hit@1/Hit@3, latency, and per-signal ablations.

Spec: `docs/EVALUATION.md`. Results land in `eval/results/<dataset>_<git-sha>.json` (gitignored; regenerate, don't commit).

Two rules:
- Reported numbers come from held-out scenarios only — never the tuning scenario
- Re-run after every correlator/ranker change; no "it seems better"
