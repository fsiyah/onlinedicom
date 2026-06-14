import { useEffect } from 'react'
import { useViewerStore } from './store/viewerStore'
import Layout from './components/Layout/Layout'
import ViewerContainer from './components/Viewer/ViewerContainer'
import Sidebar from './components/Sidebar/Sidebar'
import Toolbar from './components/Toolbar/Toolbar'
import StatusBar from './components/StatusBar/StatusBar'
import LandingPage from './components/LandingPage/LandingPage'
import './App.css'

function App() {
  const initializeCornerstone = useViewerStore((state) => state.initializeCornerstone)
  const isViewerRoute = window.location.pathname.replace(/\/$/, '') === '/app'

  useEffect(() => {
    document.body.classList.toggle('viewer-page', isViewerRoute)
    document.body.classList.toggle('landing-page-body', !isViewerRoute)

    return () => {
      document.body.classList.remove('viewer-page', 'landing-page-body')
    }
  }, [isViewerRoute])

  useEffect(() => {
    if (!isViewerRoute) {
      return
    }

    // Initialize cornerstone asynchronously to avoid blocking render
    setTimeout(() => {
      try {
        initializeCornerstone()
      } catch (error) {
        console.error('Failed to initialize Cornerstone:', error)
      }
    }, 100)
  }, [initializeCornerstone, isViewerRoute])

  if (!isViewerRoute) {
    return <LandingPage />
  }

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
