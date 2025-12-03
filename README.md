# Etherlink x Jstz Atomic Swap

A trustless atomic swap interface between **Etherlink** (EVM L2) and **Jstz** (Tezos Smart Rollup Layer). 
Demonstrates secure cross-chain asset exchange using Hashed Timelock Contracts (HTLC).

🏆 **Built for the Jstz Hackathon**

## 🌐 Live Demo

- **Frontend**: http://localhost:8080 (local)
- **Jstz Sandbox**: https://sandbox.jstz.info
- **Etherlink Testnet**: https://node.ghostnet.etherlink.com

## 🚀 Features

- ✅ **Real Smart Contracts**: HTLC deployed on both Etherlink (Solidity) and Jstz (JavaScript)
- ✅ **Visual Flow**: Step-by-step tracker for the atomic swap lifecycle
- ✅ **Dual Chain Support**: Swap between Etherlink and Jstz networks
- ✅ **My Swaps Tab**: Auto-detect and track all your active swaps
- ✅ **Security**: Comprehensive validation checks to prevent cheating
- ✅ **Modern UI**: Dark mode, glassmorphism, and neon green accents
- ✅ **Custom Modals**: Beautiful confirmation dialogs and transaction links

## 📁 Project Structure

```
atomic_swap_etherlink_hackathon/
├── index.html              # Frontend interface
├── test.html               # Automated tests page
├── test-scenarios.js       # E2E test scenarios
├── contracts/
│   ├── jstz/
│   │   └── htlc.js         # Jstz Smart Function (HTLC)
│   ├── etherlink/
│   │   ├── contracts/
│   │   │   └── HTLC.sol    # Solidity HTLC Contract
│   │   ├── scripts/
│   │   │   └── deploy.js   # Deployment script
│   │   ├── test/
│   │   │   └── HTLC.test.js
│   │   ├── hardhat.config.js
│   │   └── package.json
│   └── README.md           # Contracts documentation
└── README.md
```

## 🛠️ Quick Start

### Prerequisites

- Node.js 18+
- MetaMask wallet with Etherlink Testnet configured
- Jstz CLI (`npm i -g @jstz-dev/cli`)

### Installation

```bash
# Clone the repo
git clone https://github.com/AurelienMonteillet/atomic_swap_etherlink_hackathon.git
cd atomic_swap_etherlink_hackathon

# Install Etherlink contract dependencies (for local testing)
cd contracts/etherlink
npm install
```

### Running the App

**Option 1: Use Deployed Contracts (Recommended)**

```bash
# From project root
python3 -m http.server 8080

# Open http://localhost:8080
```

The frontend is already configured to use:
- **Etherlink Testnet**: Contract `0x32a57e30880174145cb002f526487cb74d0fcf46`
- **Jstz Sandbox**: Smart Function `KT1CAPGVNacQv6qiyrjhj6qjXDECsXZeSv59`

**Option 2: Local Development**

```bash
# 1. Start Hardhat local node
cd contracts/etherlink
npx hardhat node

# 2. Deploy contract (in another terminal)
npx hardhat run scripts/deploy.js --network localhost

# 3. Start frontend (from project root)
python3 -m http.server 8080
```

## 📝 Deployed Contract Addresses

### Production (Public Networks)

| Network | Contract Type | Address |
|---------|--------------|---------|
| **Etherlink Testnet** | HTLC Solidity | `0x32a57e30880174145cb002f526487cb74d0fcf46` |
| **Jstz Sandbox** | HTLC Smart Function | `KT1CAPGVNacQv6qiyrjhj6qjXDECsXZeSv59` |

### Network Configuration

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Etherlink Testnet | 128123 | https://node.ghostnet.etherlink.com |
| Jstz Sandbox | - | https://sandbox.jstz.info |

## 🔄 Atomic Swap Flow

```
1. Alice generates secret → calculates hashlock (keccak256)
2. Alice locks ETH on Etherlink (initiateSwap)
3. Bob verifies hashlock, locks XTZ on Jstz (POST /initiate)
4. Alice claims XTZ on Jstz (reveals secret via POST /claim)
5. Bob uses revealed secret to claim ETH on Etherlink (claimSwap)
```

### Security Checks

- ✅ Swap existence verification before claim/refund
- ✅ Hashlock validation (secret must match)
- ✅ Timelock validation (Bob's must be shorter than Alice's)
- ✅ Expiration checks (claim before expiry, refund after)
- ✅ Sender authorization for refunds
- ✅ Duplicate swap prevention

## 🧪 Testing

### Hardhat Unit Tests (12 tests)
```bash
cd contracts/etherlink
npx hardhat test
```

### Jstz Smart Function Tests
```bash
# Configure sandbox network
jstz network add sandbox --octez-node-rpc-endpoint https://sandbox.jstz.info --jstz-node-endpoint https://sandbox.jstz.info

# Test health endpoint
jstz run "jstz://KT1CAPGVNacQv6qiyrjhj6qjXDECsXZeSv59/" -n sandbox -m POST -d '{}'

# Test initiate
jstz run "jstz://KT1CAPGVNacQv6qiyrjhj6qjXDECsXZeSv59/initiate" -n sandbox -m POST -d '{"hashlock":"0x123...","recipient":"tz1...","expiration":1234567890,"amount":"10"}'
```

## 🏗️ Tech Stack

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript
- **Etherlink**: Solidity 0.8.20, Hardhat, ethers.js
- **Jstz**: JavaScript Smart Functions, Kv persistent storage
- **Libraries**: ethers.js v6, crypto-js

## 📱 Wallet Setup

### MetaMask (Etherlink)

Add Etherlink Testnet to MetaMask:
- **Network Name**: Etherlink Testnet
- **RPC URL**: https://node.ghostnet.etherlink.com
- **Chain ID**: 128123
- **Symbol**: XTZ
- **Explorer**: https://testnet.explorer.etherlink.com

### Jstz Wallet

Use the Jstz CLI to interact with the sandbox:
```bash
jstz whoami -n sandbox
```

## 📄 License

MIT License - see LICENSE file

## 🤝 Contributing

This project was built for the Jstz Hackathon. Contributions welcome!

---

**Made with ❤️ by Aurélien Monteillet**
