import { Routes, Route } from 'react-router'
import IsoPage from './iso/Page'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<IsoPage />} />
    </Routes>
  )
}
