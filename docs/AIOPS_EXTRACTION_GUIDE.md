# AIOps Dataset Extraction & Parsing Guide

This guide explains how to properly prepare the AIOps Challenge 2020 dataset for use with StormLens on Windows.

## 1. Directory Structure

Place the downloaded AIOps zip files into `data/AIOps 2020/AIOps挑战赛数据/`.
The backend scripts expect to find the following files there:
- `2020_04_11.zip`, `2020_04_20.zip`, etc.
- `passwd.txt` (used for `_lock.zip` files if any)

**Note:** We do not commit the raw or extracted dataset to Git because it is hundreds of megabytes in size. `data/AIOps 2020/` and `data/raw/` are included in `.gitignore`.

## 2. Extracting the Data (Windows)

The original dataset comes with an `unzip_all.sh` bash script. Since this doesn't run natively on Windows PowerShell, we provide a cross-platform Python script instead.

Run the following from the `backend/` directory:
```bash
python scripts/unzip_all.py
```

**What this does:**
1. Automatically handles the Chinese (GBK) text encoding inside the zips.
2. By default, it extracts a **2-day subset (April 11 & April 12)** to `data/raw/aiops-2020/` to save disk space and processing time.
3. If you want the full dataset, run `python scripts/unzip_all.py --full`.

## 3. Parsing the Data into StormLens Format

Once the raw CSVs are extracted to `data/raw/aiops-2020/`, we need to parse the traces, metrics, and ground truth into a format the StormLens backend (ReplayEngine) understands.

Run the parser from the `backend/` directory:
```bash
python scripts/parse_aiops.py
```

**What this does:**
1. **Topology:** Parses `调用链指标` (Traces) to build `data/samples/aiops-topology.json`.
2. **Alerts:** Parses `平台指标` and `业务指标` using Z-score anomaly detection to generate mock alerts, saving to `data/samples/aiops-scn1.jsonl`.
3. **Ground Truth:** Parses `故障整理（预赛）.csv` into standard Incident format for the evaluation dashboard, saving to `data/samples/aiops-ground-truth.json`.

## 4. Replaying the Data

Once `aiops-scn1.jsonl` is generated, the backend `ReplayEngine` will automatically pick it up. 
Simply press `S` in the frontend UI to start streaming the real AIOps data!
