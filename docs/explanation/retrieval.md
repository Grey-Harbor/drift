# Why retrieval is declarative

Drift provides lists and graph traversal for ordinary application reads. Retrieval is an optional third method for clients that need grouped or aggregated graph records.

The endpoint accepts a small declarative pipeline rather than JavaScript functions. This keeps tenant isolation, cost limits, contract testing, and future storage adapters understandable. It supports projection from JSON documents, but not JSON-path predicates, joins, traversal, or persisted jobs.
