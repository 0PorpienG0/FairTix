import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Post-deploy smoke test: treasury buys one ticket for a demo wallet, then reads it back.
// Uses the treasury key from shared/testnet-keys.json (git-ignored); prints no secrets.
async function main() {
  const shared = path.resolve(__dirname, "..", "..", "shared");
  const dep = JSON.parse(fs.readFileSync(path.join(shared, "deployment.json"), "utf8"));
  const keys = JSON.parse(fs.readFileSync(path.join(shared, "testnet-keys.json"), "utf8"));
  const treasury = new ethers.Wallet(keys.treasury.privateKey, ethers.provider);
  const sale = await ethers.getContractAt("PrimarySale", dep.primarySale, treasury);
  const ticket = await ethers.getContractAt("TicketNFT", dep.ticket);
  const before = await sale.sold();
  const tx = await sale.buyFor(dep.accounts.alice);
  const rc = await tx.wait();
  const after = await sale.sold();
  const id = await ticket.totalMinted();
  console.log("sold", before.toString(), "->", after.toString(), "| owner of #" + id, (await ticket.ownerOf(id)) === dep.accounts.alice ? "alice" : "unexpected", "| gas used", rc!.gasUsed.toString());
}
main().catch((e) => { console.error(e.message?.slice(0, 300)); process.exit(1); });
