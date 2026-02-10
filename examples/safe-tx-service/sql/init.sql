CREATE TABLE IF NOT EXISTS safes (
  safe_address TEXT PRIMARY KEY,
  chain_id INT NOT NULL,
  threshold INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safe_owners (
  safe_address TEXT NOT NULL REFERENCES safes(safe_address) ON DELETE CASCADE,
  owner_address TEXT NOT NULL,
  PRIMARY KEY (safe_address, owner_address)
);

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY,
  safe_address TEXT NOT NULL REFERENCES safes(safe_address) ON DELETE CASCADE,
  to TEXT NOT NULL,
  value TEXT NOT NULL,
  data TEXT NOT NULL,
  operation INT NOT NULL,
  nonce BIGINT NOT NULL,
  safe_tx_hash TEXT UNIQUE NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_tx_hash TEXT NULL,
  executed_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS signatures (
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  owner_address TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, owner_address)
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
