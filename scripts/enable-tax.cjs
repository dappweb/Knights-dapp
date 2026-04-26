const path = require("path");
const dotenv = require("dotenv");
const hre = require("hardhat");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const seerAddress = process.env.VITE_SEER_TOKEN_ADDRESS || process.env.SEER_TOKEN_ADDRESS;

  if (!seerAddress) {
    throw new Error("Missing SEER address in env");
  }

  const seer = await hre.ethers.getContractAt(
    [
      "function owner() view returns (address)",
      "function taxEnabled() view returns (bool)",
      "function setTaxEnabled(bool enabled)",
    ],
    seerAddress,
    signer
  );

  const owner = await seer.owner();
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Signer is not owner. owner=${owner} signer=${signerAddress}`);
  }

  const before = await seer.taxEnabled();
  if (before) {
    console.log("taxEnabled already true");
    return;
  }

  const tx = await seer.setTaxEnabled(true);
  const receipt = await tx.wait();
  const after = await seer.taxEnabled();

  console.log("Network:", hre.network.name);
  console.log("SEER:", seerAddress);
  console.log("setTaxEnabled tx:", receipt.hash);
  console.log("taxEnabled:", before, "->", after);
}

main().catch((error) => {
  console.error("\n❌ enable-tax failed:", error.message || error);
  process.exit(1);
});
