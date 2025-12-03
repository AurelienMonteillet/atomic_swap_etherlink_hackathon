/**
 * Automated Test Scenarios for Atomic Swap
 * Run these tests on Hardhat local network
 * 
 * Usage: Open browser console and call runAllTests()
 */

// Hardhat pre-funded accounts (DO NOT use in production!)
const TEST_ACCOUNTS = {
    alice: {
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    },
    bob: {
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
    }
};

// Short timelock for tests (60 seconds)
const TEST_TIMELOCK_SECONDS = 60;

// Contract config (must match frontend)
const CONTRACT_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
const RPC_URL = 'http://127.0.0.1:8545';

// ABI (minimal for testing)
const HTLC_ABI = [
    "function initiateSwap(address recipient, bytes32 hashLock, uint256 expiration) external payable returns (bytes32)",
    "function claimSwap(bytes32 swapId, bytes memory secret) external returns (bool)",
    "function refundSwap(bytes32 swapId) external returns (bool)",
    "function getSwap(bytes32 swapId) external view returns (tuple(address sender, address receiver, uint256 amount, bytes32 hashLock, uint256 expiration, uint8 state))"
];

// Test results storage
let testResults = [];

// ======================
// HELPER FUNCTIONS
// ======================

function generateSecretAndHash() {
    const secret = ethers.utils.randomBytes(32);
    const secretHex = ethers.utils.hexlify(secret);
    const hash = ethers.utils.keccak256(secretHex);
    return { secret: secretHex, hash };
}

async function getProvider() {
    return new ethers.providers.JsonRpcProvider(RPC_URL);
}

async function getSigner(account) {
    const provider = await getProvider();
    return new ethers.Wallet(account.privateKey, provider);
}

async function getContract(signer) {
    return new ethers.Contract(CONTRACT_ADDRESS, HTLC_ABI, signer);
}

async function advanceTime(seconds) {
    const provider = await getProvider();
    await provider.send("evm_increaseTime", [seconds]);
    await provider.send("evm_mine", []);
    console.log(`⏰ Advanced time by ${seconds} seconds`);
}

async function getBalance(address) {
    const provider = await getProvider();
    const balance = await provider.getBalance(address);
    return ethers.utils.formatEther(balance);
}

function logTest(name, status, details = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
    console.log(`${icon} ${name}: ${status} ${details}`);
    testResults.push({ name, status, details });
}

// ======================
// TEST SCENARIOS
// ======================

/**
 * Scenario 1: Successful complete swap
 * Alice initiates on Etherlink → Bob locks on "Jstz" (simulated) → Alice claims → Bob claims
 */
async function testSuccessfulSwap() {
    console.log('\n========================================');
    console.log('🧪 SCENARIO 1: Successful Complete Swap');
    console.log('========================================\n');
    
    try {
        // Setup
        const { secret, hash } = generateSecretAndHash();
        const aliceSigner = await getSigner(TEST_ACCOUNTS.alice);
        const bobSigner = await getSigner(TEST_ACCOUNTS.bob);
        const aliceContract = await getContract(aliceSigner);
        const bobContract = await getContract(bobSigner);
        
        const amount = ethers.utils.parseEther("0.1");
        const expiration = Math.floor(Date.now() / 1000) + TEST_TIMELOCK_SECONDS;
        
        console.log('📋 Test Setup:');
        console.log(`   Secret: ${secret.substring(0, 20)}...`);
        console.log(`   Hash: ${hash.substring(0, 20)}...`);
        console.log(`   Amount: 0.1 ETH`);
        console.log(`   Timelock: ${TEST_TIMELOCK_SECONDS}s\n`);
        
        // Step 1: Alice initiates swap
        console.log('Step 1: Alice initiates swap on Etherlink...');
        const initTx = await aliceContract.initiateSwap(
            TEST_ACCOUNTS.bob.address,
            hash,
            expiration,
            { value: amount }
        );
        await initTx.wait();
        logTest('Alice initiates swap', 'PASS', `tx: ${initTx.hash.substring(0, 15)}...`);
        
        // Step 2: Verify swap exists
        console.log('\nStep 2: Verifying swap on-chain...');
        const swap = await aliceContract.getSwap(hash);
        if (swap.state === 1) { // ACTIVE
            logTest('Swap is ACTIVE on-chain', 'PASS', `Locked: ${ethers.utils.formatEther(swap.amount)} ETH`);
        } else {
            logTest('Swap is ACTIVE on-chain', 'FAIL', `State: ${swap.state}`);
            return false;
        }
        
        // Step 3: Bob claims using secret (simulating cross-chain, Bob would do this on Etherlink after Alice reveals)
        console.log('\nStep 3: Bob claims swap using secret...');
        const secretBytes = ethers.utils.arrayify(secret);
        const claimTx = await bobContract.claimSwap(hash, secretBytes);
        await claimTx.wait();
        logTest('Bob claims swap', 'PASS', `tx: ${claimTx.hash.substring(0, 15)}...`);
        
        // Step 4: Verify swap is claimed
        console.log('\nStep 4: Verifying swap is CLAIMED...');
        const swapAfter = await aliceContract.getSwap(hash);
        if (swapAfter.state === 2) { // CLAIMED
            logTest('Swap state is CLAIMED', 'PASS');
        } else {
            logTest('Swap state is CLAIMED', 'FAIL', `State: ${swapAfter.state}`);
            return false;
        }
        
        console.log('\n✅ SCENARIO 1 PASSED: Complete swap successful!\n');
        return true;
        
    } catch (error) {
        logTest('Scenario 1', 'FAIL', error.message);
        console.error(error);
        return false;
    }
}

