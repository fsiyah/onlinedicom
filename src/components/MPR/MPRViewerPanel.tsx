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
  onViewportReady,
  onDoubleClick,
}) => {
  const elementRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<any>(null)
  const volumeRef = useRef<any>(null)
  const renderingEngineRef = useRef<any>(null)
  const [isLoading, setIsLoading] = useState(false)

  const windowWidth = useViewerStore((s) => s.windowWidth)
  const windowCenter = useViewerStore((s) => s.windowCenter)

  const images = volume?.images || []

  const viewportId = `viewport-${seriesId}-${plane}`
  const renderingEngineId = getRenderingEngineId()

  const onViewportReadyRef = useRef(onViewportReady)
  onViewportReadyRef.current = onViewportReady

  useEffect(() => {
    if (!images.length || !elementRef.current) return

    let cancelled = false
    let setupViewportId: string | null = null
    setIsLoading(true)

    const setupVolumeViewport = async () => {
      try {
        const element = elementRef.current
        if (!element || cancelled) return

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

        await Promise.race([
          waitForDimensions(),
          new Promise(resolve => setTimeout(resolve, 1000))
        ])

        if (cancelled) return

        await initCornerstone3D()

        const cs3D = getCornerstone3D()
        if (!cs3D) {
          throw new Error('Cornerstone3D not initialized')
        }

        await initializeCornerstoneTools()

        const { cache, Enums } = cs3D
        if (!element || cancelled) return

        const volumeId = `volume-${seriesId}`
        const streamingVolumeId = `cornerstoneStreamingImageVolume:${volumeId}`

        let csVolume = cache.getVolume(streamingVolumeId)
        if (!csVolume) {
          csVolume = await createVolumeFromImages(images, volumeId)
        } else if (!csVolume.loadStatus?.loaded) {
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
        if (cancelled) return

        volumeRef.current = csVolume

        const renderingEngine = await getOrCreateRenderingEngine(renderingEngineId)
        renderingEngineRef.current = renderingEngine

        let viewport = renderingEngine.getViewport(viewportId)
        if (viewport) {
          try {
            removeViewportFromToolGroup(viewportId)
            renderingEngine.disableElement(viewportId)
          } catch {
            // Ignore stale viewport cleanup errors.
          }
        }

        if (cancelled) return

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

        renderingEngine.enableElement(viewportInput)

        viewport = renderingEngine.getViewport(viewportId)
        if (cancelled || !viewport) return

        viewportRef.current = viewport
        setupViewportId = viewportId

        await (viewport as any).setVolumes([
          {
            volumeId: streamingVolumeId,
          },
        ])

        await addViewportToToolGroup(viewportId)

        if (cancelled) return

        await new Promise(resolve => requestAnimationFrame(resolve))

        if (cancelled) return

        const coreEnums = await import('@cornerstonejs/core')
        const { eventTarget, Enums: CoreEnums } = coreEnums

        const handleVolumeModified = () => {
          if (!cancelled && viewport && renderingEngine) {
            viewport.render()
          }
        }

        eventTarget.addEventListener(
          CoreEnums.Events.IMAGE_VOLUME_MODIFIED,
          handleVolumeModified
        )

        viewport.resetCamera()

        const firstImage = images[0]
        const metaWC = firstImage?.metadata?.floatString?.('x00281050')
        const metaWW = firstImage?.metadata?.floatString?.('x00281051')

        let effectiveWC = metaWC || windowCenter || 40
        let effectiveWW = metaWW || windowWidth || 400

        const dataRange = getVolumeDataRange()

        if (dataRange) {
          const dataCenter = (dataRange.min + dataRange.max) / 2
          const dataWidth = dataRange.max - dataRange.min

          const voiMin = effectiveWC - effectiveWW / 2
          const voiMax = effectiveWC + effectiveWW / 2

          if (voiMax < dataRange.min || voiMin > dataRange.max) {
            effectiveWC = dataCenter
            effectiveWW = Math.max(dataWidth * 1.1, 1)
            console.log(`VOI adjusted to data range: WC=${effectiveWC}, WW=${effectiveWW}`)
          }
        }

        const voiLower = effectiveWC - effectiveWW / 2
        const voiUpper = effectiveWC + effectiveWW / 2

        const volumeActor = viewport.getDefaultActor()?.actor
        if (volumeActor) {
          const property = volumeActor.getProperty()
          if (property) {
            property.getRGBTransferFunction(0)?.setRange(voiLower, voiUpper)
          }
        }

        try {
          ;(viewport as any).setProperties({
            voiRange: {
              lower: voiLower,
              upper: voiUpper,
            },
          })
        } catch {
          // Some Cornerstone versions use a different VOI API.
        }

        renderingEngine.resize(true, true)
        viewport.render()

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

        setTimeout(() => {
          if (!cancelled && renderingEngine) {
            try {
              const allViewportIds = renderingEngine.getViewports().map((vp: any) => vp.id)
              if (allViewportIds.length > 0) {
                renderingEngine.renderViewports(allViewportIds)
                console.log(`Rendered all ${allViewportIds.length} viewports`)
              }
            } catch {
              viewport?.render()
            }
          }
        }, 1000)

        setTimeout(() => {
          if (!cancelled && renderingEngine) {
            try {
              renderingEngine.render()
            } catch {
              // Ignore delayed render cleanup races.
            }
          }
        }, 2000)

        setIsLoading(false)
        console.log(`MPR viewport ${plane} setup complete`)

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

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(elementRef.current)

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
    }
  }, [viewportId])

  const getBorderColor = () => {
    switch (plane) {
      case 'axial':
        return '#e63939'
      case 'coronal':
        return '#00cc00'
      case 'sagittal':
        return '#3b82f6'
      default:
        return '#666'
    }
  }

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      const viewport = viewportRef.current
      if (!viewport) return

      const delta = e.deltaY > 0 ? 1 : -1

      try {
        viewport.scroll(delta, true)
        viewport.render()
      } catch (err) {
        console.error('MPR scroll error:', err)
      }
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [plane, viewportId])

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
      {images.length > 0 && (
        <div className="slice-info">{plane.charAt(0).toUpperCase() + plane.slice(1)}</div>
      )}
    </div>
  )
}

export default MPRViewerPanel
