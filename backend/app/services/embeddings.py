# app/services/embeddings.py
# Uses Google's text-embedding-004 model (free, 768 dimensions).
# The same Gemini API key you already have works here.

# app/services/embeddings.py
# Uses Google's text-embedding-004 model via the new google-genai SDK.

# app/services/embeddings.py
# Uses nomic-embed-text via Ollama (local, no rate limits, 768 dims)
# Requires: ollama serve running + ollama pull nomic-embed-text

import httpx
from typing import List, Optional

OLLAMA_URL = "http://localhost:11434/api/embeddings"
EMBED_MODEL = "nomic-embed-text"  # outputs 768 dims — matches DB schema


def get_embedding(text: str) -> Optional[List[float]]:
    try:
        resp = httpx.post(
            OLLAMA_URL,
            json={"model": EMBED_MODEL, "prompt": text},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()["embedding"]
    except Exception as e:
        print(f"❌ Embedding failed: {e}")
        return None


def get_query_embedding(text: str) -> Optional[List[float]]:
    # Same model for both document and query embedding
    return get_embedding(text)


def get_embeddings_batch(texts: List[str]) -> List[Optional[List[float]]]:
    # Ollama doesn't support batch endpoint — individual calls are fast locally
    results = []
    for text in texts:
        results.append(get_embedding(text))
    return results