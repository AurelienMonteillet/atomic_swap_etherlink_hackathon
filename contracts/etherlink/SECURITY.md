# HTLC Smart Contract - Security & Functional Specification

## Overview

This document describes the security model and functional specification of the HTLC (Hashed Timelock Contract) deployed on **Etherlink** for cross-chain atomic swaps with **Jstz**.

**Version:** 2.0.0-hardened  
**Contract Address:** `0x22CD807FAb2E902E62ECaD7bd97bfDD8fD69ccC4`  
**Network:** Etherlink Testnet (Chain ID: 128123)

> ✅ **Deployed:** December 3, 2025 - Hardened v2.0 with all security fixes applied.

---

## 1. Security Model

### 1.1 Trustlessness

| Feature | Status | Notes |
|---------|--------|-------|
| Admin backdoor | ❌ REMOVED | `emergencyWithdraw` deleted |
| Reentrancy | ✅ PROTECTED | Status updated before transfers |
| Time manipulation | ✅ MITIGATED | Uses `block.timestamp` |
| Cross-chain compat | ✅ SHA-256 | Same hash on both chains |

**Critical:** This contract has **NO ADMIN FUNCTIONS**. Funds can only be:
- **Claimed** by revealing the secret (before expiration)
- **Refunded** by the sender (after expiration)

### 1.2 Security Checks

#### On Claim (`claimSwap`)
```solidity
1. if (!_swapExists(swapId)) revert SwapDoesNotExist();
2. if (swap.status != SwapStatus.OPEN) revert SwapNotOpen();
3. if (block.timestamp >= swap.expiration) revert SwapExpired();       // NEW
4. if (secret.length != 32) revert IncorrectSecretLength();            // NEW
5. if (sha256(secret) != swap.hashLock) revert IncorrectHashLock();
```

#### On Refund (`refundSwap`)
```solidity
1. if (!_swapExists(swapId)) revert SwapDoesNotExist();
2. if (swap.status != SwapStatus.OPEN) revert SwapNotOpen();
3. if (block.timestamp < swap.expiration) revert SwapNotExpiredYet();
4. if (msg.sender != swap.sender) revert OnlySenderCanRefund();
```

---

## 2. Data Formats

### 2.1 Secret (Preimage)

| Property | Requirement |
|----------|-------------|
| Format | Raw 32 bytes |
| Solidity type | `bytes calldata` with `length == 32` |
| Hex representation | `0x` + 64 hex characters |
| Example | `0x4692b487d8bf740de8830b1770ece1b86f4402fd99e45ff1f3a0c1a5521f5fb0` |

**Cross-chain note:** On Jstz, the secret is stored as a hex string (`0x + 64 chars`). When claiming on Etherlink, pass the **raw 32 bytes** (not the hex string).

```javascript
// Frontend conversion
const secretHex = "0x4692b487..."; // From Jstz
const secretBytes = ethers.getBytes(secretHex); // For Etherlink
```

### 2.2 Hashlock

| Property | Requirement |
|----------|-------------|
| Format | `bytes32` |
| Algorithm | SHA-256 |
| Input | Secret (32 raw bytes) |

```solidity
// Solidity
bytes32 hashLock = sha256(secret);

// JavaScript (ethers.js)
const hashLock = ethers.sha256(secret);
```

### 2.3 Swap Status

```solidity
enum SwapStatus { 
    OPEN,     // 0 - Funds locked, can be claimed or refunded
    CLAIMED,  // 1 - Secret revealed, funds sent to recipient
    REFUNDED  // 2 - Timelock expired, funds returned to sender
}
```

---

## 3. API Reference

### 3.1 initiateSwap

Create a new atomic swap by locking ETH/XTZ.

```solidity
function initiateSwap(
    address recipient,    // Who can claim (0x0 for open swaps)
    bytes32 hashLock,     // SHA-256(secret)
    uint256 expiration    // Unix timestamp
) external payable returns (bytes32 swapId)
```

**Emits:**
```solidity
event SwapInitiated(
    bytes32 indexed swapId,
    address payable sender,
    address recipient,
    uint256 amount,
    bytes32 hashLock,
    uint256 expiration
);
```

**Errors:**
- `AmountMustBeGreaterThanZero()` - No ETH sent
- `ExpirationMustBeInFuture()` - Expiration in the past
- `SwapAlreadyExists()` - Hashlock already used

### 3.2 claimSwap

Claim funds by revealing the 32-byte secret.

```solidity
function claimSwap(
    bytes32 swapId,       // The hashlock
    bytes calldata secret // The 32-byte preimage
) external returns (bool success)
```

**Emits:**
```solidity
event SwapClaimed(
    bytes32 indexed swapId,
    address claimer,
    address recipient,
    bytes secret
);
```

