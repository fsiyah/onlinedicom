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
import { getOrCreateRenderingEngine } from '../../utils/renderingEngineLifecycle'
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
  const currentImageIndexRef = useRef(0)
  const overlayDragRef = useRef<{
    action: 'move' | 'horizontal-thickness' | 'vertical-thickness' | 'horizontal-rotate' | 'vertical-rotate'
    startX: number
    startY: number
    targetPlane?: Plane
  } | null>(null)

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

  const overlayAxes = (() => {
    if (plane === 'axial') {
      return {
        horizontal: { plane: 'coronal' as Plane, color: '#00cc00' },
        vertical: { plane: 'sagittal' as Plane, color: '#3b82f6' },
      }
    }

    if (plane === 'coronal') {
      return {
        horizontal: { plane: 'axial' as Plane, color: '#e63939' },
        vertical: { plane: 'sagittal' as Plane, color: '#3b82f6' },
      }
    }

    return {
      horizontal: { plane: 'axial' as Plane, color: '#e63939' },
      vertical: { plane: 'coronal' as Plane, color: '#00cc00' },
    }
  })()

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
        const renderingEngine = await getOrCreateRenderingEngine(renderingEngineId)
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
        await (viewport as any).setVolumes([
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
        const metaWC = firstImage?.metadata?.floatString?.('x00281050');
        const metaWW = firstImage?.metadata?.floatString?.('x00281051');
        
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
          ;(viewport as any).setProperties({
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
      viewportRef.current = null
      volumeRef.current = null

      if (setupViewportId && renderingEngineRef.current) {
        try {
          removeViewportFromToolGroup(setupViewportId)
          if (!renderingEngineRef.current.hasBeenDestroyed) {
            renderingEngineRef.current.disableElement(setupViewportId)
          }
        } catch {
          // Ignore cleanup errors.
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
      ;(viewport as any).setProperties({
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

  const updateCrosshairFromPointer = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const element = elementRef.current
    if (!element || !onCrossReferenceChange) return

    const rect = element.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top))
    onCrossReferenceChange([x, y])
  }, [onCrossReferenceChange])

  const handleOverlayPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return

    const target = event.target as SVGElement
    const action = target.dataset.action as NonNullable<typeof overlayDragRef.current>['action'] | undefined
    const targetPlane = target.dataset.plane as Plane | undefined
    const resolvedAction =
      action ||
      (target.dataset.axis === 'horizontal' || target.dataset.axis === 'vertical' ? 'move' : 'move')

    overlayDragRef.current = {
      action: resolvedAction as NonNullable<typeof overlayDragRef.current>['action'],
      startX: event.clientX,
      startY: event.clientY,
      targetPlane,
    }

    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (resolvedAction === 'move') {
      updateCrosshairFromPointer(event)
    }
  }, [updateCrosshairFromPointer])

  const handleOverlayPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const drag = overlayDragRef.current
    if (!drag) return

    if (drag.action === 'move') {
      updateCrosshairFromPointer(event)
      return
    }

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY

    if ((drag.action === 'horizontal-thickness' || drag.action === 'vertical-thickness') && drag.targetPlane) {
      const deltaMm = drag.action === 'horizontal-thickness' ? -dy * 0.08 : dx * 0.08
      if (Math.abs(deltaMm) >= 0.25) {
        onSlabThicknessChange?.(drag.targetPlane, deltaMm)
        drag.startX = event.clientX
        drag.startY = event.clientY
      }
      return
    }

    if ((drag.action === 'horizontal-rotate' || drag.action === 'vertical-rotate') && drag.targetPlane) {
      const delta = (dx + dy) * 0.08
      if (Math.abs(delta) >= 0.25) {
        const currentRotation = allRotations[drag.targetPlane] || rotation
        onRotationChange?.(drag.targetPlane, {
          ...currentRotation,
          roll: currentRotation.roll + delta,
        })
        drag.startX = event.clientX
        drag.startY = event.clientY
      }
    }
  }, [
    allRotations,
    onRotationChange,
    onSlabThicknessChange,
    rotation,
    updateCrosshairFromPointer,
  ])

  const handleOverlayPointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    overlayDragRef.current = null
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      // Ignore pointer capture release errors.
    }
  }, [])

  useEffect(() => {
    if (syncImageIndex == null || !viewportRef.current) return

    const delta = syncImageIndex - currentImageIndexRef.current
    if (!delta) return

    try {
      viewportRef.current.scroll(delta, true)
      viewportRef.current.render()
      currentImageIndexRef.current = syncImageIndex
    } catch (error) {
      console.warn('MPR sync scroll error:', error)
    }
  }, [syncImageIndex])

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
        currentImageIndexRef.current = Math.max(0, currentImageIndexRef.current + delta)
        onImageIndexChange?.(plane, currentImageIndexRef.current)
      } catch (err) {
        console.error('MPR scroll error:', err)
      }
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [onImageIndexChange, plane, viewportId])

  // Handle double-click to switch to single view
  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.(plane)
  }, [onDoubleClick, plane])

  if (images.length === 0) {
    return (
      <div className="mpr-viewer-panel" style={{ borderColor: getBorderColor() }}>
        <div className="plane-label">{plane.toUpperCase()}</div>
        <div className="error-message">No images available</div>
      </div>
    )
  }

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
      {crossReferencePoint && (
        <svg
          className="mpr-crosshair-overlay"
          aria-hidden="true"
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerCancel={handleOverlayPointerUp}
        >
          <rect
            className="mpr-crosshair-hit-area"
            x="0"
            y="0"
            width="100%"
            height="100%"
            data-action="move"
          />

          <rect
            className="mpr-crosshair-thickness-band horizontal"
            x="0"
            y={crossReferencePoint[1] - Math.max(4, slabThicknessMap[overlayAxes.horizontal.plane] * 0.6)}
            width="100%"
            height={Math.max(8, slabThicknessMap[overlayAxes.horizontal.plane] * 1.2)}
            fill={overlayAxes.horizontal.color}
          />
          <rect
            className="mpr-crosshair-thickness-band vertical"
            x={crossReferencePoint[0] - Math.max(4, slabThicknessMap[overlayAxes.vertical.plane] * 0.6)}
            y="0"
            width={Math.max(8, slabThicknessMap[overlayAxes.vertical.plane] * 1.2)}
            height="100%"
            fill={overlayAxes.vertical.color}
          />

          <line
            className="mpr-crosshair-line"
            x1="0"
            y1={crossReferencePoint[1]}
            x2="100%"
            y2={crossReferencePoint[1]}
            stroke={overlayAxes.horizontal.color}
            data-axis="horizontal"
            data-action="move"
          />
          <line
            className="mpr-crosshair-line"
            x1={crossReferencePoint[0]}
            y1="0"
            x2={crossReferencePoint[0]}
            y2="100%"
            stroke={overlayAxes.vertical.color}
            data-axis="vertical"
            data-action="move"
          />

          <rect
            className="mpr-crosshair-thickness-handle horizontal"
            x={crossReferencePoint[0] - 18}
            y={crossReferencePoint[1] - Math.max(14, slabThicknessMap[overlayAxes.horizontal.plane] * 0.6 + 10)}
            width="36"
            height="8"
            rx="2"
            fill={overlayAxes.horizontal.color}
            data-action="horizontal-thickness"
            data-plane={overlayAxes.horizontal.plane}
          />
          <rect
            className="mpr-crosshair-thickness-handle vertical"
            x={crossReferencePoint[0] + Math.max(8, slabThicknessMap[overlayAxes.vertical.plane] * 0.6 + 6)}
            y={crossReferencePoint[1] - 18}
            width="8"
            height="36"
            rx="2"
            fill={overlayAxes.vertical.color}
            data-action="vertical-thickness"
            data-plane={overlayAxes.vertical.plane}
          />

          <circle
            className="mpr-crosshair-rotation-handle"
            cx={crossReferencePoint[0] + 42}
            cy={crossReferencePoint[1]}
            r="7"
            fill={overlayAxes.horizontal.color}
            data-action="horizontal-rotate"
            data-plane={overlayAxes.horizontal.plane}
          />
          <circle
            className="mpr-crosshair-rotation-handle"
            cx={crossReferencePoint[0]}
            cy={crossReferencePoint[1] - 42}
            r="7"
            fill={overlayAxes.vertical.color}
            data-action="vertical-rotate"
            data-plane={overlayAxes.vertical.plane}
          />

          <circle
            className="mpr-crosshair-center"
            cx={crossReferencePoint[0]}
            cy={crossReferencePoint[1]}
            r="5"
            data-action="move"
          />
        </svg>
      )}
      {images.length > 0 && (
        <div className="slice-info">{plane.charAt(0).toUpperCase() + plane.slice(1)}</div>
      )}
    </div>
  )
}

export default MPRViewerPanel