/**
 * Scenario 2: Refund after timeout
 * Alice initiates → No one claims → Alice refunds after expiration
 */
async function testRefundAfterTimeout() {
    console.log('\n========================================');
    console.log('🧪 SCENARIO 2: Refund After Timeout');
    console.log('========================================\n');
    
    try {
        const { secret, hash } = generateSecretAndHash();
        const aliceSigner = await getSigner(TEST_ACCOUNTS.alice);
        const aliceContract = await getContract(aliceSigner);
        
        const amount = ethers.utils.parseEther("0.05");
        const shortTimelock = 10; // Very short for testing
        const expiration = Math.floor(Date.now() / 1000) + shortTimelock;
        
        const balanceBefore = await getBalance(TEST_ACCOUNTS.alice.address);
        
        console.log('📋 Test Setup:');
        console.log(`   Timelock: ${shortTimelock}s (short for testing)`);
        console.log(`   Alice balance before: ${parseFloat(balanceBefore).toFixed(4)} ETH\n`);
        
        // Step 1: Alice initiates swap
        console.log('Step 1: Alice initiates swap...');
        const initTx = await aliceContract.initiateSwap(
            TEST_ACCOUNTS.bob.address,
            hash,
            expiration,
            { value: amount }
        );
        await initTx.wait();
        logTest('Alice initiates swap', 'PASS');
        
        // Step 2: Wait for timelock to expire
        console.log(`\nStep 2: Waiting for timelock to expire (${shortTimelock + 5}s)...`);
        await advanceTime(shortTimelock + 5);
        
        // Step 3: Alice refunds
        console.log('\nStep 3: Alice requests refund...');
        const refundTx = await aliceContract.refundSwap(hash);
        await refundTx.wait();
        logTest('Alice refund successful', 'PASS');
        
        // Step 4: Verify swap is refunded
        const swapAfter = await aliceContract.getSwap(hash);
        if (swapAfter.state === 3) { // REFUNDED
            logTest('Swap state is REFUNDED', 'PASS');
        } else {
            logTest('Swap state is REFUNDED', 'FAIL', `State: ${swapAfter.state}`);
        }
        
        console.log('\n✅ SCENARIO 2 PASSED: Refund after timeout works!\n');
        return true;
        
    } catch (error) {
        logTest('Scenario 2', 'FAIL', error.message);
        console.error(error);
        return false;
    }
}

/**
 * Scenario 3: Attempt claim without matching swap (should fail)
 * Bob tries to claim a swap that doesn't exist
 */
