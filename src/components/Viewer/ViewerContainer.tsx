import React from 'react'
import { useViewerStore } from '../../store/viewerStore'
import DicomViewer from './DicomViewer'
import MPRViewer from '../MPR/MPRViewer'
import Viewer3D from '../Viewer3D/Viewer3D'
import SliceNavigator from '../SliceNavigator/SliceNavigator'
import ControlsHelp from '../ControlsHelp/ControlsHelp'
import './ViewerContainer.css'

const ViewerContainer: React.FC = () => {
  const activeStudyId = useViewerStore((state) => state.activeStudyId)
  const activeSeriesId = useViewerStore((state) => state.activeSeriesId)
  const activeImageIndex = useViewerStore((state) => state.activeImageIndex)
  const viewMode = useViewerStore((state) => state.viewMode)
  const studies = useViewerStore((state) => state.studies)
  const openViewers = useViewerStore((state) => state.openViewers)

  const activeStudy = studies.find((s) => s.id === activeStudyId)
  const activeSeries = activeStudy?.series.find((s) => s.id === activeSeriesId)

  if (openViewers.length > 0) {
    return (
      <div className="viewer-container multi-viewer">
        {openViewers.map((viewer) => {
          return (
            <div key={viewer.id} className="viewer-panel">
              <DicomViewer
                studyId={viewer.studyId}
                seriesId={viewer.seriesId}
                imageIndex={viewer.imageIndex}
              />
            </div>
          )
        })}
      </div>
    )
  }

  if (!activeSeries || activeSeries.images.length === 0) {
    return (
      <div className="viewer-container empty">
        <div className="empty-message">
          <p>No images loaded</p>
          <p className="empty-hint">Open DICOM files from the sidebar to get started</p>
        </div>
      </div>
    )
  }

  // Show MPR viewer if view mode is MPR
  if (viewMode === 'MPR') {
    return (
      <div className="viewer-container">
        <MPRViewer />
      </div>
    )
  }

  if (viewMode === '3D') {
    return (
      <div className="viewer-container">
        <Viewer3D />
      </div>
    )
  }

  // Default 2D viewer
  return (
    <div className="viewer-container">
      <DicomViewer
        studyId={activeStudyId || ''}
        seriesId={activeSeriesId || ''}
        imageIndex={activeImageIndex}
      />
      <SliceNavigator />
      <ControlsHelp />
    </div>
  )
}

export default ViewerContainer
