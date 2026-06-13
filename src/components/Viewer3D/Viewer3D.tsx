import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useViewerStore } from '../../store/viewerStore'
import { initCornerstone3D, getCornerstone3D } from '../../utils/cornerstone3DConfig'
import { createVolumeFromImages, getVolumeDataRange } from '../../utils/volumeUtils'
import { isMPRCompatible } from '../../utils/mprUtils'
import './Viewer3D.css'

type RenderingPreset = 'CT-Bone' | 'CT-Soft-Tissue' | 'CT-Muscle' | 'CT-Lung' | 'MR-Default'
type BlendMode = 'composite' | 'mip'

const RENDERING_ENGINE_ID = 'volume-3d-rendering-engine'
const TOOL_GROUP_ID = 'volume-3d-tool-group'

const PRESETS: Array<{ label: string; value: RenderingPreset }> = [
  { label: 'Bone', value: 'CT-Bone' },
  { label: 'Soft', value: 'CT-Soft-Tissue' },
  { label: 'Muscle', value: 'CT-Muscle' },
  { label: 'Lung', value: 'CT-Lung' },
  { label: 'MR', value: 'MR-Default' },
]

let toolsInitPromise: Promise<any> | null = null

async function initialize3DToolGroup(viewportId: string): Promise<any> {
  if (!toolsInitPromise) {
    toolsInitPromise = (async () => {
      const csTools = await import('@cornerstonejs/tools')
      const {
        init,
        addTool,
        ToolGroupManager,
        TrackballRotateTool,
        VolumeRotateMouseWheelTool,
        PanTool,
        ZoomTool,
        WindowLevelTool,
        Enums: ToolEnums,
      } = csTools

      await init()

      ;[TrackballRotateTool, VolumeRotateMouseWheelTool, PanTool, ZoomTool, WindowLevelTool].forEach((tool) => {
        try {
          addTool(tool)
        } catch (error: any) {
          if (!error.message?.includes('already been added')) {
            console.warn(`Failed to add 3D tool ${tool.toolName}:`, error)
          }
        }
      })

      let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID)
      if (!toolGroup) {
        toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID)
        if (!toolGroup) {
          throw new Error('3D tool group could not be created.')
        }

        toolGroup.addTool(TrackballRotateTool.toolName)
        toolGroup.addTool(VolumeRotateMouseWheelTool.toolName)
        toolGroup.addTool(PanTool.toolName)
        toolGroup.addTool(ZoomTool.toolName)
        toolGroup.addTool(WindowLevelTool.toolName)

        toolGroup.setToolActive(TrackballRotateTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
        })
        toolGroup.setToolActive(VolumeRotateMouseWheelTool.toolName, {
          bindings: [{ mouseButton: (ToolEnums.MouseBindings as any).Wheel }],
        })
        toolGroup.setToolActive(PanTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }],
        })
        toolGroup.setToolActive(ZoomTool.toolName, {
          bindings: [
            {
              mouseButton: ToolEnums.MouseBindings.Secondary,
            },
            {
              mouseButton: ToolEnums.MouseBindings.Primary,
              modifierKey: ToolEnums.KeyboardBindings.Ctrl,
            },
          ],
        })
        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [
            {
              mouseButton: ToolEnums.MouseBindings.Primary,
              modifierKey: ToolEnums.KeyboardBindings.Shift,
            },
          ],
        })
      }

      return { toolGroup, ToolGroupManager }
    })()
  }

  const { toolGroup } = await toolsInitPromise
  const viewportIds = toolGroup.getViewportIds?.() || []
  if (!viewportIds.includes(viewportId)) {
    toolGroup.addViewport(viewportId, RENDERING_ENGINE_ID)
  }

  return toolGroup
}

