from __future__ import annotations

import math

import numpy as np
from sklearn.metrics import adjusted_rand_score


def compression_ratio(
    raw_alert_count: int,
    incident_count: int,
    unclustered_count: int,
) -> float:
    """1 − (incidents + noise) / raw_alerts. Target: ≥ 0.95."""
    if raw_alert_count == 0:
        return 0.0
    compressed = incident_count + unclustered_count
    return max(0.0, 1.0 - compressed / raw_alert_count)


def purity(
    predicted_clusters: dict[str, set[str]],
    ground_truth_labels: dict[str, str],  # alert_id → GT incident label
) -> float:
    """
    For each predicted cluster, fraction of members from its majority GT label.
    Target: ≥ 0.80.
    """
    if not predicted_clusters or not ground_truth_labels:
        return 0.0
    total = 0
    correct = 0
    for members in predicted_clusters.values():
        labelled = [ground_truth_labels[aid] for aid in members if aid in ground_truth_labels]
        if not labelled:
            continue
        counts: dict[str, int] = {}
        for label in labelled:
            counts[label] = counts.get(label, 0) + 1
        correct += max(counts.values())
        total += len(labelled)
    return correct / total if total > 0 else 0.0


def adjusted_rand_index(
    predicted_clusters: dict[str, set[str]],
    ground_truth_labels: dict[str, str],
) -> float:
    """
    sklearn ARI — corrects for chance, punishes both over-splitting and over-merging.
    Reported alongside purity (purity alone rewards over-splitting).
    """
    all_ids = sorted(ground_truth_labels.keys())
    if not all_ids:
        return 0.0
    pred_map: dict[str, int] = {}
    for label_int, (_, members) in enumerate(predicted_clusters.items()):
        for aid in members:
            pred_map[aid] = label_int
    y_true = [ground_truth_labels.get(aid, "__noise__") for aid in all_ids]
    y_pred = [pred_map.get(aid, -1) for aid in all_ids]
    try:
        return float(adjusted_rand_score(y_true, y_pred))
    except Exception:
        return 0.0


def fragmentation(
    predicted_clusters: dict[str, set[str]],
    ground_truth_labels: dict[str, str],
) -> float:
    """
    Average number of predicted clusters a single GT incident is split across.
    Target: ≤ 1.5  (one real incident should not appear as 3 cards).
    """
    gt_incidents: dict[str, set[str]] = {}
    for aid, gt_label in ground_truth_labels.items():
        gt_incidents.setdefault(gt_label, set()).add(aid)
    if not gt_incidents:
        return 1.0
    frags = []
    for gt_members in gt_incidents.values():
        covering = {ck for ck, preds in predicted_clusters.items() if preds & gt_members}
        frags.append(len(covering) if covering else 0)
    return sum(frags) / len(frags)


def hit_at_k(
    root_predictions: dict[str, str],   # cluster_key → top-1 predicted alert_id (or pipe-separated list)
    ground_truth_roots: dict[str, str], # GT incident label → GT root alert_id
    predicted_clusters: dict[str, set[str]], # cluster_key → {alert_ids}
) -> tuple[float, float, dict]:
    """
    Hit@1: top-1 prediction IS the labeled root.
    Hit@3: labeled root appears in top-3 (approximated here — full top-k requires
           the ranker to return lists, patched in harness.py).
    Returns (hit@1, hit@3, per_type_breakdown).
    """
    total = len(ground_truth_roots)
    if total == 0:
        return 0.0, 0.0, {}

    alert_to_ck = {}
    for ck, members in predicted_clusters.items():
        for aid in members:
            alert_to_ck[aid] = ck

    h1 = 0
    h3 = 0

    for gt_label, gt_root in ground_truth_roots.items():
        ck = alert_to_ck.get(gt_root)
        if not ck:
            continue
        preds = root_predictions.get(ck, "")
        if preds.split("|")[0] == gt_root:
            h1 += 1
        if gt_root in preds.split("|"):
            h3 += 1

    return h1 / total, h3 / total, {}
