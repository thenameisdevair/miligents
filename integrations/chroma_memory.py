"""
integrations/chroma_memory.py

Local vector memory for MiliGents agents using ChromaDB.
Each agent uses this for fast in-session semantic search over
research outputs, strategies, and past decisions.

This is Tier 1 memory — fast and local.
Tier 2 memory (permanent) is handled by bridge_client.py via 0G Storage.
"""

import os
import chromadb
from chromadb.config import Settings
from dotenv import load_dotenv

load_dotenv()

CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")

def get_client() -> chromadb.PersistentClient:
    """
    Get a persistent ChromaDB client.

    Returns:
        ChromaDB PersistentClient instance.
    """
    return chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)


def store(
    collection: str,
    doc_id: str,
    text: str,
    metadata: dict | None = None
) -> bool:
    """
    Store a document in a ChromaDB collection.

    Args:
        collection: Collection name (e.g. 'originator', 'specialist').
        doc_id: Unique document identifier.
        text: Document text content to embed and store.
        metadata: Optional metadata dict to attach to the document.

    Returns:
        True if stored successfully, False otherwise.
    """
    try:
        client = get_client()
        col = client.get_or_create_collection(collection)
        col.upsert(
            ids=[doc_id],
            documents=[text],
            metadatas=[metadata or {}]
        )
        return True
    except Exception as e:
        print(f"[Memory] store failed: {e}")
        return False


def search(
    collection: str,
    query: str,
    n_results: int = 5
) -> list[dict]:
    """
    Semantic search over a ChromaDB collection.

    Args:
        collection: Collection name to search in.
        query: Natural language query string.
        n_results: Maximum number of results to return.

    Returns:
        List of dicts, each containing:
        - id: document ID
        - text: document content
        - metadata: attached metadata
        - distance: similarity distance (lower = more similar)
    """
    try:
        client = get_client()
        col = client.get_or_create_collection(collection)
        results = col.query(
            query_texts=[query],
            n_results=n_results
        )
        output = []
        for i in range(len(results["ids"][0])):
            output.append({
                "id": results["ids"][0][i],
                "text": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i]
            })
        return output
    except Exception as e:
        print(f"[Memory] search failed: {e}")
        return []


def get(collection: str, doc_id: str) -> dict | None:
    """
    Retrieve a specific document by ID from a ChromaDB collection.

    Args:
        collection: Collection name.
        doc_id: Document ID to retrieve.

    Returns:
        Dict with id, text, metadata — or None if not found.
    """
    try:
        client = get_client()
        col = client.get_or_create_collection(collection)
        results = col.get(ids=[doc_id])
        if not results["ids"]:
            return None
        return {
            "id": results["ids"][0],
            "text": results["documents"][0],
            "metadata": results["metadatas"][0]
        }
    except Exception as e:
        print(f"[Memory] get failed: {e}")
        return None


def delete(collection: str, doc_id: str) -> bool:
    """
    Delete a document from a ChromaDB collection.

    Args:
        collection: Collection name.
        doc_id: Document ID to delete.

    Returns:
        True if deleted successfully, False otherwise.
    """
    try:
        client = get_client()
        col = client.get_or_create_collection(collection)
        col.delete(ids=[doc_id])
        return True
    except Exception as e:
        print(f"[Memory] delete failed: {e}")
        return False


def test_memory() -> bool:
    """
    Quick smoke test for ChromaDB memory.

    Returns:
        True if all operations work correctly.
    """
    try:
        # Store
        store("test", "doc1", "MiliGents is an autonomous agent organism",
              {"agent": "test"})

        # Search
        results = search("test", "autonomous agents", n_results=1)
        assert len(results) > 0, "Search returned no results"

        # Get
        doc = get("test", "doc1")
        assert doc is not None, "Get returned None"
        assert "MiliGents" in doc["text"], "Content mismatch"

        # Delete
        deleted = delete("test", "doc1")
        assert deleted, "Delete failed"

        print("[Memory] All tests passed")
        return True
    except Exception as e:
        print(f"[Memory] Test failed: {e}")
        return False