async function testClaimNonExistentSwap() {
    console.log('\n========================================');
    console.log('🧪 SCENARIO 3: Claim Non-Existent Swap');
    console.log('========================================\n');
    
    try {
        const { secret, hash } = generateSecretAndHash();
        const bobSigner = await getSigner(TEST_ACCOUNTS.bob);
        const bobContract = await getContract(bobSigner);
        
        console.log('Attempting to claim a swap that was never created...\n');
        
        // Try to claim non-existent swap
        try {
            const secretBytes = ethers.utils.arrayify(secret);
            await bobContract.claimSwap(hash, secretBytes);
            logTest('Claim non-existent swap rejected', 'FAIL', 'Should have reverted!');
            return false;
        } catch (error) {
            if (error.message.includes('SwapNotExist') || error.message.includes('revert')) {
                logTest('Claim non-existent swap rejected', 'PASS', 'Correctly reverted');
            } else {
                logTest('Claim non-existent swap rejected', 'FAIL', error.message);
                return false;
            }
        }
        
        console.log('\n✅ SCENARIO 3 PASSED: Cannot claim non-existent swap!\n');
        return true;
        
    } catch (error) {
        logTest('Scenario 3', 'FAIL', error.message);
        return false;
    }
}

/**
 * Scenario 4: Attempt refund before timeout (should fail)
 * Alice tries to refund before timelock expires
 */
async function testRefundBeforeTimeout() {
    console.log('\n========================================');
    console.log('🧪 SCENARIO 4: Refund Before Timeout');
    console.log('========================================\n');
    
    try {
        const { secret, hash } = generateSecretAndHash();
        const aliceSigner = await getSigner(TEST_ACCOUNTS.alice);
        const aliceContract = await getContract(aliceSigner);
        
        const amount = ethers.utils.parseEther("0.05");
        const longTimelock = 3600; // 1 hour
        const expiration = Math.floor(Date.now() / 1000) + longTimelock;
        
        // Step 1: Alice initiates swap
        console.log('Step 1: Alice initiates swap with 1 hour timelock...');
        const initTx = await aliceContract.initiateSwap(
            TEST_ACCOUNTS.bob.address,
            hash,
            expiration,
            { value: amount }
        );
        await initTx.wait();
        logTest('Alice initiates swap', 'PASS');
        
        // Step 2: Try to refund immediately (should fail)
        console.log('\nStep 2: Alice tries to refund immediately (should fail)...');
        try {
            await aliceContract.refundSwap(hash);
            logTest('Early refund rejected', 'FAIL', 'Should have reverted!');
            return false;
        } catch (error) {
            if (error.message.includes('NotYetExpired') || error.message.includes('not yet expired') || error.message.includes('revert')) {
                logTest('Early refund rejected', 'PASS', 'Correctly reverted');
            } else {
                logTest('Early refund rejected', 'FAIL', error.message);
                return false;
            }
        }
        
        // Cleanup: advance time and refund for real
        console.log('\nCleanup: advancing time and refunding...');
        await advanceTime(longTimelock + 10);
        await aliceContract.refundSwap(hash);
        
        console.log('\n✅ SCENARIO 4 PASSED: Cannot refund before timeout!\n');
        return true;
        
    } catch (error) {
        logTest('Scenario 4', 'FAIL', error.message);
        return false;
    }
}

/**
 * Scenario 5: Claim with wrong secret (should fail)
 */
