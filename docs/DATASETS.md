# StormLens — Datasets

Three-source strategy: one labeled dataset for measured evaluation, one large raw corpus for realism/scale, one synthetic generator for controllable demos. If any single source disappoints, the other two carry the project.

---

## 1. AIOps Challenge datasets (PRIMARY — labeled ground truth)

- **What** (verified July 14): business metrics + infrastructure metrics + OpenTracing-style traces from a microservice deployment, organized in daily zips, **plus a ground-truth failure-records CSV** (`故障整理（预赛）.csv` — "failure inventory") with timestamps, fault types, and fault locations per incident
- **Where**: https://github.com/NetManAIOps/AIOps-Challenge-2020-Data — download via Tsinghua Cloud or Google Drive links in the README (MD5 published)
- **License note**: restricted to non-commercial scientific research / classroom use — a university hackathon qualifies; say so if asked
- **Why**: the ONLY source with labeled root causes → powers cluster-accuracy and Hit@k metrics in `EVALUATION.md`
- **Heads-up**: the data is **metric/trace-shaped, not alert-shaped**, and folder/label names are in Chinese. We derive alert events from KPI anomaly windows (threshold or simple z-score per KPI) and map the failure CSV to ground-truth incident labels. The trace parent-child spans also give us a REAL service topology instead of a hand-declared one — a credibility upgrade worth the parsing effort
- **Owner**: B (parsing) + D (label mapping)
- **Risk note**: this preprocessing is the biggest unknown in the project — start Day 1, timebox to 2 days, escalate at the Day 3 sync if it's fighting back

## 2. Loghub (SCALE + REALISM)

- **What**: large public collection of real system logs — HDFS, OpenStack, Spark, Linux syslog, Apache (https://github.com/logpai/loghub)
- **Why**: real messy text at volume; OpenStack/HDFS subsets have anomaly labels usable for coarse validation; great source of realistic alert *text* for the storm replay
- **Tasks**: pick 1–2 subsets (OpenStack recommended — service-structured); template extraction doubles as correlator input
- **Owner**: B

## 3. Synthetic storm generator (DEMO CONTROL)

- **What**: our own scenario scripts — a topology YAML + a failure script ("postgres-primary dies at t=30s; dependent services alert with 5–20 s lag, 10–50 alerts/service; unrelated background noise at 2 alerts/s")
- **Why**: guaranteed demo path with known ground truth; controllable difficulty; can be triggered LIVE on stage (P1); tests failure types absent from public data
- **Design rule**: generator must produce *plausible* alert text (reuse Loghub phrasing patterns), not `"alert_1 from service_A"` — judges will read the raw stream panel
- **Scenarios to script**: (1) DB cascade, (2) network partition, (3) rolling-deploy regression
- **Owner**: B (engine) + D (scenarios)

## Storage conventions

```
data/raw/        # downloaded originals — NEVER committed (size); download via scripts/
data/samples/    # small curated slices, committed — enough for dev + CI without downloads
data/synthetic/  # generated scenario files, committed (they're small and deterministic)
```

Add `data/raw/` to `.gitignore`. Every dataset gets a `scripts/fetch_<name>.(sh|py)` so any teammate reproduces the environment in one command — this also matters if the finale requires rebuilding from scratch on fresh machines.
