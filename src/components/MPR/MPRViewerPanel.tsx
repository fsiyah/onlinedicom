import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useViewerStore } from '../../store/viewerStore'
import { Plane, VolumeData, ObliqueRotation } from '../../utils/mprUtils'
import { initCornerstone3D, getCornerstone3D } from '../../utils/cornerstone3DConfig'
import { createVolumeFromImages, getVolumeDataRange } from '../../utils/volumeUtils'
import {
  initializeCornerstoneTools,
  addViewportToToolGroup,
  removeViewportFromToolGroup,
  getRenderingEngineId,
} from '../../utils/cornerstoneToolsConfig'
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
  onViewportReady?: (plane: Plane, viewportId: string) => void
  onDoubleClick?: (plane: Plane) => void
}

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
  onViewportReady,
  onDoubleClick,
}) => {
  const elementRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<any>(null)
  const volumeRef = useRef<any>(null)
  const renderingEngineRef = useRef<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  const windowWidth = useViewerStore((s) => s.windowWidth)
  const windowCenter = useViewerStore((s) => s.windowCenter)

  // Use volume images if available
  const images = volume?.images || []

  // Get viewport ID for this plane
  const viewportId = `viewport-${seriesId}-${plane}`
  const renderingEngineId = getRenderingEngineId()

  // Stable callback ref for onViewportReady
  const onViewportReadyRef = useRef(onViewportReady)
  onViewportReadyRef.current = onViewportReady

  // Setup volume viewport
  useEffect(() => {
    if (!images.length || !elementRef.current) return

    let cancelled = false
    let setupViewportId: string | null = null
    setIsLoading(true)

    const setupVolumeViewport = async () => {
      try {
        const element = elementRef.current
        if (!element || cancelled) return

        // Wait for element to have proper dimensions
        const waitForDimensions = () => new Promise<void>((resolve) => {
          const check = () => {
            if (element.clientWidth > 0 && element.clientHeight > 0) {
              resolve()
            } else {
              requestAnimationFrame(check)
            }
          }
          check()
        })
        
        // Wait up to 1 second for dimensions
        await Promise.race([
          waitForDimensions(),
          new Promise(resolve => setTimeout(resolve, 1000))
        ])

        if (cancelled) return

        // Initialize Cornerstone3D
        await initCornerstone3D()

        const cs3D = getCornerstone3D()
        if (!cs3D) {
          throw new Error('Cornerstone3D not initialized')
        }

        // Initialize tools (singleton - won't duplicate)
        await initializeCornerstoneTools()

        const { cache, Enums } = cs3D
        if (!element || cancelled) return

        // Create volume ID (shared across all planes)
        const volumeId = `volume-${seriesId}`
        const streamingVolumeId = `cornerstoneStreamingImageVolume:${volumeId}`

        // Create or get volume
        let csVolume = cache.getVolume(streamingVolumeId)
        if (!csVolume) {
          csVolume = await createVolumeFromImages(images, volumeId)
        } else {
          // Volume exists in cache but might still be loading - wait for it
          if (!csVolume.loadStatus?.loaded) {
            await new Promise<void>((resolve) => {
              let resolved = false
              const timeout = setTimeout(() => {
                if (!resolved) { resolved = true; resolve(); }
              }, 30000)
              const checkLoaded = () => {
                if (resolved) return
                if (csVolume.loadStatus?.loaded) {
                  resolved = true; clearTimeout(timeout); resolve()
                } else {
                  setTimeout(checkLoaded, 100)
                }
              }
              checkLoaded()
            })
          }
        }
        if (cancelled) return

        volumeRef.current = csVolume

        // Get or create rendering engine
        const coreModule = await import('@cornerstonejs/core')
        const { RenderingEngine, getRenderingEngine } = coreModule

        let renderingEngine = getRenderingEngine(renderingEngineId)
        if (!renderingEngine) {
          renderingEngine = new RenderingEngine(renderingEngineId)
        }
        renderingEngineRef.current = renderingEngine

        // Check if viewport exists, if so destroy it first
        let viewport = renderingEngine.getViewport(viewportId)
        if (viewport) {
          try {
            removeViewportFromToolGroup(viewportId)
            renderingEngine.disableElement(viewportId)
          } catch (e) {
            // Ignore
          }
        }

        if (cancelled) return

        // Create viewport using enableElement (adds single viewport without affecting others)
        // This is critical! setViewports([...]) REPLACES all viewports, 
        // but enableElement ADDS a single viewport to the existing ones
        const viewportInput = {
          viewportId,
          element,
          type: Enums.ViewportType.ORTHOGRAPHIC,
          defaultOptions: {
            orientation:
              plane === 'axial'
                ? Enums.OrientationAxis.AXIAL
                : plane === 'coronal'
                  ? Enums.OrientationAxis.CORONAL
                  : Enums.OrientationAxis.SAGITTAL,
            background: [0, 0, 0] as [number, number, number],
          },
        }
        
        // Use enableElement to add viewport without replacing existing ones
        renderingEngine.enableElement(viewportInput)

        viewport = renderingEngine.getViewport(viewportId)
        if (cancelled || !viewport) return

        viewportRef.current = viewport
        setupViewportId = viewportId

        // Set volume to viewport BEFORE adding to tool group
        // CrosshairsTool requires viewports to have volumes attached
        await viewport.setVolumes([
          {
            volumeId: streamingVolumeId,
          },
        ])

        // Add viewport to tool group AFTER volume is set
        addViewportToToolGroup(viewportId)

        if (cancelled) return

        // Wait a frame for the viewport to be ready
        await new Promise(resolve => requestAnimationFrame(resolve))
        
        if (cancelled) return

        // Subscribe to IMAGE_VOLUME_MODIFIED event to re-render when data changes
        const coreEnums = await import('@cornerstonejs/core')
        const { eventTarget, Enums: CoreEnums } = coreEnums
        
        const handleVolumeModified = () => {
          if (!cancelled && viewport && renderingEngine) {
            viewport.render()
          }
        }
        
        // Listen for volume data updates
        eventTarget.addEventListener(
          CoreEnums.Events.IMAGE_VOLUME_MODIFIED,
          handleVolumeModified
        )

        // Reset camera first to fit the volume
        viewport.resetCamera()

        // Get window/level from DICOM metadata (more accurate than store defaults)
        const firstImage = images[0];
        const metaWC = firstImage?.metadata?.floatString?.('x00281050') || firstImage?.windowCenter;
        const metaWW = firstImage?.metadata?.floatString?.('x00281051') || firstImage?.windowWidth;
        
        // Volume data is now rescaled to HU values in volumeUtils
        // So we use DICOM WC/WW directly (they are already in HU)
        let effectiveWC = metaWC || windowCenter || 40;
        let effectiveWW = metaWW || windowWidth || 400;
        
        // Get actual data range from volume loading
        const dataRange = getVolumeDataRange();
        
        // If we have actual data range, ensure VOI covers it reasonably
        // This handles cases where DICOM WC/WW might not match the data
        if (dataRange) {
          const dataCenter = (dataRange.min + dataRange.max) / 2;
          const dataWidth = dataRange.max - dataRange.min;
          
          // If DICOM window doesn't overlap with data at all, use data range
          const voiMin = effectiveWC - effectiveWW / 2;
          const voiMax = effectiveWC + effectiveWW / 2;
          
          if (voiMax < dataRange.min || voiMin > dataRange.max) {
            // Window is completely outside data range, use data-based window
            effectiveWC = dataCenter;
            effectiveWW = Math.max(dataWidth * 1.1, 1); // Add 10% margin
            console.log(`VOI adjusted to data range: WC=${effectiveWC}, WW=${effectiveWW}`);
          }
        }
        
        const voiLower = effectiveWC - effectiveWW / 2;
        const voiUpper = effectiveWC + effectiveWW / 2;

        // Set window/level based on volume data or defaults
        const volumeActor = viewport.getDefaultActor()?.actor
        if (volumeActor) {
          const property = volumeActor.getProperty()
          if (property) {
            // Set window/level using DICOM values
            property.getRGBTransferFunction(0)?.setRange(voiLower, voiUpper)
          }
        }

        // Also try the voiRange approach with DICOM values
        try {
          viewport.setProperties({
            voiRange: {
              lower: voiLower,
              upper: voiUpper,
            },
          })
        } catch (e) {
          // Fallback - some versions use different API
        }

        // Force rendering engine resize to ensure canvas is properly initialized
        renderingEngine.resize(true, true)
        
        // Render the viewport
        viewport.render()

        // Schedule additional renders to ensure GPU texture is updated
        setTimeout(() => {
          if (!cancelled && viewport && renderingEngine) {
            renderingEngine.resize(true, true)
            viewport.render()
          }
        }, 100)
        
        setTimeout(() => {
          if (!cancelled && viewport && renderingEngine) {
            viewport.resetCamera()
            viewport.render()
          }
        }, 500)
        
        // Force render ALL viewports in the rendering engine after a delay
        // This ensures all viewports are properly rendered regardless of setup order
        setTimeout(() => {
          if (!cancelled && renderingEngine) {
            try {
              // Get all viewport IDs and render them
              const allViewportIds = renderingEngine.getViewports().map((vp: any) => vp.id)
              if (allViewportIds.length > 0) {
                renderingEngine.renderViewports(allViewportIds)
                console.log(`Rendered all ${allViewportIds.length} viewports`)
              }
            } catch (e) {
              // Fallback to single viewport render
              viewport?.render()
            }
          }
        }, 1000)
        
        // Additional delayed render to catch any late-loading viewports
        setTimeout(() => {
          if (!cancelled && renderingEngine) {
            try {
              renderingEngine.render()
            } catch (e) {
              // Ignore
            }
          }
        }, 2000)

        setIsLoading(false)
        console.log(`MPR viewport ${plane} setup complete`)

        // Notify parent that this viewport is ready (use stable ref)
        onViewportReadyRef.current?.(plane, viewportId)
      } catch (error) {
        console.error('Failed to setup Cornerstone3D volume viewport:', error)
        setIsLoading(false)
      }
    }

    setupVolumeViewport()

    return () => {
      cancelled = true
      // Cleanup on unmount - properly destroy viewport
      if (setupViewportId && renderingEngineRef.current) {
        try {
          removeViewportFromToolGroup(setupViewportId)
          // Disable viewport from rendering engine to release canvas
          renderingEngineRef.current.disableElement(setupViewportId)
          console.log(`Viewport ${setupViewportId} disabled`)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, seriesId, plane, viewportId, renderingEngineId])

  // Update window/level when it changes
  useEffect(() => {
    if (!viewportRef.current) return

    try {
      const viewport = viewportRef.current
      viewport.setProperties({
        voiRange: {
          lower: windowCenter - windowWidth / 2,
          upper: windowCenter + windowWidth / 2,
        },
      })

      if (renderingEngineRef.current) {
        renderingEngineRef.current.renderViewport(viewportId)
      }
    } catch (error) {
      console.error('Failed to update window/level:', error)
    }
  }, [windowWidth, windowCenter, viewportId])

  // Handle resize
  useEffect(() => {
    if (!viewportRef.current || !elementRef.current) return

    const handleResize = () => {
      if (renderingEngineRef.current) {
        try {
          renderingEngineRef.current.resize()
          renderingEngineRef.current.renderViewport(viewportId)
        } catch (error) {
          console.error('Failed to resize viewport:', error)
        }
      }
    }

    window.addEventListener('resize', handleResize)

    // Initial resize
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(elementRef.current)

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
    }
  }, [viewportId])

  // Get border color based on plane
  const getBorderColor = () => {
    switch (plane) {
      case 'axial':
        return '#e63939' // Red
      case 'coronal':
        return '#00cc00' // Green
      case 'sagittal':
        return '#3b82f6' // Blue
      default:
        return '#666'
    }
  }

  if (images.length === 0) {
    return (
      <div className="mpr-viewer-panel" style={{ borderColor: getBorderColor() }}>
        <div className="plane-label">{plane.toUpperCase()}</div>
        <div className="error-message">No images available</div>
      </div>
    )
  }

  // Volume viewport scroll handler
  // StackScrollTool only works with stack viewports, NOT with orthographic/volume viewports
  // For volume viewports in MPR, we need to use viewport.scroll() API directly
  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      
      const viewport = viewportRef.current
      if (!viewport) return

      // Volume viewport scroll - delta determines direction
      // Positive deltaY = scroll down = next slice, Negative deltaY = scroll up = previous slice
      const delta = e.deltaY > 0 ? 1 : -1
      
      try {
        // Use the volume viewport scroll API
        viewport.scroll(delta, true) // true = scroll through slices
        viewport.render()
      } catch (err) {
        console.error('MPR scroll error:', err)
      }
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [plane, viewportId])

  // Handle double-click to switch to single view
  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.(plane)
  }, [onDoubleClick, plane])

  return (
    <div
      className="mpr-viewer-panel"
      style={{
        borderColor: getBorderColor(),
        borderWidth: '3px',
        borderStyle: 'solid',
      }}
      onDoubleClick={handleDoubleClick}
    >
      <div className="plane-label" style={{ color: getBorderColor() }}>
        {plane.toUpperCase()}
      </div>
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">Loading...</div>
        </div>
      )}
      <div
        className="cornerstone-element"
        ref={elementRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {images.length > 0 && (
        <div className="slice-info">{plane.charAt(0).toUpperCase() + plane.slice(1)}</div>
      )}
    </div>
  )
}

export default MPRViewerPanel
