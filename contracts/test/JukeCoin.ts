import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("JukeCoin", function () {
  const FAUCET_AMOUNT = ethers.parseUnits("1000", 18);
  const ONE_DAY = 24 * 60 * 60;

  async function deploy() {
    const [deployer, alice, bob] = await ethers.getSigners();
    const token = await ethers.deployContract("JukeCoin");
    return { token, deployer, alice, bob };
  }

  it("has the expected metadata and zero initial supply", async function () {
    const { token } = await deploy();
    expect(await token.name()).to.equal("JukeCoin");
    expect(await token.symbol()).to.equal("JUKE");
    expect(await token.decimals()).to.equal(18n);
    expect(await token.totalSupply()).to.equal(0n);
  });

  it("lets any wallet claim 1,000 JUKE from the faucet", async function () {
    const { token, alice, bob } = await deploy();

    await expect(token.connect(alice).claimTokens())
      .to.emit(token, "FaucetClaimed")
      .withArgs(alice.address, FAUCET_AMOUNT);
    await token.connect(bob).claimTokens();

    expect(await token.balanceOf(alice.address)).to.equal(FAUCET_AMOUNT);
    expect(await token.balanceOf(bob.address)).to.equal(FAUCET_AMOUNT);
    expect(await token.totalSupply()).to.equal(FAUCET_AMOUNT * 2n);
  });

  it("blocks a second claim until the cooldown has passed", async function () {
    const { token, alice } = await deploy();

    await token.connect(alice).claimTokens();
    const next = await token.nextClaimAt(alice.address);

    await expect(token.connect(alice).claimTokens())
      .to.be.revertedWithCustomError(token, "FaucetCooldownActive")
      .withArgs(next);

    await networkHelpers.time.increase(ONE_DAY);
    await token.connect(alice).claimTokens();

    expect(await token.balanceOf(alice.address)).to.equal(FAUCET_AMOUNT * 2n);
  });

  describe("payForPlay", function () {
    const PLAY_PRICE = ethers.parseUnits("0.001", 18);
    const playId = ethers.id("play-1");

    it("burns 0.001 JUKE and emits SongPlayed", async function () {
      const { token, alice } = await deploy();
      await token.connect(alice).claimTokens();

      await expect(token.connect(alice).payForPlay(7n, playId))
        .to.emit(token, "SongPlayed")
        .withArgs(alice.address, 7n, playId, PLAY_PRICE);

      expect(await token.PLAY_PRICE()).to.equal(PLAY_PRICE);
      expect(await token.balanceOf(alice.address)).to.equal(FAUCET_AMOUNT - PLAY_PRICE);
      expect(await token.totalSupply()).to.equal(FAUCET_AMOUNT - PLAY_PRICE);
    });

    it("reverts when the balance is too low", async function () {
      const { token, alice } = await deploy();
      await expect(token.connect(alice).payForPlay(7n, playId))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
        .withArgs(alice.address, 0n, PLAY_PRICE);
    });

    it("keeps the event signature the backend verifies against", async function () {
      const { token } = await deploy();
      // Must match SONG_PLAYED_TOPIC in backend/music/chain.py
      expect(token.interface.getEvent("SongPlayed").topicHash).to.equal(
        "0x4a487cb38049169c54803c9106aeb5c73fc892842427171d03a069cee30b5757",
      );
    });
  });

  it("transfers like a normal ERC-20", async function () {
    const { token, alice, bob } = await deploy();
    const amount = ethers.parseUnits("250", 18);

    await token.connect(alice).claimTokens();
    await expect(token.connect(alice).transfer(bob.address, amount)).to.changeTokenBalances(
      ethers,
      token,
      [alice, bob],
      [-amount, amount],
    );
  });
});
