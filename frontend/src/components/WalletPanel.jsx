import { formatUnits } from 'ethers'
import { useEffect, useState } from 'react'
import { CHAIN_NAME, FAUCET_AMOUNT, TOKEN_DECIMALS } from '../web3/config.js'
import { describeError, useWallet } from '../web3/wallet-context.js'

const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`

// Uses the viewer's locale (e.g. 1,000.5 in English, 1.000,5 in Turkish). Formatting the decimal
// string keeps full precision, and truncating never shows more than the wallet actually holds.
const jukeFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3, roundingMode: 'trunc' })

const formatJuke = (amount) => jukeFormat.format(formatUnits(amount, TOKEN_DECIMALS))

export function WalletPanel() {
  const wallet = useWallet()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { kind: 'error' | 'success', text }
  // Clock for the faucet cooldown; a coarse tick is enough for a 24-hour cooldown.
  const [now, setNow] = useState(() => Date.now() / 1000)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 30_000)
    return () => clearInterval(id)
  }, [])

  async function run(action, successText) {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      if (successText) setMessage({ kind: 'success', text: successText })
    } catch (err) {
      setMessage({ kind: 'error', text: describeError(err) })
    } finally {
      setBusy(false)
    }
  }

  let body
  if (!wallet.hasWallet) {
    body = (
      <p className="muted">
        MetaMask was not detected. Install it from{' '}
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          metamask.io
        </a>{' '}
        and reload this page.
      </p>
    )
  } else if (!wallet.configured) {
    body = (
      <p className="muted">
        No JukeCoin address configured. Set <code>VITE_JUKECOIN_ADDRESS</code> in <code>frontend/.env.local</code>.
      </p>
    )
  } else if (!wallet.account) {
    body = (
      <button type="button" className="button accent" disabled={wallet.connecting} onClick={() => run(wallet.connect)}>
        {wallet.connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
    )
  } else if (!wallet.onCorrectChain) {
    body = (
      <>
        <p className="muted">MetaMask is on a different network.</p>
        <button type="button" className="button accent" disabled={busy} onClick={() => run(wallet.switchNetwork)}>
          Switch to {CHAIN_NAME}
        </button>
      </>
    )
  } else {
    const coolingDown = wallet.nextClaimAt > now
    body = (
      <>
        <dl className="wallet-stats">
          <div>
            <dt>Wallet</dt>
            <dd title={wallet.account}>{shortAddress(wallet.account)}</dd>
          </div>
          <div>
            <dt>Balance</dt>
            <dd className="balance" aria-live="polite">
              {wallet.balance === null ? '—' : `${formatJuke(wallet.balance)} JUKE`}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          className="button accent"
          disabled={busy || coolingDown}
          onClick={() => run(wallet.claim, `Claimed ${formatJuke(FAUCET_AMOUNT)} JUKE.`)}
        >
          {busy ? 'Claiming…' : 'Claim 1000 JukeCoin'}
        </button>
        {coolingDown && (
          <p className="field-hint">
            Next claim available {new Date(wallet.nextClaimAt * 1000).toLocaleString()}.
          </p>
        )}
        {wallet.readError && <p className="field-error">{wallet.readError}</p>}
      </>
    )
  }

  return (
    <section className="wallet-panel" aria-label="Wallet">
      {body}
      {message && (
        <p className={message.kind === 'error' ? 'field-error' : 'field-success'} role="status">
          {message.text}
        </p>
      )}
    </section>
  )
}
