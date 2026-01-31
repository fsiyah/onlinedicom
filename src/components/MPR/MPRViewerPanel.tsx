import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCornerstone, useViewerStore } from '../../store/viewerStore'
import {
  Plane,
  VolumeData,
  ObliqueRotation,
  calculateCrossReferenceLines,
} from '../../utils/mprUtils'
import { initCornerstone3D, getCornerstone3D } from '../../utils/cornerstone3DConfig'
import { createVolumeFromImages } from '../../utils/volumeUtils'
import './MPRViewerPanel.css'

interface MPRViewerPanelProps {
  studyId: string
  seriesId: string
  plane: Plane
  volume: VolumeData
  rotation?: ObliqueRotation
  crossReferencePoint?: [number, number] | null
  onCrossReferenceChange?: (point: [number, number] | null) => void
  onImageIndexChange?: (plane: Plane, index: number) => void
  onRotationChange?: (plane: Plane, rotation: ObliqueRotation) => void
  onSlabThicknessChange?: (plane: Plane, deltaMm: number) => void
  syncImageIndex?: number
  imageIndices?: Record<Plane, number>
  slabThickness?: Record<Plane, number>
  allRotations?: Record<Plane, ObliqueRotation>
}

const HANDLE_SIZE = 8
const CIRCLE_OFFSET = 32
const LINE_HIT_THRESHOLD = 8

