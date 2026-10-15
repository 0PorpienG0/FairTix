import { expect } from "chai";
import { ethers } from "hardhat";

const U = (n: number) => BigInt(n) * 1_000_000n;

async function setup(maxSupply = 100, capBps = 0) {
  const [deployer, organizer, platform, artist, treasury, alice, bob] = await ethers.getSigners();
  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  const ticket = await (await ethers.getContractFactory("TicketNFT")).deploy("Demo", "TIX", deployer.address);
  const sale = await (await ethers.getContractFactory("PrimarySale")).deploy(
    await usdc.getAddress(), await ticket.getAddress(), organizer.address, platform.address,
    U(50), 48_500_000n, 1_500_000n, maxSupply, treasury.address);
  const market = await (await ethers.getContractFactory("Marketplace")).deploy(
    await usdc.getAddress(), await ticket.getAddress(), artist.address, platform.address,
    U(50), capBps, 1000, 500);
  await ticket.grantRole(await ticket.MINTER_ROLE(), await sale.getAddress());
  await ticket.setMarketplace(await market.getAddress());
  await usdc.mint(treasury.address, U(100000));
  await usdc.connect(treasury).approve(await sale.getAddress(), ethers.MaxUint256);
  await usdc.mint(alice.address, U(1000));
  await usdc.mint(bob.address, U(1000));
  return { deployer, organizer, platform, artist, treasury, alice, bob, usdc, ticket, sale, market };
}

