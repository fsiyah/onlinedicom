import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useViewerStore } from '../../store/viewerStore'
import { initCornerstone3D, getCornerstone3D } from '../../utils/cornerstone3DConfig'
import { createVolumeFromImages, getVolumeDataRange } from '../../utils/volumeUtils'
import { isMPRCompatible } from '../../utils/mprUtils'
import {
  VOLUME_3D_RENDERING_ENGINE_ID,
  destroy3DRenderingSession,
  getOrCreateRenderingEngine,
  prepareVolumeRenderingSession,
} from '../../utils/renderingEngineLifecycle'
import './Viewer3D.css'

type RenderingPreset = 'CT-Bone' | 'CT-Soft-Tissue' | 'CT-Muscle' | 'CT-Lung' | 'MR-Default'
type BlendMode = 'composite' | 'mip'
type TissueKey = 'lung' | 'soft' | 'contrast' | 'bone'

const THICKNESS_MIN = 10
const THICKNESS_MAX = 260
const OPACITY_MIN = 5
const OPACITY_MAX = 100
const THICKNESS_DRAG_SENS = 0.6
const OPACITY_DRAG_SENS = 0.35

const RENDERING_ENGINE_ID = VOLUME_3D_RENDERING_ENGINE_ID

const PRESETS: Array<{ label: string; value: RenderingPreset }> = [
  { label: 'Bone', value: 'CT-Bone' },
  { label: 'Soft', value: 'CT-Soft-Tissue' },
  { label: 'Muscle', value: 'CT-Muscle' },
  { label: 'Lung', value: 'CT-Lung' },
  { label: 'MR', value: 'MR-Default' },
]

const TISSUES: Array<{
  key: TissueKey
  label: string
  range: [number, number]
  color: [number, number, number]
  opacity: number
}> = [
  { key: 'lung', label: 'Lung', range: [-950, -420], color: [0.35, 0.58, 1], opacity: 0.14 },
  { key: 'soft', label: 'Soft', range: [-120, 180], color: [0.95, 0.52, 0.36], opacity: 0.28 },
  { key: 'contrast', label: 'Contrast', range: [150, 520], color: [1, 0.22, 0.18], opacity: 0.5 },
  { key: 'bone', label: 'Bone', range: [260, 2200], color: [0.96, 0.9, 0.76], opacity: 0.78 },
]

