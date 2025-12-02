const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HTLC Contract", function () {
  let htlc;
  let owner;
  let alice;
  let bob;
  
  // Test secret and hashlock
  const secret = ethers.toUtf8Bytes("my_super_secret_preimage_123");
  let hashLock;
  
  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    
    // Deploy contract
    const HTLC = await ethers.getContractFactory("HTLC");
    htlc = await HTLC.deploy();
    await htlc.waitForDeployment();
    
    // Generate hashlock from secret
    hashLock = ethers.keccak256(secret);
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(await htlc.getAddress()).to.be.properAddress;
    });
  });

  describe("Initiate Swap", function () {
    it("Should initiate a swap successfully", async function () {
      const amount = ethers.parseEther("1.0");
      const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      await expect(
        htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount })
      )
        .to.emit(htlc, "SwapInitiated")
        .withArgs(hashLock, alice.address, bob.address, amount, hashLock, expiration);
      
      // Verify swap exists
      expect(await htlc.swapPresent(hashLock)).to.be.true;
    });

    it("Should fail if amount is 0", async function () {
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      
      await expect(
        htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: 0 })
      ).to.be.revertedWithCustomError(htlc, "AmountMustBeGreaterThanZero");
    });

    it("Should fail if expiration is in the past", async function () {
      const amount = ethers.parseEther("1.0");
      const expiration = Math.floor(Date.now() / 1000) - 100; // Past
      
      await expect(
        htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount })
      ).to.be.revertedWithCustomError(htlc, "ExpirationMustBeInFuture");
    });

    it("Should fail if swap already exists", async function () {
      const amount = ethers.parseEther("1.0");
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      
      // First initiation
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount });
      
      // Second initiation with same hashlock should fail
      await expect(
        htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount })
      ).to.be.revertedWithCustomError(htlc, "SwapAlreadyExists");
    });
  });

  describe("Claim Swap", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("1.0");
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount });
    });

    it("Should claim swap with correct secret", async function () {
      const bobBalanceBefore = await ethers.provider.getBalance(bob.address);
      
      await expect(htlc.connect(bob).claimSwap(hashLock, secret))
        .to.emit(htlc, "SwapClaimed");
      
      const bobBalanceAfter = await ethers.provider.getBalance(bob.address);
      
      // Bob should have received the funds (minus gas)
      expect(bobBalanceAfter).to.be.gt(bobBalanceBefore);
    });

    it("Should fail with incorrect secret", async function () {
      const wrongSecret = ethers.toUtf8Bytes("wrong_secret");
      
      await expect(
        htlc.connect(bob).claimSwap(hashLock, wrongSecret)
      ).to.be.revertedWithCustomError(htlc, "IncorrectHashLock");
    });

    it("Should allow anyone to claim if recipient is address(0)", async function () {
      // Create new swap with no specific recipient
      const newSecret = ethers.toUtf8Bytes("another_secret");
      const newHashLock = ethers.keccak256(newSecret);
      const amount = ethers.parseEther("0.5");
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      
      await htlc.connect(alice).initiateSwap(ethers.ZeroAddress, newHashLock, expiration, { value: amount });
      
      // Anyone (bob) can claim
      await expect(htlc.connect(bob).claimSwap(newHashLock, newSecret))
        .to.emit(htlc, "SwapClaimed");
    });
  });

  describe("Refund Swap", function () {
    it("Should refund after expiration", async function () {
      const amount = ethers.parseEther("1.0");
      
      // Get current block timestamp
      const block = await ethers.provider.getBlock("latest");
      const expiration = block.timestamp + 60; // 60 seconds from block time
      
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount });
      
      // Fast forward time past expiration
      await ethers.provider.send("evm_increaseTime", [120]); // 2 minutes
      await ethers.provider.send("evm_mine");
      
      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);
      
      await expect(htlc.connect(alice).refundSwap(hashLock))
        .to.emit(htlc, "SwapRefunded");
      
      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceBalanceAfter).to.be.gt(aliceBalanceBefore);
    });

    it("Should fail if not expired yet", async function () {
      const amount = ethers.parseEther("1.0");
      
      // Get current block timestamp
      const block = await ethers.provider.getBlock("latest");
      const expiration = block.timestamp + 3600; // 1 hour from block time
      
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount });
      
      await expect(
        htlc.connect(alice).refundSwap(hashLock)
      ).to.be.revertedWithCustomError(htlc, "SwapNotExpiredYet");
    });

    it("Should fail if not the sender", async function () {
      const amount = ethers.parseEther("1.0");
      
      // Get current block timestamp
      const block = await ethers.provider.getBlock("latest");
      const expiration = block.timestamp + 60; // 60 seconds from block time
      
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount });
      
      // Fast forward time past expiration
      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine");
      
      await expect(
        htlc.connect(bob).refundSwap(hashLock)
      ).to.be.revertedWithCustomError(htlc, "OnlySenderCanRefund");
    });
  });

  describe("Get Swap", function () {
    it("Should return correct swap details", async function () {
      const amount = ethers.parseEther("1.0");
      const expiration = Math.floor(Date.now() / 1000) + 3600;
      
      await htlc.connect(alice).initiateSwap(bob.address, hashLock, expiration, { value: amount });
      
      const swap = await htlc.getSwap(hashLock);
      
      expect(swap.recipient).to.equal(bob.address);
      expect(swap.sender).to.equal(alice.address);
      expect(swap.amount).to.equal(amount);
      expect(swap.hashLock).to.equal(hashLock);
      expect(swap.status).to.equal(0); // OPEN
    });
  });
});

