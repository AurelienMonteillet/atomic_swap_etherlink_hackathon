# Atomic Swap Cookbook 🍳

Step-by-step guide for performing a **trustless cross-chain swap** between Etherlink and Jstz.

---

## Prerequisites

### Tools
```bash
# Install Jstz CLI
npm install -g @aspect-build/jstz

# Verify installation
jstz --version
```

### Wallets
- **MetaMask** configured for Etherlink Testnet (Chain ID: 128123)
- **Jstz Wallet Extension** (optional but recommended)

### Funds
- ETH/XTZ on Etherlink Testnet (get from faucet)
- XTZ on Jstz Privatenet (get from faucet)

---

## Scenario: Alice (Etherlink) ↔ Bob (Jstz)

Alice wants to swap **1 XTZ on Etherlink** for **1 XTZ on Jstz** with Bob.

### Step 1: Alice Generates Secret & Hashlock

```javascript
// In browser console or Node.js
const { ethers } = require('ethers');

// Generate 32-byte random secret
const secret = ethers.hexlify(ethers.randomBytes(32));
console.log('Secret (KEEP PRIVATE):', secret);
// e.g., 0x4692b487d8bf740de8830b1770ece1b86f4402fd99e45ff1f3a0c1a5521f5fb0

// Generate hashlock from secret
const hashlock = ethers.sha256(secret);
console.log('Hashlock (SHARE WITH BOB):', hashlock);
// e.g., 0xe754909e69b5ea098791403008356ead7454718bfae191d359439693e6be6b9c
```

**Important:** Alice keeps the `secret` private and shares only the `hashlock` with Bob.

---

### Step 2: Alice Locks Funds on Etherlink

#### Option A: Via Frontend
1. Go to https://atomic-swap-etherlink-hackathon.vercel.app
2. Connect MetaMask (Etherlink Testnet)
3. Select "Initiator (Alice)" mode
4. Enter amount: `1`
5. Set timelock: `60` minutes
6. Click "Initiate Swap"
7. Copy the hashlock from logs

#### Option B: Via Hardhat Script
```javascript
// scripts/initiate.js
const { ethers } = require("hardhat");

async function main() {
    const HTLC = await ethers.getContractAt(
        "HTLC", 
        "0x22CD807FAb2E902E62ECaD7bd97bfDD8fD69ccC4"
    );
    
    const hashlock = "0xe754909e69b5ea098791403008356ead7454718bfae191d359439693e6be6b9c";
    const bobAddress = ethers.ZeroAddress; // Open swap, anyone can claim
    const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    
    const tx = await HTLC.initiateSwap(
        bobAddress,
        hashlock,
        expiration,
        { value: ethers.parseEther("1.0") }
    );
    
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log("✅ Swap initiated on Etherlink!");
}

main();
```

```bash
npx hardhat run scripts/initiate.js --network etherlink_testnet
```

---

### Step 3: Bob Verifies Alice's Swap

Bob checks that Alice has locked funds on Etherlink:

#### Option A: Via Frontend
1. Enter Alice's hashlock in "Verify Swap" section
2. Click "Verify on Etherlink"
3. Check: amount, expiration, status = OPEN

#### Option B: Via Ethers.js
```javascript
const swap = await HTLC.getSwap(hashlock);
console.log("Amount:", ethers.formatEther(swap.amount), "XTZ");
console.log("Expiration:", new Date(Number(swap.expiration) * 1000));
console.log("Status:", ["OPEN", "CLAIMED", "REFUNDED"][swap.status]);
```

---

### Step 4: Bob Locks Funds on Jstz

**Critical:** Bob's timelock MUST be shorter than Alice's remaining time!

