#!/usr/bin/env python3
"""
AIOps Challenge 2020 dataset download guide.

The dataset has access restrictions — manual download is required.

Usage: python scripts/fetch_aiops.py
"""

from pathlib import Path

RAW_DIR = Path(__file__).parent.parent / "data" / "raw"

INSTRUCTIONS = f"""
AIOps Challenge 2020 Dataset
─────────────────────────────
Repository: https://github.com/NetManAIOps/AIOps-Challenge-2020-Data

The dataset is hosted on Tsinghua Cloud / Google Drive (links in the README).
MD5 checksums are published for verification.

License: restricted to non-commercial scientific research / classroom use.
A university hackathon qualifies — state this if asked by judges.

HEADS-UP (from DATASETS.md):
  - Data is metric/trace-shaped, NOT alert-shaped.
  - Folder and label names are in Chinese.
  - We derive alerts from KPI anomaly windows (threshold or z-score per KPI).
  - The failure CSV (故障整理（预赛）.csv) provides ground-truth incident labels.
  - Preprocessing is the biggest risk — start Day 1, timebox to 2 days.

Steps:
  1. Visit the GitHub repo above.
  2. Download daily zips from Tsinghua Cloud or Google Drive.
  3. Extract to: {RAW_DIR / "aiops-2020"}

Expected structure after download:
  data/raw/aiops-2020/
    metric/          ← KPI time series (one CSV per service)
    trace/           ← OpenTracing-style spans
    故障整理（预赛）.csv  ← ground truth failure records

After downloading:
  python scripts/parse_aiops.py   ← converts KPI anomalies → alert JSONL + GT JSON
"""


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    print(INSTRUCTIONS)
    aiops_dir = RAW_DIR / "aiops-2020"
    if aiops_dir.exists():
        files = list(aiops_dir.rglob("*"))
        print(f"✓  Found existing data at {aiops_dir} ({len(files)} files)")
    else:
        print(f"  → Target directory: {aiops_dir}")
        print("  Data not found. Please follow the steps above.")


if __name__ == "__main__":
    main()