describe("Ticketing", () => {
  it("primary sale splits 48.5/1.5 and mints to buyer", async () => {
    const { sale, ticket, usdc, organizer, platform, treasury, alice } = await setup();
    await expect(sale.connect(treasury).buyFor(alice.address))
      .to.emit(sale, "TicketSold").withArgs(alice.address, 1, 48_500_000n, 1_500_000n);
    expect(await ticket.ownerOf(1)).to.equal(alice.address);
    expect(await usdc.balanceOf(organizer.address)).to.equal(48_500_000n);
    expect(await usdc.balanceOf(platform.address)).to.equal(1_500_000n);
    expect(await usdc.balanceOf(treasury.address)).to.equal(U(100000 - 50));
    expect(await sale.sold()).to.equal(1);
  });

  it("only treasury can buyFor", async () => {
    const { sale, alice } = await setup();
    await expect(sale.connect(alice).buyFor(alice.address)).to.be.revertedWithCustomError(sale, "OnlyTreasury");
  });

  it("reverts when sold out", async () => {
    const { sale, treasury, alice } = await setup(2);
    await sale.connect(treasury).buyFor(alice.address);
    await sale.connect(treasury).buyFor(alice.address);
    await expect(sale.connect(treasury).buyFor(alice.address)).to.be.revertedWithCustomError(sale, "SoldOut");
  });

  it("only sale contract can mint", async () => {
    const { ticket, alice } = await setup();
    await expect(ticket.connect(alice).mint(alice.address)).to.be.reverted;
  });

  it("blocks direct transfers (transferFrom, safeTransferFrom) and burning", async () => {
    const { sale, ticket, treasury, alice, bob } = await setup();
    await sale.connect(treasury).buyFor(alice.address);
    await expect(ticket.connect(alice).transferFrom(alice.address, bob.address, 1))
      .to.be.revertedWithCustomError(ticket, "TransferLocked");
    await expect(ticket.connect(alice)["safeTransferFrom(address,address,uint256)"](alice.address, bob.address, 1))
      .to.be.revertedWithCustomError(ticket, "TransferLocked");
    // an approved operator that is not the marketplace is also blocked
    await ticket.connect(alice).approve(bob.address, 1);
    await expect(ticket.connect(bob).transferFrom(alice.address, bob.address, 1))
      .to.be.revertedWithCustomError(ticket, "TransferLocked");
    expect(await ticket.ownerOf(1)).to.equal(alice.address);
  });

  it("rejects listing above cap with PriceAboveCap, accepts exactly cap (capBps=12000)", async () => {
    const { sale, ticket, market, treasury, alice } = await setup(100, 12000);
    await sale.connect(treasury).buyFor(alice.address);
    await ticket.connect(alice).approve(await market.getAddress(), 1);
    expect(await market.maxPrice()).to.equal(U(60));
    await expect(market.connect(alice).list(1, U(61)))
      .to.be.revertedWithCustomError(market, "PriceAboveCap").withArgs(U(61), U(60));
    await expect(market.connect(alice).list(1, U(60))).to.emit(market, "Listed").withArgs(0, alice.address, 1, U(60));
    expect(await ticket.ownerOf(1)).to.equal(await market.getAddress());
  });

  it("rejects zero price and non-owner listing", async () => {
    const { sale, ticket, market, treasury, alice, bob } = await setup();
    await sale.connect(treasury).buyFor(alice.address);
    await ticket.connect(alice).approve(await market.getAddress(), 1);
    await expect(market.connect(alice).list(1, 0)).to.be.revertedWithCustomError(market, "PriceTooLow");
    await expect(market.connect(bob).list(1, U(10))).to.be.revertedWithCustomError(market, "NotOwner");
  });

  async function resale(price: number, seller: bigint, royalty: bigint, fee: bigint) {
    const { sale, ticket, market, usdc, treasury, alice, bob, artist, platform } = await setup();
    await sale.connect(treasury).buyFor(alice.address);
    await ticket.connect(alice).approve(await market.getAddress(), 1);
    expect(await market.maxPrice()).to.equal(0);
    await market.connect(alice).list(1, U(price));
    await usdc.mint(bob.address, U(price));
    await usdc.connect(bob).approve(await market.getAddress(), U(price));
    const aliceBefore = await usdc.balanceOf(alice.address);
    const platBefore = await usdc.balanceOf(platform.address);
    const bobBefore = await usdc.balanceOf(bob.address);
    await expect(market.connect(bob).buy(0))
      .to.emit(market, "Sold").withArgs(0, bob.address, 1, U(price), royalty, fee, seller);
    expect(await ticket.ownerOf(1)).to.equal(bob.address);
    expect(await usdc.balanceOf(bob.address)).to.equal(bobBefore - U(price));
    expect(await usdc.balanceOf(alice.address)).to.equal(aliceBefore + seller);
    expect(await usdc.balanceOf(artist.address)).to.equal(royalty);
    expect(await usdc.balanceOf(platform.address)).to.equal(platBefore + fee);
    expect(await usdc.balanceOf(await market.getAddress())).to.equal(0);
    expect((await market.listings(0)).active).to.equal(false);
    await expect(market.connect(bob).buy(0)).to.be.revertedWithCustomError(market, "NotActive");
  }

  it("uncapped resale at 60 -> 51 seller / 6 artist / 3 platform", () => resale(60, U(51), U(6), U(3)));
  it("uncapped resale at 120 -> 102 / 12 / 6", () => resale(120, U(102), U(12), U(6)));
  it("uncapped resale at 1000 works -> 850 / 100 / 50", () => resale(1000, U(850), U(100), U(50)));

  it("constructor rejects royaltyBps+feeBps >= 10000", async () => {
    const [d] = await ethers.getSigners();
    const f = await ethers.getContractFactory("Marketplace");
    await expect(f.deploy(d.address, d.address, d.address, d.address, U(50), 0, 9000, 1000))
      .to.be.revertedWithCustomError(f, "BadBps");
  });

  it("buy is atomic: without USDC allowance nothing moves", async () => {
    const { sale, ticket, market, usdc, treasury, alice, bob } = await setup();
    await sale.connect(treasury).buyFor(alice.address);
    await ticket.connect(alice).approve(await market.getAddress(), 1);
    await market.connect(alice).list(1, U(60));
    await expect(market.connect(bob).buy(0)).to.be.reverted;
    expect(await ticket.ownerOf(1)).to.equal(await market.getAddress());
    expect(await usdc.balanceOf(bob.address)).to.equal(U(1000));
    expect((await market.listings(0)).active).to.equal(true);
  });

  it("cancel returns NFT to seller; only seller may cancel; no buy afterwards", async () => {
    const { sale, ticket, market, usdc, treasury, alice, bob } = await setup();
    await sale.connect(treasury).buyFor(alice.address);
    await ticket.connect(alice).approve(await market.getAddress(), 1);
    await market.connect(alice).list(1, U(55));
    await expect(market.connect(bob).cancel(0)).to.be.revertedWithCustomError(market, "NotSeller");
    await expect(market.connect(alice).cancel(0)).to.emit(market, "Cancelled").withArgs(0);
    expect(await ticket.ownerOf(1)).to.equal(alice.address);
    await usdc.connect(bob).approve(await market.getAddress(), U(55));
    await expect(market.connect(bob).buy(0)).to.be.revertedWithCustomError(market, "NotActive");
    await expect(market.connect(alice).cancel(0)).to.be.revertedWithCustomError(market, "NotActive");
    expect(await market.nextListingId()).to.equal(1);
  });

  it("new owner can relist after resale", async () => {
    const { sale, ticket, market, usdc, treasury, alice, bob } = await setup();
    await sale.connect(treasury).buyFor(alice.address);
    await ticket.connect(alice).approve(await market.getAddress(), 1);
    await market.connect(alice).list(1, U(50));
    await usdc.connect(bob).approve(await market.getAddress(), U(50));
    await market.connect(bob).buy(0);
    await ticket.connect(bob).approve(await market.getAddress(), 1);
    await market.connect(bob).list(1, U(60));
    expect((await market.listings(1)).seller).to.equal(bob.address);
  });
});
