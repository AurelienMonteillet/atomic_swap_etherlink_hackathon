// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HTLC - Hashed Timelock Contract for Atomic Swaps (HARDENED v2.0)
 * @notice This contract enables TRUSTLESS cross-chain swaps between Etherlink and Jstz
 * @dev Uses SHA-256 for hashlock verification (cross-chain compatible with Jstz)
 * 
 * SECURITY MODEL:
 * ===============
 * - NO ADMIN BACKDOORS: emergencyWithdraw removed for true trustlessness
 * - TIMELOCK ENFORCED: claim blocked after expiration (aligned with Jstz)
 * - SECRET FORMAT: 32 bytes required (aligned with Jstz 0x + 64 hex)
 * - REENTRANCY SAFE: status updated before external calls
 * 
 * CROSS-CHAIN COMPATIBILITY:
 * - Secret: 32 bytes raw (= 0x + 64 hex on Jstz)
 * - Hashlock: SHA-256(secret)
 * - Same secret works on both chains
 */
contract HTLC {
    // Status enum - aligned with Jstz (OPEN, CLAIMED, REFUNDED)
    enum SwapStatus { OPEN, CLAIMED, REFUNDED }

    struct SwapDetails {
        address recipient;
        address payable sender;
        uint256 amount;
        uint256 expiration;
        bytes32 hashLock;
        SwapStatus status;
    }

    mapping(bytes32 => SwapDetails) public swaps;

    // Events
    event SwapInitiated(
        bytes32 indexed swapId,
        address payable sender,
        address recipient,
        uint256 amount,
        bytes32 hashLock,
        uint256 expiration
    );
    
    event SwapClaimed(
        bytes32 indexed swapId,
        address claimer,
        address recipient,
        bytes secret
    );
    
    event SwapRefunded(
        bytes32 indexed swapId,
        address sender,
        uint256 amount
    );

    // Errors
    error ExpirationMustBeInFuture();
    error AmountMustBeGreaterThanZero();
    error SwapAlreadyExists();
    error SwapDoesNotExist();
    error SwapNotOpen();
    error IncorrectSecretLength();      // NEW: secret must be 32 bytes
    error IncorrectHashLock();
    error SwapExpired();                // NEW: claim blocked after expiration
    error SwapNotExpiredYet();
    error OnlySenderCanRefund();
    error UnauthorizedClaimer();        // NEW: only designated recipient can claim
    error TransferFailed();

    modifier futureExpiration(uint256 time) {
        if (time <= block.timestamp) revert ExpirationMustBeInFuture();
        _;
    }

    modifier swapExists(bytes32 swapId) {
        if (!_swapExists(swapId)) revert SwapDoesNotExist();
        _;
    }

    modifier swapIsOpen(bytes32 swapId) {
        if (swaps[swapId].status != SwapStatus.OPEN) revert SwapNotOpen();
        _;
    }

    /**
     * @notice Initiate a new atomic swap
     * @param recipient The address that can claim the funds (use address(0) for open swaps)
     * @param hashLock The SHA-256 hash of the 32-byte secret
     * @param expiration Unix timestamp when the swap expires
     * @return swapId The unique identifier for this swap (same as hashLock)
     */
    function initiateSwap(
        address recipient,
        bytes32 hashLock,
        uint256 expiration
    ) 
        external 
        payable 
        futureExpiration(expiration) 
        returns (bytes32 swapId) 
    {
        if (msg.value == 0) revert AmountMustBeGreaterThanZero();
        
        swapId = hashLock;
        
        if (_swapExists(swapId)) revert SwapAlreadyExists();

        swaps[swapId] = SwapDetails({
            recipient: recipient,
            sender: payable(msg.sender),
            amount: msg.value,
            expiration: expiration,
            hashLock: hashLock,
            status: SwapStatus.OPEN
        });

        emit SwapInitiated(
            swapId,
            payable(msg.sender),
            recipient,
            msg.value,
            hashLock,
            expiration
        );
    }

    /**
     * @notice Claim funds by revealing the secret
     * @dev Secret must be exactly 32 bytes (matches Jstz 0x + 64 hex format)
     * @dev Claim is BLOCKED after expiration (aligned with Jstz)
     * @param swapId The swap identifier (hashLock)
     * @param secret The 32-byte preimage that hashes to the hashLock
     * @return success True if claim was successful
     */
    function claimSwap(
        bytes32 swapId, 
        bytes calldata secret
    ) 
        external 
        swapExists(swapId) 
        swapIsOpen(swapId)
        returns (bool success) 
    {
        SwapDetails storage swap = swaps[swapId];
        
        // 1. SECURITY: Block claim after expiration (aligned with Jstz)
        if (block.timestamp >= swap.expiration) revert SwapExpired();
        
        // 2. SECURITY: Secret must be exactly 32 bytes (aligned with Jstz)
        if (secret.length != 32) revert IncorrectSecretLength();
        
        // 3. Verify the secret using SHA-256 (cross-chain compatible)
        if (sha256(secret) != swap.hashLock) revert IncorrectHashLock();
        
        // 4. SECURITY: If recipient is specified, only that address can claim
        if (swap.recipient != address(0) && msg.sender != swap.recipient) {
            revert UnauthorizedClaimer();
        }
        
        // 5. Update status before transfer (reentrancy protection)
        swap.status = SwapStatus.CLAIMED;
        
        // 6. Determine recipient
        address payable claimRecipient;
        if (swap.recipient == address(0)) {
            claimRecipient = payable(msg.sender);
            swap.recipient = msg.sender;
        } else {
            claimRecipient = payable(swap.recipient);
        }
        
        // 6. Transfer funds
        (bool sent, ) = claimRecipient.call{value: swap.amount}("");
        if (!sent) revert TransferFailed();
        
        emit SwapClaimed(swapId, msg.sender, claimRecipient, secret);
        
        return true;
    }

    /**
     * @notice Refund funds to sender after expiration
     * @param swapId The swap identifier (hashLock)
     * @return success True if refund was successful
     */
    function refundSwap(bytes32 swapId) 
        external 
        swapExists(swapId) 
        swapIsOpen(swapId)
        returns (bool success) 
    {
        SwapDetails storage swap = swaps[swapId];
        
        // 1. Check expiration has passed
        if (block.timestamp < swap.expiration) revert SwapNotExpiredYet();
        
        // 2. Only sender can refund
        if (msg.sender != swap.sender) revert OnlySenderCanRefund();
        
        // 3. Update status before transfer (reentrancy protection)
        swap.status = SwapStatus.REFUNDED;  // Renamed from EXPIRED for consistency
        
        // 4. Transfer funds back to sender
        (bool sent, ) = swap.sender.call{value: swap.amount}("");
        if (!sent) revert TransferFailed();
        
        emit SwapRefunded(swapId, swap.sender, swap.amount);
        
        return true;
    }

    /**
     * @notice Get swap details
     * @param swapId The swap identifier
     * @return recipient The designated recipient
     * @return sender The swap initiator
     * @return amount The locked amount
     * @return expiration The expiration timestamp
     * @return hashLock The hashlock
     * @return status The current status (OPEN=0, CLAIMED=1, REFUNDED=2)
     */
    function getSwap(bytes32 swapId) 
        external 
        view 
        returns (
            address recipient,
            address sender,
            uint256 amount,
            uint256 expiration,
            bytes32 hashLock,
            SwapStatus status
        ) 
    {
        SwapDetails storage swap = swaps[swapId];
        return (
            swap.recipient,
            swap.sender,
            swap.amount,
            swap.expiration,
            swap.hashLock,
            swap.status
        );
    }

    /**
     * @notice Check if a swap exists
     * @param swapId The swap identifier
     * @return exists True if the swap exists
     */
    function swapPresent(bytes32 swapId) external view returns (bool exists) {
        return _swapExists(swapId);
    }

    /**
     * @dev Internal function to check swap existence
     */
    function _swapExists(bytes32 swapId) internal view returns (bool) {
        return swaps[swapId].sender != address(0);
    }

    /**
     * @notice Get contract balance
     * @dev For transparency - anyone can verify locked funds
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Accept direct transfers (for funding)
     */
    receive() external payable {}
}
