import React from 'react'
import { useViewerStore } from '../../store/viewerStore'
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react'
import './SliceNavigator.css'

const SliceNavigator: React.FC = () => {
  const activeStudy = useViewerStore((state) =>
    state.studies.find((s) => s.id === state.activeStudyId)
  )
  const activeSeriesId = useViewerStore((state) => state.activeSeriesId)
  const activeSeries = activeStudy?.series.find((s) => s.id === activeSeriesId)
  const activeImageIndex = useViewerStore((state) => state.activeImageIndex)
  const setActiveImageIndex = useViewerStore((state) => state.setActiveImageIndex)
  const nextImage = useViewerStore((state) => state.nextImage)
  const previousImage = useViewerStore((state) => state.previousImage)

  const totalImages = activeSeries?.images.length || 0

  if (!activeSeries || totalImages <= 1) {
    return null // Don't show navigator for single images
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(e.target.value)
    setActiveImageIndex(newIndex)
  }

  const goToFirst = () => setActiveImageIndex(0)
  const goToLast = () => setActiveImageIndex(totalImages - 1)
  const jumpBack = () => {
    const newIndex = Math.max(0, activeImageIndex - 10)
    setActiveImageIndex(newIndex)
  }
  const jumpForward = () => {
    const newIndex = Math.min(totalImages - 1, activeImageIndex + 10)
    setActiveImageIndex(newIndex)
  }

  return (
    <div className="slice-navigator">
      <div className="slice-controls">
        <button
          className="nav-button"
          onClick={goToFirst}
          title="First Slice (Home)"
          disabled={activeImageIndex === 0}
        >
          <SkipBack size={18} />
        </button>
        <button
          className="nav-button"
          onClick={jumpBack}
          title="Jump Back 10 Slices (Page Up)"
          disabled={activeImageIndex === 0}
        >
          <ChevronLeft size={20} />
          <span className="jump-indicator">10</span>
        </button>
        <button
          className="nav-button"
          onClick={previousImage}
          title="Previous Slice (↑ or ←)"
          disabled={activeImageIndex === 0}
        >
          <ChevronLeft size={20} />
        </button>

        <div className="slice-info">
          <span className="slice-number">{activeImageIndex + 1}</span>
          <span className="slice-separator">/</span>
          <span className="slice-total">{totalImages}</span>
        </div>

        <button
          className="nav-button"
          onClick={nextImage}
          title="Next Slice (↓ or →)"
          disabled={activeImageIndex >= totalImages - 1}
        >
          <ChevronRight size={20} />
        </button>
        <button
          className="nav-button"
          onClick={jumpForward}
          title="Jump Forward 10 Slices (Page Down)"
          disabled={activeImageIndex >= totalImages - 1}
        >
          <span className="jump-indicator">10</span>
          <ChevronRight size={20} />
        </button>
        <button
          className="nav-button"
          onClick={goToLast}
          title="Last Slice (End)"
          disabled={activeImageIndex >= totalImages - 1}
        >
          <SkipForward size={18} />
        </button>
      </div>

      <div className="slice-slider-container">
        <input
          type="range"
          min="0"
          max={totalImages - 1}
          value={activeImageIndex}
          onChange={handleSliderChange}
          className="slice-slider"
          title={`Slice ${activeImageIndex + 1} of ${totalImages}`}
        />
      </div>

      <div className="slice-hints">
        <span className="hint">Mouse Wheel: Navigate</span>
        <span className="hint">Arrow Keys: Navigate</span>
        <span className="hint">Page Up/Down: Jump 10</span>
      </div>
    </div>
  )
}

export default SliceNavigator
