# HTLC Smart Function - Security & Functional Specification

## Overview

This document describes the security model and functional specification of the HTLC (Hashed Timelock Contract) smart function deployed on **Jstz** for cross-chain atomic swaps with **Etherlink**.

**Version:** 2.0.0-hardened  
**Contract Address:** `KT1HCuUJm1rZWqnicoXFHu7H3TP8912G1qmn`  
**Network:** Jstz Privatenet

---

## 1. Security Model

### 1.1 Identity (Caller Authentication)

| Header | Source | Spoofable? | Purpose |
|--------|--------|------------|---------|
| `Referer` | Jstz runtime | ❌ No | Caller's address (`tz1...`) |
| `X-JSTZ-AMOUNT` | Jstz runtime | ❌ No | Actual tez sent with request |
| `X-JSTZ-TRANSFER` | Response | N/A | Tez to transfer from contract |

**Critical assumption:** The Jstz runtime **overwrites** any client-provided values for `Referer` and `X-JSTZ-AMOUNT`. The client cannot spoof these headers.

This is analogous to:
- `msg.sender` in Solidity
- `ctx.sender` in Tezos Michelson

### 1.2 Transfer Model

#### Receiving Tez (Initiate)
```
Client sends: Transaction with tez amount
Runtime sets: X-JSTZ-AMOUNT = actual amount received (in mutez)
Contract reads: request.headers.get('X-JSTZ-AMOUNT')
```

#### Sending Tez (Claim/Refund)
```
Contract returns: Response with X-JSTZ-TRANSFER header
Runtime executes: Transfer from contract balance to caller
```

### 1.3 Execution Model

- **Sequential execution:** Jstz executes calls to a smart function sequentially
- **No race conditions:** Claim and refund for the same swap cannot happen concurrently
- **Atomic KV:** All `Kv.get()`/`Kv.set()` operations within a single call are atomic

---

## 2. Data Formats

### 2.1 Secret (Preimage)

| Property | Requirement |
|----------|-------------|
| Format | `0x` + 64 hex characters |
| Length | 32 bytes (256 bits) |
| Entropy | Cryptographically random |
| Example | `0x4692b487d8bf740de8830b1770ece1b86f4402fd99e45ff1f3a0c1a5521f5fb0` |

**Why 32 bytes?**
- 256 bits of entropy = impossible to brute force
- Compatible with Etherlink's `bytes calldata` (enforced `length == 32`)
- Compact representation

### 2.2 Hashlock

| Property | Requirement |
|----------|-------------|
| Format | `0x` + 64 hex characters |
| Algorithm | SHA-256 |
| Input | Secret (as raw bytes) |
| Example | `0xe754909e69b5ea098791403008356ead7454718bfae191d359439693e6be6b9c` |

**Cross-chain compatibility:**
```javascript
// Jstz (this contract)
hashlock = sha256(secret) // Pure JS implementation

// Etherlink (Solidity)
hashlock = sha256(abi.encodePacked(secret)) // EVM sha256 precompile
```

Both produce identical hashes for the same input bytes.

### 2.3 Addresses

| Chain | Format | Regex |
|-------|--------|-------|
| Jstz | `tz1...`, `tz2...`, `tz3...` | `/^tz[1-3][a-zA-Z0-9]{33}$/` |
| Jstz Contract | `KT1...` | `/^KT1[a-zA-Z0-9]{33}$/` |
| Etherlink | `0x...` | `/^0x[a-fA-F0-9]{40}$/` |

---

## 3. HTLC Flow

### 3.1 Happy Path: Alice (Jstz) ↔ Bob (Etherlink)

