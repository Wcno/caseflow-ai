# Keep every inference operation local and QVAC-backed

CaseFlow AI uses QVAC directly inside the local Node process for transcription,
embeddings, retrieval, and text generation. Cloud AI providers and remote
inference fallbacks are prohibited because privacy-preserving local execution is
both the product promise and a hard qualification requirement of the challenge.
Model downloads may use the network during setup, but prepared-claim content
must never be transmitted externally.

