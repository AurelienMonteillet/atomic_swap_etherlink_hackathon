/**
 * HTLC Smart Function for Jstz
 * Hashed Timelock Contract for Atomic Swaps
 * 
 * This smart function enables REAL trustless cross-chain swaps between
 * Etherlink and Jstz using hash time-locked contracts.
 * 
 * REAL TRANSFERS:
 * - Uses X-JSTZ-AMOUNT to receive tez at initiation
 * - Uses X-JSTZ-TRANSFER to send tez at claim/refund
 * - All amounts are in MUTEZ (1 XTZ = 1,000,000 mutez)
 */

// Constants
const ONE_TEZ = 1000000; // 1 XTZ in mutez

// Status enum
const SwapStatus = {
  OPEN: 'OPEN',
  CLAIMED: 'CLAIMED',
  REFUNDED: 'REFUNDED'
};

/**
 * Helper: Get current timestamp in seconds
 */
function now() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Helper: Get swap from Kv storage
 */
function getSwapFromKv(hashlock) {
  const key = hashlock.startsWith('0x') ? hashlock.slice(2) : hashlock;
  const data = Kv.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Helper: Save swap to Kv storage
 */
function saveSwapToKv(hashlock, swap) {
  const key = hashlock.startsWith('0x') ? hashlock.slice(2) : hashlock;
  Kv.set(key, JSON.stringify(swap));
}

/**
 * Helper: Get all swap keys
 */
function getAllSwapKeys() {
  const keys = Kv.get('swap_keys');
  return keys ? JSON.parse(keys) : [];
}

/**
 * Helper: Add swap key to list
 */
function addSwapKey(hashlock) {
  const keys = getAllSwapKeys();
  if (!keys.includes(hashlock)) {
    keys.push(hashlock);
    Kv.set('swap_keys', JSON.stringify(keys));
  }
}

/**
 * Helper: Convert XTZ to mutez
 */
function xtzToMutez(xtz) {
  return Math.floor(parseFloat(xtz) * ONE_TEZ);
}

/**
 * Helper: Convert mutez to XTZ
 */
function mutezToXtz(mutez) {
  return mutez / ONE_TEZ;
}

/**
 * Pure JavaScript SHA-256 implementation (no dependencies)
 * For cross-chain compatibility with Etherlink
 */
function sha256(message) {
  // Convert input to bytes
  let bytes;
  if (typeof message === 'string' && message.startsWith('0x')) {
    const hex = message.slice(2);
    bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
  } else if (typeof message === 'string') {
    bytes = [];
    for (let i = 0; i < message.length; i++) {
      const code = message.charCodeAt(i);
      if (code < 128) bytes.push(code);
    }
  } else {
    bytes = Array.from(message);
  }

  // SHA-256 constants
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  // Initial hash values
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  // Helper functions
  const rotr = (n, x) => (x >>> n) | (x << (32 - n));
  const ch = (x, y, z) => (x & y) ^ (~x & z);
  const maj = (x, y, z) => (x & y) ^ (x & z) ^ (y & z);
  const sigma0 = x => rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
  const sigma1 = x => rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
  const gamma0 = x => rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
  const gamma1 = x => rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);

  // Preprocessing: adding padding bits
  const originalLen = bytes.length;
  const bitLen = originalLen * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  
  // Append 64-bit length (big-endian) - high 32 bits are 0 for small messages
  bytes.push(0, 0, 0, 0);
  bytes.push((bitLen >>> 24) & 0xff);
  bytes.push((bitLen >>> 16) & 0xff);
  bytes.push((bitLen >>> 8) & 0xff);
  bytes.push(bitLen & 0xff);

  // Process each 64-byte chunk
  for (let i = 0; i < bytes.length; i += 64) {
    const W = new Array(64);
    
    // Copy chunk into first 16 words
    for (let t = 0; t < 16; t++) {
      W[t] = ((bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) | 
             (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3]) >>> 0;
    }
    
    // Extend to 64 words
    for (let t = 16; t < 64; t++) {
      W[t] = (gamma1(W[t - 2]) + W[t - 7] + gamma0(W[t - 15]) + W[t - 16]) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;

    // Main loop
    for (let t = 0; t < 64; t++) {
      const T1 = (h + sigma1(e) + ch(e, f, g) + K[t] + W[t]) >>> 0;
      const T2 = (sigma0(a) + maj(a, b, c)) >>> 0;
      h = g; g = f; f = e;
      e = (d + T1) >>> 0;
      d = c; c = b; b = a;
      a = (T1 + T2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  // Convert to hex string
  return '0x' + H.map(h => h.toString(16).padStart(8, '0')).join('');
}

/**
 * Helper: Hash a secret using SHA-256 (pure JS, no crypto dependency)
 */
async function hashSecret(secret) {
  return sha256(secret);
}

/**
 * INITIATE - Lock funds with a hashlock
 * 
 * REAL TRANSFER: Receives tez via X-JSTZ-AMOUNT header
 * The smart function automatically holds the received tez in escrow
 * 
 * @param hashlock - The SHA-256 hash of the secret (0x + 64 hex chars)
 * @param recipient - Optional: Address that can claim (or null for anyone with secret)
 * @param expiration - Unix timestamp when swap expires
 * @param amountMutez - Amount received in mutez (from X-JSTZ-AMOUNT header)
 * @param sender - Address of the initiator (from Referer header)
 */
async function initiate(hashlock, recipient, expiration, amountMutez, sender) {
  if (!hashlock || hashlock.length !== 66) {
    throw new Error('Invalid hashlock: must be 0x + 64 hex chars');
  }
  
  // Amount is now received via X-JSTZ-AMOUNT (in mutez)
  if (!amountMutez || amountMutez <= 0) {
    throw new Error('No tez received. Send tez with X-JSTZ-TRANSFER header');
  }
  
  if (expiration <= now()) {
    throw new Error('Expiration must be in the future');
  }
  
  const existing = getSwapFromKv(hashlock);
  if (existing) {
    throw new Error('Swap with this hashlock already exists');
  }
  
  const swap = {
    hashlock,
    sender,
    recipient: recipient || null,
    amountMutez: amountMutez,          // Store in mutez
    amountXtz: mutezToXtz(amountMutez), // Also store in XTZ for convenience
    expiration,
    status: SwapStatus.OPEN,
    createdAt: now()
  };
  
  saveSwapToKv(hashlock, swap);
  addSwapKey(hashlock);
  
  console.log('[HTLC] Swap initiated: ' + hashlock.substring(0, 16) + '... by ' + sender);
  console.log('[HTLC] Amount locked: ' + amountMutez + ' mutez (' + mutezToXtz(amountMutez) + ' XTZ)');
  
  return {
    success: true,
    event: 'SwapInitiated',
    data: swap,
    message: `Successfully locked ${mutezToXtz(amountMutez)} XTZ`
  };
}

/**
 * CLAIM - Claim funds by revealing the secret
 * 
 * REAL TRANSFER: Sends tez to claimer via X-JSTZ-TRANSFER header in response
 * 
 * SECURITY CHECKS:
 * 1. Verifies the secret matches the hashlock
 * 2. Verifies the claimer is authorized (if recipient is set)
 * 3. Verifies swap is not expired
 */
async function claim(hashlock, secret, claimer) {
  const swap = getSwapFromKv(hashlock);
  
  if (!swap) {
    throw new Error('Swap not found');
  }
  
  if (swap.status !== SwapStatus.OPEN) {
    throw new Error('Swap already claimed or refunded');
  }
  
  if (now() >= swap.expiration) {
    throw new Error('Swap has expired');
  }
  
  // SECURITY CHECK #1: Verify the secret matches the hashlock
  const computedHash = await hashSecret(secret);
  
  console.log('[HTLC] Claim attempt - computed: ' + computedHash + ', expected: ' + hashlock);
  
  if (computedHash.toLowerCase() !== hashlock.toLowerCase()) {
    console.log('[HTLC] SECURITY: Invalid secret provided! Hash mismatch.');
    throw new Error('Invalid secret: hash does not match hashlock');
  }
  
  console.log('[HTLC] Secret verified successfully!');
  
  // SECURITY CHECK #2: Verify claimer is authorized recipient
  if (swap.recipient && swap.recipient !== claimer) {
    console.log('[HTLC] SECURITY: Unauthorized claim attempt by ' + claimer + ', expected ' + swap.recipient);
    throw new Error('Only the designated recipient can claim this swap');
  }
  
  console.log('[HTLC] Claimer authorized: ' + claimer);
  
  // Update swap status
  swap.status = SwapStatus.CLAIMED;
  swap.claimedBy = claimer;
  swap.claimedAt = now();
  swap.revealedSecret = secret;
  
  saveSwapToKv(hashlock, swap);
  
  console.log('[HTLC] Swap claimed: ' + hashlock.substring(0, 16) + '... by ' + claimer);
  console.log('[HTLC] Transferring ' + swap.amountMutez + ' mutez to ' + claimer);
  
  // Return the amount to transfer - the handler will add X-JSTZ-TRANSFER header
  return {
    success: true,
    event: 'SwapClaimed',
    transferAmount: swap.amountMutez, // Amount to send to claimer
    data: {
      hashlock,
      secret,
      claimedBy: claimer,
      amountMutez: swap.amountMutez,
      amountXtz: swap.amountXtz
    },
    message: `Successfully claimed ${swap.amountXtz} XTZ`
  };
}

/**
 * REFUND - Refund funds to sender after expiration
 * 
 * REAL TRANSFER: Sends tez back to sender via X-JSTZ-TRANSFER header in response
 */
async function refund(hashlock, refunder) {
  const swap = getSwapFromKv(hashlock);
  
  if (!swap) {
    throw new Error('Swap not found');
  }
  
  if (swap.status !== SwapStatus.OPEN) {
    throw new Error('Swap already claimed or refunded');
  }
  
  if (now() < swap.expiration) {
    throw new Error('Swap not yet expired. Wait until ' + new Date(swap.expiration * 1000).toISOString());
  }
  
  if (swap.sender !== refunder) {
    throw new Error('Only sender can refund');
  }
  
  swap.status = SwapStatus.REFUNDED;
  swap.refundedAt = now();
  
  saveSwapToKv(hashlock, swap);
  
  console.log('[HTLC] Swap refunded: ' + hashlock.substring(0, 16) + '... to ' + refunder);
  console.log('[HTLC] Transferring ' + swap.amountMutez + ' mutez back to ' + refunder);
  
  // Return the amount to transfer - the handler will add X-JSTZ-TRANSFER header
  return {
    success: true,
    event: 'SwapRefunded',
    transferAmount: swap.amountMutez, // Amount to send back to sender
    data: {
      hashlock,
      refundedTo: swap.sender,
      amountMutez: swap.amountMutez,
      amountXtz: swap.amountXtz
    },
    message: `Successfully refunded ${swap.amountXtz} XTZ`
  };
}

/**
 * GET_SWAP - Query swap details
 */
function getSwap(hashlock) {
  const swap = getSwapFromKv(hashlock);
  
  if (!swap) {
    return { found: false };
  }
  
  const safeSwap = { ...swap };
  if (swap.status !== SwapStatus.CLAIMED) {
    delete safeSwap.revealedSecret;
  }
  
  return { found: true, swap: safeSwap };
}

/**
 * LIST_SWAPS - List all swaps
 */
function listSwaps() {
  const keys = getAllSwapKeys();
  const allSwaps = [];
  
  for (const hashlock of keys) {
    const swap = getSwapFromKv(hashlock);
    if (swap) {
      allSwaps.push(swap);
    }
  }
  
  return allSwaps;
}

/**
 * Main handler for Jstz smart function
 * 
 * IMPORTANT: 
 * - Receives tez via X-JSTZ-AMOUNT header
 * - Sends tez via X-JSTZ-TRANSFER header in response
 */
const handler = async (request) => {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.toLowerCase();
  
  // Get caller address from Referer header
  const caller = request.headers.get('Referer') || 'anonymous';
  
  // Get amount of tez received (in mutez) from X-JSTZ-AMOUNT header
  const receivedAmountStr = request.headers.get('X-JSTZ-AMOUNT') || '0';
  const receivedAmount = parseInt(receivedAmountStr) || 0;
  
  console.log('[HTLC] ' + method + ' ' + path + ' from ' + caller);
  console.log('[HTLC] Received amount: ' + receivedAmount + ' mutez');
  
  try {
    let body = {};
    if (method === 'POST' && request.body) {
      const text = await request.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch (e) {
          body = {};
        }
      }
    }
    
    // ==================== INITIATE ====================
    if (method === 'POST' && path === '/initiate') {
      const { hashlock, recipient, expiration } = body;
      
      // The amount comes from X-JSTZ-AMOUNT header (real tez sent)
      // If no tez received, check if amount was passed in body (legacy mode - for testing)
      let amountToLock = receivedAmount;
      if (amountToLock === 0 && body.amount) {
        // Legacy mode: amount in body (in XTZ, convert to mutez)
        amountToLock = xtzToMutez(body.amount);
        console.log('[HTLC] WARNING: Using legacy mode (amount in body). For real transfers, send tez via X-JSTZ-TRANSFER header');
      }
      
      const result = await initiate(hashlock, recipient, expiration, amountToLock, caller);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // ==================== CLAIM ====================
    if (method === 'POST' && path === '/claim') {
      const { hashlock, secret } = body;
      const result = await claim(hashlock, secret, caller);
      
      // REAL TRANSFER: Add X-JSTZ-TRANSFER header to send tez to claimer
      const headers = { 'Content-Type': 'application/json' };
      if (result.transferAmount && result.transferAmount > 0) {
        headers['X-JSTZ-TRANSFER'] = result.transferAmount.toString();
        console.log('[HTLC] Adding transfer header: ' + result.transferAmount + ' mutez');
      }
      
      return new Response(JSON.stringify(result), { headers });
    }
    
    // ==================== REFUND ====================
    if (method === 'POST' && path === '/refund') {
      const { hashlock } = body;
      const result = await refund(hashlock, caller);
      
      // REAL TRANSFER: Add X-JSTZ-TRANSFER header to send tez back to sender
      const headers = { 'Content-Type': 'application/json' };
      if (result.transferAmount && result.transferAmount > 0) {
        headers['X-JSTZ-TRANSFER'] = result.transferAmount.toString();
        console.log('[HTLC] Adding transfer header: ' + result.transferAmount + ' mutez');
      }
      
      return new Response(JSON.stringify(result), { headers });
    }
    
    // ==================== GET SWAP ====================
    if (path.startsWith('/swap/')) {
      const hashlock = path.replace('/swap/', '');
      const result = getSwap(hashlock);
      return new Response(JSON.stringify(result), {
        status: result.found ? 200 : 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (method === 'POST' && path === '/getswap') {
      const { hashlock } = body;
      const result = getSwap(hashlock);
      return new Response(JSON.stringify(result), {
        status: result.found ? 200 : 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // ==================== LIST SWAPS ====================
    if (path === '/swaps') {
      const result = listSwaps();
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // ==================== HEALTH / INFO ====================
    if (path === '/' || path === '/health') {
      // Get contract balance if available
      let contractBalance = 'unknown';
      try {
        if (typeof Ledger !== 'undefined' && Ledger.selfAddress) {
          contractBalance = Ledger.balance(Ledger.selfAddress) + ' mutez';
        }
      } catch (e) {
        contractBalance = 'unavailable';
      }
      
      return new Response(JSON.stringify({
        name: 'HTLC Atomic Swap - Jstz',
        version: '2.0.0',
        status: 'healthy',
        realTransfers: true,
        contractBalance,
        security: {
          hashVerification: 'enabled (SHA-256)',
          recipientVerification: 'enabled'
        },
        howItWorks: {
          initiate: 'Send tez with X-JSTZ-TRANSFER header to lock funds',
          claim: 'Reveal secret, receive tez via X-JSTZ-TRANSFER in response',
          refund: 'After expiration, get tez back via X-JSTZ-TRANSFER'
        },
        endpoints: [
          'POST /initiate - Lock funds (send tez with X-JSTZ-TRANSFER)',
          'POST /claim - Claim with secret (receive tez)',
          'POST /refund - Refund after expiration (receive tez)',
          'GET /swap/:hashlock - Get swap details',
          'GET /swaps - List all swaps'
        ]
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.log('[HTLC] Error: ' + error.message);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export default handler;
