const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }

  // DRF validation errors look like { username: ["..."], password: ["...", "..."] }
  fieldErrors() {
    if (!this.data || typeof this.data !== 'object') return {}
    const errors = {}
    for (const [field, messages] of Object.entries(this.data)) {
      if (field !== 'detail' && field !== 'non_field_errors' && Array.isArray(messages)) {
        errors[field] = messages.join(' ')
      }
    }
    return errors
  }
}

function summarize(data, status) {
  if (data && typeof data === 'object') {
    if (typeof data.detail === 'string') return data.detail
    if (Array.isArray(data.non_field_errors)) return data.non_field_errors.join(' ')
    if (Object.keys(data).length > 0) return 'Please fix the highlighted fields.'
  }
  return `Request failed (HTTP ${status}).`
}

export async function apiRequest(path, { method = 'GET', body, token, signal } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Token ${token}`

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Cannot reach the server. Is the Django backend running?', 0)
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(summarize(data, response.status), response.status, data)
  return data
}
