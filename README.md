# Etherlink x Jstz Atomic Swap

A trustless atomic swap interface between **Etherlink** (EVM L2) and **Jstz** (Tezos Smart Rollup Layer). 
Demonstrates secure cross-chain asset exchange using Hashed Timelock Contracts (HTLC).

## 🚀 Features

- ✅ **Real Smart Contracts**: HTLC deployed on both Etherlink (Solidity) and Jstz (JavaScript)
- ✅ **Visual Flow**: Step-by-step tracker for the atomic swap lifecycle
- ✅ **Dual Chain Support**: Swap between Etherlink and Jstz networks
- ✅ **Security**: Client-side secret generation with keccak256 hashing
- ✅ **Modern UI**: Dark mode, glassmorphism, and neon green accents

## 📁 Project Structure

```
atomic_swap_etherlink_hackathon/
├── index.html              # Frontend interface
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
- Docker (for Jstz sandbox)
- npm or yarn

### Installation

```bash
# Install Jstz CLI
npm i -g @jstz-dev/cli

# Install Etherlink contract dependencies
cd contracts/etherlink
npm install
```

### Running Locally

**1. Start Jstz Sandbox:**
```bash
jstz sandbox --container start -d
```

**2. Deploy Jstz Smart Function:**
```bash
jstz deploy contracts/jstz/htlc.js --name htlc -n dev
```

**3. Start Hardhat Local Node:**
```bash
cd contracts/etherlink
npx hardhat node
```

**4. Deploy Etherlink Contract:**
```bash
npx hardhat run scripts/deploy.js --network localhost
```

**5. Open Frontend:**
```bash
# From project root
python3 -m http.server 8000
# Then open http://localhost:8000
```

## 📝 Contract Addresses

### Local Development

- **Etherlink HTLC**: `0x5FbDB2315678afecb367f032d93F642f64180aa3` (Hardhat local)
- **Jstz HTLC**: `jstz://htlc/` (Sandbox dev)

Update the address in `index.html` if deploying to different networks.

## 🔄 Atomic Swap Flow

```
1. Alice generates secret → calculates hashlock
2. Alice locks ETH on Etherlink (initiateSwap)
3. Bob verifies hashlock, locks XTZ on Jstz (POST /initiate)
4. Alice claims XTZ on Jstz (reveals secret via POST /claim)
5. Bob uses revealed secret to claim ETH on Etherlink (claimSwap)
```

## 🧪 Testing

```bash
# Test Etherlink contract
cd contracts/etherlink
npx hardhat test
```

All 12 tests should pass ✅

## 📚 Documentation

See `contracts/README.md` for detailed contract documentation and API.

## 🏗️ Tech Stack

- **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript
- **Etherlink**: Solidity 0.8.20, Hardhat
- **Jstz**: JavaScript (Smart Functions)
- **Libraries**: ethers.js, crypto-js

## 📄 License

MIT License - see LICENSE file

## 🤝 Contributing

This project was built for the Etherlink Internal Hackathon. Contributions welcome!
