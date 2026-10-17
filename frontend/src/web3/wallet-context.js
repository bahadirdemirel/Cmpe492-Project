import { createContext, useContext } from 'react'

export const WalletContext = createContext(null)

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used inside <WalletProvider>')
  return context
}

/** Turns MetaMask / ethers / API errors into a sentence for the UI. */
export function describeError(err) {
  if (err?.code === 'ACTION_REJECTED' || err?.code === 4001 || err?.info?.error?.code === 4001) {
    return 'You rejected the request in MetaMask.'
  }
  switch (err?.revert?.name) {
    case 'FaucetCooldownActive': {
      const at = new Date(Number(err.revert.args[0]) * 1000)
      return `You already claimed today. Try again after ${at.toLocaleString()}.`
    }
    case 'ERC20InsufficientBalance':
      return 'Not enough JukeCoin. Claim some from the faucet first.'
  }
  return err?.shortMessage || err?.message || 'Something went wrong.'
}
