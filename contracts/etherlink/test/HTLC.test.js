const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HTLC Contract (Hardened v2.0)", function () {
  let htlc;
  let owner;
  let alice;
  let bob;
  let hashLock;
  let secret;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    
    const HTLC = await ethers.getContractFactory("HTLC");
    htlc = await HTLC.deploy();
    await htlc.waitForDeployment();
    
    // IMPORTANT: Secret must be exactly 32 bytes (aligned with Jstz)
    // Generate a 32-byte secret (matches Jstz 0x + 64 hex format)
    secret = ethers.randomBytes(32);
    
    // Generate hashlock from secret using SHA-256
    hashLock = ethers.sha256(secret);
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(await htlc.getAddress()).to.be.properAddress;
    });
  });

  describe("Initiate Swap", function () {
    it("Should initiate a swap successfully", async function () {
      const amount = ethers.parseEther("1.0");
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiration = currentBlock.timestamp + 3600; // 1 hour from now

      await expect(
        htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount })
      )
        .to.emit(htlc, "SwapInitiated")
        .withArgs(hashLock, alice.address, bob.address, amount, hashLock, expiration);
      
      // Verify swap exists
      expect(await htlc.swapPresent(hashLock)).to.be.true;
    });

    it("Should fail if amount is 0", async function () {
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiration = currentBlock.timestamp + 3600;
      
      await expect(
        htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: 0 })
      ).to.be.revertedWithCustomError(htlc, "AmountMustBeGreaterThanZero");
    });

    it("Should fail if expiration is in the past", async function () {
      const amount = ethers.parseEther("1.0");
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiration = currentBlock.timestamp - 100; // Past

      await expect(
        htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount })
      ).to.be.revertedWithCustomError(htlc, "ExpirationMustBeInFuture");
    });

    it("Should fail if swap already exists", async function () {
      const amount = ethers.parseEther("1.0");
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiration = currentBlock.timestamp + 3600;

      // First swap succeeds
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount });

      // Second swap with same hashlock should fail
      await expect(
        htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount })
      ).to.be.revertedWithCustomError(htlc, "SwapAlreadyExists");
    });
  });

  describe("Claim Swap", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("1.0");
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiration = currentBlock.timestamp + 3600; // 1 hour
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount });
    });

    it("Should claim swap with correct 32-byte secret", async function () {
      const bobBalanceBefore = await ethers.provider.getBalance(bob.address);
      
      await expect(htlc.connect(bob).claimSwap(hashLock, secret))
        .to.emit(htlc, "SwapClaimed");
      
      const bobBalanceAfter = await ethers.provider.getBalance(bob.address);
      
      // Bob should have received ~1 ETH (minus gas)
      expect(bobBalanceAfter).to.be.gt(bobBalanceBefore);
    });

    it("Should fail with incorrect secret (wrong hash)", async function () {
      const wrongSecret = ethers.randomBytes(32); // Different 32 bytes
      
      await expect(
        htlc.connect(bob).claimSwap(hashLock, wrongSecret)
      ).to.be.revertedWithCustomError(htlc, "IncorrectHashLock");
    });

    it("Should fail with incorrect secret length (not 32 bytes)", async function () {
      const shortSecret = ethers.toUtf8Bytes("short"); // Only 5 bytes
      
      await expect(
        htlc.connect(bob).claimSwap(hashLock, shortSecret)
      ).to.be.revertedWithCustomError(htlc, "IncorrectSecretLength");
    });

    it("Should fail with incorrect secret length (too long)", async function () {
      const longSecret = ethers.randomBytes(64); // 64 bytes instead of 32
      
      await expect(
        htlc.connect(bob).claimSwap(hashLock, longSecret)
      ).to.be.revertedWithCustomError(htlc, "IncorrectSecretLength");
    });

    it("Should fail to claim after expiration", async function () {
      // Create a new swap with short expiration
      const newSecret = ethers.randomBytes(32);
      const newHashLock = ethers.sha256(newSecret);
      const amount = ethers.parseEther("1.0");
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const shortExpiration = currentBlock.timestamp + 60; // 60 seconds

      await htlc.connect(alice).initiateSwap(bob.address, newHashLock, shortExpiration, { value: amount });

      // Fast forward time past expiration
      await ethers.provider.send("evm_increaseTime", [120]); // 2 minutes
      await ethers.provider.send("evm_mine");

      // Claim should fail after expiration
      await expect(
        htlc.connect(bob).claimSwap(newHashLock, newSecret)
      ).to.be.revertedWithCustomError(htlc, "SwapExpired");
    });

    it("Should allow anyone to claim if recipient is address(0)", async function () {
      // Create new swap with no specific recipient
      const newSecret = ethers.randomBytes(32);
      const newHashLock = ethers.sha256(newSecret);
      const amount = ethers.parseEther("0.5");
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiration = currentBlock.timestamp + 3600;

      await htlc.connect(alice).initiateSwap(
        ethers.ZeroAddress, 
        newHashLock, 
        expiration, 
        { value: amount }
      );

      // Anyone (bob) can claim with correct secret
      await expect(htlc.connect(bob).claimSwap(newHashLock, newSecret))
        .to.emit(htlc, "SwapClaimed");
    });

    it("Should fail if claimer is not the designated recipient", async function () {
      // Create swap with specific recipient (bob)
      const newSecret = ethers.randomBytes(32);
      const newHashLock = ethers.sha256(newSecret);
      const amount = ethers.parseEther("0.5");
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiration = currentBlock.timestamp + 3600;

      await htlc.connect(alice).initiateSwap(
        bob.address,  // Bob is the designated recipient
        newHashLock, 
        expiration, 
        { value: amount }
      );

      // Alice (not bob) tries to claim - should fail
      await expect(
        htlc.connect(alice).claimSwap(newHashLock, newSecret)
      ).to.be.revertedWithCustomError(htlc, "UnauthorizedClaimer");
    });

    it("Should allow designated recipient to claim", async function () {
      // Create swap with specific recipient (bob)
      const newSecret = ethers.randomBytes(32);
      const newHashLock = ethers.sha256(newSecret);
      const amount = ethers.parseEther("0.5");
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiration = currentBlock.timestamp + 3600;

      await htlc.connect(alice).initiateSwap(
        bob.address,  // Bob is the designated recipient
        newHashLock, 
        expiration, 
        { value: amount }
      );

      // Bob (designated recipient) claims - should succeed
      await expect(htlc.connect(bob).claimSwap(newHashLock, newSecret))
        .to.emit(htlc, "SwapClaimed");
    });
  });

  describe("Refund Swap", function () {
    it("Should refund after expiration", async function () {
      const amount = ethers.parseEther("1.0");
      
      // Use block timestamp instead of Date.now()
      const currentBlock = await ethers.provider.getBlock('latest');
      const shortExpiration = currentBlock.timestamp + 60; // 60 seconds from now
      
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, shortExpiration, { value: amount });

      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [120]); // 2 minutes
      await ethers.provider.send("evm_mine");

      await expect(htlc.connect(alice).refundSwap(hashLock))
        .to.emit(htlc, "SwapRefunded");
      
      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceBalanceAfter).to.be.gt(aliceBalanceBefore);
    });

    it("Should fail if not expired yet", async function () {
      const amount = ethers.parseEther("1.0");
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiration = currentBlock.timestamp + 3600; // 1 hour
      
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount });

      // Try to refund immediately (before expiration)
      await expect(
        htlc.connect(alice).refundSwap(hashLock)
      ).to.be.revertedWithCustomError(htlc, "SwapNotExpiredYet");
    });

    it("Should fail if not the sender", async function () {
      const amount = ethers.parseEther("1.0");
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const shortExpiration = currentBlock.timestamp + 60;
      
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, shortExpiration, { value: amount });

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine");

      // Bob tries to refund Alice's swap
      await expect(
        htlc.connect(bob).refundSwap(hashLock)
      ).to.be.revertedWithCustomError(htlc, "OnlySenderCanRefund");
    });

    it("Should fail to refund after claim", async function () {
      const amount = ethers.parseEther("1.0");
      const currentBlock = await ethers.provider.getBlock('latest');
      const shortExpiration = currentBlock.timestamp + 300; // 5 minutes
      
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, shortExpiration, { value: amount });

      // Bob claims successfully
      await htlc.connect(bob).claimSwap(hashLock, secret);

      // Fast forward past expiration
      await ethers.provider.send("evm_increaseTime", [400]);
      await ethers.provider.send("evm_mine");

      // Alice tries to refund a claimed swap
      await expect(
        htlc.connect(alice).refundSwap(hashLock)
      ).to.be.revertedWithCustomError(htlc, "SwapNotOpen");
    });
  });

  describe("Get Swap", function () {
    it("Should return correct swap details", async function () {
      const amount = ethers.parseEther("1.0");
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiration = currentBlock.timestamp + 3600;

      await htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount });

      const swap = await htlc.getSwap(hashLock);
      expect(swap.recipient).to.equal(bob.address);
      expect(swap.sender).to.equal(alice.address);
      expect(swap.amount).to.equal(amount);
      expect(swap.hashLock).to.equal(hashLock);
      expect(swap.status).to.equal(0); // OPEN
    });

    it("Should show CLAIMED status after claim", async function () {
      const amount = ethers.parseEther("1.0");
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiration = currentBlock.timestamp + 3600;

      await htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount });
      await htlc.connect(bob).claimSwap(hashLock, secret);

      const swap = await htlc.getSwap(hashLock);
      expect(swap.status).to.equal(1); // CLAIMED
    });

    it("Should show REFUNDED status after refund", async function () {
      const amount = ethers.parseEther("1.0");
      const currentBlock = await ethers.provider.getBlock('latest');
      const shortExpiration = currentBlock.timestamp + 60;

      await htlc.connect(alice).initiateSwap(bob.address, hashLock, shortExpiration, { value: amount });

      // Fast forward past expiration
      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine");

      await htlc.connect(alice).refundSwap(hashLock);

      const swap = await htlc.getSwap(hashLock);
      expect(swap.status).to.equal(2); // REFUNDED (was EXPIRED)
    });
  });

  describe("Security - No Emergency Withdraw", function () {
    it("Should NOT have emergencyWithdraw function (trustless)", async function () {
      // Verify the contract doesn't have an emergencyWithdraw function
      expect(htlc.emergencyWithdraw).to.be.undefined;
    });
  });

  describe("Cross-Chain SHA-256 Compatibility", function () {
    it("Should produce consistent SHA-256 hash for 32-byte secret", async function () {
      // This test verifies the hash is deterministic
      // The same secret should always produce the same hashlock
      const testSecret = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        testSecret[i] = i; // 0x00, 0x01, 0x02, ..., 0x1f
      }
      
      const expectedHash = ethers.sha256(testSecret);
      
      // Verify the format matches what we'd use in Jstz
      expect(expectedHash).to.match(/^0x[a-fA-F0-9]{64}$/);
      
      // The hash should be consistent (same input = same output)
      expect(ethers.sha256(testSecret)).to.equal(expectedHash);
    });
  });
});
