/**
 * HTLC Smart Function for Jstz
 * Hashed Timelock Contract for Atomic Swaps
 * 
 * This smart function enables trustless cross-chain swaps between
 * Etherlink and Jstz using hash time-locked contracts.
 */

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
  // Use hashlock without 0x prefix as key
  const key = hashlock.startsWith('0x') ? hashlock.slice(2) : hashlock;
  const data = Kv.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Helper: Save swap to Kv storage
 */
function saveSwapToKv(hashlock, swap) {
  // Use hashlock without 0x prefix as key
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
 * Helper: Hash a secret using SHA-256 (Jstz compatible)
 * Note: For full cross-chain compatibility with Ethereum/Etherlink,
 * keccak256 should be used. SHA-256 is used here as it's natively
 * available in Jstz via crypto.subtle.
 */
async function hashSecret(secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * INITIATE - Lock funds with a hashlock
 */
async function initiate(hashlock, recipient, expiration, amount, sender) {
  // Validations
  if (!hashlock || hashlock.length !== 66) {
    throw new Error('Invalid hashlock: must be 0x + 64 hex chars');
  }
  
  if (!amount || parseFloat(amount) <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  
  if (expiration <= now()) {
    throw new Error('Expiration must be in the future');
  }
  
  const existing = getSwapFromKv(hashlock);
  if (existing) {
    throw new Error('Swap with this hashlock already exists');
  }
  
  // Create the swap
  const swap = {
    hashlock,
    sender,
    recipient: recipient || null,
    amount: parseFloat(amount),
    expiration,
    status: SwapStatus.OPEN,
    createdAt: now()
  };
  
  saveSwapToKv(hashlock, swap);
  addSwapKey(hashlock);
  
  console.log(`[HTLC] Swap initiated: ${hashlock.substring(0, 16)}... by ${sender}`);
  
  return {
    success: true,
    event: 'SwapInitiated',
    data: swap
  };
}

/**
 * CLAIM - Claim funds by revealing the secret
 * CRITICAL: This function verifies the secret matches the hashlock
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
  
  // CRITICAL SECURITY CHECK: Verify the secret matches the hashlock
  const computedHash = await hashSecret(secret);
  
  console.log(`[HTLC] Claim attempt - computed: ${computedHash}, expected: ${hashlock}`);
  
  // Verify hash matches (case-insensitive comparison)
  if (computedHash.toLowerCase() !== hashlock.toLowerCase()) {
    console.log(`[HTLC] SECURITY: Invalid secret provided! Hash mismatch.`);
    throw new Error('Invalid secret: hash does not match hashlock');
  }
  
  console.log(`[HTLC] Secret verified successfully!`);
  
  // Update swap status
  swap.status = SwapStatus.CLAIMED;
  swap.claimedBy = claimer;
  swap.claimedAt = now();
  swap.revealedSecret = secret;
  
  saveSwapToKv(hashlock, swap);
  
  console.log(`[HTLC] Swap claimed: ${hashlock.substring(0, 16)}... by ${claimer}`);
  
  return {
    success: true,
    event: 'SwapClaimed',
    data: {
      hashlock,
      secret,
      claimedBy: claimer,
      amount: swap.amount
    }
  };
}

/**
 * REFUND - Refund funds to sender after expiration
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
    throw new Error('Swap not yet expired');
  }
  
  if (swap.sender !== refunder) {
    throw new Error('Only sender can refund');
  }
  
  // Update swap status
  swap.status = SwapStatus.REFUNDED;
  swap.refundedAt = now();
  
  saveSwapToKv(hashlock, swap);
  
  console.log(`[HTLC] Swap refunded: ${hashlock.substring(0, 16)}... to ${refunder}`);
  
  return {
    success: true,
    event: 'SwapRefunded',
    data: {
      hashlock,
      refundedTo: swap.sender,
      amount: swap.amount
    }
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
  
  // Don't expose secret until claimed
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
 */
const handler = async (request) => {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.toLowerCase();
  
  // Get caller from Referer header (Jstz standard)
  const caller = request.headers.get('Referer') || 'anonymous';
  
  console.log(`[HTLC] ${method} ${path} from ${caller}`);
  
  try {
    // Parse body for POST requests only (GET cannot have body)
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
    
    // Route: POST /initiate
    if (method === 'POST' && path === '/initiate') {
      const { hashlock, recipient, expiration, amount } = body;
      const result = await initiate(hashlock, recipient, expiration, amount, caller);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Route: POST /claim
    if (method === 'POST' && path === '/claim') {
      const { hashlock, secret } = body;
      const result = await claim(hashlock, secret, caller);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Route: POST /refund
    if (method === 'POST' && path === '/refund') {
      const { hashlock } = body;
      const result = await refund(hashlock, caller);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Route: GET/POST /swap/:hashlock
    if (path.startsWith('/swap/')) {
      const hashlock = path.replace('/swap/', '');
      const result = getSwap(hashlock);
      return new Response(JSON.stringify(result), {
        status: result.found ? 200 : 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Route: POST /getswap (alternative for CLI)
    if (method === 'POST' && path === '/getswap') {
      const { hashlock } = body;
      const result = getSwap(hashlock);
      return new Response(JSON.stringify(result), {
        status: result.found ? 200 : 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Route: GET/POST /swaps
    if (path === '/swaps') {
      const result = listSwaps();
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Route: GET/POST / (health check)
    if (path === '/' || path === '/health') {
      return new Response(JSON.stringify({
        name: 'HTLC Atomic Swap - Jstz',
        version: '1.0.1',
        status: 'healthy',
        security: 'Hash verification enabled',
        endpoints: [
          'POST /initiate - Lock funds',
          'POST /claim - Claim with secret (verified)',
          'POST /refund - Refund after expiration',
          'GET /swap/:hashlock - Get swap details',
          'GET /swaps - List all swaps'
        ]
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 404
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.log(`[HTLC] Error: ${error.message}`);
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