**Errors:**
- `SwapDoesNotExist()` - Invalid swapId
- `SwapNotOpen()` - Already claimed/refunded
- `SwapExpired()` - Timelock passed ⚠️ **NEW**
- `IncorrectSecretLength()` - Not 32 bytes ⚠️ **NEW**
- `IncorrectHashLock()` - SHA-256(secret) ≠ hashlock

### 3.3 refundSwap

Refund funds to sender after timelock expires.

```solidity
function refundSwap(bytes32 swapId) external returns (bool success)
```

**Emits:**
```solidity
event SwapRefunded(
    bytes32 indexed swapId,
    address sender,
    uint256 amount
);
```

**Errors:**
- `SwapDoesNotExist()` - Invalid swapId
- `SwapNotOpen()` - Already claimed/refunded
- `SwapNotExpiredYet()` - Timelock not reached
- `OnlySenderCanRefund()` - Caller ≠ sender

### 3.4 getSwap (View)

```solidity
function getSwap(bytes32 swapId) external view returns (
    address recipient,
    address sender,
    uint256 amount,
    uint256 expiration,
    bytes32 hashLock,
    SwapStatus status
)
```

---

## 4. Security Guarantees

### ✅ Guaranteed Properties

| Property | How |
|----------|-----|
| **Atomicity** | Same secret works on both chains |
| **No frontrunning** | Recipient specified or first claimer |
| **Timelock enforced** | Claim blocked after expiration |
| **No double-spend** | Status check before all operations |
| **Reentrancy safe** | Status updated before external calls |
| **No admin backdoor** | `emergencyWithdraw` removed |

### ⚠️ User Responsibilities

| Risk | Mitigation |
|------|------------|
| Lost secret | Keep secure backups |
| Short timelock | Recommend > 5 minutes |
| Cross-chain mismatch | Verify hashlock on both chains |
| Gas price spikes | Plan for claim/refund gas |

### 🛡️ Threat Model

**What an attacker CAN'T do:**

| Attack | Why it fails |
|--------|--------------|
| Steal locked funds | Needs secret (256-bit entropy) |
| Claim after expiration | `SwapExpired()` revert |
| Double-claim | `SwapNotOpen()` revert |
| Spoof identity | `msg.sender` is protocol-enforced |
| Drain contract (admin) | No admin functions exist |
| Frontrun claim | Funds go to designated `recipient` |
| Brute-force secret | 2²⁵⁶ combinations, infeasible |

**What an attacker CAN do:**

| Attack | Impact | Mitigation |
|--------|--------|------------|
| Spam initiateSwap | Gas cost only | Attacker pays gas |
| Never claim/respond | Swap expires | Sender can refund |
| Observe mempool | See claim tx | Secret already revealed = too late |

**Trust assumptions:**
- Etherlink RPC nodes are honest (standard assumption)
- `block.timestamp` is reasonably accurate (±15s)
- SHA-256 preimage resistance holds

---

## 5. Cross-Chain Compatibility with Jstz

### Hash Verification

Both chains must produce the same hash:

```javascript
// JavaScript (works for both)
const secret = ethers.randomBytes(32);
const secretHex = ethers.hexlify(secret); // "0x..."
const hashLock = ethers.sha256(secret);

// Etherlink: pass raw bytes to claimSwap
await htlc.claimSwap(hashLock, secret);

// Jstz: pass hex string
await jstzRequest('POST', '/claim', { hashlock, secret: secretHex });
```

### Timelock Safety

```
ALICE (Etherlink)          BOB (Jstz)
───────────────           ─────────
expiration: T + 60min     expiration: T + 30min
     │                         │
     │   BOB's timelock MUST   │
     │   be SHORTER than       │
     │   Alice's remaining     │
     │   time                  │
     ▼                         ▼
```

**Rule:** `bob.expiration < alice.expiration - safety_margin`

---

## 6. Changes from v1.0

| Feature | v1.0 | v2.0 (Hardened) |
|---------|------|-----------------|
| Emergency withdraw | ✅ Present | ❌ **REMOVED** |
| Claim after expiry | ✅ Allowed | ❌ **BLOCKED** |
| Secret length check | ❌ None | ✅ **32 bytes** |
| Status enum | EXPIRED | REFUNDED |

---

## 7. Deployment

### Current Deployment
```
Network:  Etherlink Testnet
Chain ID: 128123
Address:  0x32a57e30880174145cb002f526487cb74d0fcf46
Version:  2.0.0-hardened
```

### Redeploy Command
```bash
cd contracts/etherlink
npx hardhat run scripts/deploy.js --network etherlink_testnet
```

---

## 8. Audit Checklist

| Check | Status |
|-------|--------|
| Reentrancy protection | ✅ |
| Integer overflow | ✅ (Solidity 0.8+) |
| Access control | ✅ |
| Timelock enforcement | ✅ |
| Cross-chain hash compat | ✅ |
| Secret format validation | ✅ |
| No admin backdoors | ✅ |
| Event emission | ✅ |

---

## License

MIT - Built for Jstz Hackathon 

