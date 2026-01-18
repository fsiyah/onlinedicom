import React, { useEffect, useRef, useState } from 'react'
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

  const study = studies.find((s) => s.id === studyId)
  const series = study?.series.find((s) => s.id === seriesId)
  const image = series?.images[imageIndex]
  const totalImages = series?.images.length || 0

  // Load cornerstone when component mounts
  useEffect(() => {
    loadCornerstone().then(() => {
      setCornerstoneLoaded(true)
    })
  }, [])

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
            const viewport = cornerstone.getDefaultViewportForImage(element, imageData)
            
            // Apply window/level
            viewport.voi.windowWidth = windowWidth
            viewport.voi.windowCenter = windowCenter
            
            // Apply zoom
            viewport.scale = zoom
            
            // Apply rotation
            viewport.rotation = rotation
            
            // Apply flip
            viewport.hflip = flipHorizontal
            viewport.vflip = flipVertical

            cornerstone.displayImage(element, imageData, viewport)

            // Set up stack for mouse wheel scrolling
            try {
              // Add stack state manager
              cornerstoneTools.addStackStateManager(element, ['stack'])
              
              // Create stack data
              const stack = {
                imageIds: imageIds,
                currentImageIdIndex: imageIndex,
              }
              
              cornerstoneTools.setStack(element, imageIndex, stack)
              
              // RadiAnt-style controls:
              // - Left mouse drag: Window/Level (Wwwc)
              // - Right mouse drag: Zoom
              // - Middle mouse drag: Pan
              // - Mouse wheel: Stack scroll (slice navigation)
              
              // Enable stack scroll with mouse wheel (for CT series)
              cornerstoneTools.setToolActive('StackScrollMouseWheel', {})
              
              // Enable tools with RadiAnt-style mouse buttons
              cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 }) // Left mouse - Window/Level
              cornerstoneTools.setToolActive('Zoom', { mouseButtonMask: 2 }) // Right mouse - Zoom
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
                cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 })
                cornerstoneTools.setToolActive('Zoom', { mouseButtonMask: 2 })
                cornerstoneTools.setToolActive('Pan', { mouseButtonMask: 4 })
              } catch (e) {
                console.warn('Failed to activate basic tools:', e)
              }
            }

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
            const viewport = cornerstone.getDefaultViewportForImage(element, imageData)
            
            // Apply window/level
            viewport.voi.windowWidth = windowWidth
            viewport.voi.windowCenter = windowCenter
            
            // Apply zoom
            viewport.scale = zoom
            
            // Apply rotation
            viewport.rotation = rotation
            
            // Apply flip
            viewport.hflip = flipHorizontal
            viewport.vflip = flipVertical

            cornerstone.displayImage(element, imageData, viewport)

            // RadiAnt-style controls for single images:
            // - Left mouse drag: Window/Level
            // - Right mouse drag: Zoom
            // - Middle mouse drag: Pan
            try {
              cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 }) // Left mouse - Window/Level
              cornerstoneTools.setToolActive('Zoom', { mouseButtonMask: 2 }) // Right mouse - Zoom
              cornerstoneTools.setToolActive('Pan', { mouseButtonMask: 4 }) // Middle mouse - Pan
              
              // Disable other tools to avoid conflicts
              cornerstoneTools.setToolPassive('Length')
              cornerstoneTools.setToolPassive('Angle')
              cornerstoneTools.setToolPassive('RectangleRoi')
              cornerstoneTools.setToolPassive('EllipseRoi')
            } catch (error) {
              console.warn('Failed to activate some tools:', error)
            }

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
        const viewport = cornerstone.getViewport(element)
        
        if (viewport) {
          viewport.voi.windowWidth = windowWidth
          viewport.voi.windowCenter = windowCenter
          viewport.scale = zoom
          viewport.rotation = rotation
          viewport.hflip = flipHorizontal
          viewport.vflip = flipVertical
          
          cornerstone.setViewport(element, viewport)
          cornerstone.updateImage(element)
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
              
              // Preserve current viewport settings
              viewport.voi.windowWidth = windowWidth
              viewport.voi.windowCenter = windowCenter
              viewport.scale = zoom
              viewport.rotation = rotation
              viewport.hflip = flipHorizontal
              viewport.vflip = flipVertical

              cornerstone.displayImage(element, imageData, viewport)
              
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
