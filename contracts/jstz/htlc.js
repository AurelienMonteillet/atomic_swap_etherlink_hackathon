/**
 * HTLC Smart Function for Jstz (HARDENED VERSION)
 * Hashed Timelock Contract for Atomic Swaps
 * 
 * This smart function enables REAL trustless cross-chain swaps between
 * Etherlink and Jstz using hash time-locked contracts.
 * 
 * SECURITY MODEL:
 * ===============
 * 1. IDENTITY: The 'Referer' header is injected by the Jstz runtime and contains
 *    the caller's address (like msg.sender in Solidity). It CANNOT be spoofed
 *    by external HTTP requests - the runtime overwrites any client-provided value.
 * 
 * 2. TRANSFERS IN (initiate):
 *    - X-JSTZ-AMOUNT header is SET BY THE RUNTIME, not the client
 *    - It contains the actual amount of tez sent with the request
 *    - Client cannot spoof this - runtime reads from actual transaction
 * 
 * 3. TRANSFERS OUT (claim/refund):
 *    - X-JSTZ-TRANSFER header in RESPONSE tells runtime to send tez
 *    - Runtime executes the transfer from smart function's balance
 *    - Amount is verified against available balance by runtime
 * 
 * 4. ATOMICITY:
 *    - Jstz executes smart function calls sequentially per contract
 *    - No race condition between claim and refund for same swap
 *    - KV operations within a single call are atomic
 * 
 * REAL TRANSFERS:
 * - Uses X-JSTZ-AMOUNT to receive tez at initiation (set by runtime)
 * - Uses X-JSTZ-TRANSFER to send tez at claim/refund (read by runtime)
 * - All amounts are in MUTEZ (1 XTZ = 1,000,000 mutez)
 */

// ============================================
// CONSTANTS & CONFIG
// ============================================

const ONE_TEZ = 1000000; // 1 XTZ in mutez
const MAX_SWAPS_LIST = 100; // Pagination limit for /swaps endpoint
const MIN_AMOUNT_MUTEZ = 1000; // Minimum 0.001 XTZ to prevent dust attacks

// Strict hashlock validation regex
const HASHLOCK_REGEX = /^0x[0-9a-fA-F]{64}$/;

// Status enum
const SwapStatus = {
  OPEN: 'OPEN',
  CLAIMED: 'CLAIMED',
  REFUNDED: 'REFUNDED'
};

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate hashlock format strictly
 * @param {string} hashlock - Must be 0x + 64 hex chars
 * @returns {boolean}
 */
function isValidHashlock(hashlock) {
  return typeof hashlock === 'string' && HASHLOCK_REGEX.test(hashlock);
}

/**
 * Validate and parse amount (safe integer handling)
 * @param {any} value - Amount to parse
 * @returns {number} - Amount in mutez, or 0 if invalid
 */
function parseAmountMutez(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

/**
 * Validate expiration timestamp
 * @param {any} exp - Expiration to validate
 * @returns {number|null} - Valid timestamp or null
 */
function parseExpiration(exp) {
  const ts = typeof exp === 'string' ? parseInt(exp, 10) : exp;
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    return Math.floor(ts);
  }
  return null;
}

/**
 * Validate Tezos address format (tz1, tz2, tz3, KT1)
 * @param {string} address 
 * @returns {boolean}
 */
function isValidAddress(address) {
  if (typeof address !== 'string') return false;
  return /^(tz[1-3]|KT1)[a-zA-Z0-9]{33}$/.test(address);
}

// ============================================
// TIME & STORAGE HELPERS
// ============================================

/**
 * Get current timestamp in seconds
 */
function now() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Get swap from Kv storage
 */
