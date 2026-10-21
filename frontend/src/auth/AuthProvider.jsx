import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../api/client.js'
import { AuthContext } from './auth-context.js'

const TOKEN_KEY = 'jukebox.authToken'

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage unavailable (e.g. private mode): the session just won't survive a reload.
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readToken)
  const [user, setUser] = useState(null)
  // True while a token saved by an earlier visit is being checked against /auth/me/
  const [restoring, setRestoring] = useState(token !== null)

  const startSession = useCallback(({ token: newToken, user: newUser }) => {
    writeToken(newToken)
    setToken(newToken)
    setUser(newUser)
  }, [])

  const endSession = useCallback(() => {
    writeToken(null)
    setToken(null)
    setUser(null)
  }, [])

  useEffect(() => {
    if (!restoring) return
    const controller = new AbortController()
    apiRequest('/auth/me/', { token, signal: controller.signal })
      .then((me) => {
        setUser(me)
        setRestoring(false)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        // Forget the token only if the server rejected it, not if the server is just down.
        if (err.status === 401) writeToken(null)
        setToken(null)
        setRestoring(false)
      })
    return () => controller.abort()
  }, [restoring, token])

  const login = useCallback(
    async (username, password) => {
      startSession(await apiRequest('/auth/login/', { method: 'POST', body: { username, password } }))
    },
    [startSession],
  )

  const register = useCallback(
    async (fields) => {
      startSession(await apiRequest('/auth/register/', { method: 'POST', body: fields }))
    },
    [startSession],
  )

  const logout = useCallback(async () => {
    const current = token
    endSession()
    try {
      await apiRequest('/auth/logout/', { method: 'POST', token: current })
    } catch {
      // The local session is gone either way.
    }
  }, [token, endSession])

  // For authenticated API calls; an expired or revoked token logs the user out.
  const authedRequest = useCallback(
    async (path, options = {}) => {
      try {
        return await apiRequest(path, { ...options, token })
      } catch (err) {
        if (err.status === 401) endSession()
        throw err
      }
    },
    [token, endSession],
  )

  const value = useMemo(
    () => ({ user, restoring, login, register, logout, authedRequest }),
    [user, restoring, login, register, logout, authedRequest],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
