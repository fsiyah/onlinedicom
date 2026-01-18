import React, { useState } from 'react'
import { useViewerStore } from '../../store/viewerStore'
import { Maximize2, Grid3x3 } from 'lucide-react'
import DicomViewer from '../Viewer/DicomViewer'
import './MPRViewer.css'

const MPRViewer: React.FC = () => {
  const activeStudyId = useViewerStore((state) => state.activeStudyId)
  const activeSeriesId = useViewerStore((state) => state.activeSeriesId)
  const [layout, setLayout] = useState<'1x1' | '2x2' | '3x3'>('2x2')
  const [activePlane, setActivePlane] = useState<'axial' | 'coronal' | 'sagittal'>('axial')

  // In a real implementation, this would reconstruct images in different planes
  // For now, we'll show placeholder viewers

  return (
    <div className="mpr-viewer">
      <div className="mpr-toolbar">
        <div className="mpr-controls">
          <button
            className={`plane-button ${activePlane === 'axial' ? 'active' : ''}`}
            onClick={() => setActivePlane('axial')}
          >
            Axial
          </button>
          <button
            className={`plane-button ${activePlane === 'coronal' ? 'active' : ''}`}
            onClick={() => setActivePlane('coronal')}
          >
            Coronal
          </button>
          <button
            className={`plane-button ${activePlane === 'sagittal' ? 'active' : ''}`}
            onClick={() => setActivePlane('sagittal')}
          >
            Sagittal
          </button>
        </div>
        <div className="layout-controls">
          <button
            className={`layout-button ${layout === '1x1' ? 'active' : ''}`}
            onClick={() => setLayout('1x1')}
          >
            <Maximize2 size={16} />
          </button>
          <button
            className={`layout-button ${layout === '2x2' ? 'active' : ''}`}
            onClick={() => setLayout('2x2')}
          >
            <Grid3x3 size={16} />
          </button>
        </div>
      </div>
      <div className={`mpr-grid layout-${layout}`}>
        {layout === '1x1' && (
          <div className="mpr-panel">
            <DicomViewer
              studyId={activeStudyId || ''}
              seriesId={activeSeriesId || ''}
              imageIndex={0}
            />
          </div>
        )}
        {layout === '2x2' && (
          <>
            <div className="mpr-panel">
              <div className="plane-label">Axial</div>
              <DicomViewer
                studyId={activeStudyId || ''}
                seriesId={activeSeriesId || ''}
                imageIndex={0}
              />
            </div>
            <div className="mpr-panel">
              <div className="plane-label">Coronal</div>
              <DicomViewer
                studyId={activeStudyId || ''}
                seriesId={activeSeriesId || ''}
                imageIndex={0}
              />
            </div>
            <div className="mpr-panel">
              <div className="plane-label">Sagittal</div>
              <DicomViewer
                studyId={activeStudyId || ''}
                seriesId={activeSeriesId || ''}
                imageIndex={0}
              />
            </div>
            <div className="mpr-panel">
              <div className="plane-label">3D</div>
              <div className="placeholder-3d">3D View</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default MPRViewer