function getSwapFromKv(hashlock) {
  if (!isValidHashlock(hashlock)) return null;
  const key = hashlock.slice(2); // Remove 0x prefix
  const data = Kv.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Save swap to Kv storage
 */
function saveSwapToKv(hashlock, swap) {
  const key = hashlock.slice(2);
  Kv.set(key, JSON.stringify(swap));
}

/**
 * Get all swap keys (with limit for DoS protection)
 */
function getAllSwapKeys(limit = MAX_SWAPS_LIST) {
  const keys = Kv.get('swap_keys');
  const allKeys = keys ? JSON.parse(keys) : [];
  return allKeys.slice(-limit); // Return most recent
}

/**
 * Add swap key to list
 */
function addSwapKey(hashlock) {
  const keys = getAllSwapKeys(10000); // Higher internal limit
  if (!keys.includes(hashlock)) {
    keys.push(hashlock);
    // Prune old keys if list gets too large (keep last 1000)
    const pruned = keys.slice(-1000);
    Kv.set('swap_keys', JSON.stringify(pruned));
  }
}

/**
 * Convert XTZ to mutez (safe)
 */
function xtzToMutez(xtz) {
  const num = parseFloat(xtz);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num * ONE_TEZ);
}

/**
 * Convert mutez to XTZ
 */
function mutezToXtz(mutez) {
  return mutez / ONE_TEZ;
}

// ============================================
// SHA-256 IMPLEMENTATION
// ============================================

/**
 * Pure JavaScript SHA-256 implementation
 * 
 * SECURITY NOTE: This implementation has been tested against ethers.js sha256
 * for cross-chain compatibility with Etherlink. The secret format is strictly
 * 0x + 64 hex chars, interpreted as raw bytes (not UTF-8 string).
 * 
 * @param {string} message - Input (0x-prefixed hex or plain string)
 * @returns {string} - SHA-256 hash as 0x + 64 hex chars
 */
function sha256(message) {
  // Convert input to bytes
  let bytes;
  if (typeof message === 'string' && message.startsWith('0x')) {
    // Hex string - parse as bytes
    const hex = message.slice(2);
    bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
  } else if (typeof message === 'string') {
    // Plain string - UTF-8 encode
    bytes = [];
    for (let i = 0; i < message.length; i++) {
      const code = message.charCodeAt(i);
      if (code < 128) bytes.push(code);
      else if (code < 2048) {
        bytes.push(192 | (code >> 6));
        bytes.push(128 | (code & 63));
      }
    }
  } else {
    bytes = Array.from(message);
  }

  // SHA-256 constants (first 32 bits of fractional parts of cube roots of first 64 primes)
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

  // Initial hash values (first 32 bits of fractional parts of square roots of first 8 primes)
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  // Helper functions
  const rotr = (n, x) => (x >>> n) | (x << (32 - n));
  const ch = (x, y, z) => (x & y) ^ (~x & z);
  const maj = (x, y, z) => (x & y) ^ (x & z) ^ (y & z);
  const sigma0 = x => rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
  const sigma1 = x => rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
  const gamma0 = x => rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
  const gamma1 = x => rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);

  // Preprocessing: add padding bits
  const originalLen = bytes.length;
  const bitLen = originalLen * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  
  // Append 64-bit length (big-endian)
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

  return '0x' + H.map(h => h.toString(16).padStart(8, '0')).join('');
}

/**
 * Hash a secret using SHA-256
 */
function hashSecret(secret) {
  return sha256(secret);
}

// ============================================
// CORE HTLC FUNCTIONS
// ============================================

/**
 * INITIATE - Lock funds with a hashlock
 * 
 * REAL TRANSFER: Receives tez via X-JSTZ-AMOUNT header (set by runtime)
 * The smart function automatically holds the received tez in escrow.
 * 
 * @param {string} hashlock - SHA-256 hash of the secret (0x + 64 hex chars)
 * @param {string|null} recipient - Address that can claim (null = anyone with secret)
 * @param {number} expiration - Unix timestamp when swap expires
 * @param {number} amountMutez - Amount received in mutez (from X-JSTZ-AMOUNT)
 * @param {string} sender - Caller's address (from Referer header, set by runtime)
 */
