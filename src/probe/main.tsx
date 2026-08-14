import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Probe } from './Probe'
import { consumeTokenFromHash } from './launch'

// Before the first render, so the token never reaches the address bar's history.
const token = consumeTokenFromHash()

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

createRoot(root).render(
  <StrictMode>
    <Probe initialToken={token ?? undefined} />
  </StrictMode>,
)
