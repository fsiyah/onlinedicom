import React, { useState } from 'react'
import { useViewerStore } from '../../store/viewerStore'
import { X, Download, Image as ImageIcon } from 'lucide-react'
import './ExportDialog.css'

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

const ExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onClose }) => {
  const activeStudy = useViewerStore((state) =>
    state.studies.find((s) => s.id === state.activeStudyId)
  )
  const activeSeriesId = useViewerStore((state) => state.activeSeriesId)
  const activeSeries = activeStudy?.series.find(
    (s) => s.id === activeSeriesId
  )
  const [exportFormat, setExportFormat] = useState<'jpeg' | 'bmp' | 'png'>('jpeg')
  const [exportScope, setExportScope] = useState<'current' | 'series' | 'study'>('current')
  const [quality, setQuality] = useState(90)

  if (!isOpen) return null

  const handleExport = async () => {
    // TODO: Implement actual export functionality
    // This would capture the canvas and convert to the selected format
    console.log('Export:', { exportFormat, exportScope, quality })
    alert('Export functionality will be implemented with canvas capture')
    onClose()
  }

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-dialog-header">
          <h2>Export Images</h2>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="export-dialog-content">
          <div className="export-section">
            <label>Export Format</label>
            <div className="format-options">
              <button
                className={`format-button ${exportFormat === 'jpeg' ? 'active' : ''}`}
                onClick={() => setExportFormat('jpeg')}
              >
                <ImageIcon size={20} />
                JPEG
              </button>
              <button
                className={`format-button ${exportFormat === 'bmp' ? 'active' : ''}`}
                onClick={() => setExportFormat('bmp')}
              >
                <ImageIcon size={20} />
                BMP
              </button>
              <button
                className={`format-button ${exportFormat === 'png' ? 'active' : ''}`}
                onClick={() => setExportFormat('png')}
              >
                <ImageIcon size={20} />
                PNG
              </button>
            </div>
          </div>

          <div className="export-section">
            <label>Export Scope</label>
            <div className="scope-options">
              <label className="radio-label">
                <input
                  type="radio"
                  value="current"
                  checked={exportScope === 'current'}
                  onChange={(e) => setExportScope(e.target.value as any)}
                />
                Current Image
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  value="series"
                  checked={exportScope === 'series'}
                  onChange={(e) => setExportScope(e.target.value as any)}
                />
                Current Series ({activeSeries?.images.length || 0} images)
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  value="study"
                  checked={exportScope === 'study'}
                  onChange={(e) => setExportScope(e.target.value as any)}
                />
                Current Study ({activeStudy?.series.reduce((sum, s) => sum + s.images.length, 0) || 0} images)
              </label>
            </div>
          </div>

          {exportFormat === 'jpeg' && (
            <div className="export-section">
              <label>Quality: {quality}%</label>
              <input
                type="range"
                min="1"
                max="100"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="quality-slider"
              />
            </div>
          )}
        </div>

        <div className="export-dialog-footer">
          <button className="cancel-button" onClick={onClose}>
            Cancel
          </button>
          <button className="export-button" onClick={handleExport}>
            <Download size={16} />
            Export
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExportDialog
