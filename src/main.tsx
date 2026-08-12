import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Editor } from './editor/Editor'
import { consumeRigParam } from './rig/visibility'
import { type Route, routeFromHash } from './routing'
import '@weasel-js/labkit/styles.css'

// Before the first render, so unlocking does not flash the locked editor.
consumeRigParam()

function Root() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return route === 'edit' ? <Editor /> : <App />
}

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