function remove3DViewportFromToolGroup(viewportId: string): void {
  if (!toolsInitPromise) return

  toolsInitPromise
    .then(({ toolGroup }) => {
      const viewportIds = toolGroup.getViewportIds?.() || []
      if (viewportIds.includes(viewportId)) {
        toolGroup.removeViewports(RENDERING_ENGINE_ID, [viewportId])
      }
    })
    .catch(() => {
      // Ignore cleanup errors.
    })
}

const Viewer3D: React.FC = () => {
  const elementRef = useRef<HTMLDivElement>(null)
  const renderingEngineRef = useRef<any>(null)
  const viewportRef = useRef<any>(null)

  const activeStudyId = useViewerStore((state) => state.activeStudyId)
  const activeSeriesId = useViewerStore((state) => state.activeSeriesId)
  const studies = useViewerStore((state) => state.studies)
  const windowWidth = useViewerStore((state) => state.windowWidth)
  const windowCenter = useViewerStore((state) => state.windowCenter)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<RenderingPreset>('CT-Bone')
  const [blendMode, setBlendMode] = useState<BlendMode>('composite')

  const study = useMemo(() => studies.find((s) => s.id === activeStudyId), [studies, activeStudyId])
  const series = useMemo(() => study?.series.find((s) => s.id === activeSeriesId), [study, activeSeriesId])
  const images = series?.images || []
  const isCompatible = images.length > 1 && isMPRCompatible(images)

  const viewportId = useMemo(() => `viewport-3d-${activeSeriesId || 'empty'}`, [activeSeriesId])
  const volumeId = useMemo(() => `volume-${activeSeriesId || 'empty'}`, [activeSeriesId])
  const streamingVolumeId = useMemo(() => `cornerstoneStreamingImageVolume:${volumeId}`, [volumeId])

  const applyRenderingStyle = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const actor = viewport.getDefaultActor?.()?.actor
    if (!actor) return

    try {
      const core = getCornerstone3D()
      const coreEnums = core?.Enums
      const mapper = actor.getMapper?.()

      mapper?.setBlendMode?.(
        blendMode === 'mip' ? coreEnums.BlendModes.MAXIMUM_INTENSITY_BLEND : coreEnums.BlendModes.COMPOSITE
      )

      const presetName = blendMode === 'mip' ? 'CT-MIP' : preset
      const presetDefinition = core?.CONSTANTS?.VIEWPORT_PRESETS?.find((item: any) => item.name === presetName)
      const applyPreset = (core as any)?.utilities?.applyPreset

      if (presetDefinition && applyPreset) {
        applyPreset(actor, presetDefinition)
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
    } catch (styleError) {
      console.warn('Failed to apply 3D rendering style:', styleError)
    }
  }, [blendMode, preset, windowCenter, windowWidth])

  useEffect(() => {
    if (!isCompatible || !elementRef.current || !activeSeriesId) return

    let cancelled = false
    let setupViewportId: string | null = null

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

        const { RenderingEngine, getRenderingEngine } = await import('@cornerstonejs/core')
        let renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID)
        if (!renderingEngine) {
          renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID)
        }

        renderingEngineRef.current = renderingEngine

        const existingViewport = renderingEngine.getViewport(viewportId)
        if (existingViewport) {
          remove3DViewportFromToolGroup(viewportId)
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
        setupViewportId = viewportId

        await viewport.setVolumes([
          {
            volumeId: streamingVolumeId,
            blendMode: blendMode === 'mip' ? Enums.BlendModes.MAXIMUM_INTENSITY_BLEND : Enums.BlendModes.COMPOSITE,
          },
        ])

        await initialize3DToolGroup(viewportId)

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

      if (setupViewportId && renderingEngineRef.current) {
        try {
          remove3DViewportFromToolGroup(setupViewportId)
          renderingEngineRef.current.disableElement(setupViewportId)
        } catch {
          // Ignore cleanup errors.
        }
      }
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

  const handleResetCamera = () => {
    const viewport = viewportRef.current
    if (!viewport) return

    viewport.resetCamera()
    viewport.render()
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
