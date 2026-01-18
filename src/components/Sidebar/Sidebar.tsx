import React, { useRef } from 'react'
import { useViewerStore, DicomStudy, DicomSeries } from '../../store/viewerStore'
import { FolderOpen, ChevronRight, ChevronDown, X, Image as ImageIcon } from 'lucide-react'
import './Sidebar.css'

const Sidebar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const studies = useViewerStore((state) => state.studies)
  const activeStudyId = useViewerStore((state) => state.activeStudyId)
  const activeSeriesId = useViewerStore((state) => state.activeSeriesId)
  const loadDicomFiles = useViewerStore((state) => state.loadDicomFiles)
  const setActiveStudy = useViewerStore((state) => state.setActiveStudy)
  const setActiveSeries = useViewerStore((state) => state.setActiveSeries)
  const deleteStudy = useViewerStore((state) => state.deleteStudy)
  const addViewer = useViewerStore((state) => state.addViewer)

  const [expandedStudies, setExpandedStudies] = React.useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = React.useState(false)
  const [loadingProgress, setLoadingProgress] = React.useState(0)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setIsLoading(true)
      setLoadingProgress(0)
      
      try {
        // Simulate progress for better UX
        const progressInterval = setInterval(() => {
          setLoadingProgress(prev => Math.min(prev + 5, 90))
        }, 100)
        
        await loadDicomFiles(files)
        
        clearInterval(progressInterval)
        setLoadingProgress(100)
        
        setTimeout(() => {
          setIsLoading(false)
          setLoadingProgress(0)
        }, 500)
      } catch (error) {
        console.error('Error loading files:', error)
        setIsLoading(false)
        setLoadingProgress(0)
      }
    }
    
    // Reset input so same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const toggleStudy = (studyId: string) => {
    setExpandedStudies((prev) => {
      const next = new Set(prev)
      if (next.has(studyId)) {
        next.delete(studyId)
      } else {
        next.add(studyId)
      }
      return next
    })
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    if (dateStr.length === 8) {
      return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
    }
    return dateStr
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Studies</h2>
        <button
          className="icon-button"
          onClick={() => fileInputRef.current?.click()}
          title="Open DICOM Files"
        >
          <FolderOpen size={20} />
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".dcm,.dicom"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div className="sidebar-content">
        {isLoading && (
          <div className="loading-state">
            <p>Loading DICOM files...</p>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="progress-text">{loadingProgress}%</p>
          </div>
        )}
        {!isLoading && studies.length === 0 ? (
          <div className="empty-state">
            <p>No studies loaded</p>
            <button
              className="open-button"
              onClick={() => fileInputRef.current?.click()}
            >
              Open DICOM Files
            </button>
            <p className="hint-text">Select multiple .dcm files for CT series</p>
          </div>
        ) : !isLoading && (
          studies.map((study) => (
            <StudyItem
              key={study.id}
              study={study}
              isExpanded={expandedStudies.has(study.id)}
              isActive={study.id === activeStudyId}
              activeSeriesId={activeSeriesId}
              onToggle={() => toggleStudy(study.id)}
              onSelect={() => setActiveStudy(study.id)}
              onSeriesSelect={(seriesId) => {
                setActiveStudy(study.id)
                setActiveSeries(seriesId)
              }}
              onDelete={() => deleteStudy(study.id)}
              onAddViewer={(seriesId) => addViewer(study.id, seriesId)}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface StudyItemProps {
  study: DicomStudy
  isExpanded: boolean
  isActive: boolean
  activeSeriesId: string | null
  onToggle: () => void
  onSelect: () => void
  onSeriesSelect: (seriesId: string) => void
  onDelete: () => void
  onAddViewer: (seriesId: string) => void
}

const StudyItem: React.FC<StudyItemProps> = ({
  study,
  isExpanded,
  isActive,
  activeSeriesId,
  onToggle,
  onSelect,
  onSeriesSelect,
  onDelete,
  onAddViewer,
}) => {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    if (dateStr.length === 8) {
      return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
    }
    return dateStr
  }

  return (
    <div className={`study-item ${isActive ? 'active' : ''}`}>
      <div className="study-header" onClick={onSelect}>
        <button className="expand-button" onClick={(e) => { e.stopPropagation(); onToggle() }}>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="study-info">
          <div className="study-name">{study.patientName || study.studyDescription || 'Unknown Study'}</div>
          <div className="study-meta">
            {study.patientId && <span>ID: {study.patientId}</span>}
            {study.studyDate && <span>{formatDate(study.studyDate)}</span>}
          </div>
        </div>
        <button
          className="delete-button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Delete Study"
        >
          <X size={14} />
        </button>
      </div>
      {isExpanded && (
        <div className="series-list">
          {study.series.map((series) => (
            <SeriesItem
              key={series.id}
              series={series}
              isActive={series.id === activeSeriesId}
              onSelect={() => onSeriesSelect(series.id)}
              onAddViewer={() => onAddViewer(series.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SeriesItemProps {
  series: DicomSeries
  isActive: boolean
  onSelect: () => void
  onAddViewer: () => void
}

const SeriesItem: React.FC<SeriesItemProps> = ({
  series,
  isActive,
  onSelect,
  onAddViewer,
}) => {
  return (
    <div className={`series-item ${isActive ? 'active' : ''}`} onClick={onSelect}>
      <ImageIcon size={14} />
      <div className="series-info">
        <div className="series-name">
          {series.seriesDescription || `Series ${series.seriesNumber}`}
        </div>
        <div className="series-meta">
          {series.modality && <span>{series.modality}</span>}
          <span>{series.images.length} images</span>
        </div>
      </div>
      <button
        className="add-viewer-button"
        onClick={(e) => { e.stopPropagation(); onAddViewer() }}
        title="Open in New Viewer"
      >
        +
      </button>
    </div>
  )
}

export default Sidebar
