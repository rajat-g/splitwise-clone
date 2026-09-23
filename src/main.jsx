import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexReactClient } from 'convex/react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// PWA: cache the app shell for offline launches; new versions
// (registerType: autoUpdate) apply silently on the next launch.
registerSW()

const convexUrl = import.meta.env.VITE_CONVEX_URL
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

function Root() {
  if (!convex) {
    return (
      <div style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'sans-serif', padding: 16 }}>
        <h1>Connect Convex to go live</h1>
        <ol>
          <li><code>npx convex dev</code> — creates your free project, generates <code>convex/_generated</code></li>
          <li>Copy the URL it prints into <code>.env</code> as <code>VITE_CONVEX_URL=...</code> (see <code>.env.example</code>)</li>
          <li><code>npm run dev</code> again</li>
        </ol>
        <p>Then deploy DB with <code>npx convex deploy</code> and frontend with Vercel.</p>
      </div>
    )
  }
  return (
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
