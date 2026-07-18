#!/usr/bin/env python3
"""
Windows-compatible alternative to unzip_all.sh for the AIOps Challenge 2020 dataset.
This script extracts the daily zip files (e.g. 2020_04_11.zip) into data/raw/aiops-2020.
It correctly handles the GBK encoding used for Chinese filenames inside the zips.
"""

import argparse
import sys
import zipfile
from pathlib import Path

# Fix stdout encoding on Windows
sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).parent.parent.parent
DATA_DIR = ROOT_DIR / "data" / "AIOps 2020" / "AIOps挑战赛数据"
OUT_DIR = ROOT_DIR / "data" / "raw" / "aiops-2020"

# Limit to April 11th and 12th by default to save disk space and time
DEFAULT_DAYS = ["2020_04_11.zip", "2020_04_12.zip"]


def main():
    parser = argparse.ArgumentParser(description="Extract AIOps dataset.")
    parser.add_argument(
        "--full", action="store_true", help="Extract all zip files (not just the first 2 days)."
    )
    args = parser.parse_args()

    if not DATA_DIR.exists():
        print(f"Error: Dataset directory not found at {DATA_DIR}")
        return

    # Gather zips
    zips = list(DATA_DIR.glob("2020_*.zip"))

    # Filter out _lock.zip if they exist, we only want the unencrypted ones
    zips = [z for z in zips if not z.name.endswith("_lock.zip")]

    if not args.full:
        print("Running in subset mode (first 2 days only). Use --full to extract all.")
        zips = [z for z in zips if z.name in DEFAULT_DAYS]

    if not zips:
        print("No zip files found to extract.")
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Extracting to {OUT_DIR}...\n")

    for z_path in sorted(zips):
        print(f"Extracting {z_path.name}...")
        try:
            with zipfile.ZipFile(z_path, "r") as zf:
                for info in zf.infolist():
                    # Handle GBK encoding for zip contents
                    try:
                        # Attempt to decode as GBK
                        decoded_name = info.filename.encode("cp437").decode("gbk")
                    except Exception:
                        # Fallback to default
                        decoded_name = info.filename

                    out_path = OUT_DIR / decoded_name

                    if info.is_dir():
                        out_path.mkdir(parents=True, exist_ok=True)
                        continue

                    # Create parent dirs if necessary
                    out_path.parent.mkdir(parents=True, exist_ok=True)

                    # Extract file
                    with zf.open(info.filename) as source, open(out_path, "wb") as target:
                        target.write(source.read())
        except Exception as e:
            print(f"Error extracting {z_path.name}: {e}")

    print("\nExtraction complete!")


if __name__ == "__main__":
    main()
