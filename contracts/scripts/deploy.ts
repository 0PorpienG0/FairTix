import { ethers, network, artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Hardhat default mnemonic accounts (LOCAL ONLY). Index order per SPEC.
const DEMO_KEYS: Record<string, string> = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  organizer: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  platform: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  artist: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  treasury: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  alice: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  bob: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
};

const SHARED = path.resolve(__dirname, "..", "..", "shared");

async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(SHARED, "config.json"), "utf8"));
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = network.name === "localhost" || network.name === "hardhat" || chainId === 31337;

  const [deployer] = await ethers.getSigners();
  let accounts: Record<string, string>;
  let signers: Record<string, any> = {};

  if (isLocal) {
    const all = await ethers.getSigners();
    const names = Object.keys(DEMO_KEYS);
    accounts = {};
    names.forEach((n, i) => {
      accounts[n] = all[i].address;
      signers[n] = all[i];
    });
  } else {
    // Testnet: deployer is also organizer/platform/artist/treasury unless overridden by env.
    const d = deployer.address;
    accounts = {
      deployer: d,
      organizer: process.env.ORGANIZER_ADDRESS || d,
      platform: process.env.PLATFORM_ADDRESS || d,
      artist: process.env.ARTIST_ADDRESS || d,
      treasury: process.env.TREASURY_ADDRESS || d,
      alice: process.env.ALICE_ADDRESS || d,
      bob: process.env.BOB_ADDRESS || d,
    };
  }
  console.log(`Network ${network.name} chainId ${chainId}, deployer ${deployer.address}`);

  // USDC
  let usdcAddr = process.env.USDC_ADDRESS;
  let usdc: any;
  if (usdcAddr) {
    usdc = await ethers.getContractAt("MockUSDC", usdcAddr);
  } else {
    usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
    await usdc.waitForDeployment();
    usdcAddr = await usdc.getAddress();
  }
  console.log("USDC", usdcAddr);

  const ticket = await (await ethers.getContractFactory("TicketNFT")).deploy(cfg.eventName, "TIX", deployer.address);
  await ticket.waitForDeployment();
  const ticketAddr = await ticket.getAddress();

  const sale = await (await ethers.getContractFactory("PrimarySale")).deploy(
    usdcAddr, ticketAddr, accounts.organizer, accounts.platform,
    cfg.faceValue, cfg.organizerShare, cfg.platformShare, cfg.maxSupply, accounts.treasury);
  await sale.waitForDeployment();
  const saleAddr = await sale.getAddress();

  const market = await (await ethers.getContractFactory("Marketplace")).deploy(
    usdcAddr, ticketAddr, accounts.artist, accounts.platform,
    cfg.faceValue, cfg.resaleCapBps, cfg.royaltyFlat, cfg.resaleFeeFlat);
  await market.waitForDeployment();
  const marketAddr = await market.getAddress();

  // Wire roles
  await (await ticket.grantRole(await ticket.MINTER_ROLE(), saleAddr)).wait();
  await (await ticket.setMarketplace(marketAddr)).wait();

  // Fund demo wallets (mock USDC only: local, or testnet when we deployed MockUSDC)
  const mockUsdc = isLocal || !process.env.USDC_ADDRESS;
  if (mockUsdc) {
    const m = (n: number) => BigInt(n) * 1_000_000n;
    await (await usdc.mint(accounts.treasury, m(100000))).wait();
    if (isLocal) {
      await (await usdc.mint(accounts.alice, m(1000))).wait();
      await (await usdc.mint(accounts.bob, m(1000))).wait();
    }
  }
  if (isLocal) {
    await (await usdc.connect(signers.treasury).approve(saleAddr, ethers.MaxUint256)).wait();
  } else if (accounts.treasury === deployer.address) {
    await (await usdc.approve(saleAddr, ethers.MaxUint256)).wait();
  }

  const rpcUrl = isLocal ? "http://127.0.0.1:8545" : (process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org");
  const { deployer: _omit, ...publicAccounts } = accounts;
  const deployment = {
    chainId, rpcUrl,
    usdc: usdcAddr, ticket: ticketAddr, primarySale: saleAddr, marketplace: marketAddr,
    accounts: publicAccounts,
  };
  fs.mkdirSync(path.join(SHARED, "abi"), { recursive: true });
  fs.writeFileSync(path.join(SHARED, "deployment.json"), JSON.stringify(deployment, null, 2) + "\n");

  for (const name of ["MockUSDC", "TicketNFT", "PrimarySale", "Marketplace"]) {
    const art = await artifacts.readArtifact(name);
    fs.writeFileSync(path.join(SHARED, "abi", `${name}.json`), JSON.stringify(art.abi, null, 2) + "\n");
  }

  if (isLocal) {
    const keys: Record<string, { address: string; privateKey: string }> = {};
    for (const [n, pk] of Object.entries(DEMO_KEYS)) keys[n] = { address: accounts[n], privateKey: pk };
    fs.writeFileSync(path.join(SHARED, "demo-keys.json"), JSON.stringify(keys, null, 2) + "\n");
  }

  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
