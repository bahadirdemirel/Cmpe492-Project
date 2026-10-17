import { parseUnits } from 'ethers'

export const JUKECOIN_ADDRESS = import.meta.env.VITE_JUKECOIN_ADDRESS || ''
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 31337)
export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || 'Hardhat Local'
export const CHAIN_RPC_URL = import.meta.env.VITE_CHAIN_RPC_URL || 'http://127.0.0.1:8545'

// Mirrors JukeCoin.PLAY_PRICE and FAUCET_AMOUNT
export const TOKEN_DECIMALS = 18
export const PLAY_PRICE = parseUnits('0.001', TOKEN_DECIMALS)
export const FAUCET_AMOUNT = parseUnits('1000', TOKEN_DECIMALS)

export const JUKECOIN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function nextClaimAt(address account) view returns (uint256)',
  'function claimTokens()',
  'function payForPlay(uint256 songId, bytes32 playId)',
  'error FaucetCooldownActive(uint256 nextClaimAt)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
]
