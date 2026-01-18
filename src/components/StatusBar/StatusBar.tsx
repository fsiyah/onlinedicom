import React from 'react'
import { useViewerStore } from '../../store/viewerStore'
import './StatusBar.css'

const StatusBar: React.FC = () => {
  const activeStudy = useViewerStore((state) =>
    state.studies.find((s) => s.id === state.activeStudyId)
  )
  const activeSeriesId = useViewerStore((state) => state.activeSeriesId)
  const activeSeries = activeStudy?.series.find(
    (s) => s.id === activeSeriesId
  )
  const activeImageIndex = useViewerStore((state) => state.activeImageIndex)
  const zoom = useViewerStore((state) => state.zoom)
  const windowWidth = useViewerStore((state) => state.windowWidth)
  const windowCenter = useViewerStore((state) => state.windowCenter)

  const totalImages = activeSeries?.images.length || 0
  const currentImage = activeSeries?.images[activeImageIndex]

  return (
    <div className="status-bar">
      <div className="status-section">
        {currentImage && (
          <>
            <span className="status-item">
              Patient: {currentImage.patientName || currentImage.patientId || 'Unknown'}
            </span>
            <span className="status-item">
              Study: {currentImage.studyDescription || 'Unknown'}
            </span>
            {currentImage.modality && (
              <span className="status-item">Modality: {currentImage.modality}</span>
            )}
          </>
        )}
      </div>
      <div className="status-section">
        <span className="status-item">
          Image: {activeImageIndex + 1} / {totalImages}
        </span>
        <span className="status-item">Zoom: {(zoom * 100).toFixed(0)}%</span>
        <span className="status-item">
          W: {Math.round(windowWidth)} / C: {Math.round(windowCenter)}
        </span>
      </div>
    </div>
  )
}

export default StatusBar
