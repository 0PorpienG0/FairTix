import { ethers, artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Deploys the CheckIn register on top of an existing deployment (run after deploy.ts).
// The gate wallet is the treasury, which the web app uses to admit tickets at the door.
const SHARED = path.resolve(__dirname, "..", "..", "shared");

async function main() {
  const depFile = path.join(SHARED, "deployment.json");
  const dep = JSON.parse(fs.readFileSync(depFile, "utf8"));
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== dep.chainId) throw new Error(`Network chain ${chainId} does not match deployment.json (${dep.chainId})`);

  let signer;
  if (chainId === 31337) {
    signer = (await ethers.getSigners())[4]; // treasury in the local demo account order
  } else {
    const keys = JSON.parse(fs.readFileSync(path.join(SHARED, "testnet-keys.json"), "utf8"));
    signer = new ethers.Wallet(keys.treasury.privateKey, ethers.provider);
  }
  if (signer.address.toLowerCase() !== String(dep.accounts.treasury).toLowerCase()) throw new Error("Gate signer is not the treasury");

  const checkIn = await (await ethers.getContractFactory("CheckIn", signer)).deploy(signer.address);
  await checkIn.waitForDeployment();
  dep.checkIn = await checkIn.getAddress();
  fs.writeFileSync(depFile, JSON.stringify(dep, null, 2) + "\n");
  const art = await artifacts.readArtifact("CheckIn");
  fs.writeFileSync(path.join(SHARED, "abi", "CheckIn.json"), JSON.stringify(art.abi, null, 2) + "\n");
  console.log("CheckIn deployed at", dep.checkIn, "gate", signer.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
