import { BrowserProvider, Contract, toQuantity } from 'ethers'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CHAIN_ID, CHAIN_NAME, CHAIN_RPC_URL, JUKECOIN_ABI, JUKECOIN_ADDRESS } from './config.js'
import { WalletContext } from './wallet-context.js'

const ethereum = typeof window === 'undefined' ? undefined : window.ethereum

// A fresh provider per call: ethers caches the network, and MetaMask users switch networks.
async function jukeCoin(withSigner) {
  const provider = new BrowserProvider(ethereum)
  if ((await provider.getCode(JUKECOIN_ADDRESS)) === '0x') {
    throw new Error(
      `JukeCoin is not deployed at ${JUKECOIN_ADDRESS} on this network. ` +
        'Run `npm run deploy:jukecoin:local` in contracts/ (and redeploy after restarting the node).',
    )
  }
  const runner = withSigner ? await provider.getSigner() : provider
  return new Contract(JUKECOIN_ADDRESS, JUKECOIN_ABI, runner)
}

async function readWalletState(account) {
  const contract = await jukeCoin(false)
  const [balance, next] = await Promise.all([contract.balanceOf(account), contract.nextClaimAt(account)])
  return { balance, nextClaimAt: Number(next) }
}

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [balance, setBalance] = useState(null) // bigint, base units
  const [nextClaimAt, setNextClaimAt] = useState(0) // unix seconds, 0 = can claim now
  const [connecting, setConnecting] = useState(false)
  const [readError, setReadError] = useState('')

  const onCorrectChain = chainId === CHAIN_ID
  const ready = Boolean(account && onCorrectChain && JUKECOIN_ADDRESS)

  // Pick up an already-authorized account without a popup, and follow account/network changes.
  useEffect(() => {
    if (!ethereum) return
    const handleAccounts = (accounts) => setAccount(accounts[0] ?? null)
    const handleChain = (id) => setChainId(Number(id))

    ethereum.request({ method: 'eth_accounts' }).then(handleAccounts).catch(() => {})
    ethereum.request({ method: 'eth_chainId' }).then(handleChain).catch(() => {})
    ethereum.on?.('accountsChanged', handleAccounts)
    ethereum.on?.('chainChanged', handleChain)
    return () => {
      ethereum.removeListener?.('accountsChanged', handleAccounts)
      ethereum.removeListener?.('chainChanged', handleChain)
    }
  }, [])

  const applyRead = useCallback((result) => {
    setBalance(result.balance)
    setNextClaimAt(result.nextClaimAt)
    setReadError('')
  }, [])

  const applyReadError = useCallback((err) => {
    setBalance(null)
    setReadError(err.shortMessage || err.message)
  }, [])

  // Balance lives on-chain: re-read it whenever the account or network changes.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    readWalletState(account)
      .then((result) => !cancelled && applyRead(result))
      .catch((err) => !cancelled && applyReadError(err))
    return () => {
      cancelled = true
    }
  }, [ready, account, chainId, applyRead, applyReadError])

  const refresh = useCallback(async () => {
    try {
      applyRead(await readWalletState(account))
    } catch (err) {
      applyReadError(err)
    }
  }, [account, applyRead, applyReadError])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
      setAccount(accounts[0] ?? null)
      setChainId(Number(await ethereum.request({ method: 'eth_chainId' })))
    } finally {
      setConnecting(false)
    }
  }, [])

  const switchNetwork = useCallback(async () => {
    const chainIdHex = toQuantity(CHAIN_ID)
    try {
      await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] })
    } catch (err) {
      if (err.code !== 4902) throw err // 4902: MetaMask doesn't know this chain yet
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainIdHex,
            chainName: CHAIN_NAME,
            rpcUrls: [CHAIN_RPC_URL],
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          },
        ],
      })
    }
  }, [])

  const claim = useCallback(async () => {
    const contract = await jukeCoin(true)
    const tx = await contract.claimTokens()
    await tx.wait()
    await refresh()
  }, [refresh])

  /** Sends payForPlay and waits for it to be mined. Returns the transaction hash. */
  const payForPlay = useCallback(
    async (songId, playId, onSubmitted) => {
      const contract = await jukeCoin(true)
      const tx = await contract.payForPlay(songId, playId)
      onSubmitted?.(tx.hash)
      const receipt = await tx.wait()
      await refresh()
      return receipt.hash
    },
    [refresh],
  )

  const value = useMemo(
    () => ({
      hasWallet: Boolean(ethereum),
      configured: Boolean(JUKECOIN_ADDRESS),
      account,
      onCorrectChain,
      ready,
      balance,
      nextClaimAt,
      connecting,
      readError,
      connect,
      switchNetwork,
      claim,
      payForPlay,
    }),
    [account, onCorrectChain, ready, balance, nextClaimAt, connecting, readError, connect, switchNetwork, claim, payForPlay],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