```
┌──────────────────────────────────────────────────────────────────────┐
│                         ATOMIC SWAP FLOW                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ALICE (Jstz)                              BOB (Etherlink)            │
│  ───────────                               ──────────────             │
│                                                                       │
│  1. Generate secret S                                                 │
│     hashlock H = SHA256(S)                                           │
│           │                                                           │
│           ├─────────────────── Share H ─────────────────────►         │
│           │                                                           │
│  2. initiate(H, bob_addr, exp1)                                      │
│     Lock 10 XTZ on Jstz                                              │
│           │                                                           │
│           │                    3. initiateSwap(H, alice_addr, exp2)  │
│           │                       Lock 10 XTZ on Etherlink           │
│           │                       (exp2 < exp1 for safety)           │
│           │                                                           │
│  4. claimSwap(H, S) on Etherlink                                     │
│     Reveal S, get Bob's 10 XTZ                                       │
│           │                                                           │
│           │                    5. claim(H, S) on Jstz                │
│           │                       Use revealed S from step 4         │
│           │                       Get Alice's 10 XTZ                 │
│           ▼                                                           │
│                                                                       │
│  ✅ SWAP COMPLETE: Alice has Bob's XTZ, Bob has Alice's XTZ          │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Unhappy Path: Timeout (Refund)

```
┌──────────────────────────────────────────────────────────────────────┐
│                         REFUND FLOW                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ALICE (Jstz)                              BOB (Etherlink)            │
│  ───────────                               ──────────────             │
│                                                                       │
│  1. initiate(H, bob_addr, exp1)                                      │
│     Lock 10 XTZ on Jstz                                              │
│           │                                                           │
│           │                    2. Bob never responds                  │
│           │                       (doesn't lock on Etherlink)        │
│           │                                                           │
│           │     ⏰ TIME PASSES... exp1 reached                        │
│           │                                                           │
│  3. refund(H) on Jstz                                                │
│     Get back 10 XTZ                                                  │
│           │                                                           │
│           ▼                                                           │
│                                                                       │
│  ✅ REFUND COMPLETE: Alice recovered her funds                       │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. API Reference

### 4.1 POST /initiate

Create a new swap by locking tez.

**Request:**
```json
{
  "hashlock": "0x...",      // SHA-256 hash (64 hex chars)
  "recipient": "tz1...",    // Optional: only this address can claim
  "expiration": 1764792809  // Unix timestamp
}
```

**Headers (runtime-set):**
- `Referer`: Caller's address (sender)
- `X-JSTZ-AMOUNT`: Tez sent with transaction (in mutez)

**Response:**
```json
{
  "success": true,
  "event": "SwapInitiated",
  "data": {
    "hashlock": "0x...",
    "sender": "tz1...",
    "recipient": "tz1..." | null,
    "amountMutez": 1000000,
    "amountXtz": 1,
    "expiration": 1764792809,
    "status": "OPEN",
    "createdAt": 1530380397
  }
}
```

**Errors:**
- `Invalid hashlock` - Format must be `0x` + 64 hex
- `Insufficient amount` - Minimum 1000 mutez (0.001 XTZ)
- `Expiration must be in the future`
- `Swap with this hashlock already exists`

### 4.2 POST /claim

Claim funds by revealing the secret.

**Request:**
```json
{
  "hashlock": "0x...",
  "secret": "0x..."  // The preimage that hashes to hashlock
}
```

**Response Headers:**
- `X-JSTZ-TRANSFER`: Amount to transfer to claimer

**Response Body:**
```json
{
  "success": true,
  "event": "SwapClaimed",
  "data": {
    "hashlock": "0x...",
    "secret": "0x...",
    "claimedBy": "tz1...",
    "amount": 1,
    "amountMutez": 1000000
  }
}
```

**Errors:**
- `Invalid secret: hash does not match hashlock`
- `Only the designated recipient can claim`
- `Swap has expired, cannot claim`
- `Swap is CLAIMED/REFUNDED, cannot claim`

### 4.3 POST /refund

Refund funds after timelock expires.

**Request:**
```json
{
  "hashlock": "0x..."
}
```

**Response Headers:**
- `X-JSTZ-TRANSFER`: Amount to transfer back to sender

**Response Body:**
```json
{
  "success": true,
  "event": "SwapRefunded",
  "data": {
    "hashlock": "0x...",
    "refundedTo": "tz1...",
    "amount": 1,
    "amountMutez": 1000000
  }
}
```

**Errors:**
- `Cannot refund yet. Timelock expires in Xm Ys`
- `Only the original sender can refund`
- `Swap is CLAIMED/REFUNDED, cannot refund`

### 4.4 GET /swap/:hashlock

Get swap details.

**Response:**
```json
{
  "found": true,
  "swap": {
    "hashlock": "0x...",
    "sender": "tz1...",
    "recipient": "tz1..." | null,
    "amountMutez": 1000000,
    "amountXtz": 1,
    "expiration": 1764792809,
    "status": "OPEN" | "CLAIMED" | "REFUNDED",
    "createdAt": 1530380397,
    "revealedSecret": "0x..."  // Only if status = CLAIMED
  }
}
```

### 4.5 GET /swaps

List all swaps (paginated).

**Query Parameters:**
- `status` - Filter by status (`OPEN`, `CLAIMED`, `REFUNDED`)
- `limit` - Max results (default: 100, max: 100)

**Response:**
```json
[
  { "hashlock": "0x...", "status": "OPEN", ... },
  { "hashlock": "0x...", "status": "CLAIMED", ... }
]
```

---

## 5. Security Guarantees

### ✅ What This Contract Guarantees

| Property | Guarantee |
|----------|-----------|
| **Atomicity** | Either both parties get funds, or neither does |
| **No frontrunning** | Secret is only revealed during claim |
| **Timelock safety** | Funds locked until expiration |
| **No double-spend** | Status changes are atomic |
| **Dust protection** | Minimum 0.001 XTZ per swap |
| **DoS protection** | Max 100 swaps per list, 1000 stored |

### ⚠️ What This Contract Does NOT Guarantee

| Risk | Mitigation |
|------|------------|
| **Runtime compromise** | Trust Jstz runtime for identity/transfer |
| **Time manipulation** | Use reasonable timelocks (> 5 min) |
| **Cross-chain failures** | Ensure Etherlink contract uses same SHA-256 |
| **Lost secrets** | Keep backups! No recovery without secret |

### 🛡️ Threat Model

**What an attacker CAN'T do:**

| Attack | Why it fails |
|--------|--------------|
| Spoof caller identity | `Referer` header is runtime-injected |
| Fake incoming tez | `X-JSTZ-AMOUNT` is runtime-controlled |
| Steal locked funds | Needs secret (256-bit entropy) |
| Claim after expiration | `now() >= expiration` check |
| Double-claim | Status check + atomic Kv update |
| Create tez from nothing | `X-JSTZ-TRANSFER` debits contract balance |
| DoS via /swaps | Capped at 100 results, 1000 stored |
| Brute-force secret | 2²⁵⁶ combinations, infeasible |

**What an attacker CAN do:**

| Attack | Impact | Mitigation |
|--------|--------|------------|
| Spam initiate | 0.001 XTZ min per swap | Attacker pays |
| Never claim/respond | Swap expires | Sender can refund |
| Flood swap_keys | Max 1000 stored | Old keys pruned |

**Trust assumptions:**
- Jstz runtime correctly injects `Referer` and `X-JSTZ-AMOUNT`
- Jstz executes smart function calls sequentially (no race conditions)
- Jstz correctly applies `X-JSTZ-TRANSFER` from contract balance
- SHA-256 preimage resistance holds

---

## 6. Testing Checklist

### Unit Tests
- [ ] `initiate` with valid params → success
- [ ] `initiate` with invalid hashlock → reject
- [ ] `initiate` with past expiration → reject
- [ ] `initiate` with duplicate hashlock → reject
- [ ] `initiate` with 0 amount → reject
- [ ] `claim` with correct secret → success + transfer
- [ ] `claim` with wrong secret → reject
- [ ] `claim` after expiry → reject
- [ ] `claim` with wrong recipient → reject
- [ ] `claim` twice → reject second
- [ ] `refund` after expiry → success + transfer
- [ ] `refund` before expiry → reject
- [ ] `refund` by non-sender → reject
- [ ] `refund` after claim → reject

### Cross-Chain Tests
- [ ] SHA-256 output matches Etherlink for same input
- [ ] Full flow: Jstz initiate → Etherlink match → Etherlink claim → Jstz claim
- [ ] Full flow: Etherlink initiate → Jstz match → Jstz claim → Etherlink claim
- [ ] Refund flow both directions

---

## 7. Deployment

### Current Deployment
```
Network:  Jstz Privatenet
Address:  KT1HCuUJm1rZWqnicoXFHu7H3TP8912G1qmn
Version:  2.0.0-hardened
```

### Redeploy Command
```bash
cd contracts/jstz
jstz deploy htlc.js -n privatenet
```

---

## 8. Audit Status

| Audit | Status | Notes |
|-------|--------|-------|
| Code review | ✅ Pass | Hardened v2.0.0 |
| Input validation | ✅ Pass | Strict regex + parsing |
| Identity model | ✅ Pass | Runtime-controlled headers |
| Transfer model | ✅ Pass | X-JSTZ-AMOUNT/TRANSFER |
| DoS protection | ✅ Pass | Pagination + limits |
| Cross-chain compat | ⚠️ Verify | Test SHA-256 output |



---

## License

MIT - Built for Jstz Hackathon