function initiate(hashlock, recipient, expiration, amountMutez, sender) {
  // === VALIDATION ===
  
  // 1. Validate hashlock format
  if (!isValidHashlock(hashlock)) {
    throw new Error('Invalid hashlock: must be 0x followed by exactly 64 hex characters');
  }
  
  // 2. Validate amount (from X-JSTZ-AMOUNT header, set by runtime)
  const amount = parseAmountMutez(amountMutez);
  if (amount < MIN_AMOUNT_MUTEZ) {
    throw new Error(`Insufficient amount: minimum is ${MIN_AMOUNT_MUTEZ} mutez (${mutezToXtz(MIN_AMOUNT_MUTEZ)} XTZ). Received: ${amount} mutez. Send tez with the transaction.`);
  }
  
  // 3. Validate expiration
  const exp = parseExpiration(expiration);
  if (!exp) {
    throw new Error('Invalid expiration: must be a valid Unix timestamp');
  }
  if (exp <= now()) {
    throw new Error('Expiration must be in the future');
  }
  
  // 4. Validate sender (from Referer header, set by runtime)
  if (!sender || sender === 'anonymous') {
    throw new Error('Sender address required (should be set by runtime via Referer)');
  }
  
  // 5. Validate recipient if provided
  if (recipient && !isValidAddress(recipient)) {
    throw new Error('Invalid recipient address format');
  }
  
  // 6. Check for duplicate
  const existing = getSwapFromKv(hashlock);
  if (existing) {
    throw new Error('Swap with this hashlock already exists');
  }
  
  // === CREATE SWAP ===
  const swap = {
    hashlock,
    sender,
    recipient: recipient || null,
    amountMutez: amount,
    amountXtz: mutezToXtz(amount),
    expiration: exp,
    status: SwapStatus.OPEN,
    createdAt: now()
  };
  
  saveSwapToKv(hashlock, swap);
  addSwapKey(hashlock);
  
  console.log(`[HTLC] Swap initiated: ${hashlock.substring(0, 16)}... by ${sender}`);
  console.log(`[HTLC] Amount locked: ${amount} mutez (${mutezToXtz(amount)} XTZ)`);
  
  return {
    success: true,
    event: 'SwapInitiated',
    data: swap,
    message: `Successfully locked ${mutezToXtz(amount)} XTZ`
  };
}

/**
 * CLAIM - Claim funds by revealing the secret
 * 
 * REAL TRANSFER: Sends tez to claimer via X-JSTZ-TRANSFER header in response
 * 
 * @param {string} hashlock - The hashlock of the swap to claim
 * @param {string} secret - The preimage that hashes to the hashlock
 * @param {string} claimer - Caller's address (from Referer header, set by runtime)
 * @returns {Response} - Response with X-JSTZ-TRANSFER header
 */
