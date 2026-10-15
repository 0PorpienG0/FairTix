import { expect } from "chai";
import { ethers } from "hardhat";

describe("CheckIn", () => {
  async function setup() {
    const [gate, other] = await ethers.getSigners();
    const checkIn = await (await ethers.getContractFactory("CheckIn")).deploy(gate.address);
    return { gate, other, checkIn };
  }

  it("lets the gate admit a ticket once", async () => {
    const { checkIn } = await setup();
    expect(await checkIn.used(7)).to.equal(false);
    await expect(checkIn.checkIn(7)).to.emit(checkIn, "CheckedIn").withArgs(7);
    expect(await checkIn.used(7)).to.equal(true);
    await expect(checkIn.checkIn(7)).to.be.revertedWithCustomError(checkIn, "AlreadyUsed").withArgs(7);
  });

  it("rejects anyone but the gate", async () => {
    const { checkIn, other } = await setup();
    await expect(checkIn.connect(other).checkIn(1)).to.be.revertedWithCustomError(checkIn, "NotGate");
  });
});
