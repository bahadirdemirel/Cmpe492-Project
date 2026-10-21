import { useEffect, useRef, useState } from 'react'

const formatTime = (seconds) =>
  Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00'

/**
 * Plays one paid track exactly once: no native controls, no seeking, no replay.
 * Calls onDone when the track ends or is stopped.
 */
export function PaidPlayer({ track, src, onDone }) {
  const audioRef = useRef(null)
  const [progress, setProgress] = useState({ current: 0, duration: 0 })
  const [needsGesture, setNeedsGesture] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // The payment flow takes a while, so the browser may no longer treat this as user-initiated.
    audioRef.current?.play().catch((err) => {
      if (err.name === 'NotAllowedError') setNeedsGesture(true)
    })
  }, [src])

  const start = () => {
    setNeedsGesture(false)
    audioRef.current?.play()
  }

  return (
    <footer className="player">
      <div className="track-info">
        <span className="muted">Now playing (paid, 1 play)</span>
        <span className="track-title">
          {track.title}
          {track.artist && ` · ${track.artist}`}
        </span>
      </div>
      <div className="player-controls">
        {needsGesture ? (
          <button type="button" className="button accent" onClick={start}>
            Start playback
          </button>
        ) : (
          <>
            <progress max={progress.duration || 1} value={progress.current} aria-label="Playback progress" />
            <span className="muted player-time">
              {formatTime(progress.current)} / {formatTime(progress.duration)}
            </span>
          </>
        )}
        <button type="button" className="button" onClick={onDone}>
          Stop
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onTimeUpdate={(e) => setProgress({ current: e.currentTarget.currentTime, duration: e.currentTarget.duration })}
        onLoadedMetadata={(e) => setProgress({ current: 0, duration: e.currentTarget.duration })}
        onEnded={onDone}
        onError={() => setError('The audio could not be loaded. The stream link may have expired.')}
      />
    </footer>
  )
}