function claim(hashlock, secret, claimer) {
  // === VALIDATION ===
  
  // 1. Validate hashlock
  if (!isValidHashlock(hashlock)) {
    throw new Error('Invalid hashlock format');
  }
  
  // 2. Validate secret format
  if (!secret || typeof secret !== 'string') {
    throw new Error('Secret is required');
  }
  if (!isValidHashlock(secret)) {
    throw new Error('Invalid secret format: must be 0x + 64 hex chars');
  }
  
  // 3. Validate claimer
  if (!claimer || claimer === 'anonymous') {
    throw new Error('Claimer address required');
  }
  
  // 4. Get swap
  const swap = getSwapFromKv(hashlock);
  if (!swap) {
    throw new Error('Swap not found');
  }
  
  // 5. Check status
  if (swap.status !== SwapStatus.OPEN) {
    throw new Error(`Swap is ${swap.status}, cannot claim`);
  }
  
  // 6. Check expiration (cannot claim after expiry)
  if (now() >= swap.expiration) {
    throw new Error('Swap has expired, cannot claim');
  }
  
  // 7. CRITICAL: Verify secret matches hashlock
  const computedHash = hashSecret(secret);
  if (computedHash.toLowerCase() !== hashlock.toLowerCase()) {
    throw new Error('Invalid secret: hash does not match hashlock');
  }
  
  // 8. CRITICAL: Verify claimer authorization
  if (swap.recipient && swap.recipient !== claimer) {
    throw new Error('Only the designated recipient can claim this swap');
  }
  
  // === EXECUTE CLAIM ===
  swap.status = SwapStatus.CLAIMED;
  swap.claimedBy = claimer;
  swap.claimedAt = now();
  swap.revealedSecret = secret;
  
  saveSwapToKv(hashlock, swap);
  
  console.log(`[HTLC] Swap claimed: ${hashlock.substring(0, 16)}... by ${claimer}`);
  console.log(`[HTLC] Transferring ${swap.amountMutez} mutez to ${claimer}`);
  
  // Return response with transfer header
  // The runtime will execute the transfer when it sees X-JSTZ-TRANSFER
  return new Response(JSON.stringify({
    success: true,
    event: 'SwapClaimed',
    data: {
      hashlock,
      secret,
      claimedBy: claimer,
      amount: swap.amountXtz,
      amountMutez: swap.amountMutez
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      'X-JSTZ-TRANSFER': swap.amountMutez.toString()
    }
  });
}

/**
 * REFUND - Refund funds after timelock expires
 * 
 * REAL TRANSFER: Sends tez back to sender via X-JSTZ-TRANSFER header
 * 
 * @param {string} hashlock - The hashlock of the swap to refund
 * @param {string} refunder - Caller's address (from Referer header, set by runtime)
 * @returns {Response} - Response with X-JSTZ-TRANSFER header
 */
function refund(hashlock, refunder) {
  // === VALIDATION ===
  
  // 1. Validate hashlock
  if (!isValidHashlock(hashlock)) {
    throw new Error('Invalid hashlock format');
  }
  
  // 2. Validate refunder
  if (!refunder || refunder === 'anonymous') {
    throw new Error('Refunder address required');
  }
  
  // 3. Get swap
  const swap = getSwapFromKv(hashlock);
  if (!swap) {
    throw new Error('Swap not found');
  }
  
  // 4. Check status
  if (swap.status !== SwapStatus.OPEN) {
    throw new Error(`Swap is ${swap.status}, cannot refund`);
  }
  
  // 5. CRITICAL: Check expiration (can only refund AFTER expiry)
  if (now() < swap.expiration) {
    const remaining = swap.expiration - now();
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    throw new Error(`Cannot refund yet. Timelock expires in ${mins}m ${secs}s`);
  }
  
  // 6. CRITICAL: Only original sender can refund
  if (swap.sender !== refunder) {
    throw new Error('Only the original sender can refund this swap');
  }
  
  // === EXECUTE REFUND ===
  swap.status = SwapStatus.REFUNDED;
  swap.refundedAt = now();
  
  saveSwapToKv(hashlock, swap);
  
  console.log(`[HTLC] Swap refunded: ${hashlock.substring(0, 16)}... to ${refunder}`);
  console.log(`[HTLC] Transferring ${swap.amountMutez} mutez back to sender`);
  
  // Return response with transfer header
  return new Response(JSON.stringify({
    success: true,
    event: 'SwapRefunded',
    data: {
      hashlock,
      refundedTo: swap.sender,
      amount: swap.amountXtz,
      amountMutez: swap.amountMutez
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      'X-JSTZ-TRANSFER': swap.amountMutez.toString()
    }
  });
}

/**
 * GET SWAP - Retrieve swap details
 */
function getSwap(hashlock) {
  if (!isValidHashlock(hashlock)) {
    return { found: false, error: 'Invalid hashlock format' };
  }
  
  const swap = getSwapFromKv(hashlock);
  if (!swap) {
    return { found: false, error: 'Swap not found' };
  }
  
  // Don't reveal secret unless already claimed
  const safeSwap = { ...swap };
  if (swap.status !== SwapStatus.CLAIMED) {
    delete safeSwap.revealedSecret;
  }
  
  return { found: true, swap: safeSwap };
}

/**
 * LIST SWAPS - Get all swaps (paginated)
 */
function listSwaps(filterStatus = null, limit = MAX_SWAPS_LIST) {
  const keys = getAllSwapKeys(limit);
  const swaps = [];
  
  for (const hashlock of keys) {
    const swap = getSwapFromKv(hashlock);
    if (swap) {
      // Apply status filter if provided
      if (!filterStatus || swap.status === filterStatus) {
        // Don't reveal secrets
        const safeSwap = { ...swap };
        if (swap.status !== SwapStatus.CLAIMED) {
          delete safeSwap.revealedSecret;
        }
        swaps.push(safeSwap);
      }
    }
  }
  
  return swaps;
}

// ============================================
// REQUEST HANDLER
// ============================================

const handler = async (request) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  
  // Get caller identity from Referer header (set by Jstz runtime)
  // SECURITY: This header is injected by the runtime and cannot be spoofed
  const caller = request.headers.get('Referer') || 'anonymous';
  
  // Get amount received (from X-JSTZ-AMOUNT, set by runtime)
  // SECURITY: This header is set by runtime based on actual transaction amount
  const receivedAmountStr = request.headers.get('X-JSTZ-AMOUNT') || '0';
  const receivedAmount = parseAmountMutez(receivedAmountStr);
  
  console.log(`[HTLC] ${method} ${path} from ${caller}`);
  if (receivedAmount > 0) {
    console.log(`[HTLC] Received: ${receivedAmount} mutez`);
  }

  try {
    // Parse body for POST requests
    let body = {};
    if (method === 'POST') {
      try {
        const text = await request.text();
        if (text && text.trim()) {
          body = JSON.parse(text);
        }
      } catch (e) {
        console.log('[HTLC] No JSON body or parse error');
      }
    }

    // === ROUTING ===
    
    // Health check
    if (path === '/' || path === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        contract: 'HTLC',
        version: '2.0.0-hardened',
        timestamp: now(),
        securityModel: {
          identity: 'Referer header (runtime-injected, not spoofable)',
          transferIn: 'X-JSTZ-AMOUNT header (runtime-set)',
          transferOut: 'X-JSTZ-TRANSFER header (runtime-executed)'
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // INITIATE
    if (path === '/initiate' && method === 'POST') {
      const { hashlock, recipient, expiration } = body;
      const result = initiate(hashlock, recipient, expiration, receivedAmount, caller);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // CLAIM
    if (path === '/claim' && method === 'POST') {
      const { hashlock, secret } = body;
      // claim() returns a Response with X-JSTZ-TRANSFER header
      return claim(hashlock, secret, caller);
    }

    // REFUND
    if (path === '/refund' && method === 'POST') {
      const { hashlock } = body;
      // refund() returns a Response with X-JSTZ-TRANSFER header
      return refund(hashlock, caller);
    }

    // GET SWAP (GET or POST for Jstz CLI compatibility)
    if (path.startsWith('/swap/') && (method === 'GET' || method === 'POST')) {
      const hashlock = path.replace('/swap/', '');
      const result = getSwap(hashlock);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // LIST SWAPS (GET or POST for Jstz CLI compatibility)
    if (path === '/swaps' && (method === 'GET' || method === 'POST')) {
      const status = url.searchParams.get('status') || body?.status;
      const limit = Math.min(
        parseInt(url.searchParams.get('limit') || body?.limit || MAX_SWAPS_LIST), 
        MAX_SWAPS_LIST
      );
      const swaps = listSwaps(status, limit);
      return new Response(JSON.stringify(swaps), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 404
    return new Response(JSON.stringify({
      error: 'Not found',
      availableEndpoints: [
        'GET  /           - Health check & security model',
        'POST /initiate   - Create new swap (send tez with X-JSTZ-AMOUNT)',
        'POST /claim      - Claim swap with secret',
        'POST /refund     - Refund expired swap',
        'ANY  /swap/:hash - Get swap details by hashlock',
        'ANY  /swaps      - List swaps (optional: ?status=OPEN&limit=50)'
      ]
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.log('[HTLC] Error:', error.message);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export default handler;
