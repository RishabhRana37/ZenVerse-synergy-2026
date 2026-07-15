/**
 * App — top-level router.
 *
 * Routes:
 *   /         → WarRoom      (the demo view)
 *   /eval     → EvalDashboard
 *   /tokens   → TokensPage   (design system style guide)
 */

import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { WarRoom }        from '@/app/WarRoom'
import { EvalDashboard }  from '@/features/eval/EvalDashboard'
import { TokensPage }     from '@/app/TokensPage'
import { clsx }           from 'clsx'

function NavBar() {
  return (
    <nav className="fixed top-0 right-0 z-50 flex gap-1 p-2">
      {[
        { to: '/',       label: 'War Room' },
        { to: '/eval',   label: 'Eval' },
        { to: '/tokens', label: 'Tokens' },
      ].map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            clsx(
              'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
              isActive
                ? 'bg-accent text-text-inverse'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated',
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/"       element={<WarRoom />} />
        <Route path="/eval"   element={<EvalDashboard />} />
        <Route path="/tokens" element={<TokensPage />} />
      </Routes>
    </BrowserRouter>
  )
}
