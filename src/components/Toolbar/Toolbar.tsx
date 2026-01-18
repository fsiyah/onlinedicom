import React, { useState } from 'react'
import { useViewerStore } from '../../store/viewerStore'
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  RotateCcw,
  Maximize,
  Minus,
  Plus,
  Ruler,
  MoveDiagonal,
  Circle,
  Square,
  Download,
  Settings,
  Grid,
  Server,
} from 'lucide-react'
import ExportDialog from '../Export/ExportDialog'
import PACSDialog from '../PACS/PACSDialog'
import './Toolbar.css'

const Toolbar: React.FC = () => {
  const zoom = useViewerStore((state) => state.zoom)
  const rotation = useViewerStore((state) => state.rotation)
  const flipHorizontal = useViewerStore((state) => state.flipHorizontal)
  const flipVertical = useViewerStore((state) => state.flipVertical)
  const windowWidth = useViewerStore((state) => state.windowWidth)
  const windowCenter = useViewerStore((state) => state.windowCenter)
  const setZoom = useViewerStore((state) => state.setZoom)
  const setRotation = useViewerStore((state) => state.setRotation)
  const toggleFlipHorizontal = useViewerStore((state) => state.toggleFlipHorizontal)
  const toggleFlipVertical = useViewerStore((state) => state.toggleFlipVertical)
  const setWindowWidth = useViewerStore((state) => state.setWindowWidth)
  const setWindowCenter = useViewerStore((state) => state.setWindowCenter)
  const resetView = useViewerStore((state) => state.resetView)
  const nextImage = useViewerStore((state) => state.nextImage)
  const previousImage = useViewerStore((state) => state.previousImage)

  const [activeTool, setActiveTool] = React.useState<string | null>(null)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showPACSDialog, setShowPACSDialog] = useState(false)

  const handleZoomIn = () => setZoom(zoom * 1.2)
  const handleZoomOut = () => setZoom(zoom / 1.2)
  const handleRotate = (direction: 'cw' | 'ccw') => {
    setRotation(rotation + (direction === 'cw' ? 90 : -90))
  }

  const presetWindows = [
    { name: 'Lung', width: 1500, center: -600 },
    { name: 'Bone', width: 2000, center: 400 },
    { name: 'Brain', width: 80, center: 40 },
    { name: 'Abdomen', width: 400, center: 40 },
    { name: 'Mediastinum', width: 350, center: 50 },
  ]

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <div className="toolbar-group">
          <button
            className={`toolbar-button ${activeTool === 'pan' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'pan' ? null : 'pan')}
            title="Pan Tool"
          >
            <Maximize size={18} />
          </button>
          <button
            className={`toolbar-button ${activeTool === 'zoom' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'zoom' ? null : 'zoom')}
            title="Zoom Tool"
          >
            <ZoomIn size={18} />
          </button>
          <div className="toolbar-divider" />
          <button className="toolbar-button" onClick={handleZoomOut} title="Zoom Out">
            <ZoomOut size={18} />
          </button>
          <button className="toolbar-button" onClick={handleZoomIn} title="Zoom In">
            <ZoomIn size={18} />
          </button>
          <button className="toolbar-button" onClick={() => setZoom(1)} title="Reset Zoom">
            <span style={{ fontSize: '12px' }}>1:1</span>
          </button>
        </div>

        <div className="toolbar-group">
          <div className="toolbar-divider" />
          <button
            className="toolbar-button"
            onClick={() => handleRotate('ccw')}
            title="Rotate Counter-clockwise"
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="toolbar-button"
            onClick={() => handleRotate('cw')}
            title="Rotate Clockwise"
          >
            <RotateCw size={18} />
          </button>
          <button
            className={`toolbar-button ${flipHorizontal ? 'active' : ''}`}
            onClick={toggleFlipHorizontal}
            title="Flip Horizontal"
          >
            <FlipHorizontal size={18} />
          </button>
          <button
            className={`toolbar-button ${flipVertical ? 'active' : ''}`}
            onClick={toggleFlipVertical}
            title="Flip Vertical"
          >
            <FlipVertical size={18} />
          </button>
          <button className="toolbar-button" onClick={resetView} title="Reset View">
            <span style={{ fontSize: '12px' }}>Reset</span>
          </button>
        </div>

        <div className="toolbar-group">
          <div className="toolbar-divider" />
          <button
            className={`toolbar-button ${activeTool === 'length' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'length' ? null : 'length')}
            title="Length Measurement"
          >
            <Ruler size={18} />
          </button>
          <button
            className={`toolbar-button ${activeTool === 'angle' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'angle' ? null : 'angle')}
            title="Angle Measurement"
          >
            <MoveDiagonal size={18} />
          </button>
          <button
            className={`toolbar-button ${activeTool === 'roi' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'roi' ? null : 'roi')}
            title="Rectangle ROI"
          >
            <Square size={18} />
          </button>
          <button
            className={`toolbar-button ${activeTool === 'ellipse' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'ellipse' ? null : 'ellipse')}
            title="Ellipse ROI"
          >
            <Circle size={18} />
          </button>
        </div>

        <div className="toolbar-group">
          <div className="toolbar-divider" />
          <button className="toolbar-button" onClick={previousImage} title="Previous Image">
            <Minus size={18} />
          </button>
          <button className="toolbar-button" onClick={nextImage} title="Next Image">
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="toolbar-section">
        <div className="toolbar-group">
          <div className="window-controls">
            <label>W:</label>
            <input
              type="number"
              value={Math.round(windowWidth)}
              onChange={(e) => setWindowWidth(Number(e.target.value))}
              className="window-input"
            />
            <label>C:</label>
            <input
              type="number"
              value={Math.round(windowCenter)}
              onChange={(e) => setWindowCenter(Number(e.target.value))}
              className="window-input"
            />
          </div>
          <div className="preset-windows">
            {presetWindows.map((preset) => (
              <button
                key={preset.name}
                className="preset-button"
                onClick={() => {
                  setWindowWidth(preset.width)
                  setWindowCenter(preset.center)
                }}
                title={`${preset.name} Window (W: ${preset.width}, C: ${preset.center})`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="toolbar-section">
        <div className="toolbar-group">
          <button className="toolbar-button" onClick={() => setShowExportDialog(true)} title="Export">
            <Download size={18} />
          </button>
          <button className="toolbar-button" title="Layout">
            <Grid size={18} />
          </button>
          <button className="toolbar-button" onClick={() => setShowPACSDialog(true)} title="PACS">
            <Server size={18} />
          </button>
          <button className="toolbar-button" title="Settings">
            <Settings size={18} />
          </button>
        </div>
      </div>

      <ExportDialog isOpen={showExportDialog} onClose={() => setShowExportDialog(false)} />
      <PACSDialog isOpen={showPACSDialog} onClose={() => setShowPACSDialog(false)} />
    </div>
  )
}

export default Toolbar
