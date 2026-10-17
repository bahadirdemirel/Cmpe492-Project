import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthProvider.jsx'
import './index.css'
import { WalletProvider } from './web3/WalletProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
