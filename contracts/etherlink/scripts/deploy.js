const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying HTLC contract to Etherlink...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Deploy HTLC contract
  const HTLC = await hre.ethers.getContractFactory("HTLC");
  const htlc = await HTLC.deploy();

  await htlc.waitForDeployment();

  const contractAddress = await htlc.getAddress();
  
  console.log("✅ HTLC Contract deployed to:", contractAddress);
  console.log("\n📋 Contract Details:");
  console.log("   Network:", hre.network.name);
  console.log("   Chain ID:", (await hre.ethers.provider.getNetwork()).chainId.toString());
  console.log("   Block:", await hre.ethers.provider.getBlockNumber());
  
  console.log("\n💡 Next steps:");
  console.log("   1. Update the contract address in your frontend");
  console.log("   2. Verify the contract on the block explorer (if available)");
  console.log("   3. Test the contract with a small amount first");
  
  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    contractAddress: contractAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString()
  };
  
  console.log("\n📄 Deployment Info (save this):");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  
  return contractAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });

