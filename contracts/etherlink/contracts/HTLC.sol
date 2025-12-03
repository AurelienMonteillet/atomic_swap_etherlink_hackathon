// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HTLC - Hashed Timelock Contract for Atomic Swaps
 * @notice This contract enables trustless cross-chain swaps between Etherlink and Jstz
 * @dev Uses SHA-256 for hashlock verification (cross-chain compatible with Jstz)
 */
contract HTLC {
    address private immutable contractOwner;

    enum SwapStatus { OPEN, CLAIMED, EXPIRED }

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
        bytes secret
    );
    
    event SwapRefunded(
        bytes32 indexed swapId,
        address sender,
        uint256 amount
    );

    // Errors
    error CallerNotOwner();
    error ExpirationMustBeInFuture();
    error AmountMustBeGreaterThanZero();
    error SwapAlreadyExists();
    error SwapDoesNotExist();
    error SwapNotOpen();
    error IncorrectHashLock();
    error SwapNotExpiredYet();
    error OnlySenderCanRefund();
    error TransferFailed();

    constructor() {
        contractOwner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != contractOwner) revert CallerNotOwner();
        _;
    }

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
     * @param hashLock The SHA-256 hash of the secret
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
     * @param swapId The swap identifier (hashLock)
     * @param secret The preimage that hashes to the hashLock
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
        
        // Verify the secret using SHA-256 (cross-chain compatible)
        if (sha256(secret) != swap.hashLock) revert IncorrectHashLock();
        
        // Update status before transfer (reentrancy protection)
        swap.status = SwapStatus.CLAIMED;
        
        // Determine recipient
        address payable claimRecipient;
        if (swap.recipient == address(0)) {
            claimRecipient = payable(msg.sender);
            swap.recipient = msg.sender;
        } else {
            claimRecipient = payable(swap.recipient);
        }
        
        // Transfer funds
        (bool sent, ) = claimRecipient.call{value: swap.amount}("");
        if (!sent) revert TransferFailed();
        
        emit SwapClaimed(swapId, msg.sender, secret);
        
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
        
        if (block.timestamp < swap.expiration) revert SwapNotExpiredYet();
        if (msg.sender != swap.sender) revert OnlySenderCanRefund();
        
        // Update status before transfer (reentrancy protection)
        swap.status = SwapStatus.EXPIRED;
        
        // Transfer funds back to sender
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
     * @return status The current status
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
     * @notice Emergency withdrawal (owner only)
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        (bool sent, ) = payable(contractOwner).call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    /**
     * @notice Get contract balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}

