import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("Jukebox", function () {
  const price = ethers.parseEther("0.01");

  async function deploy() {
    const [owner, listener] = await ethers.getSigners();
    const jukebox = await ethers.deployContract("Jukebox", [price]);
    return { jukebox, owner, listener };
  }

  it("emits SongRequested when paid enough", async function () {
    const { jukebox, listener } = await deploy();
    await expect(jukebox.connect(listener).requestSong("song-1", { value: price }))
      .to.emit(jukebox, "SongRequested")
      .withArgs(listener.address, "song-1", price);
  });

  it("reverts when underpaid", async function () {
    const { jukebox, listener } = await deploy();
    await expect(jukebox.connect(listener).requestSong("song-1", { value: 1n }))
      .to.be.revertedWithCustomError(jukebox, "InsufficientPayment")
      .withArgs(1n, price);
  });

  it("only lets the owner withdraw", async function () {
    const { jukebox, listener } = await deploy();
    await expect(jukebox.connect(listener).withdraw()).to.be.revertedWithCustomError(
      jukebox,
      "NotOwner",
    );
  });
});
