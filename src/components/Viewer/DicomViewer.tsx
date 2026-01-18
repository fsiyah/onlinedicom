import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useViewerStore, loadCornerstone } from '../../store/viewerStore'
import './DicomViewer.css'

interface DicomViewerProps {
  studyId: string
  seriesId: string
  imageIndex: number
}

const DicomViewer: React.FC<DicomViewerProps> = ({
  studyId,
  seriesId,
  imageIndex,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<HTMLDivElement>(null)
  const [cornerstoneLoaded, setCornerstoneLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const isInitialized = useViewerStore((state) => state.isInitialized)
  const studies = useViewerStore((state) => state.studies)
  const zoom = useViewerStore((state) => state.zoom)
  const rotation = useViewerStore((state) => state.rotation)
  const flipHorizontal = useViewerStore((state) => state.flipHorizontal)
  const flipVertical = useViewerStore((state) => state.flipVertical)
  const windowWidth = useViewerStore((state) => state.windowWidth)
  const windowCenter = useViewerStore((state) => state.windowCenter)
  const setActiveImageIndex = useViewerStore((state) => state.setActiveImageIndex)
  const nextImage = useViewerStore((state) => state.nextImage)
  const previousImage = useViewerStore((state) => state.previousImage)
  const setZoom = useViewerStore((state) => state.setZoom)
  const setWindowWidth = useViewerStore((state) => state.setWindowWidth)
  const setWindowCenter = useViewerStore((state) => state.setWindowCenter)

  // Refs for avoiding stale state
  const csRef = useRef<any>(null)
  const cstRef = useRef<any>(null)

  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const wwRef = useRef(windowWidth)
  useEffect(() => {
    wwRef.current = windowWidth
  }, [windowWidth])

  const wcRef = useRef(windowCenter)
  useEffect(() => {
    wcRef.current = windowCenter
  }, [windowCenter])

  const study = studies.find((s) => s.id === studyId)
  const series = study?.series.find((s) => s.id === seriesId)
  const image = series?.images[imageIndex]
  const totalImages = series?.images.length || 0

  // Safe stack tools setup helper
  const safeSetupStackTools = useCallback((element: HTMLDivElement, imageIds: string[], index: number) => {
    const cs = csRef.current
    const tools = cstRef.current
    if (!cs || !tools) return
    if (typeof cs.getEnabledElement !== 'function') return

    // element enabled mi?
    let enabledElement: any
    try {
      enabledElement = cs.getEnabledElement(element)
    } catch {
      return
    }
    if (!enabledElement) return

    // Stack manager/setStack fonksiyonları var mı?
    try {
      if (tools.addStackStateManager) {
        tools.addStackStateManager(element, ['stack'])
      }

      const stack = { imageIds, currentImageIdIndex: index }
      if (tools.setStack) {
        tools.setStack(element, index, stack)
      }

      // Tool aktivasyonları
      if (tools.setToolActive) {
        tools.setToolActive('StackScrollMouseWheel', {})
        // Sol tuş Wwwc'yi de pasif yapabiliriz (orta tuş WW/WC için)
        tools.setToolPassive?.('Wwwc')
        tools.setToolPassive?.('Zoom') // default zoom devre dışı
        tools.setToolPassive?.('Pan') // orta tuş pan kapalı (WW/WC için)

        tools.setToolPassive?.('Length')
        tools.setToolPassive?.('Angle')
        tools.setToolPassive?.('RectangleRoi')
        tools.setToolPassive?.('EllipseRoi')
      }
    } catch (e) {
      console.warn('Stack tools setup skipped/failed safely:', e)
    }
  }, [])

  // Calculate fit-to-window scale
  const calculateFitToWindow = useCallback((element: HTMLElement, imageData: any): number => {
    const elementWidth = element.clientWidth || element.offsetWidth
    const elementHeight = element.clientHeight || element.offsetHeight
    
    // If element has no size yet, return default
    if (elementWidth === 0 || elementHeight === 0) {
      console.warn('Element has no size yet, using default scale')
      return 1
    }
    
    if (!imageData) {
      console.warn('No image data provided')
      return 1
    }

    // Get image dimensions from imageData
    const imageWidth = imageData.width || imageData.columns || 512
    const imageHeight = imageData.height || imageData.rows || 512

    if (!imageWidth || !imageHeight || imageWidth === 0 || imageHeight === 0) {
      console.warn('Invalid image dimensions:', { imageWidth, imageHeight })
      return 1
    }

    // Calculate scale to fit both dimensions
    const scaleX = elementWidth / imageWidth
    const scaleY = elementHeight / imageHeight
    
    // Use the smaller scale to ensure image fits completely
    const fitScale = Math.min(scaleX, scaleY)
    
    // Add small padding (5% margin)
    const finalScale = fitScale * 0.95
    
    // Only log in debug mode (comment out for production)
    // console.log('Fit-to-window calculation:', {
    //   elementSize: { width: elementWidth, height: elementHeight },
    //   imageSize: { width: imageWidth, height: imageHeight },
    //   fitScale: finalScale
    // })
    
    return finalScale
  }, [])

  // Load cornerstone when component mounts and cache in refs
  useEffect(() => {
    let cancelled = false

    loadCornerstone().then(({ cornerstone, cornerstoneTools }) => {
      if (cancelled) return

      // ✅ undefined geldiyse mevcut ref'i bozma
      if (cornerstone && typeof cornerstone.getEnabledElement === 'function') {
        csRef.current = cornerstone
      }
      if (cornerstoneTools) {
        cstRef.current = cornerstoneTools
      }

      // loaded flag sadece gerçekten cornerstone geldiyse true olsun
      if (csRef.current) setCornerstoneLoaded(true)
    })

    return () => { cancelled = true }
  }, [])

  // Handle window resize for fit-to-window
  useEffect(() => {
    const handleResize = () => {
      if (!cornerstoneLoaded || !isInitialized || !elementRef.current || !image) return

      loadCornerstone().then(({ cornerstone }) => {
        const element = elementRef.current
        if (!element) return

        try {
          const enabledElement = cornerstone.getEnabledElement(element)
          if (enabledElement && enabledElement.image) {
            const imageData = enabledElement.image
            const fitScale = calculateFitToWindow(element, imageData)
            
            const viewport = cornerstone.getViewport(element)
            if (viewport) {
              // Recalculate scale based on current zoom and new fit scale
              const finalScale = fitScale * zoom
              viewport.scale = finalScale
              
              // Reset pan if zoom is 1 (fit-to-window)
              if (zoom === 1) {
                viewport.translation = { x: 0, y: 0 }
              }
              
              cornerstone.setViewport(element, viewport)
              cornerstone.updateImage(element)
            }
          }
        } catch (error) {
          // Element not enabled yet, ignore
        }
      })
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [cornerstoneLoaded, isInitialized, image, zoom, setZoom])

  // Keyboard navigation for CT series
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!elementRef.current) return
      
      // Check if viewer is focused or if no input is focused
      const activeElement = document.activeElement
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault()
          previousImage()
          break
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault()
          nextImage()
          break
        case 'PageUp':
          e.preventDefault()
          const prevIndex = Math.max(0, imageIndex - 10)
          setActiveImageIndex(prevIndex)
          break
        case 'PageDown':
          e.preventDefault()
          const nextIndex = Math.min(totalImages - 1, imageIndex + 10)
          setActiveImageIndex(nextIndex)
          break
        case 'Home':
          e.preventDefault()
          setActiveImageIndex(0)
          break
        case 'End':
          e.preventDefault()
          setActiveImageIndex(totalImages - 1)
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => {
      window.removeEventListener('keydown', handleKeyPress)
    }
  }, [imageIndex, totalImages, nextImage, previousImage, setActiveImageIndex])

  // Custom mouse handlers for enhanced controls using Pointer Events API
  // All mouse interactions in one place for cleaner code
  useEffect(() => {
    if (!elementRef.current || !cornerstoneLoaded || !isInitialized) return

    const element = elementRef.current

    // Cache cornerstone
    loadCornerstone().then(({ cornerstone }) => {
      csRef.current = cornerstone
    })

    // Modlar
    let rightDown = false
    let middleDown = false

    // Son pointer konumu
    let lastX = 0
    let lastY = 0

    // Zoom limits
    const MIN_ZOOM = 0.1
    const MAX_ZOOM = 10
    const ZOOM_SENS = 0.01

    // WW/WC limits + sensitivity
    const MIN_WW = 1
    const MAX_WW = 5000
    const WW_SENS = 2.0   // X hareketi -> WW
    const WC_SENS = 1.0   // Y hareketi -> WC

    // Store update'i raf ile yumuşat
    let rafId: number | null = null
    let pendingZoom: number | null = null
    let pendingWW: number | null = null
    let pendingWC: number | null = null

    const flushStore = () => {
      rafId = null
      if (pendingZoom != null) setZoom(pendingZoom)
      if (pendingWW != null && typeof setWindowWidth === 'function') setWindowWidth(pendingWW)
      if (pendingWC != null && typeof setWindowCenter === 'function') setWindowCenter(pendingWC)
      pendingZoom = null
      pendingWW = null
      pendingWC = null
    }

    const scheduleStore = () => {
      if (rafId != null) return
      rafId = requestAnimationFrame(flushStore)
    }

    const applyViewport = (fn: (viewport: any, enabledImage: any) => void) => {
      const cs = csRef.current
      if (!cs) return
      try {
        const enabled = cs.getEnabledElement(element)
        if (!enabled?.image) return

        const viewport = cs.getViewport(element)
        if (!viewport) return

        fn(viewport, enabled.image)

        cs.setViewport(element, viewport)
        cs.updateImage(element)
      } catch {
        // element enable edilmemiş olabilir
      }
    }

    const applyZoom = (newZoom: number) => {
      zoomRef.current = newZoom
      pendingZoom = newZoom
      scheduleStore()

      applyViewport((viewport, image) => {
        const fitScale = calculateFitToWindow(element, image)
        viewport.scale = fitScale * newZoom
        // zoom 1 ise pan resetlemek istersen:
        // if (newZoom === 1) viewport.translation = { x: 0, y: 0 }
      })
    }

    const applyWwWc = (dx: number, dy: number) => {
      // Y: yukarı (-dy) -> parlaklık azalsın => WC azalsın
      // Y: aşağı (+dy) -> parlaklık artsın => WC artsın
      const nextWC = wcRef.current + dy * WC_SENS

      // X: sağa (+dx) -> kontrast azalsın => WW artsın
      // X: sola (-dx) -> kontrast artsın => WW azalsın
      const unclampedWW = wwRef.current + dx * WW_SENS
      const nextWW = Math.max(MIN_WW, Math.min(MAX_WW, unclampedWW))

      wcRef.current = nextWC
      wwRef.current = nextWW

      pendingWC = nextWC
      pendingWW = nextWW
      scheduleStore()

      applyViewport((viewport) => {
        viewport.voi = viewport.voi || {}
        viewport.voi.windowCenter = nextWC
        viewport.voi.windowWidth = nextWW
      })
    }

    const handlePointerDown = (e: PointerEvent) => {
      // Right button: 2 -> zoom drag
      if (e.button === 2) {
        rightDown = true
        lastX = e.clientX
        lastY = e.clientY
        e.preventDefault()
        e.stopPropagation()
        element.setPointerCapture?.(e.pointerId)
        return
      }

      // Middle button: 1 -> WW/WC drag
      if (e.button === 1) {
        middleDown = true
        lastX = e.clientX
        lastY = e.clientY
        e.preventDefault()
        e.stopPropagation()
        element.setPointerCapture?.(e.pointerId)
        return
      }
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!rightDown && !middleDown) return

      e.preventDefault()
      e.stopPropagation()

      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      if (rightDown) {
        // sadece Y ile zoom (senin istediğin)
        const factor = Math.exp(-dy * ZOOM_SENS) // yukarı => >1, aşağı => <1
        const current = zoomRef.current
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * factor))
        applyZoom(next)
        return
      }

      if (middleDown) {
        applyWwWc(dx, dy)
        return
      }
    }

    const handlePointerUp = (e: PointerEvent) => {
      if (rightDown || middleDown) {
        rightDown = false
        middleDown = false
        try { element.releasePointerCapture?.(e.pointerId) } catch {}
      }
    }

    const handlePointerCancel = handlePointerUp

    const handleWheel = (e: WheelEvent) => {
      if (!element.contains(e.target as Node)) return

      // Sağ tuş basılıyken wheel zoom (opsiyonel, sende vardı)
      if (rightDown || e.buttons === 2) {
        e.preventDefault()
        e.stopPropagation()
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * zoomFactor))
        applyZoom(next)
        return
      }

      // Normal wheel = slice navigation
      if (totalImages > 1) {
        e.preventDefault()
        if (e.deltaY > 0) nextImage()
        else previousImage()
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      if (element.contains(e.target as Node)) e.preventDefault()
    }

    element.addEventListener('pointerdown', handlePointerDown)
    element.addEventListener('pointermove', handlePointerMove)
    element.addEventListener('pointerup', handlePointerUp)
    element.addEventListener('pointercancel', handlePointerCancel)
    element.addEventListener('wheel', handleWheel, { passive: false })
    element.addEventListener('contextmenu', handleContextMenu)

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown)
      element.removeEventListener('pointermove', handlePointerMove)
      element.removeEventListener('pointerup', handlePointerUp)
      element.removeEventListener('pointercancel', handlePointerCancel)
      element.removeEventListener('wheel', handleWheel)
      element.removeEventListener('contextmenu', handleContextMenu)

      if (rafId != null) cancelAnimationFrame(rafId)
      rafId = null
    }
  }, [
    cornerstoneLoaded,
    isInitialized,
    totalImages,
    nextImage,
    previousImage,
    calculateFitToWindow,
    setZoom,
    setWindowWidth,
    setWindowCenter,
  ])

  useEffect(() => {
    if (!isInitialized || !cornerstoneLoaded || !elementRef.current || !image || !series) return

    setIsLoading(true)
    let cancelled = false

    loadCornerstone().then(({ cornerstone, cornerstoneTools }) => {
      if (cancelled) return

      const element = elementRef.current
      if (!element) {
        setIsLoading(false)
        return
      }

      // Cache in refs
      csRef.current = cornerstone
      cstRef.current = cornerstoneTools

      // Enable element
      cornerstone.enable(element)

      // For CT series with multiple images, create a stack
      if (series.images.length > 1) {
        // Create image IDs array for the stack
        const imageIds = series.images.map(img => img.imageId)
        
        // Load current image first
        cornerstone.loadImage(image.imageId)
          .then((imageData: any) => {
            if (cancelled) return

            // Wait a bit for element to have proper size, then setup
            const setupImage = () => {
              if (cancelled) return

              const viewport = cornerstone.getDefaultViewportForImage(element, imageData)
              
              // Calculate fit-to-window scale
              const fitScale = calculateFitToWindow(element, imageData)
              
              // Apply window/level
              viewport.voi.windowWidth = windowWidth
              viewport.voi.windowCenter = windowCenter
              
              // Apply zoom: zoom is a multiplier relative to fit scale
              // If zoom is 1, use fit scale; otherwise multiply fit scale by zoom
              const finalScale = fitScale * zoom
              viewport.scale = finalScale
              
              // Reset pan for fit-to-window when zoom is 1
              if (zoom === 1) {
                viewport.translation = { x: 0, y: 0 }
              }
              
              // Apply rotation
              viewport.rotation = rotation
              
              // Apply flip
              viewport.hflip = flipHorizontal
              viewport.vflip = flipVertical

              cornerstone.displayImage(element, imageData, viewport)
              
              // Force resize to ensure fit
              cornerstone.resize(element)

              // ✅ Stack tools setup: görüntü gerçekten ekrana basıldıktan sonra
              safeSetupStackTools(element, imageIds, imageIndex)
            }
            
            // Try immediately, if element has size
            if (element.clientWidth > 0 && element.clientHeight > 0) {
              setupImage()
            } else {
              // Wait for element to get size
              setTimeout(() => {
                if (!cancelled) setupImage()
              }, 100)
            }

            setIsLoading(false)
          })
          .catch((error: any) => {
            if (cancelled) return
            console.error('Failed to load DICOM image:', error)
            setIsLoading(false)
          })
      } else {
        // Single image (non-CT or single slice)
        cornerstone.loadImage(image.imageId)
          .then((imageData: any) => {
            if (cancelled) return

            // Setup image with fit-to-window
            const setupImage = () => {
              if (cancelled) return

              const viewport = cornerstone.getDefaultViewportForImage(element, imageData)
              
              // Calculate fit-to-window scale
              const fitScale = calculateFitToWindow(element, imageData)
              
              // Apply window/level
              viewport.voi.windowWidth = windowWidth
              viewport.voi.windowCenter = windowCenter
              
              // Apply zoom: zoom is a multiplier relative to fit scale
              // If zoom is 1, use fit scale; otherwise multiply fit scale by zoom
              const finalScale = fitScale * zoom
              viewport.scale = finalScale
              
              // Reset pan for fit-to-window when zoom is 1
              if (zoom === 1) {
                viewport.translation = { x: 0, y: 0 }
              }
              
              // Apply rotation
              viewport.rotation = rotation
              
              // Apply flip
              viewport.hflip = flipHorizontal
              viewport.vflip = flipVertical

              cornerstone.displayImage(element, imageData, viewport)
              
              // Force resize to ensure fit
              cornerstone.resize(element)

              // RadiAnt-style controls for single images:
              // - Right mouse drag: Direction-based Zoom (custom handler)
              // - Middle mouse drag: WW/WC (custom handler)
              // All handled in the unified mouse handler useEffect
              try {
                const tools = cstRef.current
                if (tools) {
                  // All tools passive, custom handlers manage everything
                  tools.setToolPassive?.('Wwwc')
                  tools.setToolPassive?.('Zoom')
                  tools.setToolPassive?.('Pan')
                  
                  // Disable other tools to avoid conflicts
                  tools.setToolPassive?.('Length')
                  tools.setToolPassive?.('Angle')
                  tools.setToolPassive?.('RectangleRoi')
                  tools.setToolPassive?.('EllipseRoi')
                }
              } catch (error) {
                console.warn('Failed to activate some tools:', error)
              }
            }
            
            // Try immediately, if element has size
            if (element.clientWidth > 0 && element.clientHeight > 0) {
              setupImage()
            } else {
              // Wait for element to get size
              setTimeout(() => {
                if (!cancelled) setupImage()
              }, 100)
            }

            setIsLoading(false)
          })
          .catch((error: any) => {
            if (cancelled) return
            console.error('Failed to load DICOM image:', error)
            setIsLoading(false)
          })
      }

      return () => {
        cancelled = true
        cornerstone.disable(element)
      }
    })
  }, [
    isInitialized,
    cornerstoneLoaded,
    image,
    series,
    imageIndex,
    windowWidth,
    windowCenter,
    zoom,
    rotation,
    flipHorizontal,
    flipVertical,
    safeSetupStackTools,
    calculateFitToWindow,
  ])

  // Update viewport when settings change
  useEffect(() => {
    if (!cornerstoneLoaded || !isInitialized || !elementRef.current || !image) return

    loadCornerstone().then(({ cornerstone }) => {
      const element = elementRef.current
      if (!element) return
      
      // Check if element is enabled
      try {
        const enabledElement = cornerstone.getEnabledElement(element)
        if (enabledElement && enabledElement.image) {
          const imageData = enabledElement.image
          const fitScale = calculateFitToWindow(element, imageData)
          const viewport = cornerstone.getViewport(element)
          
          if (viewport) {
            viewport.voi.windowWidth = windowWidth
            viewport.voi.windowCenter = windowCenter
            viewport.scale = fitScale * zoom // Apply zoom relative to fit scale
            viewport.rotation = rotation
            viewport.hflip = flipHorizontal
            viewport.vflip = flipVertical
            
            cornerstone.setViewport(element, viewport)
            cornerstone.updateImage(element)
          }
        }
      } catch (error) {
        // Element might not be enabled yet, ignore this update
        console.debug('Viewport update skipped - element not ready:', error)
      }
    })
  }, [cornerstoneLoaded, isInitialized, windowWidth, windowCenter, zoom, rotation, flipHorizontal, flipVertical, image])

  // Update image when imageIndex changes (for CT series)
  useEffect(() => {
    if (!cornerstoneLoaded || !isInitialized || !elementRef.current || !image || !series) return

    loadCornerstone().then(({ cornerstone, cornerstoneTools }) => {
      const element = elementRef.current
      if (!element) return

      // Check if element is enabled
      try {
        cornerstone.getEnabledElement(element)
      } catch (error) {
        // Element not enabled yet, skip this update
        console.debug('Image update skipped - element not enabled:', error)
        return
      }

      // Only update if we have a stack (multiple images)
      if (series.images.length > 1) {
        cornerstone.loadImage(image.imageId)
          .then((imageData: any) => {
            try {
              const viewport = cornerstone.getViewport(element) || cornerstone.getDefaultViewportForImage(element, imageData)
              
              // Calculate fit-to-window scale for new image
              const fitScale = calculateFitToWindow(element, imageData)
              
              // Preserve current viewport settings
              viewport.voi.windowWidth = windowWidth
              viewport.voi.windowCenter = windowCenter
              viewport.scale = fitScale * zoom // Apply zoom relative to fit scale
              viewport.rotation = rotation
              viewport.hflip = flipHorizontal
              viewport.vflip = flipVertical
              
              // Reset pan if zoom is 1
              if (zoom === 1) {
                viewport.translation = { x: 0, y: 0 }
              }

              cornerstone.displayImage(element, imageData, viewport)
              cornerstone.resize(element)
              
              // Update stack index
              try {
                const imageIds = series.images.map(img => img.imageId)
                const stack = {
                  imageIds: imageIds,
                  currentImageIdIndex: imageIndex,
                }
                if (cornerstoneTools && cornerstoneTools.setStack) {
                  cornerstoneTools.setStack(element, imageIndex, stack)
                }
              } catch (error) {
                console.warn('Failed to update stack:', error)
              }
            } catch (error) {
              console.warn('Failed to update viewport:', error)
            }
          })
          .catch((error: any) => {
            console.error('Failed to load new image:', error)
          })
      }
    })
  }, [cornerstoneLoaded, isInitialized, imageIndex, image, series, windowWidth, windowCenter, zoom, rotation, flipHorizontal, flipVertical])

  if (!image) {
    return (
      <div className="dicom-viewer empty">
        <p>No image available</p>
      </div>
    )
  }

  return (
    <div className="dicom-viewer" ref={canvasRef}>
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">Loading...</div>
        </div>
      )}
      {totalImages > 1 && (
        <div className="series-info">
          <span>Slice: {imageIndex + 1} / {totalImages}</span>
        </div>
      )}
      <div className="cornerstone-element" ref={elementRef} />
    </div>
  )
}

export default DicomViewer
