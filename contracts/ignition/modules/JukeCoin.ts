import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("JukeCoinModule", (m) => {
  const jukeCoin = m.contract("JukeCoin");
  return { jukeCoin };
});
