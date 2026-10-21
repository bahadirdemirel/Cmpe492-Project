import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth-context.js'
import { AuthLayout, Field, FormError } from '../components/AuthLayout.jsx'

const EMPTY_FORM = { username: '', email: '', password: '', confirmPassword: '' }

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const update = (event) => setForm((f) => ({ ...f, [event.target.name]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setFieldErrors({})
    setFormError('')

    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match.' })
      return
    }

    setSubmitting(true)
    try {
      await register({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setFieldErrors(err.fieldErrors?.() ?? {})
      setFormError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle="Sign up to browse the library and request songs."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <FormError message={formError} />
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          required
          autoFocus
          value={form.username}
          onChange={update}
          error={fieldErrors.username}
        />
        <Field
          label="Email (optional)"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={update}
          error={fieldErrors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={update}
          hint="At least 8 characters. Not too common, not only numbers, not close to your username."
          error={fieldErrors.password}
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirmPassword}
          onChange={update}
          error={fieldErrors.confirmPassword}
        />
        <button type="submit" className="button primary" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
