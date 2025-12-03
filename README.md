# Etherlink x Jstz Atomic Swap

A trustless atomic swap interface between **Etherlink** (EVM L2) and **Jstz** (Tezos Smart Rollup Layer). 
Demonstrates secure cross-chain asset exchange using Hashed Timelock Contracts (HTLC) with **SHA-256**.

🏆 **Built for the Jstz Hackathon**

## 📦 Deployed Contracts

| Network | Contract | Address |
|---------|----------|---------|
| **Etherlink Testnet** | HTLC Solidity | `0x79826f6Ab82C24395123f8419E3aFb995d906bAd` |
| **Jstz Sandbox** | HTLC Smart Function | `KT19cEGFQGsmtSimKJQFzi9WYrsHGXofq8Hb` |

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- **MetaMask** with Etherlink Testnet configured
- **Jstz CLI**: `npm i -g @jstz-dev/cli`
- **Jstz Wallet Extension** (optional but recommended): [Download from GitHub](https://github.com/jstz-dev/dev-wallet/releases)
- **Python 3** (for local server)

### Jstz Wallet Extension (Recommended)

For the best experience, install the Jstz Chrome extension wallet:

1. Download the latest release from [jstz-dev/dev-wallet](https://github.com/jstz-dev/dev-wallet/releases)
2. Unzip the downloaded file
3. Go to `chrome://extensions/` in Chrome
4. Enable "Developer mode"
5. Click "Load unpacked" and select the unzipped folder
6. Create or import an account in the extension

With the extension installed, all Jstz transactions will be signed automatically through the wallet popup.

### 1. Clone & Install

```bash
git clone https://github.com/AurelienMonteillet/atomic_swap_etherlink_hackathon.git
cd atomic_swap_etherlink_hackathon

# Install Etherlink contract dependencies
cd contracts/etherlink
npm install
cd ../..
```

### 2. Configure Jstz Network

```bash
jstz network add sandbox \
  --octez-node-rpc-endpoint https://sandbox.jstz.info \
  --jstz-node-endpoint https://sandbox.jstz.info
```

### 3. Configure MetaMask

Add Etherlink Testnet to MetaMask:
- **Network Name**: Etherlink Testnet
- **RPC URL**: `https://node.ghostnet.etherlink.com`
- **Chain ID**: `128123`
- **Symbol**: `XTZ`
- **Explorer**: `https://testnet.explorer.etherlink.com`

Get testnet XTZ: https://faucet.etherlink.com

### 4. Start Frontend

```bash
python3 -m http.server 8080
```

Open http://localhost:8080

---

## 🧪 Test: Complete Atomic Swap

### Scenario: Alice (Etherlink) ↔ Bob (Jstz)

Alice wants to swap ETH for XTZ with Bob.

---

### Step 1: Alice Initiates on Etherlink (Frontend)

1. Open http://localhost:8080
2. Click **"Connect Etherlink"** (MetaMask)
3. In the **"Initiate"** tab:
   - Click **"Generate New"** to create secret/hash
   - **Copy the Hash** 📋 (you'll need it)
   - **Copy the Secret** 🔐 (keep it safe!)
   - Enter amount (e.g., `0.01`)
   - Click **"From Etherlink"**
4. Confirm in MetaMask
5. **Save the Hash displayed in the logs**

Example output:
```
Hash: 0x7398c0867ead74a1861828d540743bf10d07690519b2bdd716dd1512f2a8f41c
Secret: 0x45bb7983ccd97365ac019514d61631d7ea6f5bbffb4dd9ff4d3f7271a81b968c
```

---

### Step 2: Bob Initiates on Jstz (CLI)

Bob uses the **same hash** to lock XTZ on Jstz:

```bash
# Set variables
HASH="0x7398c0867ead74a1861828d540743bf10d07690519b2bdd716dd1512f2a8f41c"
EXPIRATION=$(($(date +%s) + 3600))  # 1 hour from now

# Bob locks 10 XTZ with the same hash
jstz run "jstz://KT19cEGFQGsmtSimKJQFzi9WYrsHGXofq8Hb/initiate" \
  -n sandbox -m POST \
  -d "{\"hashlock\":\"$HASH\",\"recipient\":null,\"expiration\":$EXPIRATION,\"amount\":\"10\"}"
```

Expected output:
```json
{
  "success": true,
  "event": "SwapInitiated",
  "data": { "status": "OPEN", "amount": 10, ... }
}
```

---

### Step 3: Alice Claims on Jstz (Reveals Secret)

Alice uses her secret to claim Bob's XTZ:

```bash
SECRET="0x45bb7983ccd97365ac019514d61631d7ea6f5bbffb4dd9ff4d3f7271a81b968c"
HASH="0x7398c0867ead74a1861828d540743bf10d07690519b2bdd716dd1512f2a8f41c"

jstz run "jstz://KT19cEGFQGsmtSimKJQFzi9WYrsHGXofq8Hb/claim" \
  -n sandbox -m POST \
  -d "{\"hashlock\":\"$HASH\",\"secret\":\"$SECRET\"}"
```

Expected output:
```json
{
  "success": true,
  "event": "SwapClaimed",
  "data": { "secret": "0x45bb7983...", ... }
}
```

**⚠️ The secret is now PUBLIC!**

---

### Step 4: Bob Claims on Etherlink (Frontend)

Bob uses the revealed secret to claim Alice's ETH:

1. Go to http://localhost:8080
2. Go to **"Claim/Refund"** tab
3. Enter:
   - **Swap ID**: `0x7398c0867ead74a1861828d540743bf10d07690519b2bdd716dd1512f2a8f41c`
   - **Secret**: `0x45bb7983ccd97365ac019514d61631d7ea6f5bbffb4dd9ff4d3f7271a81b968c`
4. Click **"Claim"**
5. Confirm in MetaMask

---

### Verify Final Status

```bash
# Check Jstz swap status
jstz run "jstz://KT19cEGFQGsmtSimKJQFzi9WYrsHGXofq8Hb/swap/0x7398c0867ead74a1861828d540743bf10d07690519b2bdd716dd1512f2a8f41c" \
  -n sandbox -m POST -d '{}'
```

Should show `"status": "CLAIMED"` ✅

---

## 🔄 How Atomic Swaps Work

```
┌─────────────────────────────────────────────────────────────────┐
│                     ATOMIC SWAP FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Alice generates: SECRET → SHA256(SECRET) = HASH            │
│                                                                 │
│  2. Alice locks ETH on Etherlink with HASH                     │
│     └─ Funds locked until: Alice refunds OR Bob claims         │
│                                                                 │
│  3. Bob verifies Alice's swap, locks XTZ on Jstz with HASH     │
│     └─ Funds locked until: Bob refunds OR Alice claims         │
│                                                                 │
│  4. Alice claims XTZ on Jstz by revealing SECRET               │
│     └─ SECRET is now PUBLIC (visible on-chain)                 │
│                                                                 │
│  5. Bob uses revealed SECRET to claim ETH on Etherlink         │
│     └─ Swap complete! Both parties received funds              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Security

### Checks Implemented

| Check | Etherlink | Jstz |
|-------|-----------|------|
| SHA-256(secret) == hashlock | ✅ | ✅ |
| Swap exists | ✅ | ✅ |
| Swap is OPEN | ✅ | ✅ |
| Not expired (claim) | ✅ | ✅ |
| Expired (refund) | ✅ | ✅ |
| Sender authorization (refund) | ✅ | ✅ |
| Recipient authorization (claim) | ✅ | ✅ |
| Duplicate prevention | ✅ | ✅ |

### Why SHA-256?

Both Etherlink (Solidity) and Jstz use **SHA-256** for hash verification, ensuring the same secret works on both chains. This is critical for cross-chain atomic swaps.

---

## 🧪 Run Tests

### Solidity Tests (12 tests)

```bash
cd contracts/etherlink
npx hardhat test
```

### Jstz Health Check

```bash
jstz run "jstz://KT19cEGFQGsmtSimKJQFzi9WYrsHGXofq8Hb/" -n sandbox -m POST -d '{}'
```

---

## 📁 Project Structure

```
atomic_swap_etherlink_hackathon/
├── index.html                    # Frontend interface
├── contracts/
│   ├── jstz/
│   │   └── htlc.js              # Jstz Smart Function (SHA-256)
│   └── etherlink/
│       ├── contracts/HTLC.sol   # Solidity Contract (SHA-256)
│       ├── test/HTLC.test.js    # Unit tests
│       └── scripts/deploy.js    # Deployment script
└── README.md
```

---

## 🏗️ Tech Stack

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript, ethers.js
- **Etherlink**: Solidity 0.8.20, Hardhat
- **Jstz**: JavaScript Smart Functions, Kv storage
- **Hash Algorithm**: SHA-256 (cross-chain compatible)

---

## 📄 License

MIT License

---

**Made with ❤️ for the Jstz Hackathon**
