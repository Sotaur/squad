# Security Review & Fix Plan — MCP Squad Memory Sample

> Scope: `samples/mcp-squad-memory`, bootstrap scripts, and related docs/hook examples.
> Perspective: adversarial threat modeling for defensive hardening.

## Executive Summary

The sample is a strong foundation (structured logging, SQLite resilience settings, payload guardrails, and runbook), but it is **not production-safe by default** for internet-exposed or multi-tenant environments.

### Implemented in current sample (partial risk reduction)

- Optional token-based AuthN/AuthZ with squad-scoped access checks (`SQUAD_MEMORY_AUTHZ_JSON`).
- In-process per-token per-tool rate limiting.
- Production guardrail to block `SQUAD_MEMORY_BACKEND=memory` when `NODE_ENV=production`.
- Handoff integrity check enforcing `message.squadId === memory.squadId`.
- Per-squad quota enforcement (`SQUAD_MEMORY_MAX_MESSAGES_PER_SQUAD`, `SQUAD_MEMORY_MAX_MEMORIES_PER_SQUAD`).
- Sensitive-data blocking for common secret/token patterns before persistence.

Key gaps:

1. No authentication/authorization model for tool execution.
2. No confidentiality controls for sensitive memory content at rest.
3. No cryptographic integrity guarantees for stored memories.
4. No cryptographic integrity guarantees for stored memories.
5. DLP is improved but still pattern-based and not classifier-backed.

## Threat Model (Condensed)

- **Assets:** messages, memories, handoff context, operational metadata.
- **Trust boundaries:** MCP client ↔ server transport, server ↔ SQLite file, local scripts ↔ user machine.
- **Attacker classes:** malicious local user, compromised client process, untrusted tenant, insider with log/db access.

## Findings and Fix Plans

### Critical

#### 1) Missing AuthN/AuthZ for MCP tool calls
- **Risk:** Any connected client can call write/read tools.
- **Impact:** Unauthorized data exfiltration and tampering.
- **Fix plan:**
  - Add required identity token/mTLS at transport edge.
  - Add per-tool RBAC (`read`, `write`, `admin`) tied to caller identity.
  - Enforce squad-scoped authorization (`caller can access squadId`).
- **Owner:** Platform security + backend.
- **Target:** Immediate (P0).

#### 2) No tenant isolation model
- **Risk:** Cross-squad data leakage.
- **Impact:** Privacy/compliance breach.
- **Fix plan:**
  - Introduce tenant ID in all records + indexes.
  - Enforce tenant filter in every query/update path.
  - Add integration tests proving isolation.
- **Owner:** Backend.
- **Target:** Immediate (P0).

### High

#### 3) Memory data stored unencrypted at rest
- **Risk:** Disk-level compromise exposes all memories.
- **Fix plan:**
  - Use encrypted filesystem or SQLCipher.
  - Optional field-level encryption for sensitive payload fields.
  - Rotate encryption keys with KMS.
- **Owner:** Infra/SRE.
- **Target:** 30 days (P1).

#### 4) Redaction is regex-only and bypassable
- **Risk:** Secrets/PII may persist in DB/logs despite masking.
- **Fix plan:**
  - Add layered DLP pipeline (pattern + entropy + allow/deny dictionaries).
  - Classify/label sensitive records; block high-risk writes.
  - Add regression tests with adversarial payload corpus.
- **Owner:** Security engineering.
- **Target:** 30 days (P1).

#### 5) No tamper-evident audit trail
- **Risk:** Undetected modification/deletion of records/logs.
- **Fix plan:**
  - Write append-only audit stream with hash chain/signatures.
  - Send audit events to immutable retention backend.
- **Owner:** Platform + SecOps.
- **Target:** 30–60 days (P1).

#### 6) Abuse controls need distributed enforcement
- **Risk:** local limits can be bypassed across multiple server replicas.
- **Fix plan:**
  - Move quotas/rate limits to shared distributed counters (Redis or equivalent).
  - Add hard reject + alerting path on quota breach.
  - Add auto-archival policies and hard storage caps.
- **Owner:** Backend/SRE.
- **Target:** 30 days (P1).

### Medium

#### 7) Weak data retention/deletion governance
- **Risk:** Over-retention and compliance exposure.
- **Fix plan:**
  - Retention classes by tier (`hot/cold/long_term`).
  - Scheduled purge and legal-hold exceptions.
  - Data deletion verification reports.
- **Owner:** Data governance.
- **Target:** 60 days (P2).

#### 8) Potential metadata leakage in logs
- **Risk:** Internal identifiers and payload-derived signals leak.
- **Fix plan:**
  - Log minimization policy + field-level suppression.
  - Redact IDs/tokens in failure paths.
  - Add secure log sink ACLs + retention limits.
- **Owner:** SRE.
- **Target:** 30 days (P1).

#### 9) Bootstrap script trust assumptions
- **Risk:** Copying templates/scripts into working repos without provenance checks.
- **Fix plan:**
  - Add checksum/signature verification for copied artifacts.
  - Add explicit warnings + dry-run mode.
  - Require user confirmation in interactive environments.
- **Owner:** DX tooling.
- **Target:** 60 days (P2).

### Low

#### 10) In-memory mode accidentally used in production
- **Risk:** data loss on restart.
- **Fix plan:**
  - Fail startup in production env if backend=memory.
  - Add startup warning + telemetry event.
- **Owner:** Backend/SRE.
- **Target:** Immediate (P0/P1 depending env).

## Validation Plan (Security Acceptance)

1. **AuthZ tests:** deny unauthorized read/write across squads.
2. **Abuse tests:** rate-limit and quota exhaustion behave safely.
3. **DLP tests:** seeded sensitive payloads never persist in plaintext.
4. **Audit tests:** tampering attempts are detectable.
5. **Recovery drills:** backup restore + integrity checks pass.
6. **Chaos drills:** induced SQLite busy/corruption scenarios preserve safety.

## Prioritized Delivery Roadmap

### Phase 0 (Immediate)
- Mandatory AuthN/AuthZ gates.
- Tenant isolation enforcement.
- Disable memory backend in production profile.

### Phase 1 (30 days)
- Quotas/rate limits.
- Stronger DLP and log minimization.
- Encryption-at-rest + key management.

### Phase 2 (60–90 days)
- Tamper-evident audit ledger.
- Compliance automation (retention + deletion attestations).
- Formal threat model and recurring security review cadence.

## Bottom Line

Treat the current sample as **production-adjacent**. With the P0/P1 controls above, it can be promoted to production readiness for controlled environments.
