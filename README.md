# Etherlink x Jstz Atomic Swap

A trustless atomic swap interface between **Etherlink** (L2) and **Jstz** (Tezos Smart Rollup Layer). 
Designed for the internal hackathon to demonstrate secure cross-chain asset exchange using Hashed Timelock Contracts (HTLC).

![Design Preview](https://placehold.co/600x400/02040a/39FF14?text=Atomic+Swap+UI)

## Features

-   **Visual Flow**: Step-by-step tracker for the atomic swap lifecycle (Initiate -> Participate -> Redeem -> Complete).
-   **Roles**: Switch between **Initiator (Alice)** and **Participant (Bob)**.
-   **Security**: Client-side secret generation (Preimage/Hash) using `crypto-js`.
-   **Mock Integration**: Simulates smart contract interactions with a "Terminal" log for debugging and presentation.
-   **Design**: "Etherlink" aesthetic with dark mode, glassmorphism, and neon green accents.

## Usage

1.  **Open `index.html`** in any modern browser.
2.  **Connect Wallet**: Click "Connect Etherlink" or "Connect Jstz" to simulate wallet connection.
3.  **Initiate (Alice)**:
    -   Ensure you are on the "Initiate Swap" tab.
    -   Enter Amount (e.g., 10 ETH).
    -   Click **Initiate Swap**.
    -   Watch the terminal log and progress bar.
4.  **Participate (Bob)**:
    -   Wait for the "Waiting for Counterparty" state or manually switch tabs to "Join Swap".
    -   Click **Match Swap** (or follow the on-screen flow if auto-simulated).
5.  **Reveal & Claim**:
    -   Once both parties have locked funds, the Initiator reveals the secret to claim funds on Jstz.
    -   The Participant then uses the revealed secret to claim funds on Etherlink.

## Tech Stack

-   **Frontend**: HTML5, Tailwind CSS (CDN), Vanilla JS.
-   **Libraries**: `ethers.js` (Wallet), `crypto-js` (Hashing).
-   **Compatibility**: Designed to be easily integrated with the `jstz` runtime.

## Hackathon Notes

-   The current logic is **mocked** for demonstration purposes.
-   To connect to real contracts, edit the `executeAction` function in `index.html` and replace the `setTimeout` calls with actual `ethers.Contract` calls.


