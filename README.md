# Etherlink x Jstz Atomic Swap

A trustless atomic swap interface between **Etherlink** (EVM L2) and **Jstz** (Tezos Smart Rollup Layer). 
Demonstrates secure cross-chain asset exchange using Hashed Timelock Contracts (HTLC) with **SHA-256**.

🏆 **Built for the Jstz Hackathon**

🌐 **Live Demo**: [https://atomic-swap-etherlink-hackathon.vercel.app](https://atomic-swap-etherlink-hackathon.vercel.app)

---

## 📦 Deployed Contracts

| Network | Contract | Address |
|---------|----------|---------|
| **Etherlink Testnet** | HTLC Solidity | `0x79826f6Ab82C24395123f8419E3aFb995d906bAd` |
| **Jstz Privatenet** | HTLC Smart Function | `KT1FuiM76E3meki28sf9nAKBGVcwTCcGp97W` |

---

## 🚀 Quick Start (5 minutes)

### Step 1: Open the App

**👉 Go to: [https://atomic-swap-etherlink-hackathon.vercel.app](https://atomic-swap-etherlink-hackathon.vercel.app)**

That's it! The frontend is already deployed and ready to use.

---

### Step 2: Configure MetaMask (for Etherlink)

1. Open MetaMask browser extension
2. Click the network dropdown (top left)
3. Click **"Add network"** → **"Add a network manually"**
4. Enter these details:

| Field | Value |
|-------|-------|
| Network Name | `Etherlink Testnet` |
| RPC URL | `https://node.ghostnet.etherlink.com` |
| Chain ID | `128123` |
| Currency Symbol | `XTZ` |
| Block Explorer | `https://testnet.explorer.etherlink.com` |

5. Click **Save**

**Get free testnet XTZ:** https://faucet.etherlink.com

---

### Step 3: Install Jstz CLI (for Jstz transactions)

```bash
# Check you have Node.js 18+
node --version

# Install Jstz CLI globally
npm install -g @jstz-dev/cli

# Verify installation
jstz --version
```

**Getting errors?**
- On macOS/Linux, you might need `sudo npm install -g @jstz-dev/cli`
- On Windows, run your terminal as Administrator
- More details: [Jstz Installation Guide](https://jstz.tezos.com/installation)

---

### Step 4: Configure Jstz Network

```bash
# Add the privatenet network configuration
jstz network add privatenet \
  --octez-node-rpc-endpoint https://privatenet.jstz.info \
  --jstz-node-endpoint https://privatenet.jstz.info
```

**Verify it works:**
```bash
jstz run "jstz://KT1FuiM76E3meki28sf9nAKBGVcwTCcGp97W/" -n privatenet -m POST -d '{}'
```

Should output something like: `{"status":"healthy","swaps_count":...}`

---

### Step 5 (Optional): Install Jstz Wallet Extension

For signing Jstz transactions directly from the browser instead of CLI:

1. Go to [jstz-dev/dev-wallet releases](https://github.com/jstz-dev/dev-wallet/releases)
2. Download the latest `.zip` file
3. Unzip it to a folder
4. Open Chrome → `chrome://extensions/`
5. Enable **"Developer mode"** (toggle in top right)
6. Click **"Load unpacked"**
7. Select the `apps/signer/dist` folder from the unzipped files
8. The extension appears in your toolbar - click it to create an account

**Without the extension:** You'll see CLI commands to copy/paste in your terminal.

---

### ✅ You're ready! 

Go to [https://atomic-swap-etherlink-hackathon.vercel.app](https://atomic-swap-etherlink-hackathon.vercel.app) and start swapping!

---

## 🧪 Complete Atomic Swap Test

### Scenario: Alice (Etherlink) ↔ Bob (Jstz)

**Alice** has XTZ on Etherlink and wants to exchange with **Bob** who has XTZ on Jstz.

---

### 📍 Step 1: Alice Initiates on Etherlink

**In the browser (http://localhost:8080):**

1. Click **"Connect Etherlink"** → MetaMask opens → Confirm connection
2. Make sure you're on **Etherlink Testnet** (the badge should be green)
3. In the **"Initiate"** tab:
   - Click **"Generate New"** to create a secret/hash pair
   - **📋 COPY THE HASH** (share this with Bob)
   - **🔐 COPY THE SECRET** (keep this private!)
   - Enter amount: `0.01` (or any amount you want to swap)
   - Set timelock: `60` minutes
   - Click **"Initiate Swap"**
4. MetaMask popup → Confirm the transaction
5. Wait for confirmation (~10 seconds)

**You should see in the logs:**
```
🎉 SWAP INITIATED SUCCESSFULLY!
📋 NEXT STEP:
   Share this HASH with Bob:
   0x7398c0867ead74a1861828d540743bf10d07690519b2bdd716dd1512f2a8f41c
```

**⚠️ IMPORTANT: Save both the HASH and SECRET!**

---

### 📍 Step 2: Bob Locks Funds on Jstz

**Bob receives the HASH from Alice and runs this in his terminal:**

```bash
# Replace with your actual hash from Step 1
HASH="0x7398c0867ead74a1861828d540743bf10d07690519b2bdd716dd1512f2a8f41c"

# Calculate expiration (30 minutes from now - must be shorter than Alice's!)
EXPIRATION=$(($(date +%s) + 1800))

# Lock 10 XTZ with the same hash
jstz run "jstz://KT1FuiM76E3meki28sf9nAKBGVcwTCcGp97W/initiate" \
  -n privatenet -m POST \
  -d "{\"hashlock\":\"$HASH\",\"recipient\":null,\"expiration\":$EXPIRATION,\"amount\":\"10\"}"
```

**Expected output:**
```json
{
  "success": true,
  "event": "SwapInitiated",
  "data": {
    "hashlock": "0x7398c0867...",
    "status": "OPEN",
    "amount": 10
  }
}
```

**Verify the swap exists:**
```bash
jstz run "jstz://KT1FuiM76E3meki28sf9nAKBGVcwTCcGp97W/swap/$HASH" \
  -n privatenet -m POST -d '{}'
```

---

### 📍 Step 3: Alice Claims on Jstz (Reveals Secret)

**Alice uses her SECRET to claim Bob's XTZ:**

```bash
# Use Alice's secret and the shared hash
SECRET="0x45bb7983ccd97365ac019514d61631d7ea6f5bbffb4dd9ff4d3f7271a81b968c"
HASH="0x7398c0867ead74a1861828d540743bf10d07690519b2bdd716dd1512f2a8f41c"

jstz run "jstz://KT1FuiM76E3meki28sf9nAKBGVcwTCcGp97W/claim" \
  -n privatenet -m POST \
  -d "{\"hashlock\":\"$HASH\",\"secret\":\"$SECRET\"}"
```

**Expected output:**
```json
{
  "success": true,
  "event": "SwapClaimed",
  "data": {
    "hashlock": "0x7398c0867...",
    "secret": "0x45bb7983...",
    "status": "CLAIMED"
  }
}
```

**⚠️ The SECRET is now PUBLIC on-chain! Bob can see it.**

---

### 📍 Step 4: Bob Claims on Etherlink

**Bob uses the revealed SECRET to claim Alice's XTZ:**

**In the browser:**

1. Go to http://localhost:8080
2. Connect MetaMask (Etherlink)
3. Go to **"Claim/Refund"** tab
4. Enter:
   - **Swap ID / Hash**: `0x7398c0867ead74a1861828d540743bf10d07690519b2bdd716dd1512f2a8f41c`
   - **Secret**: `0x45bb7983ccd97365ac019514d61631d7ea6f5bbffb4dd9ff4d3f7271a81b968c`
5. Click **"Claim"**
6. Confirm in MetaMask

**✅ Swap Complete!** Both parties have received their funds.

---

### 📍 Verify Final Status

```bash
# Check Jstz swap status
HASH="0x7398c0867ead74a1861828d540743bf10d07690519b2bdd716dd1512f2a8f41c"
jstz run "jstz://KT1FuiM76E3meki28sf9nAKBGVcwTCcGp97W/swap/$HASH" \
  -n privatenet -m POST -d '{}'
```

Should show: `"status": "CLAIMED"` ✅

---

## ⏱️ What About Refunds?

If the swap expires (timelock passes) and the other party didn't claim:

**On Etherlink (browser):**
1. Go to "Claim/Refund" tab
2. Enter the Swap ID
3. Click "Refund"

**On Jstz (CLI):**
```bash
HASH="your_hash_here"
jstz run "jstz://KT1FuiM76E3meki28sf9nAKBGVcwTCcGp97W/refund" \
  -n privatenet -m POST \
  -d "{\"hashlock\":\"$HASH\"}"
```

---

## 🔄 How Atomic Swaps Work

```
┌─────────────────────────────────────────────────────────────────┐
│                     ATOMIC SWAP FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Alice generates: SECRET → SHA256(SECRET) = HASH            │
│                                                                 │
│  2. Alice locks XTZ on Etherlink with HASH (60 min timelock)   │
│     └─ Funds locked until: Alice refunds OR Bob claims         │
│                                                                 │
│  3. Bob verifies Alice's swap, locks XTZ on Jstz with HASH     │
│     └─ IMPORTANT: Bob's timelock must be SHORTER (30 min)      │
│                                                                 │
│  4. Alice claims XTZ on Jstz by revealing SECRET               │
│     └─ SECRET is now PUBLIC (visible on-chain)                 │
│                                                                 │
│  5. Bob uses revealed SECRET to claim XTZ on Etherlink         │
│     └─ Swap complete! Both parties received funds              │
│                                                                 │
│  SAFETY: If anything goes wrong, both can refund after expiry  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Features

| Security Check | Etherlink | Jstz |
|----------------|-----------|------|
| SHA-256(secret) == hashlock | ✅ | ✅ |
| Swap exists | ✅ | ✅ |
| Swap is OPEN (not already claimed) | ✅ | ✅ |
| Not expired (for claim) | ✅ | ✅ |
| Expired (for refund) | ✅ | ✅ |
| Sender authorization (refund) | ✅ | ✅ |
| Recipient authorization (claim) | ✅ | ✅ |
| Duplicate prevention | ✅ | ✅ |

**Why SHA-256?** Both Etherlink (Solidity) and Jstz use SHA-256 for hash verification, ensuring the same secret works on both chains.

---

## 🛠️ Development Setup (Run Locally)

Want to run the project locally instead of using Vercel? Here's how:

### Clone & Run Locally

```bash
# Clone the repository
git clone https://github.com/AurelienMonteillet/atomic_swap_etherlink_hackathon.git
cd atomic_swap_etherlink_hackathon

# Start a local server (choose one):

# Option A: Python 3
python3 -m http.server 8080

# Option B: Node.js
npx serve -p 8080

# Option C: PHP
php -S localhost:8080
```

Open http://localhost:8080 in your browser.

### Run Solidity Tests

```bash
cd contracts/etherlink
npm install
npx hardhat test
```

All 12 tests should pass ✅

### Deploy Your Own Contract

```bash
cd contracts/etherlink
npx hardhat run scripts/deploy.js --network etherlink_testnet
```

### Deploy Your Own Jstz Smart Function

```bash
cd contracts/jstz
jstz deploy htlc.js -n privatenet
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
│       ├── test/HTLC.test.js    # 12 unit tests
│       └── scripts/deploy.js    # Deployment script
└── README.md
```

---

## 🐛 Troubleshooting

### "jstz: command not found"
```bash
# Make sure npm global bin is in your PATH
npm config get prefix
# Add to your shell profile (~/.bashrc, ~/.zshrc):
export PATH="$PATH:$(npm config get prefix)/bin"
```

### "Network privatenet not found"
```bash
jstz network add privatenet \
  --octez-node-rpc-endpoint https://privatenet.jstz.info \
  --jstz-node-endpoint https://privatenet.jstz.info
```

### MetaMask shows wrong network
Click the network badge in the header to auto-switch to Etherlink Testnet.

### "Insufficient funds"
Get testnet XTZ at: https://faucet.etherlink.com

### Transaction stuck/pending
Wait a few seconds and refresh. Etherlink blocks are ~10 seconds.

---

## 🏗️ Tech Stack

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript, ethers.js v5
- **Etherlink**: Solidity 0.8.20, Hardhat, OpenZeppelin
- **Jstz**: JavaScript Smart Functions, Kv storage
- **Hash Algorithm**: SHA-256 (cross-chain compatible)

---

## 📄 License

MIT License

---

## 🔗 Resources

- [Jstz Documentation](https://jstz.tezos.com/)
- [Jstz CLI Installation](https://jstz.tezos.com/installation)
- [Etherlink Documentation](https://docs.etherlink.com/)
- [Etherlink Faucet](https://faucet.etherlink.com)
- [Etherlink Explorer](https://testnet.explorer.etherlink.com)

---

**Made with ❤️ for the Jstz Hackathon**