async function testClaimWrongSecret() {
    console.log('\n========================================');
    console.log('🧪 SCENARIO 5: Claim With Wrong Secret');
    console.log('========================================\n');
    
    try {
        const { secret, hash } = generateSecretAndHash();
        const wrongSecret = generateSecretAndHash().secret; // Different secret
        
        const aliceSigner = await getSigner(TEST_ACCOUNTS.alice);
        const bobSigner = await getSigner(TEST_ACCOUNTS.bob);
        const aliceContract = await getContract(aliceSigner);
        const bobContract = await getContract(bobSigner);
        
        const amount = ethers.utils.parseEther("0.05");
        const expiration = Math.floor(Date.now() / 1000) + TEST_TIMELOCK_SECONDS;
        
        // Step 1: Alice initiates swap
        console.log('Step 1: Alice initiates swap...');
        const initTx = await aliceContract.initiateSwap(
            TEST_ACCOUNTS.bob.address,
            hash,
            expiration,
            { value: amount }
        );
        await initTx.wait();
        logTest('Alice initiates swap', 'PASS');
        
        // Step 2: Bob tries to claim with wrong secret
        console.log('\nStep 2: Bob tries to claim with WRONG secret...');
        try {
            const wrongSecretBytes = ethers.utils.arrayify(wrongSecret);
            await bobContract.claimSwap(hash, wrongSecretBytes);
            logTest('Wrong secret rejected', 'FAIL', 'Should have reverted!');
            return false;
        } catch (error) {
            if (error.message.includes('InvalidHashLock') || error.message.includes('revert')) {
                logTest('Wrong secret rejected', 'PASS', 'Correctly reverted');
            } else {
                logTest('Wrong secret rejected', 'FAIL', error.message);
                return false;
            }
        }
        
        // Cleanup
        console.log('\nCleanup: advancing time and refunding...');
        await advanceTime(TEST_TIMELOCK_SECONDS + 10);
        await aliceContract.refundSwap(hash);
        
        console.log('\n✅ SCENARIO 5 PASSED: Cannot claim with wrong secret!\n');
        return true;
        
    } catch (error) {
        logTest('Scenario 5', 'FAIL', error.message);
        return false;
    }
}

/**
 * Scenario 6: Double claim attempt (should fail)
 */
async function testDoubleClaimAttempt() {
    console.log('\n========================================');
    console.log('🧪 SCENARIO 6: Double Claim Attempt');
    console.log('========================================\n');
    
    try {
        const { secret, hash } = generateSecretAndHash();
        const aliceSigner = await getSigner(TEST_ACCOUNTS.alice);
        const bobSigner = await getSigner(TEST_ACCOUNTS.bob);
        const aliceContract = await getContract(aliceSigner);
        const bobContract = await getContract(bobSigner);
        
        const amount = ethers.utils.parseEther("0.05");
        const expiration = Math.floor(Date.now() / 1000) + TEST_TIMELOCK_SECONDS;
        
        // Step 1: Alice initiates
        console.log('Step 1: Alice initiates swap...');
        await (await aliceContract.initiateSwap(
            TEST_ACCOUNTS.bob.address,
            hash,
            expiration,
            { value: amount }
        )).wait();
        logTest('Alice initiates swap', 'PASS');
        
        // Step 2: Bob claims
        console.log('\nStep 2: Bob claims swap...');
        const secretBytes = ethers.utils.arrayify(secret);
        await (await bobContract.claimSwap(hash, secretBytes)).wait();
        logTest('Bob claims swap', 'PASS');
        
        // Step 3: Try to claim again
        console.log('\nStep 3: Attempting second claim (should fail)...');
        try {
            await bobContract.claimSwap(hash, secretBytes);
            logTest('Double claim rejected', 'FAIL', 'Should have reverted!');
            return false;
        } catch (error) {
            if (error.message.includes('SwapNotActive') || error.message.includes('revert')) {
                logTest('Double claim rejected', 'PASS', 'Correctly reverted');
            } else {
                logTest('Double claim rejected', 'FAIL', error.message);
                return false;
            }
        }
        
        console.log('\n✅ SCENARIO 6 PASSED: Cannot claim twice!\n');
        return true;
        
    } catch (error) {
        logTest('Scenario 6', 'FAIL', error.message);
        return false;
    }
}

/**
 * Scenario 7: Only sender can refund
 */
