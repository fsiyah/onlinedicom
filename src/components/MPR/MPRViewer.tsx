import React, { useCallback, useMemo, useState } from 'react'
import { useViewerStore } from '../../store/viewerStore'
import { Maximize2, Grid3x3 } from 'lucide-react'
import MPRViewerPanel from './MPRViewerPanel'
import {
  Plane,
  VolumeData,
  calculateVolumeData,
  calculateCrossReference,
  isMPRCompatible,
  ObliqueRotation,
  calculateSliceIndexForPosition,
} from '../../utils/mprUtils'
import './MPRViewer.css'

const MPRViewer: React.FC = () => {
  const activeStudyId = useViewerStore((state) => state.activeStudyId)
  const activeSeriesId = useViewerStore((state) => state.activeSeriesId)
  const studies = useViewerStore((state) => state.studies)

  const [layout, setLayout] = useState<'1x1' | '2x2'>('2x2')
  const [activePlane, setActivePlane] = useState<Plane>('axial')
  
  // Cross-reference state
  const [crossReferencePoint, setCrossReferencePoint] = useState<[number, number] | null>(null)
  const [crossReferencePlane, setCrossReferencePlane] = useState<Plane | null>(null)
  
  // Synchronized image indices for each plane
  const [imageIndices, setImageIndices] = useState<Record<Plane, number>>({
    axial: 0,
    coronal: 0,
    sagittal: 0,
  })

  // Oblique rotations for each plane
  const [rotations, setRotations] = useState<Record<Plane, ObliqueRotation>>({
    axial: { pitch: 0, yaw: 0, roll: 0 },
    coronal: { pitch: 0, yaw: 0, roll: 0 },
    sagittal: { pitch: 0, yaw: 0, roll: 0 },
  })

  // MIP slab thickness per plane (mm)
  const [slabThickness, setSlabThickness] = useState<Record<Plane, number>>({
    axial: 10,
    coronal: 10,
    sagittal: 10,
  })

  // Get current series
  const study = useMemo(() => studies.find((s) => s.id === activeStudyId), [studies, activeStudyId])
  const series = useMemo(() => study?.series.find((s) => s.id === activeSeriesId), [study, activeSeriesId])
  const images = series?.images || []

  // Calculate volume data
  const volume = useMemo<VolumeData | null>(() => {
    if (!images.length || !isMPRCompatible(images)) return null
    return calculateVolumeData(images)
  }, [images])

  // Handle cross-reference point changes - synchronize slice indices across planes for spatial alignment
  const handleCrossReferenceChange = useCallback(
    (point: [number, number] | null, plane: Plane) => {
      setCrossReferencePoint(point)
      setCrossReferencePlane(plane)

      // When cross-reference point changes, update slice indices for spatial alignment
      // This ensures all viewports show the same anatomical location
      if (point && volume) {
        // Calculate slice indices for other planes based on the new cross-reference point
        const otherPlanes: Plane[] = ['axial', 'coronal', 'sagittal'].filter((p) => p !== plane) as Plane[]

        otherPlanes.forEach((otherPlane) => {
          const targetPoint = calculateCrossReference(
            point,
            plane,
            otherPlane,
            volume,
            rotations[plane],
            rotations[otherPlane]
          )
          if (targetPoint) {
            const sliceIndex = calculateSliceIndexForPosition(targetPoint, otherPlane, volume, rotations[otherPlane])
            setImageIndices((prev) => ({ ...prev, [otherPlane]: sliceIndex }))
          }
        })

        // Also update the current plane's slice index
        const currentSliceIndex = calculateSliceIndexForPosition(point, plane, volume, rotations[plane])
        setImageIndices((prev) => ({ ...prev, [plane]: currentSliceIndex }))
      }
    },
    [volume, rotations]
  )

  // Calculate cross-reference points for other planes (recalculate when rotations change)
  const getCrossReferenceForPlane = useCallback(
    (targetPlane: Plane): [number, number] | null => {
      if (!crossReferencePoint || !crossReferencePlane || !volume || crossReferencePlane === targetPlane) {
        return null
      }

      return calculateCrossReference(
        crossReferencePoint,
        crossReferencePlane,
        targetPlane,
        volume,
        rotations[crossReferencePlane],
        rotations[targetPlane]
      )
    },
    [
      crossReferencePoint,
      crossReferencePlane,
      volume,
      rotations.axial.pitch,
      rotations.axial.yaw,
      rotations.axial.roll,
      rotations.coronal.pitch,
      rotations.coronal.yaw,
      rotations.coronal.roll,
      rotations.sagittal.pitch,
      rotations.sagittal.yaw,
      rotations.sagittal.roll,
    ]
  )

  // Handle image index changes (plane + index so line-drag can scroll other viewports)
  const handleImageIndexChange = useCallback((plane: Plane, index: number) => {
    setImageIndices((prev) => ({ ...prev, [plane]: index }))
  }, [])

  // Handle slab thickness changes
  const handleSlabThicknessChange = useCallback((plane: Plane, deltaMm: number) => {
    setSlabThickness((prev) => {
      const current = prev[plane]
      const next = Math.max(1, Math.min(100, current + deltaMm))
      return { ...prev, [plane]: next }
    })
  }, [])

  // Handle rotation changes - when rotation changes, recalculate cross-reference and slice indices
  const handleRotationChange = useCallback(
    (plane: Plane, rotation: ObliqueRotation) => {
      setRotations((prev) => ({ ...prev, [plane]: rotation }))

      // When rotation changes, update cross-reference point positions in other planes
      // This maintains spatial alignment across all viewports
      if (crossReferencePoint && crossReferencePlane === plane && volume) {
        const otherPlanes: Plane[] = ['axial', 'coronal', 'sagittal'].filter((p) => p !== plane) as Plane[]

        otherPlanes.forEach((otherPlane) => {
          const targetPoint = calculateCrossReference(
            crossReferencePoint,
            plane,
            otherPlane,
            volume,
            rotation, // Use new rotation
            rotations[otherPlane]
          )
          if (targetPoint) {
            const sliceIndex = calculateSliceIndexForPosition(targetPoint, otherPlane, volume, rotations[otherPlane])
            setImageIndices((prev) => ({ ...prev, [otherPlane]: sliceIndex }))
          }
        })
      }
    },
    [crossReferencePoint, crossReferencePlane, volume, rotations]
  )

  // Show warning if MPR is not compatible
  if (!volume) {
    return (
      <div className="mpr-viewer">
        <div className="mpr-warning">
          <p>MPR reformat is not available for this series.</p>
          <p>Series must contain multiple images with ImagePositionPatient and ImageOrientationPatient metadata.</p>
        </div>
      </div>
    )
  }

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
            title="Single View"
          >
            <Maximize2 size={16} />
          </button>
          <button
            className={`layout-button ${layout === '2x2' ? 'active' : ''}`}
            onClick={() => setLayout('2x2')}
            title="Quad View"
          >
            <Grid3x3 size={16} />
          </button>
        </div>
      </div>
      <div className={`mpr-grid layout-${layout}`}>
        {layout === '1x1' && activeStudyId && activeSeriesId && (
          <div className="mpr-panel">
            <MPRViewerPanel
              studyId={activeStudyId}
              seriesId={activeSeriesId}
              plane={activePlane}
              volume={volume}
              rotation={rotations[activePlane]}
              allRotations={rotations}
              slabThickness={slabThickness}
              crossReferencePoint={
                crossReferencePlane === activePlane ? crossReferencePoint : getCrossReferenceForPlane(activePlane)
              }
              onCrossReferenceChange={(point) => handleCrossReferenceChange(point, activePlane)}
              onImageIndexChange={(targetPlane, index) => handleImageIndexChange(targetPlane, index)}
              onRotationChange={(targetPlane, rotation) => handleRotationChange(targetPlane, rotation)}
              onSlabThicknessChange={handleSlabThicknessChange}
              syncImageIndex={imageIndices[activePlane]}
              imageIndices={imageIndices}
            />
          </div>
        )}
        {layout === '2x2' && activeStudyId && activeSeriesId && (
          <>
            <div className="mpr-panel">
              <MPRViewerPanel
                studyId={activeStudyId}
                seriesId={activeSeriesId}
                plane="axial"
                volume={volume}
                rotation={rotations.axial}
                allRotations={rotations}
                slabThickness={slabThickness}
                crossReferencePoint={
                  crossReferencePlane === 'axial'
                    ? crossReferencePoint
                    : getCrossReferenceForPlane('axial')
                }
                onCrossReferenceChange={(point) => handleCrossReferenceChange(point, 'axial')}
                onImageIndexChange={(targetPlane, index) => handleImageIndexChange(targetPlane, index)}
                onRotationChange={(targetPlane, rotation) => handleRotationChange(targetPlane, rotation)}
                onSlabThicknessChange={handleSlabThicknessChange}
                syncImageIndex={imageIndices.axial}
                imageIndices={imageIndices}
              />
            </div>
            <div className="mpr-panel">
              <MPRViewerPanel
                studyId={activeStudyId}
                seriesId={activeSeriesId}
                plane="coronal"
                volume={volume}
                rotation={rotations.coronal}
                allRotations={rotations}
                slabThickness={slabThickness}
                crossReferencePoint={
                  crossReferencePlane === 'coronal'
                    ? crossReferencePoint
                    : getCrossReferenceForPlane('coronal')
                }
                onCrossReferenceChange={(point) => handleCrossReferenceChange(point, 'coronal')}
                onImageIndexChange={(targetPlane, index) => handleImageIndexChange(targetPlane, index)}
                onRotationChange={(targetPlane, rotation) => handleRotationChange(targetPlane, rotation)}
                onSlabThicknessChange={handleSlabThicknessChange}
                syncImageIndex={imageIndices.coronal}
                imageIndices={imageIndices}
              />
            </div>
            <div className="mpr-panel">
              <MPRViewerPanel
                studyId={activeStudyId}
                seriesId={activeSeriesId}
                plane="sagittal"
                volume={volume}
                rotation={rotations.sagittal}
                allRotations={rotations}
                slabThickness={slabThickness}
                crossReferencePoint={
                  crossReferencePlane === 'sagittal'
                    ? crossReferencePoint
                    : getCrossReferenceForPlane('sagittal')
                }
                onCrossReferenceChange={(point) => handleCrossReferenceChange(point, 'sagittal')}
                onImageIndexChange={(targetPlane, index) => handleImageIndexChange(targetPlane, index)}
                onRotationChange={(targetPlane, rotation) => handleRotationChange(targetPlane, rotation)}
                onSlabThicknessChange={handleSlabThicknessChange}
                syncImageIndex={imageIndices.sagittal}
                imageIndices={imageIndices}
              />
            </div>
            <div className="mpr-panel">
              <div className="plane-label">3D</div>
              <div className="placeholder-3d">3D View (Coming Soon)</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default MPRViewer
