import type Database from 'better-sqlite3';
export function migrate(db: Database.Database) {
  db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), label TEXT NOT NULL, prefix TEXT NOT NULL UNIQUE, secret_hash TEXT NOT NULL, scopes TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS vertices (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), type TEXT NOT NULL, slug TEXT, external_id TEXT, title TEXT, status TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), metadata TEXT NOT NULL CHECK(json_valid(metadata)), version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), from_vertex_id TEXT NOT NULL REFERENCES vertices(id), to_vertex_id TEXT NOT NULL REFERENCES vertices(id), type TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), metadata TEXT NOT NULL CHECK(json_valid(metadata)), version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE INDEX IF NOT EXISTS vertices_active_list ON vertices(tenant_id, deleted_at, type, status, id);
CREATE INDEX IF NOT EXISTS edges_active_list ON edges(tenant_id, deleted_at, type, status, id);
CREATE INDEX IF NOT EXISTS edges_from ON edges(tenant_id, from_vertex_id, deleted_at);
CREATE INDEX IF NOT EXISTS edges_to ON edges(tenant_id, to_vertex_id, deleted_at);`);
}
