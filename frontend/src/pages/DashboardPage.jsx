import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth-context.js'
import { PaidPlayer } from '../components/PaidPlayer.jsx'
import { WalletPanel } from '../components/WalletPanel.jsx'
import { PLAY_PRICE } from '../web3/config.js'
import { describeError, useWallet } from '../web3/wallet-context.js'

const STEP_LABELS = {
  reserving: 'Preparing…',
  wallet: 'Confirm the payment in MetaMask…',
  mining: 'Waiting for the transaction…',
  verifying: 'Verifying payment…',
}

export default function DashboardPage() {
  const { user, logout, authedRequest } = useAuth()
  const wallet = useWallet()
  const [tracks, setTracks] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  // Payment in progress or failed: { trackId, step, error?, pending?: { playId, txHash } }
  const [purchase, setPurchase] = useState(null)
  const [nowPlaying, setNowPlaying] = useState(null) // { track, src }

  useEffect(() => {
    const controller = new AbortController()
    authedRequest('/tracks/', { signal: controller.signal })
      .then((data) => {
        setTracks(data)
        setStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err.message)
        setStatus('error')
      })
    return () => controller.abort()
  }, [authedRequest, reloadKey])

  const retry = () => {
    setStatus('loading')
    setReloadKey((k) => k + 1)
  }

  async function confirmAndPlay(track, playId, txHash) {
    setPurchase({ trackId: track.id, step: 'verifying' })
    try {
      const { stream_url: src } = await authedRequest(`/plays/${playId}/confirm/`, {
        method: 'POST',
        body: { tx_hash: txHash },
      })
      setPurchase(null)
      setNowPlaying({ track, src })
    } catch (err) {
      // The tokens are already spent, so offer to retry the verification instead of paying again.
      setPurchase({ trackId: track.id, step: 'error', error: describeError(err), pending: { playId, txHash } })
    }
  }

  async function payAndPlay(track) {
    setNowPlaying(null)
    setPurchase({ trackId: track.id, step: 'reserving' })
    let play
    let txHash
    try {
      play = await authedRequest(`/tracks/${track.id}/plays/`, { method: 'POST' })
      setPurchase({ trackId: track.id, step: 'wallet' })
      txHash = await wallet.payForPlay(track.id, play.play_id, () =>
        setPurchase({ trackId: track.id, step: 'mining' }),
      )
    } catch (err) {
      setPurchase({ trackId: track.id, step: 'error', error: describeError(err) })
      return
    }
    await confirmAndPlay(track, play.id, txHash)
  }

  const busy = purchase !== null && purchase.step !== 'error'
  const canAfford = wallet.balance !== null && wallet.balance >= PLAY_PRICE
  let playHint = ''
  if (!wallet.ready) playHint = 'Connect your wallet to play songs.'
  else if (!canAfford) playHint = 'You need at least 0.001 JUKE to play a song. Claim some above.'

  return (
    <div className="dashboard">
      <header className="topbar">
        <p className="brand">Jukebox</p>
        <div className="topbar-user">
          <span className="muted">
            Signed in as <strong>{user.username}</strong>
          </span>
          <button type="button" className="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <main className="library">
        <WalletPanel />

        <div className="library-header">
          <h1>Music library</h1>
          {status === 'ready' && (
            <span className="muted">
              {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </span>
          )}
        </div>

        {status === 'loading' && <p className="page-status">Loading tracks…</p>}

        {status === 'error' && (
          <div className="form-error" role="alert">
            <p>Could not load tracks: {error}</p>
            <button type="button" className="button" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && tracks.length === 0 && (
          <div className="empty">
            <p>No tracks yet.</p>
            <p className="muted">
              Drop audio files into <code>backend/media/music/</code>, then run{' '}
              <code>python manage.py sync_music</code>.
            </p>
          </div>
        )}

        {status === 'ready' && tracks.length > 0 && (
          <>
            {playHint && <p className="muted library-hint">{playHint}</p>}
            <ol className="track-list">
              {tracks.map((track, index) => {
                const playing = nowPlaying?.track.id === track.id
                const mine = purchase?.trackId === track.id ? purchase : null
                return (
                  <li key={track.id} className={playing ? 'track playing' : 'track'}>
                    <span className="track-number">{index + 1}</span>
                    <div className="track-info">
                      <span className="track-title">{track.title}</span>
                      <span className="muted">{track.artist || 'Unknown artist'}</span>
                      {mine && mine.step !== 'error' && (
                        <span className="track-status" role="status">
                          {STEP_LABELS[mine.step]}
                        </span>
                      )}
                      {mine?.step === 'error' && (
                        <span className="field-error" role="alert">
                          {mine.error}{' '}
                          {mine.pending && (
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => confirmAndPlay(track, mine.pending.playId, mine.pending.txHash)}
                            >
                              Retry verification
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="button"
                      disabled={!wallet.ready || !canAfford || busy || playing}
                      aria-label={`Play ${track.title} for 0.001 JukeCoin`}
                      onClick={() => payAndPlay(track)}
                    >
                      {playing ? 'Playing' : 'Play (0.001 JukeCoin)'}
                    </button>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </main>

      {nowPlaying && (
        <PaidPlayer
          key={nowPlaying.src}
          track={nowPlaying.track}
          src={nowPlaying.src}
          onDone={() => setNowPlaying(null)}
        />
      )}
    </div>
  )
}
