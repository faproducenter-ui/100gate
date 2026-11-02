import { Routes, Route } from 'react-router'
import Home from './episode/EpisodePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
