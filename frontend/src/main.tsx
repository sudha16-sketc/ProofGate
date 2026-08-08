import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id'
import './lib/polyfills/buffer'
import './index.css'
import App from './App.tsx'
import { NETWORK } from './lib/env'

setNetworkId(NETWORK)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
