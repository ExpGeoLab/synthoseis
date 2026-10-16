import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Runs from './pages/Runs'
import Configs from './pages/Configs'
import RunDetail from './pages/RunDetail'
import Faults from './pages/Faults'
import RockPhysics from './pages/RockPhysics'
import Wavelets from './pages/Wavelets'
import FeaturePreview from './pages/FeaturePreview'
import Augmentation from './pages/Augmentation'
import Datasets from './pages/Datasets'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/runs" element={<Runs />} />
          <Route path="/runs/:id" element={<RunDetail />} />
          <Route path="/configs" element={<Configs />} />
          <Route path="/faults" element={<Faults />} />
          <Route path="/rockphysics" element={<RockPhysics />} />
          <Route path="/wavelets" element={<Wavelets />} />
          <Route path="/features" element={<FeaturePreview />} />
          <Route path="/augmentation" element={<Augmentation />} />
          <Route path="/datasets" element={<Datasets />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <Toaster position="top-right" />
    </BrowserRouter>
  )
}

export default App
