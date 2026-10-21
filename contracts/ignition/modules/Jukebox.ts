import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("JukeboxModule", (m) => {
  const requestPrice = m.getParameter("requestPrice", 10_000_000_000_000_000n); // 0.01 ETH
  const jukebox = m.contract("Jukebox", [requestPrice]);
  return { jukebox };
});
