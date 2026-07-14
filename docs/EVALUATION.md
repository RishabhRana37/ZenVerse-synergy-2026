# StormLens — Evaluation Methodology

The evaluation is a first-class deliverable: it's what separates "we built a demo" from "we built a system and measured it." Every metric below is computed by the harness in `eval/` and rendered live on the eval dashboard.

---

## Metrics

### 1. Compression ratio
```
compression = 1 − (incident_count + unclustered_count) / raw_alert_count
```
Report both the headline (`2,143 → 3 incidents`) and the honest version including unclustered noise items. Target: ≥ 95%.

### 2. Cluster quality (vs. labeled ground truth)
- **Purity**: for each predicted cluster, the fraction of members belonging to its majority ground-truth incident. Target ≥ 0.8.
- **Adjusted Rand Index (ARI)**: overall agreement between predicted clustering and ground truth, chance-corrected. Report alongside purity (purity alone rewards over-splitting; ARI catches that).
- **Fragmentation**: average number of predicted clusters a single ground-truth incident is split across. Target ≤ 1.5 (one real incident should not appear as three cards).

### 3. Root-cause identification
- **Hit@1**: fraction of labeled incidents where the top-ranked candidate IS the labeled root cause. Target ≥ 60%.
- **Hit@3**: labeled root cause appears in top-3 candidates. Target ≥ 85%.
- Report per failure-type breakdown (DB, network, deploy) — judges will ask where it's weak; know the answer before they do.

### 4. Latency
- p50 / p95 of (alert received → incident card created/updated), measured during replay at 100 alerts/s. Target p95 < 5 s.

### 5. Ablations (the expert-judge slide)
Run the eval with each signal disabled:

| Configuration | Shows |
|---|---|
| Full system | baseline numbers |
| − semantic (no embeddings) | what semantics buys |
| − topology | what the dependency graph buys |
| − temporal | why timing matters |
| Naive dedup only (exact-duplicate collapse) | the strawman most teams will ship |

If the full system beats every ablation, we've *proven* the layered design instead of asserting it. HPE engineers will recognize this as real methodology.

## Protocol

1. **Tune/test split**: weight tuning (w_t, w_s, w_a, α–δ) happens on one labeled scenario; reported numbers come from *held-out* scenarios. Never report numbers from the tuning scenario — a domain-expert judge will ask exactly this.
2. Harness runs the real pipeline code (same classes as production path), just without replay delays.
3. Output: `eval/results/<dataset>_<git-sha>.json` — every reported number traceable to a commit.
4. Re-run after every correlator/ranker change. Numbers only move with evidence.

## Honesty rules for the finale

- Show the ablation and per-type breakdown even where we're weak — a known weakness explained beats a hidden one discovered in Q&A.
- If a metric misses target, report it with the reason and the roadmap fix. HPE judges reward engineering honesty; they punish inflated claims (they know this domain better than we do).
