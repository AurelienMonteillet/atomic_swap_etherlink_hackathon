/**
 * HTLC Smart Function for Jstz
 * Hashed Timelock Contract for Atomic Swaps
 * 
 * This smart function enables trustless cross-chain swaps between
 * Etherlink and Jstz using hash time-locked contracts.
 */

// In-memory storage for swaps (in production, use Jstz's persistent storage)
const swaps = new Map();

// Status enum
const SwapStatus = {
  OPEN: 'OPEN',
  CLAIMED: 'CLAIMED',
  EXPIRED: 'EXPIRED'
};

/**
 * Helper: Get current timestamp in seconds
 */
function now() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Helper: Hash a secret using keccak256
 * Jstz provides crypto APIs similar to Web Crypto
 */
async function keccak256(data) {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
  
  // Use SubtleCrypto for hashing (SHA-256 as fallback, ideally keccak256)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Helper: Convert hex string to bytes
 */
function hexToBytes(hex) {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Helper: Validate address format
 */
function isValidAddress(address) {
  // Jstz addresses start with 'tz' or could be account identifiers
  return address && (address.startsWith('tz') || address.startsWith('jstz://'));
}

/**
 * INITIATE - Lock funds with a hashlock
 * 
 * @param {string} hashlock - The keccak256 hash of the secret
 * @param {string} recipient - Optional recipient address (can be null for open swaps)
 * @param {number} expiration - Unix timestamp when the swap expires
 * @param {number} amount - Amount to lock (in mutez)
 * @param {string} sender - The sender's address
 */
async function initiate(hashlock, recipient, expiration, amount, sender) {
  // Validations
  if (!hashlock || hashlock.length !== 66) {
    throw new Error('Invalid hashlock: must be a 32-byte hex string (0x...)');
  }
  
  if (amount <= 0) {
    throw new Error('AMOUNT_MUST_BE_GREATER_THAN_0');
  }
  
  if (expiration <= now()) {
    throw new Error('EXPIRATION_MUST_BE_IN_FUTURE');
  }
  
  if (swaps.has(hashlock)) {
    throw new Error('SWAP_ALREADY_EXISTS');
  }
  
  // Create the swap
  const swap = {
    hashlock,
    sender,
    recipient: recipient || null,
    amount,
    expiration,
    status: SwapStatus.OPEN,
    createdAt: now()
  };
  
  swaps.set(hashlock, swap);
  
  return {
    success: true,
    event: 'SwapInitiated',
    data: {
      hashlock,
      sender,
      recipient,
      amount,
      expiration,
      status: SwapStatus.OPEN
    }
  };
}

/**
 * CLAIM - Claim funds by revealing the secret
 * 
 * @param {string} hashlock - The hashlock identifying the swap
 * @param {string} secret - The preimage that hashes to the hashlock
 * @param {string} claimer - The address claiming the funds
 */
async function claim(hashlock, secret, claimer) {
  const swap = swaps.get(hashlock);
  
  if (!swap) {
    throw new Error('SWAP_NOT_FOUND');
  }
  
  if (swap.status !== SwapStatus.OPEN) {
    throw new Error('SWAP_CLAIMED_OR_EXPIRED');
  }
  
  if (now() >= swap.expiration) {
    throw new Error('SWAP_EXPIRED');
  }
  
  // Verify the secret matches the hashlock
  const computedHash = await keccak256(secret);
  if (computedHash.toLowerCase() !== hashlock.toLowerCase()) {
    throw new Error('BAD_HASHLOCK: Secret does not match hashlock');
  }
  
  // If recipient is specified, verify claimer is the recipient
  if (swap.recipient && swap.recipient !== claimer) {
    throw new Error('UNAUTHORIZED: Only designated recipient can claim');
  }
  
  // Update swap status
  swap.status = SwapStatus.CLAIMED;
  swap.claimedBy = claimer;
  swap.claimedAt = now();
  swap.revealedSecret = secret;
  
  swaps.set(hashlock, swap);
  
  // In a real implementation, transfer funds here
  // Kv.transfer(swap.recipient || claimer, swap.amount);
  
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
 * 
 * @param {string} hashlock - The hashlock identifying the swap
 * @param {string} refunder - The address requesting the refund
 */
async function refund(hashlock, refunder) {
  const swap = swaps.get(hashlock);
  
  if (!swap) {
    throw new Error('SWAP_NOT_FOUND');
  }
  
  if (swap.status !== SwapStatus.OPEN) {
    throw new Error('SWAP_ALREADY_CLAIMED_OR_REFUNDED');
  }
  
  if (now() < swap.expiration) {
    throw new Error('SWAP_NOT_EXPIRED_YET');
  }
  
  if (swap.sender !== refunder) {
    throw new Error('UNAUTHORIZED: Only sender can refund');
  }
  
  // Update swap status
  swap.status = SwapStatus.EXPIRED;
  swap.refundedAt = now();
  
  swaps.set(hashlock, swap);
  
  // In a real implementation, transfer funds back to sender
  // Kv.transfer(swap.sender, swap.amount);
  
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
 * 
 * @param {string} hashlock - The hashlock identifying the swap
 */
function getSwap(hashlock) {
  const swap = swaps.get(hashlock);
  
  if (!swap) {
    return { found: false };
  }
  
  // Don't expose the secret in queries (only visible after claim)
  const safeSwap = { ...swap };
  if (swap.status !== SwapStatus.CLAIMED) {
    delete safeSwap.revealedSecret;
  }
  
  return {
    found: true,
    swap: safeSwap
  };
}

/**
 * LIST_SWAPS - List all swaps (for debugging/demo)
 */
function listSwaps() {
  const allSwaps = [];
  for (const [hashlock, swap] of swaps) {
    allSwaps.push({ hashlock, ...swap });
  }
  return allSwaps;
}

/**
 * Main handler for Jstz smart function
 * Routes HTTP requests to appropriate functions
 */
export default async function handler(request) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;
  
  try {
    // Parse request body for POST requests
    let body = {};
    if (method === 'POST' && request.body) {
      body = await request.json();
    }
    
    // Get caller identity from Jstz headers
    const caller = request.headers.get('X-Jstz-Caller') || 'unknown';
    
    // Route handling
    if (method === 'POST' && path === '/initiate') {
      const { hashlock, recipient, expiration, amount } = body;
      const result = await initiate(hashlock, recipient, expiration, amount, caller);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (method === 'POST' && path === '/claim') {
      const { hashlock, secret } = body;
      const result = await claim(hashlock, secret, caller);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (method === 'POST' && path === '/refund') {
      const { hashlock } = body;
      const result = await refund(hashlock, caller);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (method === 'GET' && path.startsWith('/swap/')) {
      const hashlock = path.replace('/swap/', '');
      const result = getSwap(hashlock);
      return new Response(JSON.stringify(result), {
        status: result.found ? 200 : 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (method === 'GET' && path === '/swaps') {
      const result = listSwaps();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Health check
    if (method === 'GET' && (path === '/' || path === '/health')) {
      return new Response(JSON.stringify({
        name: 'HTLC Atomic Swap',
        version: '1.0.0',
        status: 'healthy',
        endpoints: [
          'POST /initiate - Lock funds with hashlock',
          'POST /claim - Claim funds with secret',
          'POST /refund - Refund expired swap',
          'GET /swap/:hashlock - Get swap details',
          'GET /swaps - List all swaps'
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 404 for unknown routes
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

