# Atomic Swap Contracts - Etherlink x Jstz

Ce dossier contient les smart contracts pour les atomic swaps entre **Etherlink** et **Jstz**.

## Architecture

```
contracts/
├── jstz/
│   └── htlc.js          # Smart Function Jstz (HTLC)
├── etherlink/
│   ├── HTLC.sol         # Smart Contract Solidity
│   ├── hardhat.config.js
│   ├── scripts/
│   │   └── deploy.js
│   └── test/
│       └── HTLC.test.js
└── package.json
```

## Prérequis

### Pour Jstz
```bash
npm i -g @jstz-dev/cli
```

### Pour Etherlink
```bash
cd etherlink
npm install
```

## Déploiement

### 1. Déployer sur Jstz (Sandbox)

```bash
# Démarrer le sandbox Jstz
jstz sandbox --container start -d

# Déployer la smart function
jstz deploy jstz/htlc.js --name htlc -n dev

# Tester
jstz run jstz://htlc/ -n dev
```

### 2. Déployer sur Etherlink

```bash
cd etherlink

# Créer le fichier .env
cp .env.example .env
# Éditer .env avec votre clé privée

# Compiler
npx hardhat compile

# Déployer sur testnet
npx hardhat run scripts/deploy.js --network etherlinkTestnet

# Déployer sur mainnet
npx hardhat run scripts/deploy.js --network etherlink
```

## API Jstz HTLC

### Endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/initiate` | Initier un swap (lock funds) |
| POST | `/claim` | Réclamer les fonds avec le secret |
| POST | `/refund` | Récupérer les fonds après expiration |
| GET | `/swap/:hashlock` | Obtenir les détails d'un swap |
| GET | `/swaps` | Lister tous les swaps |
| GET | `/` | Health check |

### Exemples

**Initier un swap:**
```bash
curl -X POST jstz://htlc/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "hashlock": "0x...",
    "recipient": "tz1...",
    "expiration": 1700000000,
    "amount": 1000000
  }'
```

**Réclamer un swap:**
```bash
curl -X POST jstz://htlc/claim \
  -H "Content-Type: application/json" \
  -d '{
    "hashlock": "0x...",
    "secret": "my_secret_preimage"
  }'
```

## API Etherlink HTLC

### Fonctions

| Fonction | Description |
|----------|-------------|
| `initiateSwap(recipient, hashLock, expiration)` | Initier un swap |
| `claimSwap(swapId, secret)` | Réclamer avec le secret |
| `refundSwap(swapId)` | Récupérer après expiration |
| `getSwap(swapId)` | Obtenir les détails |
| `swapPresent(swapId)` | Vérifier si un swap existe |

### Events

- `SwapInitiated(swapId, sender, recipient, amount, hashLock, expiration)`
- `SwapClaimed(swapId, claimer, secret)`
- `SwapRefunded(swapId, sender, amount)`

## Flow Atomic Swap

```
┌─────────────────────────────────────────────────────────────────┐
│                     ATOMIC SWAP FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Alice génère un secret et calcule le hashlock               │
│     secret = "random_bytes"                                      │
│     hashlock = keccak256(secret)                                │
│                                                                  │
│  2. Alice initie sur Etherlink                                  │
│     HTLC.initiateSwap(bob, hashlock, expiration_long)           │
│     → Lock 1 ETH                                                │
│                                                                  │
│  3. Bob vérifie sur Etherlink, puis initie sur Jstz             │
│     jstz://htlc/initiate                                        │
│     → Lock 100 XTZ avec le MÊME hashlock                        │
│     → Expiration PLUS COURTE que celle d'Alice                  │
│                                                                  │
│  4. Alice réclame sur Jstz (révèle le secret)                   │
│     jstz://htlc/claim { hashlock, secret }                      │
│     → Le secret est maintenant public                           │
│                                                                  │
│  5. Bob utilise le secret révélé pour réclamer sur Etherlink    │
│     HTLC.claimSwap(hashlock, secret)                            │
│                                                                  │
│  ✅ Swap complet ! Alice a XTZ, Bob a ETH                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Tests

```bash
# Tests Etherlink
cd etherlink
npx hardhat test
```

## Réseaux

### Etherlink
- **Mainnet**: https://node.mainnet.etherlink.com (chainId: 42793)
- **Testnet (Ghostnet)**: https://node.ghostnet.etherlink.com (chainId: 128123)

### Jstz
- **Sandbox**: `jstz sandbox --container start -d`
- **Dev Network**: `-n dev`

