// src/store/viewerStore.ts
import { create } from 'zustand'
import dicomParser from 'dicom-parser'

// Lazy load cornerstone to avoid blocking
let cornerstone: any = null
let cornerstoneTools: any = null
let wadoImageLoader: any = null

export const loadCornerstone = async () => {
  if (!cornerstone || !cornerstoneTools) {
    const cornerstoneModule = await import('cornerstone-core')
    const toolsModule = await import('cornerstone-tools')

    // Vite/ESM interop safety
    cornerstone = (cornerstoneModule as any).default ?? cornerstoneModule
    cornerstoneTools = (toolsModule as any).default ?? toolsModule

    // Extra fallbacks (some bundles export nested objects)
    if (!cornerstone || Object.keys(cornerstone).length === 0) {
      cornerstone = cornerstoneModule
    }
    if (!cornerstoneTools || Object.keys(cornerstoneTools).length === 0) {
      cornerstoneTools = toolsModule
    }
  }

  return { cornerstone, cornerstoneTools }
}

export interface DicomImage {
  id: string
  patientId?: string
  patientName?: string
  studyDate?: string
  studyTime?: string
  studyDescription?: string
  seriesNumber?: number
  instanceNumber?: number
  modality?: string
  imageId: string
  file: File
  metadata?: any
  sliceLocation?: number
  imagePositionZ?: number
}

export interface DicomSeries {
  id: string
  seriesNumber: number
  seriesDescription?: string
  modality?: string
  images: DicomImage[]
  studyId: string
}

export interface DicomStudy {
  id: string
  patientId?: string
  patientName?: string
  studyDate?: string
  studyTime?: string
  studyDescription?: string
  series: DicomSeries[]
}

export interface ViewerState {
  studies: DicomStudy[]
  activeStudyId: string | null
  activeSeriesId: string | null
  activeImageIndex: number
  openViewers: Array<{
    id: string
    studyId: string
    seriesId: string
    imageIndex: number
  }>
  windowWidth: number
  windowCenter: number
  zoom: number
  pan: { x: number; y: number }
  rotation: number
  flipHorizontal: boolean
  flipVertical: boolean
  measurementTools: {
    length: boolean
    angle: boolean
    roi: boolean
    ellipse: boolean
  }
  isInitialized: boolean
}

interface ViewerActions {
  initializeCornerstone: () => Promise<void>
  loadDicomFile: (file: File) => Promise<void>
  loadDicomFiles: (files: File[]) => Promise<void>
  setActiveStudy: (studyId: string) => void
  setActiveSeries: (seriesId: string) => void
  setActiveImageIndex: (index: number) => void
  addViewer: (studyId: string, seriesId: string) => void
  removeViewer: (viewerId: string) => void
  setWindowWidth: (width: number) => void
  setWindowCenter: (center: number) => void
  setZoom: (zoom: number) => void
  setPan: (pan: { x: number; y: number }) => void
  setRotation: (rotation: number) => void
  toggleFlipHorizontal: () => void
  toggleFlipVertical: () => void
  resetView: () => void
  nextImage: () => void
  previousImage: () => void
  deleteStudy: (studyId: string) => void
  fitToWindow: () => void
  setMeasurementTool: (tool: 'length' | 'angle' | 'roi' | 'ellipse' | null) => void
}

const initialState: ViewerState = {
  studies: [],
  activeStudyId: null,
  activeSeriesId: null,
  activeImageIndex: 0,
  openViewers: [],
  windowWidth: 400,
  windowCenter: 40,
  zoom: 1,
  pan: { x: 0, y: 0 },
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  measurementTools: {
    length: false,
    angle: false,
    roi: false,
    ellipse: false,
  },
  isInitialized: false,
}

/**
 * Cornerstone Tools (classic) tool-name compatibility:
 * Some builds register Ellipse as "EllipticalRoi" instead of "EllipseRoi".
 * We'll add both tool classes if present, and you can activate either name.
 */
