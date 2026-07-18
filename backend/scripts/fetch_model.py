#!/usr/bin/env python3
"""
Download the model2vec embedding model for offline use.
Run once before starting the server.

Usage: python scripts/fetch_model.py
"""

MODEL_NAME = "minishlab/potion-base-8M"


def main() -> None:
    print(f"Downloading {MODEL_NAME} ...")
    try:
        from model2vec import StaticModel

        model = StaticModel.from_pretrained(MODEL_NAME)
        print(f"✓  Model ready. Embedding dim: {model.dim}")
        print("   Cached by HuggingFace hub — no further action needed.")
    except ImportError:
        print("✗  model2vec not installed. Run:  pip install model2vec")
    except Exception as exc:
        print(f"✗  Download failed: {exc}")
        print("   Fallback: sentence-transformers MiniLM will be used instead.")


if __name__ == "__main__":
    main()
