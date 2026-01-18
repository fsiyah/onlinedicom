import { useEffect } from 'react'
import { useViewerStore } from './store/viewerStore'
import Layout from './components/Layout/Layout'
import ViewerContainer from './components/Viewer/ViewerContainer'
import Sidebar from './components/Sidebar/Sidebar'
import Toolbar from './components/Toolbar/Toolbar'
import StatusBar from './components/StatusBar/StatusBar'
import './App.css'

function App() {
  const initializeCornerstone = useViewerStore((state) => state.initializeCornerstone)

  useEffect(() => {
    // Initialize cornerstone asynchronously to avoid blocking render
    setTimeout(() => {
      try {
        initializeCornerstone()
      } catch (error) {
        console.error('Failed to initialize Cornerstone:', error)
      }
    }, 100)
  }, [initializeCornerstone])

  return (
    <Layout>
      <Sidebar />
      <div className="main-content">
        <Toolbar />
        <ViewerContainer />
        <StatusBar />
      </div>
    </Layout>
  )
}

export default App
