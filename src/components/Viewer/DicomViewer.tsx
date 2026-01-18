import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useViewerStore, loadCornerstone } from '../../store/viewerStore'
import './DicomViewer.css'

interface DicomViewerProps {
  studyId: string
  seriesId: string
  imageIndex: number
}

type MeasureTool = 'None' | 'Length' | 'RectangleRoi' | 'EllipseRoi'

const DicomViewer: React.FC<DicomViewerProps> = ({ studyId, seriesId, imageIndex }) => {
  const canvasRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<HTMLDivElement>(null)

  const [cornerstoneLoaded, setCornerstoneLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const isInitialized = useViewerStore((s) => s.isInitialized)
  const studies = useViewerStore((s) => s.studies)

  const zoom = useViewerStore((s) => s.zoom)
  const rotation = useViewerStore((s) => s.rotation)
  const flipHorizontal = useViewerStore((s) => s.flipHorizontal)
  const flipVertical = useViewerStore((s) => s.flipVertical)
  const windowWidth = useViewerStore((s) => s.windowWidth)
  const windowCenter = useViewerStore((s) => s.windowCenter)

  const nextImage = useViewerStore((s) => s.nextImage)
  const previousImage = useViewerStore((s) => s.previousImage)

  const setZoom = useViewerStore((s) => s.setZoom)
  const setWindowWidth = useViewerStore((s) => s.setWindowWidth)
  const setWindowCenter = useViewerStore((s) => s.setWindowCenter)

  // cornerstone refs
  const csRef = useRef<any>(null)
  const cstRef = useRef<any>(null)

  // Avoid stale state in mouse handlers
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

  // Track one-time tool setup per element
  const toolsSetupDoneRef = useRef(false)

  const study = useMemo(() => studies.find((s) => s.id === studyId), [studies, studyId])
  const series = useMemo(() => study?.series.find((s) => s.id === seriesId), [study, seriesId])
  const image = series?.images?.[imageIndex]
  const totalImages = series?.images?.length || 0

  const [activeTool, setActiveTool] = useState<MeasureTool>('None')

  const calculateFitToWindow = useCallback((element: HTMLElement, imageData: any): number => {
    const elementWidth = element.clientWidth || element.offsetWidth
    const elementHeight = element.clientHeight || element.offsetHeight
    if (!elementWidth || !elementHeight) return 1
    if (!imageData) return 1

    const imageWidth = imageData.width || imageData.columns || 512
    const imageHeight = imageData.height || imageData.rows || 512
    if (!imageWidth || !imageHeight) return 1

    const scaleX = elementWidth / imageWidth
    const scaleY = elementHeight / imageHeight
    return Math.min(scaleX, scaleY) * 0.95
  }, [])

  /**
   * Classic cornerstone-tools: addTool(...) + mouseInput.enable(element) etc.
   * We ONLY rely on tools for measurement + stack state.
   * Pan/Zoom/Wwwc are handled by our custom mouse logic, so we leave them passive.
   */
  const setupToolsOnceForElement = useCallback((element: HTMLDivElement) => {
    const tools = cstRef.current
    if (!tools || toolsSetupDoneRef.current) return

    try {
      // Add common tools if present
      if (typeof tools.addTool === 'function') {
        // Measurement
        if (tools.LengthTool) tools.addTool(tools.LengthTool)
        if (tools.RectangleRoiTool) tools.addTool(tools.RectangleRoiTool)
        if (tools.EllipseRoiTool) tools.addTool(tools.EllipseRoiTool)

        // Stack wheel (we keep passive; we do our own wheel nav)
        if (tools.StackScrollMouseWheelTool) tools.addTool(tools.StackScrollMouseWheelTool)

        // These may exist; add but keep passive (or don’t add—either is fine)
        if (tools.WwwcTool) tools.addTool(tools.WwwcTool)
        if (tools.PanTool) tools.addTool(tools.PanTool)
        if (tools.ZoomTool) tools.addTool(tools.ZoomTool)
      }

      // Enable inputs on this element (classic)
      tools.mouseInput?.enable?.(element)
      tools.mouseWheelInput?.enable?.(element)
      tools.touchInput?.enable?.(element)

      // Stack manager (classic)
      tools.addStackStateManager?.(element, ['stack'])

      // Ensure everything starts passive
      const passive = (name: string) => {
        try {
          tools.setToolPassive?.(name)
        } catch {}
      }
      passive('StackScrollMouseWheel')
      passive('Wwwc')
      passive('Pan')
      passive('Zoom')
      passive('Length')
      passive('RectangleRoi')
      passive('EllipseRoi')

      toolsSetupDoneRef.current = true
    } catch (e) {
      console.warn('Tool setup failed:', e)
    }
  }, [])

  const setMeasureToolsPassive = useCallback(() => {
    const tools = cstRef.current
    if (!tools?.setToolPassive) return
    ;['Length', 'RectangleRoi', 'EllipseRoi'].forEach((t) => {
      try {
        tools.setToolPassive(t)
      } catch {}
    })
  }, [])

  const activateMeasureTool = useCallback(
    (tool: MeasureTool) => {
      const tools = cstRef.current
      const element = elementRef.current
      if (!tools || !element) return

      // Make sure tools exist on this element (prevents "Unable to find tool ...")
      setupToolsOnceForElement(element)

      setMeasureToolsPassive()

      if (tool === 'None') {
        setActiveTool('None')
        return
      }

      try {
        tools.setToolActive?.(tool, { mouseButtonMask: 1 }) // Left click
        setActiveTool(tool)
      } catch (e) {
        console.warn(`Unable to activate tool "${tool}"`, e)
      }
    },
    [setMeasureToolsPassive, setupToolsOnceForElement]
  )

  const applyViewportFromState = useCallback(() => {
    const cs = csRef.current
    const element = elementRef.current
    if (!cs || !element) return

    try {
      const enabled = cs.getEnabledElement(element)
      const img = enabled?.image
      if (!img) return

      const viewport = cs.getViewport(element)
      if (!viewport) return

      const fitScale = calculateFitToWindow(element, img)
      viewport.voi = viewport.voi || {}
      viewport.voi.windowWidth = wwRef.current
      viewport.voi.windowCenter = wcRef.current

      viewport.scale = fitScale * zoomRef.current
      viewport.rotation = rotation
      viewport.hflip = flipHorizontal
      viewport.vflip = flipVertical

      if (zoomRef.current === 1) viewport.translation = { x: 0, y: 0 }

      cs.setViewport(element, viewport)
      cs.updateImage(element)
    } catch {
      // element not ready
    }
  }, [calculateFitToWindow, rotation, flipHorizontal, flipVertical])

  /**
   * Stack state:
   * - addToolState(element, 'stack', stack) is the most compatible for classic builds.
   * - setStack(...) signature differs across builds; we try both.
   */
  const setupStackState = useCallback((element: HTMLDivElement, imageIds: string[], index: number) => {
    const tools = cstRef.current
    if (!tools) return

    const stack = { imageIds, currentImageIdIndex: index }

    try {
      tools.addStackStateManager?.(element, ['stack'])
    } catch {}

    // Guarantee tool state exists (prevents some internal handlers reading undefined)
    try {
      tools.clearToolState?.(element, 'stack')
    } catch {}
    try {
      tools.addToolState?.(element, 'stack', stack)
    } catch {}

    // Also try setStack variations (best-effort)
    try {
      if (tools.setStack) {
        try {
          tools.setStack(element, stack) // some builds
        } catch {
          tools.setStack(element, index, stack) // other builds
        }
      }
    } catch {}
  }, [])

  // Load cornerstone once
  useEffect(() => {
    let cancelled = false
    loadCornerstone().then(({ cornerstone, cornerstoneTools }) => {
      if (cancelled) return
      csRef.current = cornerstone
      cstRef.current = cornerstoneTools
      setCornerstoneLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Keyboard navigation + measurement shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return

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

        case 'Escape':
          e.preventDefault()
          activateMeasureTool('None')
          break
        case 'l':
        case 'L':
          e.preventDefault()
          activateMeasureTool(activeTool === 'Length' ? 'None' : 'Length')
          break
        case 'r':
        case 'R':
          e.preventDefault()
          activateMeasureTool(activeTool === 'RectangleRoi' ? 'None' : 'RectangleRoi')
          break
        case 'e':
        case 'E':
          e.preventDefault()
          activateMeasureTool(activeTool === 'EllipseRoi' ? 'None' : 'EllipseRoi')
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [nextImage, previousImage, activateMeasureTool, activeTool])

  // Custom mouse controls (right drag zoom, middle drag WW/WC, wheel slice)
  useEffect(() => {
    if (!elementRef.current || !cornerstoneLoaded || !isInitialized) return
    const element = elementRef.current

    let rightDown = false
    let middleDown = false
    let lastX = 0
    let lastY = 0

    const MIN_ZOOM = 0.1
    const MAX_ZOOM = 10
    const ZOOM_SENS = 0.01

    const MIN_WW = 1
    const MAX_WW = 5000
    const WW_SENS = 2.0
    const WC_SENS = 1.0

    let rafId: number | null = null
    let pendingZoom: number | null = null
    let pendingWW: number | null = null
    let pendingWC: number | null = null

    const flushStore = () => {
      rafId = null
      if (pendingZoom != null) setZoom(pendingZoom)
      if (pendingWW != null) setWindowWidth(pendingWW)
      if (pendingWC != null) setWindowCenter(pendingWC)
      pendingZoom = null
      pendingWW = null
      pendingWC = null
    }

    const scheduleStore = () => {
      if (rafId != null) return
      rafId = requestAnimationFrame(flushStore)
    }

    const applyZoom = (newZoom: number) => {
      zoomRef.current = newZoom
      pendingZoom = newZoom
      scheduleStore()
      applyViewportFromState()
    }

    const applyWwWc = (dx: number, dy: number) => {
      const nextWC = wcRef.current + dy * WC_SENS
      const unclampedWW = wwRef.current + dx * WW_SENS
      const nextWW = Math.max(MIN_WW, Math.min(MAX_WW, unclampedWW))

      wcRef.current = nextWC
      wwRef.current = nextWW

      pendingWC = nextWC
      pendingWW = nextWW
      scheduleStore()

      applyViewportFromState()
    }

    const handlePointerDown = (e: PointerEvent) => {
      // If measurement tool active, do not steal left click.
      if (e.button === 2) {
        rightDown = true
        lastX = e.clientX
        lastY = e.clientY
        e.preventDefault()
        e.stopPropagation()
        element.setPointerCapture?.(e.pointerId)
        return
      }

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
        const factor = Math.exp(-dy * ZOOM_SENS)
        const current = zoomRef.current
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * factor))
        applyZoom(next)
        return
      }

      if (middleDown) {
        applyWwWc(dx, dy)
      }
    }

    const handlePointerUp = (e: PointerEvent) => {
      if (rightDown || middleDown) {
        rightDown = false
        middleDown = false
        try {
          element.releasePointerCapture?.(e.pointerId)
        } catch {}
      }
    }

    const handleWheel = (e: WheelEvent) => {
      if (!element.contains(e.target as Node)) return

      // Right button + wheel zoom (optional)
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
    element.addEventListener('pointercancel', handlePointerUp)
    element.addEventListener('wheel', handleWheel, { passive: false })
    element.addEventListener('contextmenu', handleContextMenu)

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown)
      element.removeEventListener('pointermove', handlePointerMove)
      element.removeEventListener('pointerup', handlePointerUp)
      element.removeEventListener('pointercancel', handlePointerUp)
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
    setZoom,
    setWindowWidth,
    setWindowCenter,
    applyViewportFromState,
  ])

  // Initial image load + display (and on series change)
  useEffect(() => {
    if (!isInitialized || !cornerstoneLoaded || !elementRef.current || !image || !series) return

    const cornerstone = csRef.current
    const element = elementRef.current
    if (!cornerstone || !element) return

    let cancelled = false
    setIsLoading(true)

    // Enable element (only once per mount)
    try {
      cornerstone.enable(element)
    } catch {}

    // Ensure tools exist for this element (prevents "Unable to find tool...")
    setupToolsOnceForElement(element)

    // Setup stack state early
    const imageIds = series.images.map((img) => img.imageId)
    if (imageIds.length > 1) {
      setupStackState(element, imageIds, imageIndex)
    }

    cornerstone
      .loadImage(image.imageId)
      .then((imageData: any) => {
        if (cancelled) return

        const setupImage = () => {
          if (cancelled) return
          try {
            const viewport = cornerstone.getDefaultViewportForImage(element, imageData)
            const fitScale = calculateFitToWindow(element, imageData)

            viewport.voi = viewport.voi || {}
            viewport.voi.windowWidth = wwRef.current
            viewport.voi.windowCenter = wcRef.current

            viewport.scale = fitScale * zoomRef.current
            viewport.rotation = rotation
            viewport.hflip = flipHorizontal
            viewport.vflip = flipVertical

            if (zoomRef.current === 1) viewport.translation = { x: 0, y: 0 }

            cornerstone.displayImage(element, imageData, viewport)
            cornerstone.resize(element)

            // Keep non-measurement tools passive (we do custom mouse)
            try {
              const tools = cstRef.current
              tools?.setToolPassive?.('Wwwc')
              tools?.setToolPassive?.('Zoom')
              tools?.setToolPassive?.('Pan')
              tools?.setToolPassive?.('StackScrollMouseWheel')
            } catch {}

            // Restore measurement tool if user selected one
            if (activeTool !== 'None') {
              activateMeasureTool(activeTool)
            } else {
              setMeasureToolsPassive()
            }
          } catch (e) {
            console.warn('displayImage failed:', e)
          }
        }

        // If layout not measured yet, wait a tick
        if (element.clientWidth > 0 && element.clientHeight > 0) setupImage()
        else setTimeout(setupImage, 50)

        setIsLoading(false)
      })
      .catch((err: any) => {
        if (cancelled) return
        console.error('Failed to load DICOM image:', err)
        setIsLoading(false)
      })

    return () => {
      cancelled = true
      try {
        cornerstone.disable(element)
      } catch {}
      toolsSetupDoneRef.current = false
    }
  }, [
    isInitialized,
    cornerstoneLoaded,
    seriesId,
    studyId,
    image?.imageId,
    imageIndex,
    rotation,
    flipHorizontal,
    flipVertical,
    calculateFitToWindow,
    setupToolsOnceForElement,
    setupStackState,
    activeTool,
    activateMeasureTool,
    setMeasureToolsPassive,
  ])

  // Update viewport when ww/wc/zoom/rotate/flip changes
  useEffect(() => {
    if (!cornerstoneLoaded || !isInitialized) return
    applyViewportFromState()
  }, [cornerstoneLoaded, isInitialized, windowWidth, windowCenter, zoom, rotation, flipHorizontal, flipVertical, applyViewportFromState])

  // Update image when imageIndex changes (stack)
  useEffect(() => {
    if (!cornerstoneLoaded || !isInitialized || !elementRef.current || !image || !series) return
    const cornerstone = csRef.current
    const element = elementRef.current
    if (!cornerstone || !element) return
    if (series.images.length <= 1) return

    const ids = series.images.map((img) => img.imageId)
    setupStackState(element, ids, imageIndex)

    cornerstone.loadImage(image.imageId).then((imageData: any) => {
      try {
        const viewport =
          cornerstone.getViewport(element) || cornerstone.getDefaultViewportForImage(element, imageData)

        const fitScale = calculateFitToWindow(element, imageData)
        viewport.voi = viewport.voi || {}
        viewport.voi.windowWidth = wwRef.current
        viewport.voi.windowCenter = wcRef.current
        viewport.scale = fitScale * zoomRef.current
        viewport.rotation = rotation
        viewport.hflip = flipHorizontal
        viewport.vflip = flipVertical
        if (zoomRef.current === 1) viewport.translation = { x: 0, y: 0 }

        cornerstone.displayImage(element, imageData, viewport)
        cornerstone.resize(element)

        // Restore measure tool if active
        if (activeTool !== 'None') activateMeasureTool(activeTool)
      } catch (e) {
        console.warn('Failed to update stack image:', e)
      }
    })
  }, [
    cornerstoneLoaded,
    isInitialized,
    imageIndex,
    image?.imageId,
    seriesId,
    calculateFitToWindow,
    setupStackState,
    rotation,
    flipHorizontal,
    flipVertical,
    activeTool,
    activateMeasureTool,
  ])

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (!cornerstoneLoaded || !isInitialized) return
      applyViewportFromState()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [cornerstoneLoaded, isInitialized, applyViewportFromState])

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

      <div className="tool-bar">
        <button
          className={activeTool === 'Length' ? 'active' : ''}
          onClick={() => activateMeasureTool(activeTool === 'Length' ? 'None' : 'Length')}
          title="Cetvel (L)"
        >
          Cetvel
        </button>

        <button
          className={activeTool === 'RectangleRoi' ? 'active' : ''}
          onClick={() => activateMeasureTool(activeTool === 'RectangleRoi' ? 'None' : 'RectangleRoi')}
          title="Rectangle ROI (R)"
        >
          Rectangle
        </button>

        <button
          className={activeTool === 'EllipseRoi' ? 'active' : ''}
          onClick={() => activateMeasureTool(activeTool === 'EllipseRoi' ? 'None' : 'EllipseRoi')}
          title="Ellipse ROI (E)"
        >
          Ellipse
        </button>

        <button
          className={activeTool === 'None' ? 'active' : ''}
          onClick={() => activateMeasureTool('None')}
          title="Kapat (Esc)"
        >
          Kapat
        </button>
      </div>

      {totalImages > 1 && (
        <div className="series-info">
          <span>
            Slice: {imageIndex + 1} / {totalImages}
          </span>
        </div>
      )}

      <div className="cornerstone-element" ref={elementRef} />
    </div>
  )
}

export default DicomViewer
