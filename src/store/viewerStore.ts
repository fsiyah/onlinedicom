import { create } from 'zustand'
import dicomParser from 'dicom-parser'

// Lazy load cornerstone to avoid blocking
let cornerstone: any = null
let cornerstoneTools: any = null

export const loadCornerstone = async () => {
  if (!cornerstone) {
    const cornerstoneModule = await import('cornerstone-core')
    const toolsModule = await import('cornerstone-tools')
    
    // Handle default export or named export
    cornerstone = cornerstoneModule.default || cornerstoneModule
    cornerstoneTools = toolsModule.default || toolsModule
    
    // If still not found, try accessing the actual module
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
  initializeCornerstone: () => void
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

export const useViewerStore = create<ViewerState & ViewerActions>((set, get) => ({
  ...initialState,

  initializeCornerstone: async () => {
    if (get().isInitialized) return

    try {
      const { cornerstone: cs, cornerstoneTools: tools } = await loadCornerstone()
      
      // Register image loader
      try {
        const cornerstoneWADOImageLoader = await import('cornerstone-wado-image-loader')
        const dicomParserModule = await import('dicom-parser')
        
        // Get the actual module (handle default export)
        const wadoLoader = cornerstoneWADOImageLoader.default || cornerstoneWADOImageLoader
        const dicomParser = dicomParserModule.default || dicomParserModule
        
        // Configure external dependencies
        if (wadoLoader.external) {
          wadoLoader.external.cornerstone = cs
          wadoLoader.external.dicomParser = dicomParser
        }
        
        // Configure codec paths
        const codecPath = 'https://cdn.jsdelivr.net/npm/cornerstone-wado-image-loader/dist/'
        if (wadoLoader.webWorkerManager) {
          wadoLoader.webWorkerManager.initialize({
            maxWebWorkers: navigator.hardwareConcurrency || 4,
            startWebWorkersOnDemand: true,
            taskConfiguration: {
              decodeTask: {
                codecsPath: codecPath,
                initializeCodecsOnStartup: false,
                usePDFJS: false,
                strict: false,
              },
            },
          })
        }
        
        // Register the image loader with cornerstone
        // cornerstone-wado-image-loader exports wadouri.loadImage
        if (wadoLoader.wadouri && wadoLoader.wadouri.loadImage) {
          cs.registerImageLoader('wadouri', wadoLoader.wadouri.loadImage)
          console.log('Image loader registered successfully (wadouri.loadImage)')
        } else {
          // Fallback: try to find loadImage in different locations
          console.warn('wadouri.loadImage not found, trying alternative paths...')
          console.log('Available keys:', Object.keys(wadoLoader))
          
          // Try alternative registration
          if (wadoLoader.loadImage) {
            cs.registerImageLoader('wadouri', wadoLoader.loadImage)
            console.log('Image loader registered (loadImage)')
          } else {
            throw new Error('Image loader registration failed - no loadImage function found')
          }
        }
      } catch (loaderError) {
        console.error('Failed to register image loader:', loaderError)
        throw loaderError
      }
      
      // Initialize cornerstone tools
      // Skip init if it causes errors - some versions don't require explicit init
      // Tools will be initialized when needed in components
      if (tools) {
        // Try to initialize tools only if cornerstone is properly loaded
        if (typeof tools.init === 'function' && cs) {
          try {
            // Check if cornerstone has EVENTS (required by some tool versions)
            if (cs.EVENTS || cs.default?.EVENTS) {
              // Try with cornerstone instance
              if (tools.init.length > 0) {
                tools.init(cs)
              } else {
                tools.init()
              }
            }
          } catch (initError) {
            // Silently fail - tools might work without explicit init
            // Some versions of cornerstone-tools don't require init
            console.debug('Tools init skipped:', initError.message || initError)
          }
        }
        
        // Enable tools (only if they exist)
        if (tools.addTool && typeof tools.addTool === 'function') {
          try {
            if (tools.LengthTool) tools.addTool(tools.LengthTool)
            if (tools.AngleTool) tools.addTool(tools.AngleTool)
            if (tools.RectangleRoiTool) tools.addTool(tools.RectangleRoiTool)
            if (tools.EllipseRoiTool) tools.addTool(tools.EllipseRoiTool)
            if (tools.PanTool) tools.addTool(tools.PanTool)
            if (tools.ZoomTool) tools.addTool(tools.ZoomTool)
            if (tools.WwwcTool) tools.addTool(tools.WwwcTool)
            if (tools.StackScrollMouseWheelTool) tools.addTool(tools.StackScrollMouseWheelTool)
          } catch (toolError) {
            console.warn('Some tools could not be added:', toolError)
          }
        }
      }

      set({ isInitialized: true })
    } catch (error) {
      console.error('Failed to initialize Cornerstone:', error)
      // Don't block the app if cornerstone fails
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

        const studyInstanceUID = dataset.string('x0020000d') || `study-${Date.now()}-${Math.random()}`
        const seriesInstanceUID = dataset.string('x0020000e') || `series-${Date.now()}-${Math.random()}`
        const sopInstanceUID = dataset.string('x00080018') || `image-${Date.now()}-${Math.random()}`

        const patientId = dataset.string('x00100020')
        const patientName = dataset.string('x00100010')
        const studyDate = dataset.string('x00080020')
        const studyTime = dataset.string('x00080030')
        const studyDescription = dataset.string('x00081030')
        const seriesNumber = dataset.intString('x00200011') || 0
        const instanceNumber = dataset.intString('x00200013') || 0
        const modality = dataset.string('x00080060')
        const seriesDescription = dataset.string('x0008103e')
        
        // Get slice location for CT series sorting
        const sliceLocation = dataset.floatString('x00201041')
        
        // Get image position patient for better sorting (z-coordinate)
        let imagePositionZ: number | undefined
        const imagePositionPatient = dataset.string('x00200032')
        if (imagePositionPatient) {
          const positions = imagePositionPatient.split('\\').map(Number)
          if (positions.length >= 3) {
            imagePositionZ = positions[2] // Z coordinate
          }
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
          // Add sorting metadata
          sliceLocation: sliceLocation ? parseFloat(sliceLocation) : undefined,
          imagePositionZ,
        }

        series.images.push(image)
      } catch (error) {
        console.error('Error parsing DICOM file:', file.name, error)
      }
    }

    const studies = Array.from(studiesMap.values())
    studies.forEach(study => {
      study.series.forEach(series => {
        // Sort CT images by slice location or image position Z, fallback to instance number
        series.images.sort((a, b) => {
          // For CT, prefer slice location or image position Z
          if (series.modality === 'CT') {
            // Try image position Z first (most accurate)
            if (a.imagePositionZ !== undefined && b.imagePositionZ !== undefined) {
              return a.imagePositionZ - b.imagePositionZ
            }
            // Fallback to slice location
            if (a.sliceLocation !== undefined && b.sliceLocation !== undefined) {
              return a.sliceLocation - b.sliceLocation
            }
          }
          // Default: sort by instance number
          return (a.instanceNumber || 0) - (b.instanceNumber || 0)
        })
      })
      study.series.sort((a, b) => a.seriesNumber - b.seriesNumber)
    })

    set((state) => {
      const newStudies = [...state.studies, ...studies]
      const activeStudyId = state.activeStudyId || (studies[0]?.id ?? null)
      const activeStudy = newStudies.find(s => s.id === activeStudyId)
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
    const study = state.studies.find(s => s.id === studyId)
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
      openViewers: [
        ...state.openViewers,
        { id: viewerId, studyId, seriesId, imageIndex: 0 },
      ],
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
    set({ rotation: rotation % 360 })
  },

  toggleFlipHorizontal: () => {
    set((state) => ({ flipHorizontal: !state.flipHorizontal }))
  },

  toggleFlipVertical: () => {
    set((state) => ({ flipVertical: !state.flipVertical }))
  },

  resetView: () => {
    // Reset zoom to 1, which will trigger fit-to-window on next render
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
    // Set zoom to 1 to trigger fit-to-window calculation
    set({ zoom: 1, pan: { x: 0, y: 0 } })
  },

  nextImage: () => {
    const state = get()
    const activeSeries = state.studies
      .find(s => s.id === state.activeStudyId)
      ?.series.find(s => s.id === state.activeSeriesId)
    
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
      studies: state.studies.filter(s => s.id !== studyId),
      activeStudyId: state.activeStudyId === studyId ? null : state.activeStudyId,
    }))
  },
}))