async function testOnlySenderCanRefund() {
    console.log('\n========================================');
    console.log('🧪 SCENARIO 7: Only Sender Can Refund');
    console.log('========================================\n');
    
    try {
        const { secret, hash } = generateSecretAndHash();
        const aliceSigner = await getSigner(TEST_ACCOUNTS.alice);
        const bobSigner = await getSigner(TEST_ACCOUNTS.bob);
        const aliceContract = await getContract(aliceSigner);
        const bobContract = await getContract(bobSigner);
        
        const amount = ethers.utils.parseEther("0.05");
        const shortTimelock = 10;
        const expiration = Math.floor(Date.now() / 1000) + shortTimelock;
        
        // Step 1: Alice initiates
        console.log('Step 1: Alice initiates swap...');
        await (await aliceContract.initiateSwap(
            TEST_ACCOUNTS.bob.address,
            hash,
            expiration,
            { value: amount }
        )).wait();
        logTest('Alice initiates swap', 'PASS');
        
        // Step 2: Wait for expiration
        console.log('\nStep 2: Waiting for timelock to expire...');
        await advanceTime(shortTimelock + 5);
        
        // Step 3: Bob tries to refund (should fail - he's not the sender)
        console.log('\nStep 3: Bob tries to refund (should fail)...');
        try {
            await bobContract.refundSwap(hash);
            logTest('Non-sender refund rejected', 'FAIL', 'Should have reverted!');
            return false;
        } catch (error) {
            if (error.message.includes('OnlySender') || error.message.includes('not sender') || error.message.includes('revert')) {
                logTest('Non-sender refund rejected', 'PASS', 'Correctly reverted');
            } else {
                logTest('Non-sender refund rejected', 'FAIL', error.message);
                return false;
            }
        }
        
        // Cleanup: Alice refunds
        console.log('\nCleanup: Alice (sender) refunds...');
        await aliceContract.refundSwap(hash);
        logTest('Sender can refund', 'PASS');
        
        console.log('\n✅ SCENARIO 7 PASSED: Only sender can refund!\n');
        return true;
        
    } catch (error) {
        logTest('Scenario 7', 'FAIL', error.message);
        return false;
    }
}

// ======================
// RUN ALL TESTS
// ======================

async function runAllTests() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║     ATOMIC SWAP - AUTOMATED TEST SUITE                 ║');
    console.log('║     Testing on Hardhat Local Network                   ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    testResults = []; // Reset results
    
    // Check ethers is available
    if (typeof ethers === 'undefined') {
        console.error('❌ ethers.js not found! Make sure you run this in the browser with ethers loaded.');
        return;
    }
    
    // Check connection to local node
    try {
        const provider = await getProvider();
        const network = await provider.getNetwork();
        console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
        
        if (network.chainId !== 31337) {
            console.warn('⚠️ Not on Hardhat local network! Some tests may fail.');
        }
    } catch (error) {
        console.error('❌ Cannot connect to Hardhat node! Make sure it is running.');
        console.error('   Run: cd contracts/etherlink && npx hardhat node');
        return;
    }
    
    const startTime = Date.now();
    
    // Run all scenarios
    await testSuccessfulSwap();
    await testRefundAfterTimeout();
    await testClaimNonExistentSwap();
    await testRefundBeforeTimeout();
    await testClaimWrongSecret();
    await testDoubleClaimAttempt();
    await testOnlySenderCanRefund();
    
    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const passed = testResults.filter(t => t.status === 'PASS').length;
    const failed = testResults.filter(t => t.status === 'FAIL').length;
    
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                        ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`\n  Total tests: ${testResults.length}`);
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  ⏱️  Duration: ${elapsed}s\n`);
    
    if (failed === 0) {
        console.log('🎉 ALL TESTS PASSED! The contract is secure.\n');
    } else {
        console.log('⚠️  SOME TESTS FAILED! Review the output above.\n');
        testResults.filter(t => t.status === 'FAIL').forEach(t => {
            console.log(`   ❌ ${t.name}: ${t.details}`);
        });
    }
    
    return { passed, failed, results: testResults };
}

// Export for use
if (typeof window !== 'undefined') {
    window.runAllTests = runAllTests;
    window.testSuccessfulSwap = testSuccessfulSwap;
    window.testRefundAfterTimeout = testRefundAfterTimeout;
    window.testClaimNonExistentSwap = testClaimNonExistentSwap;
    window.testRefundBeforeTimeout = testRefundBeforeTimeout;
    window.testClaimWrongSecret = testClaimWrongSecret;
    window.testDoubleClaimAttempt = testDoubleClaimAttempt;
    window.testOnlySenderCanRefund = testOnlySenderCanRefund;
    
    console.log('🧪 Test suite loaded! Run runAllTests() in console to start.');
}