function addToolsClassic(tools: any) {
  if (!tools || typeof tools.addTool !== 'function') return

  const addIf = (ToolCtor: any) => {
    if (!ToolCtor) return
    try {
      tools.addTool(ToolCtor)
    } catch {
      // ignore duplicate / incompatible
    }
  }

  // Interaction
  addIf(tools.WwwcTool)
  addIf(tools.PanTool)
  addIf(tools.ZoomTool)
  addIf(tools.StackScrollMouseWheelTool)

  // Measurements
  addIf(tools.LengthTool)
  addIf(tools.RectangleRoiTool)

  // Ellipse variants
  addIf(tools.EllipseRoiTool)
  addIf((tools as any).EllipticalRoiTool)

  // Optional (if you ever need them)
  addIf(tools.AngleTool)
}

function setPassiveIfExists(tools: any, name: string) {
  try {
    tools?.setToolPassive?.(name)
  } catch {
    // ignore
  }
}

export const useViewerStore = create<ViewerState & ViewerActions>((set, get) => ({
  ...initialState,

  initializeCornerstone: async () => {
    if (get().isInitialized) return

    try {
      const { cornerstone: cs, cornerstoneTools: tools } = await loadCornerstone()

      /**
       * 1) cornerstone-wado-image-loader init + register wadouri loader
       */
      try {
        if (!wadoImageLoader) {
          const wadoModule = await import('cornerstone-wado-image-loader')
          wadoImageLoader = (wadoModule as any).default ?? wadoModule
        }

        const dp = dicomParser

        if (wadoImageLoader?.external) {
          wadoImageLoader.external.cornerstone = cs
          wadoImageLoader.external.dicomParser = dp
        }

        // Configure worker/codecs (optional but recommended)
        const codecsPath = 'https://cdn.jsdelivr.net/npm/cornerstone-wado-image-loader/dist/'
        if (wadoImageLoader?.webWorkerManager?.initialize) {
          wadoImageLoader.webWorkerManager.initialize({
            maxWebWorkers: navigator.hardwareConcurrency || 4,
            startWebWorkersOnDemand: true,
            taskConfiguration: {
              decodeTask: {
                codecsPath,
                initializeCodecsOnStartup: false,
                usePDFJS: false,
                strict: false,
              },
            },
          })
        }

        // Register image loader for wadouri:
        // cornerstone-wado-image-loader exports wadouri.loadImage in most builds
        const wadouriLoadImage =
          wadoImageLoader?.wadouri?.loadImage ??
          wadoImageLoader?.loadImage ??
          null

        if (!wadouriLoadImage) {
          throw new Error('cornerstone-wado-image-loader: loadImage not found')
        }

        cs.registerImageLoader('wadouri', wadouriLoadImage)
      } catch (loaderError) {
        console.error('Failed to init/register cornerstone-wado-image-loader:', loaderError)
        throw loaderError
      }

      /**
       * 2) cornerstone-tools classic init (externals + init + addTool)
       */
      if (tools) {
        try {
          // externals
          tools.external = tools.external || {}
          tools.external.cornerstone = cs

          // Measurements often need cornerstone-math + hammerjs
          try {
            const cornerstoneMathModule = await import('cornerstone-math')
            const hammerModule = await import('hammerjs')

            tools.external.cornerstoneMath = (cornerstoneMathModule as any).default ?? cornerstoneMathModule
            tools.external.Hammer = (hammerModule as any).default ?? hammerModule
          } catch (e) {
            console.warn('hammerjs/cornerstone-math missing (measure tools may not work):', e)
          }

          // init (classic)
          if (typeof tools.init === 'function') {
            tools.init({
              mouseEnabled: true,
              touchEnabled: true,
              globalToolSyncEnabled: false,
              showSVGCursors: true,
            })
          }

          // Add tools to global registry
          addToolsClassic(tools)

          // Put tools into a safe default state (passive)
          ;[
            'Wwwc',
            'Pan',
            'Zoom',
            'StackScrollMouseWheel',
            'Length',
            'RectangleRoi',
            'EllipseRoi',
            'EllipticalRoi', // some builds use this name
            'Angle',
          ].forEach((name) => setPassiveIfExists(tools, name))
        } catch (e) {
          console.warn('cornerstone-tools classic init failed:', e)
        }
      }

      set({ isInitialized: true })
    } catch (error) {
      console.error('Failed to initialize Cornerstone:', error)
      set({ isInitialized: false })
    }
  },

  loadDicomFile: async (file: File) => {
    await get().loadDicomFiles([file])
  },

  loadDicomFiles: async (files: File[]) => {
    const studiesMap = new Map<string, DicomStudy>()
    const seriesMap = new Map<string, DicomSeries>()

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const byteArray = new Uint8Array(arrayBuffer)
        const dataset = dicomParser.parseDicom(byteArray)

        const studyInstanceUID =
          dataset.string('x0020000d') || `study-${Date.now()}-${Math.random()}`
        const seriesInstanceUID =
          dataset.string('x0020000e') || `series-${Date.now()}-${Math.random()}`
        const sopInstanceUID =
          dataset.string('x00080018') || `image-${Date.now()}-${Math.random()}`

        const patientId = dataset.string('x00100020') ?? undefined
        const patientName = dataset.string('x00100010') ?? undefined
        const studyDate = dataset.string('x00080020') ?? undefined
        const studyTime = dataset.string('x00080030') ?? undefined
        const studyDescription = dataset.string('x00081030') ?? undefined
        const seriesNumber = dataset.intString('x00200011') || 0
        const instanceNumber = dataset.intString('x00200013') || 0
        const modality = dataset.string('x00080060') ?? undefined
        const seriesDescription = dataset.string('x0008103e') ?? undefined

        // Sorting metadata for stacks (CT, etc.)
        const sliceLocationStr = dataset.floatString('x00201041')
        const sliceLocation = sliceLocationStr ? parseFloat(sliceLocationStr) : undefined

        let imagePositionZ: number | undefined
        const imagePositionPatient = dataset.string('x00200032')
        if (imagePositionPatient) {
          const positions = imagePositionPatient.split('\\').map((v) => Number(v))
          if (positions.length >= 3 && Number.isFinite(positions[2])) imagePositionZ = positions[2]
        }

        let study = studiesMap.get(studyInstanceUID)
        if (!study) {
          study = {
            id: studyInstanceUID,
            patientId,
            patientName,
            studyDate,
            studyTime,
            studyDescription,
            series: [],
          }
          studiesMap.set(studyInstanceUID, study)
        }

        let series = seriesMap.get(seriesInstanceUID)
        if (!series) {
          series = {
            id: seriesInstanceUID,
            seriesNumber,
            seriesDescription,
            modality,
            images: [],
            studyId: studyInstanceUID,
          }
          seriesMap.set(seriesInstanceUID, series)
          study.series.push(series)
        }

        // wadouri loader expects: wadouri:<url>
        const imageId = `wadouri:${URL.createObjectURL(file)}`

        const image: DicomImage = {
          id: sopInstanceUID,
          patientId,
          patientName,
          studyDate,
          studyTime,
          studyDescription,
          seriesNumber,
          instanceNumber,
          modality,
          imageId,
          file,
          metadata: dataset,
          sliceLocation,
          imagePositionZ,
        }

        series.images.push(image)
      } catch (error) {
        console.error('Error parsing DICOM file:', file.name, error)
      }
    }

    const studies = Array.from(studiesMap.values())

    // Sort images and series
    studies.forEach((study) => {
      study.series.forEach((series) => {
        series.images.sort((a, b) => {
          if (series.modality === 'CT') {
            if (a.imagePositionZ !== undefined && b.imagePositionZ !== undefined) {
              return a.imagePositionZ - b.imagePositionZ
            }
            if (a.sliceLocation !== undefined && b.sliceLocation !== undefined) {
              return a.sliceLocation - b.sliceLocation
            }
          }
          return (a.instanceNumber || 0) - (b.instanceNumber || 0)
        })
      })
      study.series.sort((a, b) => a.seriesNumber - b.seriesNumber)
    })

    set((state) => {
      const newStudies = [...state.studies, ...studies]
      const activeStudyId = state.activeStudyId || (studies[0]?.id ?? null)
      const activeStudy = newStudies.find((s) => s.id === activeStudyId)
      const activeSeriesId = state.activeSeriesId || (activeStudy?.series[0]?.id ?? null)

      return {
        studies: newStudies,
        activeStudyId,
        activeSeriesId,
        activeImageIndex: 0,
      }
    })
  },

  setActiveStudy: (studyId: string) => {
    const state = get()
    const study = state.studies.find((s) => s.id === studyId)
    if (study) {
      set({
        activeStudyId: studyId,
        activeSeriesId: study.series[0]?.id ?? null,
        activeImageIndex: 0,
      })
    }
  },

  setActiveSeries: (seriesId: string) => {
    set({ activeSeriesId: seriesId, activeImageIndex: 0 })
  },

  setActiveImageIndex: (index: number) => {
    set({ activeImageIndex: index })
  },

  addViewer: (studyId: string, seriesId: string) => {
    const viewerId = `viewer-${Date.now()}-${Math.random()}`
    set((state) => ({
      openViewers: [...state.openViewers, { id: viewerId, studyId, seriesId, imageIndex: 0 }],
    }))
  },

  removeViewer: (viewerId: string) => {
    set((state) => ({
      openViewers: state.openViewers.filter((v) => v.id !== viewerId),
    }))
  },

  setWindowWidth: (width: number) => {
    set({ windowWidth: width })
  },

  setWindowCenter: (center: number) => {
    set({ windowCenter: center })
  },

  setZoom: (zoom: number) => {
    set({ zoom: Math.max(0.1, Math.min(10, zoom)) })
  },

  setPan: (pan: { x: number; y: number }) => {
    set({ pan })
  },

  setRotation: (rotation: number) => {
    set({ rotation: ((rotation % 360) + 360) % 360 })
  },

  toggleFlipHorizontal: () => {
    set((state) => ({ flipHorizontal: !state.flipHorizontal }))
  },

  toggleFlipVertical: () => {
    set((state) => ({ flipVertical: !state.flipVertical }))
  },

  resetView: () => {
    set({
      zoom: 1,
      pan: { x: 0, y: 0 },
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
      windowWidth: 400,
      windowCenter: 40,
    })
  },

  fitToWindow: () => {
    set({ zoom: 1, pan: { x: 0, y: 0 } })
  },

  nextImage: () => {
    const state = get()
    const activeSeries = state.studies
      .find((s) => s.id === state.activeStudyId)
      ?.series.find((s) => s.id === state.activeSeriesId)

    if (activeSeries && state.activeImageIndex < activeSeries.images.length - 1) {
      set({ activeImageIndex: state.activeImageIndex + 1 })
    }
  },

  previousImage: () => {
    const state = get()
    if (state.activeImageIndex > 0) {
      set({ activeImageIndex: state.activeImageIndex - 1 })
    }
  },

  deleteStudy: (studyId: string) => {
    set((state) => ({
      studies: state.studies.filter((s) => s.id !== studyId),
      activeStudyId: state.activeStudyId === studyId ? null : state.activeStudyId,
      activeSeriesId:
        state.activeStudyId === studyId ? null : state.activeSeriesId,
      activeImageIndex: state.activeStudyId === studyId ? 0 : state.activeImageIndex,
      openViewers: state.openViewers.filter((v) => v.studyId !== studyId),
    }))
  },

  setMeasurementTool: (tool: 'length' | 'angle' | 'roi' | 'ellipse' | null) => {
    set({
      measurementTools: {
        length: tool === 'length',
        angle: tool === 'angle',
        roi: tool === 'roi',
        ellipse: tool === 'ellipse',
      },
    })
  },
}))