const MPRViewerPanel: React.FC<MPRViewerPanelProps> = ({
  studyId: _studyId,
  seriesId,
  plane,
  volume,
  rotation = { pitch: 0, yaw: 0, roll: 0 },
  crossReferencePoint,
  onCrossReferenceChange,
  onImageIndexChange,
  onRotationChange,
  onSlabThicknessChange,
  syncImageIndex,
  imageIndices = { axial: 0, coronal: 0, sagittal: 0 },
  slabThickness: slabThicknessMap = { axial: 10, coronal: 10, sagittal: 10 },
  allRotations = {
    axial: { pitch: 0, yaw: 0, roll: 0 },
    coronal: { pitch: 0, yaw: 0, roll: 0 },
    sagittal: { pitch: 0, yaw: 0, roll: 0 },
  },
}) => {
  const elementRef = useRef<HTMLDivElement>(null)
  const csRef = useRef<any>(null)
  const toolsRef = useRef<any>(null)
  const viewportRef = useRef<any>(null)
  const volumeRef = useRef<any>(null)
  const [cornerstoneReady, setCornerstoneReady] = useState(false)
  const [cornerstone3DReady, setCornerstone3DReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  
  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState<'crosshair' | 'line' | 'thickness' | 'rotation' | null>(null)
  const [dragLineIndex, setDragLineIndex] = useState<number | null>(null)
  const [dragTargetPlane, setDragTargetPlane] = useState<Plane | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)

  useViewerStore((s) => s.studies) // Keep store subscription
  const windowWidth = useViewerStore((s) => s.windowWidth)
  const windowCenter = useViewerStore((s) => s.windowCenter)

  // Use volume images if available, otherwise fallback to series images
  const images = volume?.images || []
  const image = images[currentImageIndex]

  // Sync image index from parent
  useEffect(() => {
    if (syncImageIndex !== undefined && syncImageIndex !== currentImageIndex) {
      const clampedIndex = Math.max(0, Math.min(images.length - 1, syncImageIndex))
      setCurrentImageIndex(clampedIndex)
    }
  }, [syncImageIndex, images.length])

  // Notify parent of image index changes (only when user changes it, not from sync)
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!elementRef.current) return

      e.preventDefault()
      const delta = e.deltaY > 0 ? 1 : -1
      const newIndex = Math.max(0, Math.min(images.length - 1, currentImageIndex + delta))
      
      if (newIndex !== currentImageIndex) {
        setCurrentImageIndex(newIndex)
        onImageIndexChange?.(plane, newIndex)
      }
    },
    [plane, currentImageIndex, images.length, onImageIndexChange]
  )

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  // Helper function to apply rotation to viewport
  const applyRotationToViewport = useCallback(
    (viewport: any, rot: ObliqueRotation, planeType: Plane) => {
      if (!viewport || typeof viewport.setCamera !== 'function') return

      try {
        // Get current camera
        const camera = viewport.getCamera()
        if (!camera) return

        // Convert rotation angles to radians
        const pitchRad = (rot.pitch * Math.PI) / 180
        const yawRad = (rot.yaw * Math.PI) / 180
        const rollRad = (rot.roll * Math.PI) / 180

        // Get base orientation vectors based on plane
        let baseViewPlaneNormal: [number, number, number] = [0, 0, 1]
        let baseViewUp: [number, number, number] = [0, -1, 0]

        if (planeType === 'axial') {
          baseViewPlaneNormal = [0, 0, 1] // Looking down Z-axis
          baseViewUp = [0, -1, 0]
        } else if (planeType === 'coronal') {
          baseViewPlaneNormal = [0, 1, 0] // Looking along Y-axis
          baseViewUp = [0, 0, -1]
        } else if (planeType === 'sagittal') {
          baseViewPlaneNormal = [1, 0, 0] // Looking along X-axis
          baseViewUp = [0, 0, -1]
        }

        // Apply rotations using rotation matrices
        // For pitch (rotation around X-axis)
        const cosPitch = Math.cos(pitchRad)
        const sinPitch = Math.sin(pitchRad)
        // For yaw (rotation around Y-axis)
        const cosYaw = Math.cos(yawRad)
        const sinYaw = Math.sin(yawRad)
        // For roll (rotation around Z-axis)
        const cosRoll = Math.cos(rollRad)
        const sinRoll = Math.sin(rollRad)

        // Apply rotations to view plane normal
        let [nx, ny, nz] = baseViewPlaneNormal

        // Apply pitch (X-axis rotation)
        const nyPitch = ny * cosPitch - nz * sinPitch
        const nzPitch = ny * sinPitch + nz * cosPitch
        ny = nyPitch
        nz = nzPitch

        // Apply yaw (Y-axis rotation)
        const nxYaw = nx * cosYaw + nz * sinYaw
        const nzYaw = -nx * sinYaw + nz * cosYaw
        nx = nxYaw
        nz = nzYaw

        // Apply roll (Z-axis rotation) - affects viewUp
        let [ux, uy, uz] = baseViewUp
        const uxRoll = ux * cosRoll - uy * sinRoll
        const uyRoll = ux * sinRoll + uy * cosRoll
        ux = uxRoll
        uy = uyRoll

        // Normalize
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
        if (len > 0) {
          nx /= len
          ny /= len
          nz /= len
        }

        const viewPlaneNormal: [number, number, number] = [nx, ny, nz]
        const viewUp: [number, number, number] = [ux, uy, uz]

        // Update camera with rotated view plane
        viewport.setCamera({
          ...camera,
          viewPlaneNormal,
          viewUp,
        })
      } catch (error) {
        console.error('Failed to apply rotation to viewport:', error)
      }
    },
    []
  )

  // Helper function to apply slab thickness (MIP)
  const applySlabThicknessToViewport = useCallback((viewport: any, thicknessMm: number) => {
    if (!viewport) return

    try {
      const cs3D = getCornerstone3D()
      if (!cs3D || !cs3D.Enums) return

      // Set blend mode to MIP (Maximum Intensity Projection) for slab thickness
      viewport.setBlendMode(cs3D.Enums.BlendModes.MAXIMUM_INTENSITY_BLEND)

      // Set slab thickness using camera clipping
      const camera = viewport.getCamera()
      if (camera && thicknessMm > 0) {
        // Calculate clipping range based on slab thickness
        // Slab thickness is the distance along the view plane normal
        const slabHalf = thicknessMm / 2

        // Get current focal point
        const focalPoint = camera.focalPoint || [0, 0, 0]

        // Calculate new clipping range
        const near = Math.max(0.1, camera.clippingRange?.[0] || 0.1)
        const far = Math.max(near + thicknessMm, camera.clippingRange?.[1] || 1000)

        viewport.setCamera({
          ...camera,
          clippingRange: [near, far],
        })

        // Set slab thickness property if available
        if (viewport.setSlabThickness) {
          viewport.setSlabThickness(thicknessMm)
        }
      }
    } catch (error) {
      console.error('Failed to apply slab thickness to viewport:', error)
    }
  }, [])

  // Load Cornerstone and Cornerstone3D
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Load classic Cornerstone (for fallback)
        const { cornerstone, cornerstoneTools } = await loadCornerstone()
        if (cancelled) return
        csRef.current = cornerstone
        toolsRef.current = cornerstoneTools
        setCornerstoneReady(true)

        // Initialize Cornerstone3D
        await initCornerstone3D()
        if (cancelled) return
        setCornerstone3DReady(true)
      } catch (error) {
        console.error('Failed to initialize Cornerstone3D:', error)
        // Fallback to classic Cornerstone
        setCornerstoneReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Create Cornerstone3D volume and setup VolumeViewport with real MPR reformat
  useEffect(() => {
    if (!cornerstone3DReady || !images.length || !elementRef.current) return

    let cancelled = false
    setIsLoading(true)

    const setupVolumeViewport = async () => {
      try {
        const cs3D = getCornerstone3D()
        if (!cs3D) {
          throw new Error('Cornerstone3D not initialized')
        }

        const { cache, Enums } = cs3D
        const element = elementRef.current
        if (!element || cancelled) return

        // Create volume ID (shared across all planes)
        const volumeId = `volume-${seriesId}`
        const streamingVolumeId = `cornerstoneStreamingImageVolume:${volumeId}`

        // Create or get volume
        let volume = cache.getVolume(streamingVolumeId)
        if (!volume) {
          volume = await createVolumeFromImages(images, volumeId)
        }
        if (cancelled) return

        volumeRef.current = volume

        // Get or create rendering engine
        const renderingEngineId = 'mpr-rendering-engine'
        let renderingEngine: any
        
        try {
          const coreModule = await import('@cornerstonejs/core')
          const { RenderingEngine, getRenderingEngine } = coreModule
          
          // Try to get existing rendering engine
          renderingEngine = getRenderingEngine(renderingEngineId)
          
          if (!renderingEngine) {
            renderingEngine = new RenderingEngine(renderingEngineId)
          }
        } catch (importError) {
          console.error('Failed to import RenderingEngine from @cornerstonejs/core:', importError)
          throw new Error('Cornerstone3D packages not installed')
        }

        const viewportId = `viewport-${seriesId}-${plane}`
        let viewport = renderingEngine.getViewport(viewportId)

        if (!viewport) {
          // Use setViewports to create the viewport (Cornerstone3D API)
          renderingEngine.setViewports([
            {
              viewportId,
              element,
              type: Enums.ViewportType.ORTHOGRAPHIC, // Volume viewport for MPR
              defaultOptions: {
                background: [0, 0, 0] as [number, number, number], // Black background
              },
            },
          ])
          viewport = renderingEngine.getViewport(viewportId)
        }

        if (cancelled || !viewport) return

        viewportRef.current = viewport

        // Set volume to viewport
        await viewport.setVolumes([
          {
            volumeId: streamingVolumeId,
            callback: (_data: { volumeActor?: any }) => {
              // Volume actor is set, now configure viewport for MPR
            },
          },
        ])

        // Set viewport orientation based on plane
        // In Cornerstone3D, orientations are in Enums.OrientationAxis
        const { OrientationAxis } = Enums
        if (plane === 'axial') {
          viewport.setOrientation(OrientationAxis.AXIAL)
        } else if (plane === 'coronal') {
          viewport.setOrientation(OrientationAxis.CORONAL)
        } else if (plane === 'sagittal') {
          viewport.setOrientation(OrientationAxis.SAGITTAL)
        }

        // Set initial slice position based on currentImageIndex
        const camera = viewport.getCamera()
        if (camera && volume) {
          // Get spacing from volume (Cornerstone3D volume has spacing property)
          const spacing = (volume as any).spacing || [1, 1, 1]
          const sliceSpacing = spacing[2] || 1
          const slicePosition = currentImageIndex * sliceSpacing
          
          // Set camera focal point to slice position
          const focalPoint = camera.focalPoint || [0, 0, 0]
          const newFocalPoint = [...focalPoint] as [number, number, number]
          
          // Adjust focal point based on plane
          if (plane === 'axial') {
            newFocalPoint[2] = slicePosition
          } else if (plane === 'coronal') {
            newFocalPoint[1] = slicePosition
          } else if (plane === 'sagittal') {
            newFocalPoint[0] = slicePosition
          }
          
          viewport.setCamera({
            ...camera,
            focalPoint: newFocalPoint,
          })
        }

        // Apply rotation (oblique reformat)
        applyRotationToViewport(viewport, rotation, plane)

        // Apply slab thickness (MIP)
        const slabThicknessMm = slabThicknessMap[plane] || 10
        applySlabThicknessToViewport(viewport, slabThicknessMm)

        // Set window/level
        viewport.setProperties({
          voiRange: {
            lower: windowCenter - windowWidth / 2,
            upper: windowCenter + windowWidth / 2,
          },
        })

        // Render viewport
        renderingEngine.renderViewport(viewportId)

        setIsLoading(false)
      } catch (error) {
        console.error('Failed to setup Cornerstone3D volume viewport:', error)
        // Fallback to classic Cornerstone
        setIsLoading(false)
      }
    }

    setupVolumeViewport()

    return () => {
      cancelled = true
      // Cleanup: remove viewport when component unmounts
      if (viewportRef.current && renderingEngine) {
        try {
          const viewportId = `viewport-${seriesId}-${plane}`
          renderingEngine.destroyViewport(viewportId)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }, [cornerstone3DReady, images, seriesId, plane, currentImageIndex, rotation.pitch, rotation.yaw, rotation.roll, slabThicknessMap, windowWidth, windowCenter, applyRotationToViewport, applySlabThicknessToViewport, volume])

  // Update viewport when rotation, slab thickness, or slice index changes
  useEffect(() => {
    if (!cornerstone3DReady || !viewportRef.current || !volumeRef.current) return

    const viewport = viewportRef.current
    const volume = volumeRef.current
    const cs3D = getCornerstone3D()
    if (!cs3D) return

    try {
      // Update slice position
      const camera = viewport.getCamera()
      if (camera && volume) {
        const spacing = (volume as any).spacing || [1, 1, 1]
        const sliceSpacing = spacing[2] || 1
        const slicePosition = currentImageIndex * sliceSpacing
        
        const focalPoint = camera.focalPoint || [0, 0, 0]
        const newFocalPoint = [...focalPoint] as [number, number, number]
        
        if (plane === 'axial') {
          newFocalPoint[2] = slicePosition
        } else if (plane === 'coronal') {
          newFocalPoint[1] = slicePosition
        } else if (plane === 'sagittal') {
          newFocalPoint[0] = slicePosition
        }
        
        viewport.setCamera({
          ...camera,
          focalPoint: newFocalPoint,
        })
      }

      // Apply rotation
      applyRotationToViewport(viewport, rotation, plane)

      // Apply slab thickness
      const slabThicknessMm = slabThicknessMap[plane] || 10
      applySlabThicknessToViewport(viewport, slabThicknessMm)

      // Set window/level
      viewport.setProperties({
        voiRange: {
          lower: windowCenter - windowWidth / 2,
          upper: windowCenter + windowWidth / 2,
        },
      })

      // Re-render
      const renderingEngineId = 'mpr-rendering-engine'
      const renderingEngine = cs3D.cache.getRenderingEngine(renderingEngineId)
      if (renderingEngine) {
        const viewportId = `viewport-${seriesId}-${plane}`
        renderingEngine.renderViewport(viewportId)
      }
    } catch (error) {
      console.error('Failed to update viewport:', error)
    }
  }, [rotation.pitch, rotation.yaw, rotation.roll, slabThicknessMap, windowWidth, windowCenter, plane, seriesId, currentImageIndex, cornerstone3DReady, applyRotationToViewport, applySlabThicknessToViewport])

  // Handle resize
  useEffect(() => {
    if (!cornerstone3DReady || !viewportRef.current || !elementRef.current) return

    const handleResize = () => {
      const cs3D = getCornerstone3D()
      if (!cs3D) return

      try {
        const renderingEngineId = 'mpr-rendering-engine'
        const renderingEngine = cs3D.cache.getRenderingEngine(renderingEngineId)
        if (renderingEngine) {
          const viewportId = `viewport-${seriesId}-${plane}`
          renderingEngine.resize()
          renderingEngine.renderViewport(viewportId)
        }
      } catch (error) {
        console.error('Failed to resize viewport:', error)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [cornerstone3DReady, seriesId, plane])

  // Load and display image with rotation and slab thickness applied (fallback to classic Cornerstone)
  // Only use this if Cornerstone3D is NOT available
  useEffect(() => {
    // Skip if Cornerstone3D is ready - use VolumeViewport instead
    if (cornerstone3DReady) return
    
    if (!cornerstoneReady || !image || !elementRef.current) return

    const element = elementRef.current
    const cs = csRef.current
    if (!cs) return

    setIsLoading(true)

    const loadImage = async () => {
      try {
        // Enable element
        try {
          cs.enable(element)
        } catch {
          // Already enabled
        }

        // Load image
        const imageData = await cs.loadImage(image.imageId)
        if (!imageData) {
          setIsLoading(false)
          return
        }

        // Get viewport
        const viewport = cs.getViewport(element) || cs.getDefaultViewportForImage(element, imageData)

        // Apply window/level
        viewport.voi = viewport.voi || {}
        viewport.voi.windowWidth = windowWidth
        viewport.voi.windowCenter = windowCenter

        // Apply rotation (convert degrees to radians)
        const rotationRad = (rotation.yaw * Math.PI) / 180
        viewport.rotation = rotationRad

        // Display image
        cs.displayImage(element, imageData, viewport)
        cs.resize(element)

        setIsLoading(false)
      } catch (error) {
        console.error('Failed to load image:', error)
        setIsLoading(false)
      }
    }

    loadImage()
  }, [cornerstoneReady, cornerstone3DReady, image, windowWidth, windowCenter, rotation.pitch, rotation.yaw, rotation.roll, plane])

  // Convert screen coordinates to pixel coordinates
  const screenToPixel = useCallback((screenX: number, screenY: number): [number, number] | null => {
    if (!elementRef.current) return null

    try {
      const element = elementRef.current
      const rect = element.getBoundingClientRect()
      const canvas = element.querySelector('canvas')
      if (!canvas) return null

      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      const pixelX = Math.floor((screenX - rect.left) * scaleX)
      const pixelY = Math.floor((screenY - rect.top) * scaleY)

      return [pixelY, pixelX] // [row, col]
    } catch {
      return null
    }
  }, [])

  // Calculate main cross-reference point position
  const crossRefScreenPos = useMemo(() => {
    if (!crossReferencePoint || !elementRef.current) return null

    try {
      const element = elementRef.current
      const canvas = element.querySelector('canvas')
      if (!canvas) return null

      const rect = element.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      const [row, col] = crossReferencePoint
      return {
        x: col / scaleX,
        y: row / scaleY,
        width: rect.width,
        height: rect.height,
      }
    } catch {
      return null
    }
  }, [crossReferencePoint, image])

  // Calculate all cross-reference lines for this viewport with screen coords and handle positions
  const crossReferenceLines = useMemo(() => {
    if (!crossReferencePoint || !elementRef.current || !volume || !crossRefScreenPos) return []

    try {
      const element = elementRef.current
      const canvas = element.querySelector('canvas')
      if (!canvas) return []

      const rect = element.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      const lines = calculateCrossReferenceLines(plane, volume, allRotations, crossReferencePoint)

      return lines.map((line) => {
        const [col, row] = line.position
        const screenX = col / scaleX
        const screenY = row / scaleY
        const thicknessMm = slabThicknessMap[line.targetPlane] ?? 10
        // Slab offset in screen pixels: mm to screen using viewport scale
        const slabOffsetScreenY = (thicknessMm / 2) * (rect.height / (volume.dimensions[1] * volume.spacing[0]))
        const slabOffsetScreenX = (thicknessMm / 2) * (rect.width / (volume.dimensions[0] * volume.spacing[1]))

        let centerScreenX: number
        let centerScreenY: number
        let slabOffsetScreen: number
        let circleScreenX: number
        let circleScreenY: number

        if (line.type === 'horizontal') {
          centerScreenX = crossRefScreenPos.x
          centerScreenY = screenY
          slabOffsetScreen = slabOffsetScreenY
          circleScreenX = crossRefScreenPos.x + CIRCLE_OFFSET
          circleScreenY = screenY
        } else if (line.type === 'vertical') {
          centerScreenX = screenX
          centerScreenY = crossRefScreenPos.y
          slabOffsetScreen = slabOffsetScreenX
          circleScreenX = screenX
          circleScreenY = crossRefScreenPos.y + CIRCLE_OFFSET
        } else {
          // diagonal
          centerScreenX = screenX
          centerScreenY = screenY
          slabOffsetScreen = Math.sqrt(slabOffsetScreenX * slabOffsetScreenX + slabOffsetScreenY * slabOffsetScreenY) / Math.SQRT2
          const dx = line.end && line.start ? (line.end[0] - line.start[0]) / scaleX : 1
          const dy = line.end && line.start ? (line.end[1] - line.start[1]) / scaleY : 0
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          circleScreenX = screenX + (dx / len) * CIRCLE_OFFSET
          circleScreenY = screenY + (dy / len) * CIRCLE_OFFSET
        }

        return {
          ...line,
          screenX,
          screenY,
          width: rect.width,
          height: rect.height,
          centerScreenX,
          centerScreenY,
          slabOffsetScreen,
          squareScreenX: centerScreenX,
          squareScreenY: centerScreenY,
          circleScreenX,
          circleScreenY,
          screenStart: line.start ? [line.start[0] / scaleX, line.start[1] / scaleY] as [number, number] : undefined,
          screenEnd: line.end ? [line.end[0] / scaleX, line.end[1] / scaleY] as [number, number] : undefined,
        }
      })
    } catch {
      return []
    }
  }, [
    crossReferencePoint,
    plane,
    volume,
    slabThicknessMap?.axial,
    slabThicknessMap?.coronal,
    slabThicknessMap?.sagittal,
    allRotations?.axial?.pitch,
    allRotations?.axial?.yaw,
    allRotations?.axial?.roll,
    allRotations?.coronal?.pitch,
    allRotations?.coronal?.yaw,
    allRotations?.coronal?.roll,
    allRotations?.sagittal?.pitch,
    allRotations?.sagittal?.yaw,
    allRotations?.sagittal?.roll,
    image,
    crossRefScreenPos,
  ])

  // Handle mouse down - start drag (per-line handles: square = thickness, circle = rotation)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!elementRef.current || !onCrossReferenceChange) return

      const rect = elementRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      // Check each line's square handle (thickness) and circle handle (rotation) first
      for (let i = 0; i < crossReferenceLines.length; i++) {
        const line = crossReferenceLines[i]
        const distSquare = Math.sqrt((x - line.squareScreenX) ** 2 + (y - line.squareScreenY) ** 2)
        const distCircle = Math.sqrt((x - line.circleScreenX) ** 2 + (y - line.circleScreenY) ** 2)
        if (distSquare < HANDLE_SIZE * 1.5) {
          setIsDragging(true)
          setDragType('thickness')
          setDragLineIndex(i)
          setDragTargetPlane(line.targetPlane)
          dragStartRef.current = { x: e.clientX, y: e.clientY }
          e.preventDefault()
          e.stopPropagation()
          return
        }
        if (distCircle < HANDLE_SIZE + 2) {
          setIsDragging(true)
          setDragType('rotation')
          setDragLineIndex(i)
          setDragTargetPlane(line.targetPlane)
          dragStartRef.current = { x: e.clientX, y: e.clientY }
          e.preventDefault()
          e.stopPropagation()
          return
        }
      }

      // Check if clicking near a cross-reference line (scroll other view)
      for (let i = 0; i < crossReferenceLines.length; i++) {
        const line = crossReferenceLines[i]
        let distToLine = Infinity
        if (line.type === 'horizontal') {
          distToLine = Math.abs(y - line.screenY)
          if (distToLine < LINE_HIT_THRESHOLD && x >= 0 && x <= line.width) {
            setIsDragging(true)
            setDragType('line')
            setDragLineIndex(i)
            setDragTargetPlane(null)
            dragStartRef.current = { x: e.clientX, y: e.clientY }
            e.preventDefault()
            e.stopPropagation()
            return
          }
        } else if (line.type === 'vertical') {
          distToLine = Math.abs(x - line.screenX)
          if (distToLine < LINE_HIT_THRESHOLD && y >= 0 && y <= line.height) {
            setIsDragging(true)
            setDragType('line')
            setDragLineIndex(i)
            setDragTargetPlane(null)
            dragStartRef.current = { x: e.clientX, y: e.clientY }
            e.preventDefault()
            e.stopPropagation()
            return
          }
        } else if (line.screenStart && line.screenEnd) {
          const [x1, y1] = line.screenStart
          const [x2, y2] = line.screenEnd
          const d = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2)
          if (d < LINE_HIT_THRESHOLD) {
            setIsDragging(true)
            setDragType('line')
            setDragLineIndex(i)
            setDragTargetPlane(null)
            dragStartRef.current = { x: e.clientX, y: e.clientY }
            e.preventDefault()
            e.stopPropagation()
            return
          }
        }
      }

      // Default: move crosshair
      setIsDragging(true)
      setDragType('crosshair')
      setDragLineIndex(null)
      setDragTargetPlane(null)
      dragStartRef.current = { x: e.clientX, y: e.clientY }

      const pixelCoords = screenToPixel(e.clientX, e.clientY)
      if (pixelCoords) {
        onCrossReferenceChange(pixelCoords)
      }
    },
    [onCrossReferenceChange, crossReferenceLines, screenToPixel]
  )

  // Handle mouse move - update during drag
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || !dragStartRef.current || !onCrossReferenceChange) return

      const pixelCoords = screenToPixel(e.clientX, e.clientY)

      if (dragType === 'crosshair' && pixelCoords) {
        onCrossReferenceChange(pixelCoords)
      } else if (dragType === 'line' && dragLineIndex !== null && onImageIndexChange) {
        const line = crossReferenceLines[dragLineIndex]
        const deltaY = e.clientY - dragStartRef.current.y
        const slicesToMove = Math.round(deltaY / 10)
        if (slicesToMove !== 0) {
          const currentIdx = imageIndices[line.targetPlane]
          const newIndex = Math.max(0, Math.min(images.length - 1, currentIdx + slicesToMove))
          onImageIndexChange(line.targetPlane, newIndex)
          if (line.targetPlane === plane) setCurrentImageIndex(newIndex)
          dragStartRef.current = { x: e.clientX, y: e.clientY }
        }
      } else if (dragType === 'rotation' && dragTargetPlane && onRotationChange) {
        const deltaX = e.clientX - dragStartRef.current.x
        const deltaY = e.clientY - dragStartRef.current.y
        const r = allRotations[dragTargetPlane]
        const newRotation: ObliqueRotation = {
          pitch: r.pitch - deltaY * 0.5,
          yaw: r.yaw + deltaX * 0.5,
          roll: r.roll,
        }
        onRotationChange(dragTargetPlane, newRotation)
        dragStartRef.current = { x: e.clientX, y: e.clientY }
      } else if (dragType === 'thickness' && dragTargetPlane && onSlabThicknessChange) {
        const deltaY = e.clientY - dragStartRef.current.y
        const deltaMm = deltaY * 0.3
        onSlabThicknessChange(dragTargetPlane, deltaMm)
        dragStartRef.current = { x: e.clientX, y: e.clientY }
      }
    },
    [
      isDragging,
      dragType,
      dragLineIndex,
      dragTargetPlane,
      plane,
      onCrossReferenceChange,
      onImageIndexChange,
      onRotationChange,
      onSlabThicknessChange,
      crossReferenceLines,
      imageIndices,
      images.length,
      allRotations,
      screenToPixel,
    ]
  )

  // Handle mouse up - end drag
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragType(null)
    setDragLineIndex(null)
    setDragTargetPlane(null)
    dragStartRef.current = null
  }, [])

  // Handle mouse leave - end drag
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
    setDragType(null)
    setDragLineIndex(null)
    setDragTargetPlane(null)
    dragStartRef.current = null
  }, [])

  if (!image && images.length === 0) {
    return (
      <div className="mpr-viewer-panel">
        <div className="plane-label">{plane.toUpperCase()}</div>
        <div className="error-message">No images available</div>
      </div>
    )
  }

  return (
    <div className="mpr-viewer-panel">
      <div className="plane-label">{plane.toUpperCase()}</div>
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">Loading...</div>
        </div>
      )}
      <div
        className="cornerstone-element"
        ref={elementRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{
          cursor: isDragging
            ? dragType === 'rotation'
              ? 'grabbing'
              : dragType === 'thickness'
                ? 'move'
                : dragType === 'line'
                  ? 'grabbing'
                  : 'grabbing'
            : 'crosshair',
        }}
      >
        {(crossRefScreenPos || crossReferenceLines.length > 0) && (
          <svg
            className="cross-reference-overlay"
            width={crossRefScreenPos?.width || crossReferenceLines[0]?.width || 0}
            height={crossRefScreenPos?.height || crossReferenceLines[0]?.height || 0}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
              zIndex: 15,
            }}
          >
            {/* Cross-reference lines: solid center + dashed slab boundaries + per-line handles */}
            {crossReferenceLines.map((line, idx) => {
              const colorMap: Record<string, string> = {
                green: '#00cc00',
                red: '#e63939',
                yellow: '#e6c935',
                blue: '#3b82f6',
              }
              const strokeColor = colorMap[line.color] || '#00cc00'
              const isDraggingThisLine = dragType === 'line' && dragLineIndex === idx
              const slabOffset = line.slabOffsetScreen ?? 0

              const renderLine = (suffix: string, x1: number, y1: number, x2: number, y2: number, dashed: boolean) => (
                <line
                  key={`line-${idx}-${suffix}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={strokeColor}
                  strokeWidth={isDraggingThisLine ? 3 : 2}
                  strokeDasharray={dashed ? '6,4' : undefined}
                />
              )

              if (line.type === 'horizontal') {
                return (
                  <g key={idx}>
                    {renderLine('solid', 0, line.screenY, line.width, line.screenY, false)}
                    {renderLine('dash1', 0, line.screenY - slabOffset, line.width, line.screenY - slabOffset, true)}
                    {renderLine('dash2', 0, line.screenY + slabOffset, line.width, line.screenY + slabOffset, true)}
                    <rect
                      x={line.squareScreenX - HANDLE_SIZE / 2}
                      y={line.squareScreenY - HANDLE_SIZE / 2}
                      width={HANDLE_SIZE}
                      height={HANDLE_SIZE}
                      fill={strokeColor}
                      fillOpacity="0.9"
                      stroke="#000"
                      strokeWidth="1.5"
                      style={{ cursor: 'ns-resize' }}
                    />
                    <circle
                      cx={line.circleScreenX}
                      cy={line.circleScreenY}
                      r={HANDLE_SIZE / 2 + 1}
                      fill={strokeColor}
                      fillOpacity="0.9"
                      stroke="#000"
                      strokeWidth="1.5"
                      style={{ cursor: 'grab' }}
                    />
                  </g>
                )
              }
              if (line.type === 'vertical') {
                return (
                  <g key={idx}>
                    {renderLine('solid', line.screenX, 0, line.screenX, line.height, false)}
                    {renderLine('dash1', line.screenX - slabOffset, 0, line.screenX - slabOffset, line.height, true)}
                    {renderLine('dash2', line.screenX + slabOffset, 0, line.screenX + slabOffset, line.height, true)}
                    <rect
                      x={line.squareScreenX - HANDLE_SIZE / 2}
                      y={line.squareScreenY - HANDLE_SIZE / 2}
                      width={HANDLE_SIZE}
                      height={HANDLE_SIZE}
                      fill={strokeColor}
                      fillOpacity="0.9"
                      stroke="#000"
                      strokeWidth="1.5"
                      style={{ cursor: 'ew-resize' }}
                    />
                    <circle
                      cx={line.circleScreenX}
                      cy={line.circleScreenY}
                      r={HANDLE_SIZE / 2 + 1}
                      fill={strokeColor}
                      fillOpacity="0.9"
                      stroke="#000"
                      strokeWidth="1.5"
                      style={{ cursor: 'grab' }}
                    />
                  </g>
                )
              }
              if (line.type === 'diagonal' && line.screenStart && line.screenEnd) {
                const [x1, y1] = line.screenStart
                const [x2, y2] = line.screenEnd
                const dx = x2 - x1
                const dy = y2 - y1
                const len = Math.sqrt(dx * dx + dy * dy) || 1
                const perpX = -dy / len
                const perpY = dx / len
                return (
                  <g key={idx}>
                    {renderLine('solid', x1, y1, x2, y2, false)}
                    {renderLine('dash1', x1 + perpX * slabOffset, y1 + perpY * slabOffset, x2 + perpX * slabOffset, y2 + perpY * slabOffset, true)}
                    {renderLine('dash2', x1 - perpX * slabOffset, y1 - perpY * slabOffset, x2 - perpX * slabOffset, y2 - perpY * slabOffset, true)}
                    <rect
                      x={line.squareScreenX - HANDLE_SIZE / 2}
                      y={line.squareScreenY - HANDLE_SIZE / 2}
                      width={HANDLE_SIZE}
                      height={HANDLE_SIZE}
                      fill={strokeColor}
                      fillOpacity="0.9"
                      stroke="#000"
                      strokeWidth="1.5"
                      style={{ cursor: 'move' }}
                    />
                    <circle
                      cx={line.circleScreenX}
                      cy={line.circleScreenY}
                      r={HANDLE_SIZE / 2 + 1}
                      fill={strokeColor}
                      fillOpacity="0.9"
                      stroke="#000"
                      strokeWidth="1.5"
                      style={{ cursor: 'grab' }}
                    />
                  </g>
                )
              }
              return null
            })}

            {/* Main crosshair: horizontal = green, vertical = yellow (düşey sarı, yatay yeşil) */}
            {crossRefScreenPos && (
              <>
                <line
                  x1={0}
                  y1={crossRefScreenPos.y}
                  x2={crossRefScreenPos.width}
                  y2={crossRefScreenPos.y}
                  stroke="#00cc00"
                  strokeWidth="2"
                />
                <line
                  x1={crossRefScreenPos.x}
                  y1={0}
                  x2={crossRefScreenPos.x}
                  y2={crossRefScreenPos.height}
                  stroke="#e6c935"
                  strokeWidth="2"
                />
              </>
            )}
          </svg>
        )}
      </div>
      {image && images.length > 0 && (
        <div className="slice-info">
          Slice: {currentImageIndex + 1} / {images.length}
        </div>
      )}
    </div>
  )
}

export default MPRViewerPanel