#### Option A: Via Frontend
1. Connect Jstz Wallet
2. Select "Participant (Bob)" mode
3. Paste Alice's hashlock
4. Enter amount: `1`
5. Set timelock: `30` minutes (< Alice's remaining time)
6. Click "Match Swap"

#### Option B: Via Jstz CLI
```bash
# Calculate expiration (30 minutes from now)
EXPIRATION=$(($(date +%s) + 1800))

jstz run "jstz://KT1HCuUJm1rZWqnicoXFHu7H3TP8912G1qmn/initiate" \
  -n privatenet \
  -m POST \
  -d '{"hashlock":"0xe754909e69b5ea098791403008356ead7454718bfae191d359439693e6be6b9c","expiration":'$EXPIRATION',"recipient":null}' \
  --amount 1000000
```

---

### Step 5: Alice Claims on Jstz (Reveals Secret)

Alice uses her secret to claim Bob's funds on Jstz:

#### Option A: Via Frontend
1. Connect Jstz Wallet
2. Go to "My Swaps" tab
3. Find Bob's swap, click "Claim"
4. The secret is automatically used

#### Option B: Via Jstz CLI
```bash
jstz run "jstz://KT1HCuUJm1rZWqnicoXFHu7H3TP8912G1qmn/claim" \
  -n privatenet \
  -m POST \
  -d '{"hashlock":"0xe754909e69b5ea098791403008356ead7454718bfae191d359439693e6be6b9c","secret":"0x4692b487d8bf740de8830b1770ece1b86f4402fd99e45ff1f3a0c1a5521f5fb0"}'
```

**Important:** This reveals the secret on Jstz! Bob can now see it.

---

### Step 6: Bob Claims on Etherlink (Uses Revealed Secret)

Bob retrieves the secret from Jstz and claims on Etherlink:

#### Option A: Via Frontend
1. Connect MetaMask
2. Go to "My Swaps" tab
3. Find Alice's swap (should show "Secret Available")
4. Click "Claim"

#### Option B: Via Hardhat Script
```javascript
// scripts/claim.js
async function main() {
    const HTLC = await ethers.getContractAt(
        "HTLC", 
        "0x22CD807FAb2E902E62ECaD7bd97bfDD8fD69ccC4"
    );
    
    const hashlock = "0xe754909e69b5ea098791403008356ead7454718bfae191d359439693e6be6b9c";
    
    // Secret revealed by Alice on Jstz (convert hex to bytes)
    const secretHex = "0x4692b487d8bf740de8830b1770ece1b86f4402fd99e45ff1f3a0c1a5521f5fb0";
    const secretBytes = ethers.getBytes(secretHex);
    
    const tx = await HTLC.claimSwap(hashlock, secretBytes);
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log("✅ Claimed on Etherlink!");
}

main();
```

---

## ✅ Swap Complete!

- Alice received Bob's XTZ on Jstz
- Bob received Alice's XTZ on Etherlink
- Neither party could cheat

---

## Refund Scenarios

### Alice Refunds (Bob Never Locked)

If Bob doesn't lock funds on Jstz, Alice can refund after expiration:

```javascript
// After expiration
const tx = await HTLC.refundSwap(hashlock);
await tx.wait();
console.log("✅ Refunded!");
```

### Bob Refunds (Alice Never Claimed)

If Alice doesn't claim on Jstz, Bob can refund after his expiration:

```bash
jstz run "jstz://KT1HCuUJm1rZWqnicoXFHu7H3TP8912G1qmn/refund" \
  -n privatenet \
  -m POST \
  -d '{"hashlock":"0xe754909e69b5ea098791403008356ead7454718bfae191d359439693e6be6b9c"}'
```

---

## Contract Addresses

| Chain | Contract | Address |
|-------|----------|---------|
| Etherlink Testnet | HTLC.sol v2.0 | `0x22CD807FAb2E902E62ECaD7bd97bfDD8fD69ccC4` |
| Jstz Privatenet | htlc.js v2.0 | `KT1HCuUJm1rZWqnicoXFHu7H3TP8912G1qmn` |

---

## Explorers

- **Etherlink Testnet:** https://testnet.explorer.etherlink.com
- **Jstz Dashboard:** https://privatenet.dashboard.jstz.info

---

## Troubleshooting

### "SwapExpired" Error
- You tried to claim after the timelock expired
- Use refund instead

### "IncorrectSecretLength" Error
- Secret must be exactly 32 bytes
- Use `ethers.getBytes(secretHex)` to convert

### "IncorrectHashLock" Error
- SHA-256(secret) doesn't match the hashlock
- Double-check your secret

### "SwapNotExpiredYet" Error
- You tried to refund before expiration
- Wait until timelock passes

### Jstz Signature Fails
- Install the Jstz wallet extension
- Or use CLI commands as fallback

---

## Security Checklist

- [ ] Secret is 32 bytes (256 bits entropy)
- [ ] Bob's timelock < Alice's remaining time
- [ ] Both swaps use the same hashlock
- [ ] Verify amounts before matching
- [ ] Keep secret private until claiming

---

## Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│                    ATOMIC SWAP FLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ALICE                                    BOB               │
│   (Etherlink)                             (Jstz)            │
│                                                              │
│   1. Generate secret S                                       │
│      hashlock H = SHA256(S)                                 │
│            │                                                 │
│            ├──────── Share H ─────────────►                  │
│            │                                                 │
│   2. Lock 1 XTZ on Etherlink                                │
│      (timelock: 60 min)                                     │
│            │                                                 │
│            │                    3. Verify Alice's swap       │
│            │                    4. Lock 1 XTZ on Jstz       │
│            │                       (timelock: 30 min)       │
│            │                                                 │
│   5. Claim on Jstz with S                                   │
│      (reveals S)                                            │
│            │                                                 │
│            │                    6. See S on Jstz            │
│            │                    7. Claim on Etherlink       │
│            │                       with S                   │
│            ▼                                                 │
│                                                              │
│   ✅ Alice has Bob's XTZ        ✅ Bob has Alice's XTZ       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

