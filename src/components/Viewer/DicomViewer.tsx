import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCornerstone, useViewerStore } from '../../store/viewerStore'
import './DicomViewer.css'

interface DicomViewerProps {
  studyId: string
  seriesId: string
  imageIndex: number
}

type MeasureTool = 'None' | 'Length' | 'RectangleRoi'
const MEASURE_TOOLS: Exclude<MeasureTool, 'None'>[] = ['Length', 'RectangleRoi']

const DicomViewer: React.FC<DicomViewerProps> = ({ studyId, seriesId, imageIndex }) => {
  const elementRef = useRef<HTMLDivElement>(null)

  // Cornerstone refs
  const csRef = useRef<any>(null)
  const toolsRef = useRef<any>(null)

  const [cornerstoneReady, setCornerstoneReady] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTool, setActiveTool] = useState<MeasureTool>('None')

  // Store
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
  const setActiveImageIndex = useViewerStore((s) => s.setActiveImageIndex)

  const setZoom = useViewerStore((s) => s.setZoom)
  const setWindowWidth = useViewerStore((s) => s.setWindowWidth)
  const setWindowCenter = useViewerStore((s) => s.setWindowCenter)

  // Avoid stale closures in pointer handlers
  const zoomRef = useRef(zoom)
  const wwRef = useRef(windowWidth)
  const wcRef = useRef(windowCenter)
  useEffect(() => void (zoomRef.current = zoom), [zoom])
  useEffect(() => void (wwRef.current = windowWidth), [windowWidth])
  useEffect(() => void (wcRef.current = windowCenter), [windowCenter])

  const study = useMemo(() => studies.find((s) => s.id === studyId), [studies, studyId])
  const series = useMemo(() => study?.series.find((s) => s.id === seriesId), [study, seriesId])
  const image = series?.images[imageIndex]
  const totalImages = series?.images.length || 0

  const safe = useCallback((fn: () => void) => {
    try {
      fn()
    } catch {
      // no-op
    }
  }, [])

  const calculateFitToWindow = useCallback((element: HTMLElement, imageData: any): number => {
    const w = element.clientWidth || element.offsetWidth
    const h = element.clientHeight || element.offsetHeight
    if (!w || !h || !imageData) return 1

    const iw = imageData.width || imageData.columns || 512
    const ih = imageData.height || imageData.rows || 512
    if (!iw || !ih) return 1

    return Math.min(w / iw, h / ih) * 0.95
  }, [])

  /**
   * IMPORTANT:
   * In many cornerstone-tools builds, tools must be added per enabledElement:
   * - addToolForElement(element, ToolClass)
   * - setToolActiveForElement(element, toolName, options)
   */
  const ensureToolsForElement = useCallback(() => {
    const element = elementRef.current
    const tools = toolsRef.current
    if (!element || !tools) return

    // If API exists, add tool instances for THIS element
    const addForEl = tools.addToolForElement
    if (typeof addForEl === 'function') {
      // Try to add commonly used tools (if present in bundle)
      if (tools.LengthTool) safe(() => addForEl(element, tools.LengthTool))
      if (tools.RectangleRoiTool) safe(() => addForEl(element, tools.RectangleRoiTool))
      if (tools.WwwcTool) safe(() => addForEl(element, tools.WwwcTool))
      if (tools.PanTool) safe(() => addForEl(element, tools.PanTool))
      if (tools.ZoomTool) safe(() => addForEl(element, tools.ZoomTool))
      if (tools.StackScrollMouseWheelTool) safe(() => addForEl(element, tools.StackScrollMouseWheelTool))
    }
  }, [safe])

  const setAllMeasureToolsPassive = useCallback(() => {
    const element = elementRef.current
    const tools = toolsRef.current
    if (!element || !tools) return

    const perEl = tools.setToolPassiveForElement
    const global = tools.setToolPassive

    MEASURE_TOOLS.forEach((name) => {
      if (typeof perEl === 'function') safe(() => perEl(element, name))
      else if (typeof global === 'function') safe(() => global(name))
    })
  }, [safe])

  const activateMeasureTool = useCallback(
    (tool: MeasureTool) => {
      const element = elementRef.current
      const tools = toolsRef.current
      if (!element || !tools) return

      setAllMeasureToolsPassive()

      if (tool === 'None') {
        setActiveTool('None')
        return
      }

      const perEl = tools.setToolActiveForElement
      const global = tools.setToolActive

      if (typeof perEl === 'function') {
        safe(() => perEl(element, tool, { mouseButtonMask: 1 }))
      } else if (typeof global === 'function') {
        safe(() => global(tool, { mouseButtonMask: 1 }))
      }
      setActiveTool(tool)
    },
    [safe, setAllMeasureToolsPassive]
  )

  // Stack toolState (prevents some internal listeners from crashing)
  const ensureStackState = useCallback(
    (imageIds: string[], index: number) => {
      const element = elementRef.current
      const tools = toolsRef.current
      if (!element || !tools) return

      const stack = { imageIds, currentImageIdIndex: index }

      safe(() => tools.addStackStateManager?.(element, ['stack']))
      safe(() => tools.clearToolState?.(element, 'stack'))
      safe(() => tools.addToolState?.(element, 'stack', stack))

      if (tools.setStack) {
        safe(() => tools.setStack(element, stack))
        safe(() => tools.setStack(element, index, stack))
      }
    },
    [safe]
  )

  // Delete/Clear annotations
  const clearAllAnnotations = useCallback(() => {
    const element = elementRef.current
    const tools = toolsRef.current
    const cs = csRef.current
    if (!element || !tools) return

    MEASURE_TOOLS.forEach((name) => safe(() => tools.clearToolState?.(element, name)))
    safe(() => cs?.updateImage?.(element))
  }, [safe])

  const deleteSelectedAnnotation = useCallback(() => {
    const element = elementRef.current
    const tools = toolsRef.current
    const cs = csRef.current
    if (!element || !tools) return

    const tryDeleteFrom = (toolName: Exclude<MeasureTool, 'None'>): boolean => {
      const st = tools.getToolState?.(element, toolName)
      const data: any[] | undefined = st?.data
      if (!Array.isArray(data) || data.length === 0) return false

      const idx = data.findIndex(
        (d) => d?.active === true || d?.selected === true || d?.highlight === true
      )

      if (idx >= 0) data.splice(idx, 1)
      else data.pop()

      safe(() => cs?.updateImage?.(element))
      return true
    }

    if (activeTool !== 'None' && activeTool !== 'None') {
      if (activeTool === 'Length' || activeTool === 'RectangleRoi') {
        if (tryDeleteFrom(activeTool)) return
      }
    }
    if (tryDeleteFrom('Length')) return
    tryDeleteFrom('RectangleRoi')
  }, [activeTool, safe])

  // Load modules once
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { cornerstone, cornerstoneTools } = await loadCornerstone()
      if (cancelled) return
      csRef.current = cornerstone
      toolsRef.current = cornerstoneTools
      setCornerstoneReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Enable element once ready
  useEffect(() => {
    if (!cornerstoneReady || !isInitialized) return
    const element = elementRef.current
    const cs = csRef.current
    if (!element || !cs) return

    safe(() => cs.enable(element))
    // Important: after enable, attach tools to this element if API exists
    ensureToolsForElement()

    return () => {
      const tools = toolsRef.current
      safe(() => {
        MEASURE_TOOLS.forEach((t) => tools?.clearToolState?.(element, t))
      })
      safe(() => tools?.clearToolState?.(element, 'stack'))
      safe(() => cs.disable(element))
    }
  }, [cornerstoneReady, isInitialized, safe, ensureToolsForElement])

  // Load + display image
  useEffect(() => {
    if (!cornerstoneReady || !isInitialized || !image || !series) return
    const element = elementRef.current
    const cs = csRef.current
    if (!element || !cs) return

    let cancelled = false
    setIsLoading(true)

    const imageIds = series.images.map((i) => i.imageId)
    ensureStackState(imageIds, imageIndex)

    cs
      .loadImage(image.imageId)
      .then((img: any) => {
        if (cancelled) return

        const apply = () => {
          if (cancelled) return

          const viewport = cs.getDefaultViewportForImage(element, img)
          const fit = calculateFitToWindow(element, img)

          viewport.voi.windowWidth = wwRef.current
          viewport.voi.windowCenter = wcRef.current
          viewport.scale = fit * zoomRef.current
          viewport.rotation = rotation
          viewport.hflip = flipHorizontal
          viewport.vflip = flipVertical

          cs.displayImage(element, img, viewport)
          cs.resize(element, true)
          setIsLoading(false)

          // keep measure tools passive until selected
          setAllMeasureToolsPassive()
          if (activeTool !== 'None') activateMeasureTool(activeTool)
        }

        if (element.clientWidth > 0 && element.clientHeight > 0) apply()
        else setTimeout(apply, 50)
      })
      .catch((e: any) => {
        if (cancelled) return
        console.error('Failed to load image:', e)
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    cornerstoneReady,
    isInitialized,
    image,
    series,
    imageIndex,
    rotation,
    flipHorizontal,
    flipVertical,
    calculateFitToWindow,
    ensureStackState,
    setAllMeasureToolsPassive,
    activeTool,
    activateMeasureTool,
  ])

  // Update viewport on settings changes
  useEffect(() => {
    if (!cornerstoneReady || !isInitialized) return
    const element = elementRef.current
    const cs = csRef.current
    if (!element || !cs) return

    safe(() => {
      const enabled = cs.getEnabledElement(element)
      if (!enabled?.image) return
      const viewport = cs.getViewport(element)
      if (!viewport) return

      const fit = calculateFitToWindow(element, enabled.image)
      viewport.voi = viewport.voi || {}
      viewport.voi.windowWidth = windowWidth
      viewport.voi.windowCenter = windowCenter
      viewport.scale = fit * zoom
      viewport.rotation = rotation
      viewport.hflip = flipHorizontal
      viewport.vflip = flipVertical

      cs.setViewport(element, viewport)
      cs.updateImage(element)
    })
  }, [
    cornerstoneReady,
    isInitialized,
    windowWidth,
    windowCenter,
    zoom,
    rotation,
    flipHorizontal,
    flipVertical,
    calculateFitToWindow,
    safe,
  ])

  // Mouse: right-drag zoom, middle-drag WW/WC, wheel slice
  useEffect(() => {
    if (!cornerstoneReady || !isInitialized) return
    const element = elementRef.current
    const cs = csRef.current
    if (!element || !cs) return

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

    const flush = () => {
      rafId = null
      if (pendingZoom != null) setZoom(pendingZoom)
      if (pendingWW != null) setWindowWidth(pendingWW)
      if (pendingWC != null) setWindowCenter(pendingWC)
      pendingZoom = null
      pendingWW = null
      pendingWC = null
    }
    const schedule = () => {
      if (rafId != null) return
      rafId = requestAnimationFrame(flush)
    }

    const applyViewport = (fn: (viewport: any, enabledImage: any) => void) => {
      safe(() => {
        const enabled = cs.getEnabledElement(element)
        if (!enabled?.image) return
        const viewport = cs.getViewport(element)
        if (!viewport) return
        fn(viewport, enabled.image)
        cs.setViewport(element, viewport)
        cs.updateImage(element)
      })
    }

    const applyZoom = (newZoom: number) => {
      zoomRef.current = newZoom
      pendingZoom = newZoom
      schedule()

      applyViewport((viewport, img) => {
        const fit = calculateFitToWindow(element, img)
        viewport.scale = fit * newZoom
      })
    }

    const applyWwWc = (dx: number, dy: number) => {
      const nextWC = wcRef.current + dy * WC_SENS
      const unclampedWW = wwRef.current + dx * WW_SENS
      const nextWW = Math.max(MIN_WW, Math.min(MAX_WW, unclampedWW))

      wcRef.current = nextWC
      wwRef.current = nextWW

      pendingWC = nextWC
      pendingWW = nextWW
      schedule()

      applyViewport((viewport) => {
        viewport.voi = viewport.voi || {}
        viewport.voi.windowCenter = nextWC
        viewport.voi.windowWidth = nextWW
      })
    }

    const onPointerDown = (e: PointerEvent) => {
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
      }
      // left click: keep default for measurement tools
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!rightDown && !middleDown) return
      e.preventDefault()
      e.stopPropagation()

      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      if (rightDown) {
        const factor = Math.exp(-dy * ZOOM_SENS)
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * factor))
        applyZoom(next)
        return
      }
      if (middleDown) applyWwWc(dx, dy)
    }

    const onPointerUp = (e: PointerEvent) => {
      if (rightDown || middleDown) {
        rightDown = false
        middleDown = false
        try {
          element.releasePointerCapture?.(e.pointerId)
        } catch {}
      }
    }

    const onWheel = (e: WheelEvent) => {
      if (!element.contains(e.target as Node)) return
      if (totalImages > 1) {
        e.preventDefault()
        if (e.deltaY > 0) nextImage()
        else previousImage()
      }
    }

    const onContextMenu = (e: MouseEvent) => {
      if (element.contains(e.target as Node)) e.preventDefault()
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerUp)
    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('contextmenu', onContextMenu)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerUp)
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('contextmenu', onContextMenu)
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [
    cornerstoneReady,
    isInitialized,
    totalImages,
    nextImage,
    previousImage,
    calculateFitToWindow,
    safe,
    setZoom,
    setWindowWidth,
    setWindowCenter,
  ])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return

      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault()
          previousImage()
          return
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault()
          nextImage()
          return
        case 'PageUp':
          e.preventDefault()
          setActiveImageIndex(Math.max(0, imageIndex - 10))
          return
        case 'PageDown':
          e.preventDefault()
          setActiveImageIndex(Math.min(Math.max(0, totalImages - 1), imageIndex + 10))
          return
        case 'Home':
          e.preventDefault()
          setActiveImageIndex(0)
          return
        case 'End':
          e.preventDefault()
          setActiveImageIndex(Math.max(0, totalImages - 1))
          return

        case 'Escape':
          e.preventDefault()
          activateMeasureTool('None')
          return
        case 'l':
        case 'L':
          e.preventDefault()
          activateMeasureTool(activeTool === 'Length' ? 'None' : 'Length')
          return
        case 'r':
        case 'R':
          e.preventDefault()
          activateMeasureTool(activeTool === 'RectangleRoi' ? 'None' : 'RectangleRoi')
          return

        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          deleteSelectedAnnotation()
          return
        case 'c':
        case 'C':
          e.preventDefault()
          clearAllAnnotations()
          return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    imageIndex,
    totalImages,
    nextImage,
    previousImage,
    setActiveImageIndex,
    activeTool,
    activateMeasureTool,
    deleteSelectedAnnotation,
    clearAllAnnotations,
  ])

  if (!image) {
    return (
      <div className="dicom-viewer empty">
        <p>No image available</p>
      </div>
    )
  }

  return (
    <div className="dicom-viewer">
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
          onClick={() =>
            activateMeasureTool(activeTool === 'RectangleRoi' ? 'None' : 'RectangleRoi')
          }
          title="Rectangle ROI (R)"
        >
          Rectangle
        </button>

        <button
          className={activeTool === 'None' ? 'active' : ''}
          onClick={() => activateMeasureTool('None')}
          title="Kapat (Esc)"
        >
          Kapat
        </button>

        <button onClick={deleteSelectedAnnotation} title="Seçili / Son çizileni sil (Del)">
          Sil
        </button>

        <button onClick={clearAllAnnotations} title="Tüm ölçümleri temizle (C)">
          Temizle
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
