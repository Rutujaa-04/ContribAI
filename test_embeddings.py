import sys, os
sys.path.insert(0, "backend")

# Load .env so settings picks up GOOGLE_API_KEY
from dotenv import load_dotenv
load_dotenv("backend/.env")

from app.services.embeddings import get_embedding, get_query_embedding

emb = get_embedding("def handle_click(event): pass")
print("Embedding dims:", len(emb) if emb else "FAILED")
print("First 5 values:", emb[:5] if emb else "N/A")

query_emb = get_query_embedding("fix the button not responding to clicks")
print("Query embedding dims:", len(query_emb) if query_emb else "FAILED")