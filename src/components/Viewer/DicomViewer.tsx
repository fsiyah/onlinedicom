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

  // Zoom ref for avoiding stale state
  const zoomRef = useRef(zoom)
  const csRef = useRef<any>(null)

  // Keep zoomRef in sync with zoom state
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const study = studies.find((s) => s.id === studyId)
  const series = study?.series.find((s) => s.id === seriesId)
  const image = series?.images[imageIndex]
  const totalImages = series?.images.length || 0

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

  // Load cornerstone when component mounts
  useEffect(() => {
    loadCornerstone().then(() => {
      setCornerstoneLoaded(true)
    })
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
  // Optimized with refs to avoid stale state and reduce re-renders
  useEffect(() => {
    if (!elementRef.current || !cornerstoneLoaded || !isInitialized) return

    const element = elementRef.current

    let rightDown = false
    let lastY = 0

    const MIN_ZOOM = 0.1
    const MAX_ZOOM = 10
    const sensitivity = 0.01

    let rafId: number | null = null
    let pendingZoom: number | null = null

    // Cornerstone'u bir kere yükleyip cache'le
    loadCornerstone().then(({ cornerstone }) => {
      csRef.current = cornerstone
    })

    const applyZoomToViewport = (newZoom: number) => {
      const cs = csRef.current
      if (!cs) return

      try {
        const enabledElement = cs.getEnabledElement(element)
        if (!enabledElement || !enabledElement.image) return

        const viewport = cs.getViewport(element)
        if (!viewport) return

        const fitScale = calculateFitToWindow(element, enabledElement.image)
        viewport.scale = fitScale * newZoom

        cs.setViewport(element, viewport)
        cs.updateImage(element)
        // resize her move'da şart değil; çoğu zaman gereksiz masraf
        // cs.resize(element)
      } catch (err) {
        // element henüz enable değilse vb.
      }
    }

    const scheduleStoreZoomUpdate = (newZoom: number) => {
      pendingZoom = newZoom
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (pendingZoom == null) return
        setZoom(pendingZoom)
        pendingZoom = null
      })
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 2) return // right mouse

      rightDown = true
      lastY = e.clientY

      e.preventDefault()
      e.stopPropagation()

      element.setPointerCapture?.(e.pointerId)
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!rightDown) return

      e.preventDefault()
      e.stopPropagation()

      const dy = e.clientY - lastY // aşağı +, yukarı -
      lastY = e.clientY

      const factor = Math.exp(-dy * sensitivity) // yukarı => >1, aşağı => <1
      const current = zoomRef.current
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * factor))

      // refs ile state senkron
      zoomRef.current = next

      // anlık uygula
      applyZoomToViewport(next)

      // store'u raf ile güncelle (daha akıcı)
      scheduleStoreZoomUpdate(next)
    }

    const endRightDrag = (e: PointerEvent) => {
      if (!rightDown) return
      rightDown = false
      try {
        element.releasePointerCapture?.(e.pointerId)
      } catch {}
    }

    const handleWheel = (e: WheelEvent) => {
      if (!element.contains(e.target as Node)) return

      // Right mouse + wheel = zoom
      if (rightDown || e.buttons === 2) {
        e.preventDefault()
        e.stopPropagation()

        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
        const newZoom = zoomRef.current * zoomFactor
        const clampedZoom = Math.max(0.1, Math.min(10, newZoom))
        zoomRef.current = clampedZoom

        const cs = csRef.current
        if (cs) {
          try {
            const enabledElement = cs.getEnabledElement(element)
            if (!enabledElement) return

            const viewport = cs.getViewport(element)
            if (!viewport) return

            // Get fit scale for current image
            if (enabledElement.image) {
              const fitScale = calculateFitToWindow(element, enabledElement.image)
              viewport.scale = fitScale * clampedZoom
              
              cs.setViewport(element, viewport)
              cs.updateImage(element)
            }
          } catch (error) {
            console.warn('Failed to zoom with wheel:', error)
          }
        }

        setZoom(clampedZoom)
      }
      // Normal wheel = slice navigation (for CT series with multiple images)
      else if (totalImages > 1) {
        e.preventDefault()
        
        if (e.deltaY > 0) {
          nextImage()
        } else {
          previousImage()
        }
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      if (element.contains(e.target as Node)) e.preventDefault()
    }

    element.addEventListener('pointerdown', handlePointerDown)
    element.addEventListener('pointermove', handlePointerMove)
    element.addEventListener('pointerup', endRightDrag)
    element.addEventListener('pointercancel', endRightDrag)
    element.addEventListener('wheel', handleWheel, { passive: false })
    element.addEventListener('contextmenu', handleContextMenu)

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown)
      element.removeEventListener('pointermove', handlePointerMove)
      element.removeEventListener('pointerup', endRightDrag)
      element.removeEventListener('pointercancel', endRightDrag)
      element.removeEventListener('wheel', handleWheel)
      element.removeEventListener('contextmenu', handleContextMenu)

      if (rafId != null) cancelAnimationFrame(rafId)
      rafId = null
      pendingZoom = null
    }
  }, [cornerstoneLoaded, isInitialized, calculateFitToWindow, setZoom, totalImages, nextImage, previousImage])

  useEffect(() => {
    if (!isInitialized || !cornerstoneLoaded || !elementRef.current || !image || !series) return

    setIsLoading(true)
    loadCornerstone().then(({ cornerstone, cornerstoneTools }) => {
      const element = elementRef.current
      if (!element) return

      // Enable element
      cornerstone.enable(element)

      // For CT series with multiple images, create a stack
      if (series.images.length > 1) {
        // Create image IDs array for the stack
        const imageIds = series.images.map(img => img.imageId)
        
        // Load current image first
        cornerstone.loadImage(image.imageId)
          .then((imageData) => {
            // Wait a bit for element to have proper size, then setup
            const setupImage = () => {
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
            }
            
            // Try immediately, if element has size
            if (element.clientWidth > 0 && element.clientHeight > 0) {
              setupImage()
            } else {
              // Wait for element to get size
              setTimeout(setupImage, 100)
            }

            // Set up stack for mouse wheel scrolling (after image is displayed)
            setTimeout(() => {
              // Get current element reference
              const currentElement = elementRef.current
              if (!currentElement) {
                console.warn('Element ref not available, skipping stack setup')
                return
              }
              
              // Use the cornerstone and tools instances from the outer scope (already loaded)
              // They are available in the closure
              try {
                // Validate cornerstone instance
                if (!cornerstone) {
                  console.warn('Cornerstone instance is null or undefined, skipping stack setup')
                  return
                }
                
                if (typeof cornerstone.getEnabledElement !== 'function') {
                  console.warn('Cornerstone getEnabledElement is not a function, skipping stack setup')
                  return
                }
                
                if (!cornerstoneTools) {
                  console.warn('CornerstoneTools is not available, skipping stack setup')
                  return
                }
                
                // Check if element is enabled before setting up stack
                let enabledElement
                try {
                  enabledElement = cornerstone.getEnabledElement(currentElement)
                  if (!enabledElement) {
                    console.warn('Element not enabled, skipping stack setup')
                    return
                  }
                } catch (err) {
                  console.warn('Cannot get enabled element, skipping stack setup:', err)
                  return
                }
                
                // Add stack state manager (only if it exists)
                if (cornerstoneTools.addStackStateManager) {
                  cornerstoneTools.addStackStateManager(currentElement, ['stack'])
                }
                
                // Create stack data
                const stack = {
                  imageIds: imageIds,
                  currentImageIdIndex: imageIndex,
                }
                
                // Set stack (only if it exists)
                if (cornerstoneTools.setStack) {
                  cornerstoneTools.setStack(currentElement, imageIndex, stack)
                }
                
                // RadiAnt-style controls:
                // - Left mouse drag: Window/Level (Wwwc)
                // - Right mouse drag: Direction-based Zoom (custom handler)
                // - Middle mouse drag: Pan
                // - Mouse wheel: Stack scroll (slice navigation)
                
                // Enable stack scroll with mouse wheel (for CT series)
                cornerstoneTools.setToolActive('StackScrollMouseWheel', {})
                
                // Enable tools with RadiAnt-style mouse buttons
                cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 }) // Left mouse - Window/Level
                // Note: Right mouse zoom is handled by custom event handler for direction-based zoom
                // Disable default right mouse tools to avoid conflicts
                cornerstoneTools.setToolPassive('Zoom') // Disable default zoom tool
                cornerstoneTools.setToolActive('Pan', { mouseButtonMask: 4 }) // Middle mouse - Pan
                
                // Disable other tools to avoid conflicts
                cornerstoneTools.setToolPassive('Length')
                cornerstoneTools.setToolPassive('Angle')
                cornerstoneTools.setToolPassive('RectangleRoi')
                cornerstoneTools.setToolPassive('EllipseRoi')
              } catch (error) {
                console.warn('Failed to set up stack tools:', error)
                // Fallback: enable basic tools
                try {
                  if (cornerstoneTools && currentElement) {
                    cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 })
                    cornerstoneTools.setToolActive('Zoom', { mouseButtonMask: 2 })
                    cornerstoneTools.setToolActive('Pan', { mouseButtonMask: 4 })
                  }
                } catch (e) {
                  console.warn('Failed to activate basic tools:', e)
                }
              }
            }, 150)

            setIsLoading(false)
          })
          .catch((error) => {
            console.error('Failed to load DICOM image:', error)
            setIsLoading(false)
          })
      } else {
        // Single image (non-CT or single slice)
        cornerstone.loadImage(image.imageId)
          .then((imageData) => {
            // Setup image with fit-to-window
            const setupImage = () => {
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
            }
            
            // Try immediately, if element has size
            if (element.clientWidth > 0 && element.clientHeight > 0) {
              setupImage()
            } else {
              // Wait for element to get size
              setTimeout(setupImage, 100)
            }

            // RadiAnt-style controls for single images:
            // - Left mouse drag: Window/Level
            // - Right mouse drag: Direction-based Zoom (custom handler)
            // - Middle mouse drag: Pan
            setTimeout(() => {
              try {
                cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 }) // Left mouse - Window/Level
                // Note: Right mouse zoom is handled by custom event handler for direction-based zoom
                cornerstoneTools.setToolActive('Pan', { mouseButtonMask: 4 }) // Middle mouse - Pan
                
                // Disable other tools to avoid conflicts
                cornerstoneTools.setToolPassive('Length')
                cornerstoneTools.setToolPassive('Angle')
                cornerstoneTools.setToolPassive('RectangleRoi')
                cornerstoneTools.setToolPassive('EllipseRoi')
              } catch (error) {
                console.warn('Failed to activate some tools:', error)
              }
            }, 150)

            setIsLoading(false)
          })
          .catch((error) => {
            console.error('Failed to load DICOM image:', error)
            setIsLoading(false)
          })
      }

      return () => {
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
          .then((imageData) => {
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
          .catch((error) => {
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