const Viewer3D: React.FC = () => {
  const elementRef = useRef<HTMLDivElement>(null)
  const renderingEngineRef = useRef<any>(null)
  const viewportRef = useRef<any>(null)

  const activeStudyId = useViewerStore((state) => state.activeStudyId)
  const activeSeriesId = useViewerStore((state) => state.activeSeriesId)
  const studies = useViewerStore((state) => state.studies)
  const windowWidth = useViewerStore((state) => state.windowWidth)
  const windowCenter = useViewerStore((state) => state.windowCenter)
  const setWindowWidth = useViewerStore((state) => state.setWindowWidth)
  const setWindowCenter = useViewerStore((state) => state.setWindowCenter)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<RenderingPreset>('CT-Bone')
  const [blendMode, setBlendMode] = useState<BlendMode>('composite')
  const [tissueVisibility, setTissueVisibility] = useState<Record<TissueKey, boolean>>({
    lung: false,
    soft: true,
    contrast: true,
    bone: true,
  })
  const [tissueThickness, setTissueThickness] = useState(90)
  const [opacityScale, setOpacityScale] = useState(70)
  const [useTissueControls, setUseTissueControls] = useState(true)

  const tissueThicknessRef = useRef(tissueThickness)
  const opacityScaleRef = useRef(opacityScale)
  const useTissueControlsRef = useRef(useTissueControls)
  const blendModeRef = useRef(blendMode)
  const windowWidthRef = useRef(windowWidth)
  const windowCenterRef = useRef(windowCenter)

  tissueThicknessRef.current = tissueThickness
  opacityScaleRef.current = opacityScale
  useTissueControlsRef.current = useTissueControls
  blendModeRef.current = blendMode
  windowWidthRef.current = windowWidth
  windowCenterRef.current = windowCenter

  const study = useMemo(() => studies.find((s) => s.id === activeStudyId), [studies, activeStudyId])
  const series = useMemo(() => study?.series.find((s) => s.id === activeSeriesId), [study, activeSeriesId])
  const images = series?.images || []
  const isCompatible = images.length > 1 && isMPRCompatible(images)

  const viewportId = useMemo(() => `viewport-3d-${activeSeriesId || 'empty'}`, [activeSeriesId])
  const volumeId = useMemo(() => `volume-${activeSeriesId || 'empty'}`, [activeSeriesId])
  const streamingVolumeId = useMemo(() => `cornerstoneStreamingImageVolume:${volumeId}`, [volumeId])

  const applyTissueTransferFunction = useCallback(async (actor: any) => {
    const { default: vtkColorTransferFunction } = await import('@kitware/vtk.js/Rendering/Core/ColorTransferFunction')
    const { default: vtkPiecewiseFunction } = await import('@kitware/vtk.js/Common/DataModel/PiecewiseFunction')

    const colorFunction = vtkColorTransferFunction.newInstance()
    const opacityFunction = vtkPiecewiseFunction.newInstance()
    const enabledTissues = TISSUES.filter((tissue) => tissueVisibility[tissue.key])
    const dataRange = getVolumeDataRange()
    const minValue = dataRange?.min ?? -1024
    const maxValue = dataRange?.max ?? 3071
    const ramp = Math.max(5, tissueThickness)
    const opacityMultiplier = opacityScale / 100

    colorFunction.addRGBPoint(minValue, 0, 0, 0)
    opacityFunction.addPoint(minValue, 0)

    enabledTissues.forEach((tissue) => {
      const [start, end] = tissue.range
      const [r, g, b] = tissue.color
      const opacity = Math.min(1, tissue.opacity * opacityMultiplier)

      colorFunction.addRGBPoint(start - ramp, 0, 0, 0)
      colorFunction.addRGBPoint(start, r, g, b)
      colorFunction.addRGBPoint(end, r, g, b)
      colorFunction.addRGBPoint(end + ramp, 1, 1, 1)

      opacityFunction.addPoint(start - ramp, 0)
      opacityFunction.addPoint(start, opacity * 0.25)
      opacityFunction.addPoint((start + end) / 2, opacity)
      opacityFunction.addPoint(end, opacity)
      opacityFunction.addPoint(end + ramp, 0)
    })

    colorFunction.addRGBPoint(maxValue, 1, 1, 1)
    opacityFunction.addPoint(maxValue, 0)

    const property = actor.getProperty()
    property.setRGBTransferFunction(0, colorFunction)
    property.setScalarOpacity(0, opacityFunction)
    property.setUseGradientOpacity(0, true)
    property.setGradientOpacityMinimumValue(0, Math.max(1, tissueThickness * 0.5))
    property.setGradientOpacityMinimumOpacity(0, 0)
    property.setGradientOpacityMaximumValue(0, Math.max(2, tissueThickness * 3))
    property.setGradientOpacityMaximumOpacity(0, 1)
    property.setShade(true)
    property.setAmbient(0.18)
    property.setDiffuse(0.82)
    property.setSpecular(0.18)
    property.setSpecularPower(12)
  }, [opacityScale, tissueThickness, tissueVisibility])

  const applyRenderingStyle = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const actor = viewport.getDefaultActor?.()?.actor
    if (!actor) return

    const applyStyle = async () => {
      const core = getCornerstone3D()
      const coreEnums = core?.Enums
      const mapper = actor.getMapper?.()

      mapper?.setBlendMode?.(
        blendMode === 'mip' ? coreEnums.BlendModes.MAXIMUM_INTENSITY_BLEND : coreEnums.BlendModes.COMPOSITE
      )

      if (blendMode === 'composite' && useTissueControls) {
        await applyTissueTransferFunction(actor)
      } else {
        const presetName = blendMode === 'mip' ? 'CT-MIP' : preset
        const presetDefinition = core?.CONSTANTS?.VIEWPORT_PRESETS?.find((item: any) => item.name === presetName)
        const applyPreset = (core as any)?.utilities?.applyPreset

        if (presetDefinition && applyPreset) {
          applyPreset(actor, presetDefinition)
        }
      }

      const dataRange = getVolumeDataRange()
      const lower = dataRange ? Math.max(dataRange.min, windowCenter - windowWidth / 2) : windowCenter - windowWidth / 2
      const upper = dataRange ? Math.min(dataRange.max, windowCenter + windowWidth / 2) : windowCenter + windowWidth / 2

      if (Number.isFinite(lower) && Number.isFinite(upper) && lower < upper) {
        viewport.setProperties?.({
          voiRange: { lower, upper },
        })
      }

      viewport.render()
    }

    try {
      void applyStyle()
    } catch (styleError) {
      console.warn('Failed to apply 3D rendering style:', styleError)
    }
  }, [
    applyTissueTransferFunction,
    blendMode,
    preset,
    useTissueControls,
    windowCenter,
    windowWidth,
  ])

  useEffect(() => {
    if (!isCompatible || !elementRef.current || !activeSeriesId) return

    let cancelled = false
    const setupVolumeRendering = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const element = elementRef.current
        if (!element) return

        const waitForDimensions = () =>
          new Promise<void>((resolve) => {
            const check = () => {
              if (element.clientWidth > 0 && element.clientHeight > 0) {
                resolve()
              } else {
                requestAnimationFrame(check)
              }
            }
            check()
          })

        await Promise.race([waitForDimensions(), new Promise((resolve) => setTimeout(resolve, 1000))])
        if (cancelled) return

        await initCornerstone3D()
        await prepareVolumeRenderingSession({ mode: '3D', volumeId })
        const cs3D = getCornerstone3D()
        if (!cs3D) {
          throw new Error('Cornerstone3D could not be initialized.')
        }

        const { cache, Enums } = cs3D

        let volume = cache.getVolume(streamingVolumeId)
        if (!volume || !volume.loadStatus?.loaded) {
          volume = await createVolumeFromImages(images, volumeId)
        }
        if (cancelled) return

        const renderingEngine = await getOrCreateRenderingEngine(RENDERING_ENGINE_ID)

        renderingEngineRef.current = renderingEngine

        const existingViewport = renderingEngine.getViewport(viewportId)
        if (existingViewport) {
          renderingEngine.disableElement(viewportId)
        }

        renderingEngine.enableElement({
          viewportId,
          element,
          type: Enums.ViewportType.VOLUME_3D,
          defaultOptions: {
            background: [0, 0, 0] as [number, number, number],
            orientation: Enums.OrientationAxis.AXIAL,
          },
        })

        const viewport = renderingEngine.getViewport(viewportId) as any
        if (!viewport || cancelled) return

        viewportRef.current = viewport

        await viewport.setVolumes([
          {
            volumeId: streamingVolumeId,
            blendMode: blendMode === 'mip' ? Enums.BlendModes.MAXIMUM_INTENSITY_BLEND : Enums.BlendModes.COMPOSITE,
          },
        ])

        if (cancelled) return

        viewport.resetCamera()
        renderingEngine.resize(true, true)
        applyRenderingStyle()
        viewport.render()

        setTimeout(() => {
          if (!cancelled) {
            renderingEngine.resize(true, true)
            viewport.resetCamera()
            applyRenderingStyle()
          }
        }, 250)

        setIsLoading(false)
      } catch (setupError) {
        console.error('Failed to setup 3D volume rendering:', setupError)
        setError(setupError instanceof Error ? setupError.message : '3D volume rendering could not be started.')
        setIsLoading(false)
      }
    }

    setupVolumeRendering()

    return () => {
      cancelled = true
      viewportRef.current = null
      renderingEngineRef.current = null

      void destroy3DRenderingSession(volumeId)
    }
  // Recreate the viewport only when the active series changes. Presets, blend modes,
  // and window/level are applied to the existing volume actor in a separate effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeriesId, images, isCompatible, streamingVolumeId, viewportId, volumeId])

  useEffect(() => {
    applyRenderingStyle()
  }, [applyRenderingStyle])

  useEffect(() => {
    if (!renderingEngineRef.current || !elementRef.current) return

    const handleResize = () => {
      try {
        renderingEngineRef.current.resize()
        renderingEngineRef.current.renderViewport(viewportId)
      } catch (resizeError) {
        console.warn('Failed to resize 3D viewport:', resizeError)
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(elementRef.current)
    window.addEventListener('resize', handleResize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [viewportId])

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    let dragMode: 'rotate' | 'pan' | 'zoom' | 'windowLevel' | 'thickness' | 'opacity' | null = null
    let lastY = 0
    let lastX = 0
    let rafId: number | null = null
    let pendingThickness: number | null = null
    let pendingOpacity: number | null = null
    let pendingWindowWidth: number | null = null
    let pendingWindowCenter: number | null = null

    const scheduleInteractionUpdate = () => {
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (pendingThickness != null) {
          setTissueThickness(pendingThickness)
          pendingThickness = null
        }
        if (pendingOpacity != null) {
          setOpacityScale(pendingOpacity)
          pendingOpacity = null
        }
        if (pendingWindowWidth != null) {
          setWindowWidth(pendingWindowWidth)
          pendingWindowWidth = null
        }
        if (pendingWindowCenter != null) {
          setWindowCenter(pendingWindowCenter)
          pendingWindowCenter = null
        }
      })
    }

    const renderViewport = () => {
      const viewport = viewportRef.current
      if (!viewport) return

      viewport.resetVolumeViewportClippingRange?.()
      viewport.render()
    }

    const handleWheel = (event: WheelEvent) => {
      const viewport = viewportRef.current
      if (!viewport) return

      event.preventDefault()
      const camera = viewport.getVtkActiveCamera?.()
      if (!camera) return

      camera.zoom?.(event.deltaY > 0 ? 0.9 : 1.1)
      renderViewport()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0 && event.shiftKey) {
        dragMode = 'windowLevel'
      } else if (event.button === 0) {
        dragMode = 'rotate'
      } else if (event.button === 1) {
        dragMode = 'pan'
      } else if (event.button === 2 && event.shiftKey && blendModeRef.current !== 'mip' && useTissueControlsRef.current) {
        dragMode = 'thickness'
        setUseTissueControls(true)
      } else if (event.button === 2 && event.ctrlKey && blendModeRef.current !== 'mip' && useTissueControlsRef.current) {
        dragMode = 'opacity'
        setUseTissueControls(true)
      } else if (event.button === 2) {
        dragMode = 'zoom'
      } else {
        return
      }

      lastX = event.clientX
      lastY = event.clientY
      event.preventDefault()
      event.stopPropagation()
      element.setPointerCapture?.(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dragMode) return

      event.preventDefault()
      event.stopPropagation()

      const dx = event.clientX - lastX
      const dy = lastY - event.clientY
      lastX = event.clientX
      lastY = event.clientY

      const viewport = viewportRef.current
      const camera = viewport?.getVtkActiveCamera?.()

      if (dragMode === 'rotate' && camera) {
        camera.azimuth?.(-dx * 0.45)
        camera.elevation?.(dy * 0.45)
        camera.orthogonalizeViewUp?.()
        renderViewport()
        return
      }

      if (dragMode === 'pan' && camera) {
        const position = camera.getPosition?.()
        const focalPoint = camera.getFocalPoint?.()
        const viewUp = camera.getViewUp?.()

        if (position && focalPoint && viewUp) {
          const viewDir = [
            focalPoint[0] - position[0],
            focalPoint[1] - position[1],
            focalPoint[2] - position[2],
          ]
          const right = [
            viewDir[1] * viewUp[2] - viewDir[2] * viewUp[1],
            viewDir[2] * viewUp[0] - viewDir[0] * viewUp[2],
            viewDir[0] * viewUp[1] - viewDir[1] * viewUp[0],
          ]
          const normalize = (vector: number[]) => {
            const length = Math.hypot(vector[0], vector[1], vector[2]) || 1
            return vector.map((value) => value / length)
          }
          const normalizedRight = normalize(right)
          const normalizedUp = normalize(viewUp)
          const distance = Math.hypot(viewDir[0], viewDir[1], viewDir[2]) || 1
          const scale = distance * 0.0018
          const shift = [
            (-dx * normalizedRight[0] - dy * normalizedUp[0]) * scale,
            (-dx * normalizedRight[1] - dy * normalizedUp[1]) * scale,
            (-dx * normalizedRight[2] - dy * normalizedUp[2]) * scale,
          ]

          camera.setPosition?.(position[0] + shift[0], position[1] + shift[1], position[2] + shift[2])
          camera.setFocalPoint?.(focalPoint[0] + shift[0], focalPoint[1] + shift[1], focalPoint[2] + shift[2])
          renderViewport()
        }
        return
      }

      if (dragMode === 'zoom' && camera) {
        camera.zoom?.(Math.max(0.1, 1 + dy * 0.012))
        renderViewport()
        return
      }

      if (dragMode === 'windowLevel') {
        pendingWindowWidth = Math.max(1, Math.round(windowWidthRef.current + dx * 2))
        pendingWindowCenter = Math.round(windowCenterRef.current + dy * 2)
        scheduleInteractionUpdate()
        return
      }

      if (dragMode === 'thickness') {
        const next = Math.round(
          Math.max(
            THICKNESS_MIN,
            Math.min(THICKNESS_MAX, tissueThicknessRef.current + dy * THICKNESS_DRAG_SENS)
          ) / 5
        ) * 5
        pendingThickness = next
      } else {
        const next = Math.round(
          Math.max(
            OPACITY_MIN,
            Math.min(OPACITY_MAX, opacityScaleRef.current + dy * OPACITY_DRAG_SENS)
          ) / 5
        ) * 5
        pendingOpacity = next
      }

      scheduleInteractionUpdate()
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!dragMode) return

      dragMode = null
      try {
        element.releasePointerCapture?.(event.pointerId)
      } catch {
        // Ignore capture release errors.
      }
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    element.addEventListener('pointerdown', onPointerDown, { capture: true })
    element.addEventListener('pointermove', onPointerMove, { capture: true })
    element.addEventListener('pointerup', onPointerUp, { capture: true })
    element.addEventListener('pointercancel', onPointerUp, { capture: true })

    return () => {
      element.removeEventListener('wheel', handleWheel)
      element.removeEventListener('pointerdown', onPointerDown, { capture: true })
      element.removeEventListener('pointermove', onPointerMove, { capture: true })
      element.removeEventListener('pointerup', onPointerUp, { capture: true })
      element.removeEventListener('pointercancel', onPointerUp, { capture: true })
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [setWindowCenter, setWindowWidth])

  const handleResetCamera = () => {
    const viewport = viewportRef.current
    if (!viewport) return

    viewport.resetCamera()
    viewport.render()
  }

  const toggleTissue = (key: TissueKey) => {
    setUseTissueControls(true)
    setBlendMode('composite')
    setTissueVisibility((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  if (!images.length) {
    return (
      <div className="viewer-3d empty">
        <div className="viewer-3d-message">No images loaded</div>
      </div>
    )
  }

  if (!isCompatible) {
    return (
      <div className="viewer-3d empty">
        <div className="viewer-3d-message">
          <p>3D volume rendering is not available for this series.</p>
          <p>Series must contain multiple slices with position and orientation metadata.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="viewer-3d">
      <div
        ref={elementRef}
        className="viewer-3d-element"
        onContextMenu={(event) => event.preventDefault()}
      />

      <div className="viewer-3d-topbar">
        <div className="viewer-3d-segment">
          <button
            className={blendMode === 'composite' ? 'active' : ''}
            onClick={() => setBlendMode('composite')}
          >
            VR
          </button>
          <button
            className={blendMode === 'mip' ? 'active' : ''}
            onClick={() => setBlendMode('mip')}
          >
            MIP
          </button>
        </div>

        <div className="viewer-3d-presets">
          {PRESETS.map((item) => (
            <button
              key={item.value}
              className={preset === item.value && blendMode === 'composite' ? 'active' : ''}
              onClick={() => {
                setBlendMode('composite')
                setPreset(item.value)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button className="viewer-3d-icon-button" onClick={handleResetCamera} title="Reset 3D Camera">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="viewer-3d-sidepanel">
        <div className="viewer-3d-panel-header">
          <div className="viewer-3d-panel-title">Fare Kontrolleri</div>
          <button className="viewer-3d-small-icon" onClick={handleResetCamera} title="3D kamerayı sıfırla">
            <RefreshCw size={14} />
          </button>
        </div>

        <ul className="viewer-3d-mouse-help">
          <li><kbd>Sol</kbd> sürükle — Döndür</li>
          <li><kbd>Orta</kbd> sürükle — Kaydır</li>
          <li><kbd>Sağ</kbd> sürükle — Yakınlaştır</li>
          <li><kbd>Shift</kbd> + <kbd>Sol</kbd> — Pencere/seviye</li>
          <li><kbd>Shift</kbd> + <kbd>Sağ</kbd> — Doku kalınlığı</li>
          <li><kbd>Ctrl</kbd> + <kbd>Sağ</kbd> — Doku opaklığı</li>
          <li><kbd>Tekerlek</kbd> — Yakınlaştır</li>
        </ul>

        <label className="viewer-3d-toggle">
          <input
            type="checkbox"
            checked={useTissueControls}
            disabled={blendMode === 'mip'}
            onChange={(event) => setUseTissueControls(event.target.checked)}
          />
          Tissue editor
        </label>

        <div className="viewer-3d-tissue-list">
          {TISSUES.map((tissue) => (
            <button
              key={tissue.key}
              className={tissueVisibility[tissue.key] && useTissueControls && blendMode === 'composite' ? 'active' : ''}
              disabled={blendMode === 'mip'}
              onClick={() => toggleTissue(tissue.key)}
            >
              <span
                className="viewer-3d-swatch"
                style={{
                  backgroundColor: `rgb(${tissue.color.map((value) => Math.round(value * 255)).join(', ')})`,
                }}
              />
              {tissue.label}
            </button>
          ))}
        </div>

        <label className="viewer-3d-slider">
          <span>Doku kalınlığı</span>
          <input
            type="range"
            min="10"
            max="260"
            step="5"
            value={tissueThickness}
            disabled={blendMode === 'mip' || !useTissueControls}
            onChange={(event) => {
              setUseTissueControls(true)
              setTissueThickness(Number(event.target.value))
            }}
          />
          <output>{tissueThickness} HU</output>
        </label>

        <label className="viewer-3d-slider">
          <span>Doku opaklığı</span>
          <input
            type="range"
            min="5"
            max="100"
            step="5"
            value={opacityScale}
            disabled={blendMode === 'mip' || !useTissueControls}
            onChange={(event) => {
              setUseTissueControls(true)
              setOpacityScale(Number(event.target.value))
            }}
          />
          <output>{opacityScale}%</output>
        </label>
      </div>

      <div className="viewer-3d-info">
        <span>{series?.modality || 'DICOM'}</span>
        <span>{images.length} slices</span>
        <span>{series?.seriesDescription || '3D Volume'}</span>
      </div>

      {isLoading && (
        <div className="viewer-3d-overlay">
          <div className="viewer-3d-spinner">Loading 3D volume...</div>
        </div>
      )}

      {error && (
        <div className="viewer-3d-overlay">
          <div className="viewer-3d-error">{error}</div>
        </div>
      )}
    </div>
  )
}

export default Viewer3D
