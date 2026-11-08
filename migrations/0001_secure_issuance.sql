-- Milestone A: issuer trust, protected sessions and immutable signed issuance.
-- UTC timestamps are Unix seconds. D1 enforces foreign keys for this database.
CREATE TABLE issuers (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 128),
  trust_tier TEXT NOT NULL CHECK (trust_tier IN ('demo', 'verified')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
);

CREATE TABLE issuer_keys (
  kid TEXT PRIMARY KEY NOT NULL CHECK (length(kid) BETWEEN 1 AND 128),
  issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE RESTRICT,
  public_jwk TEXT NOT NULL CHECK (
    CASE WHEN json_valid(public_jwk) THEN
      json_extract(public_jwk, '$.kty') = 'OKP' AND
      json_extract(public_jwk, '$.crv') = 'Ed25519' AND
      json_type(public_jwk, '$.x') = 'text' AND
      length(json_extract(public_jwk, '$.x')) = 43 AND
      json_extract(public_jwk, '$.x') NOT GLOB '*[^A-Za-z0-9_-]*' AND
      json_type(public_jwk, '$.d') IS NULL
    ELSE 0 END
  ),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE (kid, issuer_id)
);
CREATE INDEX issuer_keys_by_issuer ON issuer_keys(issuer_id, status);
-- Key identity/public material are immutable; rotate by registering a new kid.
CREATE TRIGGER issuer_key_immutable BEFORE UPDATE ON issuer_keys
WHEN NEW.kid IS NOT OLD.kid OR NEW.issuer_id IS NOT OLD.issuer_id OR
  NEW.public_jwk IS NOT OLD.public_jwk OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'registered key material is immutable'); END;


CREATE TABLE issuer_allowed_hosts (
  issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE RESTRICT,
  hostname TEXT NOT NULL CHECK (
    length(hostname) BETWEEN 4 AND 253 AND
    hostname = lower(hostname) AND
    instr(hostname, '.') > 0 AND
    hostname NOT GLOB '*[^a-z0-9.-]*' AND
    substr(hostname, 1, 1) NOT IN ('.', '-') AND
    substr(hostname, -1, 1) NOT IN ('.', '-')
  ),
  PRIMARY KEY (issuer_id, hostname)
);

CREATE TABLE codes (
  jti TEXT PRIMARY KEY NOT NULL CHECK (length(jti) BETWEEN 16 AND 256),
  issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE RESTRICT,
  kid TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 64),
  destination_url TEXT NOT NULL CHECK (length(destination_url) BETWEEN 1 AND 240),
  signed_token TEXT NOT NULL UNIQUE CHECK (length(signed_token) BETWEEN 1 AND 2048),
  issued_at INTEGER NOT NULL CHECK (issued_at >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > issued_at),
  revoked_at INTEGER CHECK (revoked_at IS NULL OR revoked_at >= issued_at),
  FOREIGN KEY (kid, issuer_id) REFERENCES issuer_keys(kid, issuer_id) ON DELETE RESTRICT
);
CREATE INDEX codes_by_issuer_issued ON codes(issuer_id, issued_at DESC);
CREATE INDEX codes_by_issuer_jti ON codes(issuer_id, jti);
CREATE INDEX codes_expiration ON codes(expires_at);

-- Only a future revocation operation may change codes; an old revocation cannot be undone.
CREATE TRIGGER codes_immutable_metadata BEFORE UPDATE ON codes
WHEN NEW.jti IS NOT OLD.jti OR NEW.issuer_id IS NOT OLD.issuer_id OR
  NEW.kid IS NOT OLD.kid OR NEW.title IS NOT OLD.title OR
  NEW.destination_url IS NOT OLD.destination_url OR
  NEW.signed_token IS NOT OLD.signed_token OR
  NEW.issued_at IS NOT OLD.issued_at OR NEW.expires_at IS NOT OLD.expires_at OR
  (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at)
BEGIN SELECT RAISE(ABORT, 'code metadata is immutable'); END;
CREATE TRIGGER codes_no_delete BEFORE DELETE ON codes
BEGIN SELECT RAISE(ABORT, 'issued codes cannot be deleted'); END;

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64),
  issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at)
);
CREATE INDEX sessions_by_expiration ON admin_sessions(expires_at);
CREATE INDEX sessions_by_issuer ON admin_sessions(issuer_id);

CREATE TABLE login_attempts (
  throttle_key TEXT PRIMARY KEY NOT NULL CHECK (length(throttle_key) = 64),
  window_start INTEGER NOT NULL CHECK (window_start >= 0),
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 1)
);
CREATE INDEX attempts_by_window ON login_attempts(window_start);
