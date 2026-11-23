import { lazy, Suspense } from 'react'
import { Routes, Route, useSearchParams } from 'react-router'
import IsoPage from './iso/Page'
import { LoadingScreen } from './boot/screen'

// Chapter 2 (the gas station) is opened with ?loc=station so it works on static hosting without server routes.
const StationPage = lazy(() => import('./station/StationPage').catch(error => {
  // the chapter's code did not arrive: say so on the loading screen instead of leaving it waiting
  console.error('[100GATE] station code failed to load', error)
  LoadingScreen.attach()?.error('Не удалось загрузить локацию. Попробуйте ещё раз.', () => location.reload())
  return new Promise<never>(() => {})
}))

function Home() {
  const [params] = useSearchParams()
  if (params.get('loc') === 'station') return <Suspense fallback={null}><StationPage /></Suspense>
  return <IsoPage />
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
