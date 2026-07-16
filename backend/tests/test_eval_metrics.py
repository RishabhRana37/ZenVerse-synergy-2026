from __future__ import annotations

import pytest
from eval.metrics import (
    adjusted_rand_index,
    compression_ratio,
    fragmentation,
    hit_at_k,
    purity,
)


# ── compression_ratio ─────────────────────────────────────────────────────────

def test_compression_ratio_perfect() -> None:
    # 100 raw alerts → 2 incidents, 0 noise  →  (100 - 2) / 100 = 0.98
    assert compression_ratio(100, 2, 0) == pytest.approx(0.98)


def test_compression_ratio_zero_alerts() -> None:
    assert compression_ratio(0, 0, 0) == pytest.approx(0.0)


def test_compression_ratio_all_noise() -> None:
    # Every alert is noise → ratio = 0
    assert compression_ratio(10, 0, 10) == pytest.approx(0.0)


# ── purity ────────────────────────────────────────────────────────────────────

def test_purity_perfect() -> None:
    predicted = {"c0": {"a1", "a2"}, "c1": {"a3", "a4"}}
    gt = {"a1": "inc-A", "a2": "inc-A", "a3": "inc-B", "a4": "inc-B"}
    assert purity(predicted, gt) == pytest.approx(1.0)


def test_purity_impure_cluster() -> None:
    predicted = {"c0": {"a1", "a2", "a3"}}
    gt = {"a1": "inc-A", "a2": "inc-A", "a3": "inc-B"}
    # majority = inc-A (2/3)
    assert purity(predicted, gt) == pytest.approx(2 / 3)


def test_purity_empty() -> None:
    assert purity({}, {}) == pytest.approx(0.0)


# ── fragmentation ─────────────────────────────────────────────────────────────

def test_fragmentation_no_split() -> None:
    # Each GT incident appears in exactly one cluster
    predicted = {"c0": {"a1", "a2"}, "c1": {"a3", "a4"}}
    gt = {"a1": "inc-A", "a2": "inc-A", "a3": "inc-B", "a4": "inc-B"}
    assert fragmentation(predicted, gt) == pytest.approx(1.0)


def test_fragmentation_split() -> None:
    # inc-A is split across two predicted clusters
    predicted = {"c0": {"a1"}, "c1": {"a2"}, "c2": {"a3", "a4"}}
    gt = {"a1": "inc-A", "a2": "inc-A", "a3": "inc-B", "a4": "inc-B"}
    # inc-A: 2 covering clusters; inc-B: 1 covering cluster → avg = 1.5
    assert fragmentation(predicted, gt) == pytest.approx(1.5)


# ── hit_at_k ──────────────────────────────────────────────────────────────────

def test_hit_at_1_perfect() -> None:
    root_preds = {"c0": "a1", "c1": "a3"}
    gt_roots = {"inc-A": "a1", "inc-B": "a3"}
    predicted = {"c0": {"a1", "a2"}, "c1": {"a3"}}
    h1, h3, _ = hit_at_k(root_preds, gt_roots, predicted)
    assert h1 == pytest.approx(1.0)


def test_hit_at_3_present() -> None:
    # top-3 joined by "|": gt root appears in 2nd position
    root_preds = {"c0": "a9|a1|a7"}
    gt_roots = {"inc-A": "a1"}
    predicted = {"c0": {"a1", "a7", "a9"}}
    _, h3, _ = hit_at_k(root_preds, gt_roots, predicted)
    assert h3 == pytest.approx(1.0)


def test_hit_at_k_zero() -> None:
    root_preds = {"c0": "a9"}
    gt_roots = {"inc-A": "a1"}
    predicted = {"c0": {"a9"}, "c1": {"a1"}}
    h1, h3, _ = hit_at_k(root_preds, gt_roots, predicted)
    assert h1 == pytest.approx(0.0)


def test_hit_at_k_empty_gt() -> None:
    h1, h3, _ = hit_at_k({}, {}, {})
    assert h1 == pytest.approx(0.0)
    assert h3 == pytest.approx(0.0)
