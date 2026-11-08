"""Dependency-free SQLite schema contract check (not a substitute for local D1)."""
import json
import sqlite3
from pathlib import Path

source = Path(__file__).resolve().parents[1] / 'migrations' / '0001_secure_issuance.sql'
con = sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys = ON')
con.executescript(source.read_text(encoding='utf-8'))

TABLES = {'issuers', 'issuer_keys', 'issuer_allowed_hosts', 'codes', 'admin_sessions', 'login_attempts'}
actual = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert actual == TABLES, (actual, TABLES)

con.execute("INSERT INTO issuers VALUES ('trueseal-demo','TrueSeal Demo Organization','demo','active',1000)")
public_jwk = json.dumps({'kty': 'OKP', 'crv': 'Ed25519', 'x': 'A' * 43})
con.execute("INSERT INTO issuer_keys VALUES (?,?,?,?,?)", ('demo-key', 'trueseal-demo', public_jwk, 'active', 1000))
con.execute("INSERT INTO issuer_allowed_hosts VALUES ('trueseal-demo','trueseal-431.pages.dev')")
con.execute("INSERT INTO codes VALUES (?,?,?,?,?,?,?,?,?)", ('j'*36, 'trueseal-demo', 'demo-key', 'Title', 'https://trueseal-431.pages.dev/demo', 'x.y.z', 1000, 2000, None))

checks = 0
def must_reject(query, args=()):
    global checks
    try:
        con.execute(query, args)
    except sqlite3.IntegrityError:
        checks += 1
        return
    raise AssertionError('Unsafe SQL unexpectedly accepted: ' + query)

must_reject("INSERT INTO issuer_keys VALUES ('unowned','not-an-issuer',?, 'active', 1000)", (public_jwk,))
must_reject("INSERT INTO issuer_keys VALUES ('private','trueseal-demo',?, 'active', 1000)", (json.dumps({'kty':'OKP','crv':'Ed25519','x':'A'*43,'d':'private'}),))
must_reject("INSERT INTO issuer_allowed_hosts VALUES ('trueseal-demo','trueseal-431.pages.dev')")
must_reject("INSERT INTO issuer_allowed_hosts VALUES ('trueseal-demo','evil@host.example')")
must_reject("INSERT INTO codes VALUES (?,?,?,?,?,?,?,?,?)", ('k'*36, 'trueseal-demo', 'unowned', 'Title', 'https://trueseal-431.pages.dev/demo', 'a.b.c',1000,2000,None))
must_reject("UPDATE codes SET title='modified' WHERE jti=?", ('j'*36,))
must_reject("DELETE FROM codes WHERE jti=?", ('j'*36,))
must_reject("UPDATE issuer_keys SET public_jwk=? WHERE kid='demo-key'", (json.dumps({'kty':'OKP','crv':'Ed25519','x':'tampered'}),))
con.execute("UPDATE codes SET revoked_at=1100 WHERE jti=?", ('j'*36,))
checks += 1
must_reject("UPDATE codes SET revoked_at=NULL WHERE jti=?", ('j'*36,))
con.execute("INSERT INTO login_attempts VALUES ('a'*64, 1000, 1)".replace("'a'*64", "'"+'a'*64+"'"))
checks += 1
print(f'PASS: {len(TABLES)} tables, {checks} constraints/immutability assertions (SQLite contract; NOT Cloudflare D1).')
