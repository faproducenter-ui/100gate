import { lazy, Suspense } from 'react'
import { Routes, Route, useSearchParams } from 'react-router'
import IsoPage from './iso/Page'

// Chapter 2 (the gas station) is opened with ?loc=station so it works on static hosting without server routes.
const StationPage = lazy(() => import('./station/StationPage'))

function Home() {
  const [params] = useSearchParams()
  if (params.get('loc') === 'station') return <Suspense fallback={null}><StationPage /></Suspense>
  return <IsoPage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
