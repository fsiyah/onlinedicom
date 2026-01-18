import React, { useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import './ControlsHelp.css'

const ControlsHelp: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) {
    return (
      <button
        className="help-button"
        onClick={() => setIsOpen(true)}
        title="Show Controls Help"
      >
        <HelpCircle size={20} />
      </button>
    )
  }

  return (
    <div className="controls-help-overlay" onClick={() => setIsOpen(false)}>
      <div className="controls-help-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="controls-help-header">
          <h2>RadiAnt-Style Controls</h2>
          <button className="close-button" onClick={() => setIsOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="controls-help-content">
          <div className="control-section">
            <h3>Mouse Controls</h3>
            <div className="control-item">
              <span className="control-key">Left Click + Drag</span>
              <span className="control-desc">Window/Level (Brightness/Contrast)</span>
            </div>
            <div className="control-item">
              <span className="control-key">Right Click + Drag</span>
              <span className="control-desc">Zoom In/Out</span>
            </div>
            <div className="control-item">
              <span className="control-key">Middle Click + Drag</span>
              <span className="control-desc">Pan (Move Image)</span>
            </div>
            <div className="control-item">
              <span className="control-key">Mouse Wheel</span>
              <span className="control-desc">Navigate Slices (CT Series)</span>
            </div>
          </div>

          <div className="control-section">
            <h3>Keyboard Shortcuts</h3>
            <div className="control-item">
              <span className="control-key">↑ / ←</span>
              <span className="control-desc">Previous Slice</span>
            </div>
            <div className="control-item">
              <span className="control-key">↓ / →</span>
              <span className="control-desc">Next Slice</span>
            </div>
            <div className="control-item">
              <span className="control-key">Page Up</span>
              <span className="control-desc">Jump Back 10 Slices</span>
            </div>
            <div className="control-item">
              <span className="control-key">Page Down</span>
              <span className="control-desc">Jump Forward 10 Slices</span>
            </div>
            <div className="control-item">
              <span className="control-key">Home</span>
              <span className="control-desc">First Slice</span>
            </div>
            <div className="control-item">
              <span className="control-key">End</span>
              <span className="control-desc">Last Slice</span>
            </div>
          </div>

          <div className="control-section">
            <h3>Window/Level Presets</h3>
            <div className="control-item">
              <span className="control-key">Toolbar Presets</span>
              <span className="control-desc">Lung, Bone, Brain, Abdomen, Mediastinum</span>
            </div>
            <div className="control-item">
              <span className="control-key">W / C Inputs</span>
              <span className="control-desc">Manual Window Width / Center adjustment</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ControlsHelp
