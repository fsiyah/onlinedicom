/**
 * Cornerstone3D Configuration and Initialization
 * For MPR (Multi-Planar Reconstruction) with real oblique reformat
 */

let cornerstone3DInitialized = false
let initializationPromise: Promise<Cornerstone3DModules> | null = null

export interface Cornerstone3DModules {
  initCornerstone3D: any
  cache: any
  imageLoader: any
  metaData: any
  volumeLoader: any
  Enums: any
  CONSTANTS: any
  utilities: any
}

let cornerstone3D: Cornerstone3DModules | null = null

/**
 * Initialize Cornerstone3D
 * Uses mutex pattern to prevent multiple simultaneous initializations
 */
export async function initCornerstone3D(): Promise<Cornerstone3DModules> {
  // Return cached result if already initialized
  if (cornerstone3DInitialized && cornerstone3D) {
    return cornerstone3D
  }

  // Return existing promise if initialization is in progress (mutex)
  if (initializationPromise) {
    return initializationPromise
  }

  console.log('[Cornerstone3D] Initializing...')
  
  // Create initialization promise (mutex lock)
  initializationPromise = doInitialization()
  
  try {
    const result = await initializationPromise
    return result
  } catch (error) {
    // Reset promise on error so we can retry
    initializationPromise = null
    throw error
  }
}

/**
 * Internal initialization function
 */
async function doInitialization(): Promise<Cornerstone3DModules> {

  // Import Cornerstone3D modules (dynamic import with error handling)
  let coreModule: any
  let streamingLoader: any

  try {
    coreModule = await import('@cornerstonejs/core')
    
    // Try to get streaming loader from core first, then from separate package
    if (coreModule.cornerstoneStreamingImageVolumeLoader) {
      streamingLoader = coreModule.cornerstoneStreamingImageVolumeLoader
      console.log('Found cornerstoneStreamingImageVolumeLoader in @cornerstonejs/core')
    } else {
      try {
        const streamingModule = await import('@cornerstonejs/streaming-image-volume-loader')
        streamingLoader = streamingModule.default || streamingModule.cornerstoneStreamingImageVolumeLoader
        console.log('Found cornerstoneStreamingImageVolumeLoader in @cornerstonejs/streaming-image-volume-loader')
      } catch (e) {
        console.warn('Could not import @cornerstonejs/streaming-image-volume-loader:', e)
      }
    }
  } catch (importError) {
    console.warn('Cornerstone3D packages not installed. Install with: npm install @cornerstonejs/core @cornerstonejs/streaming-image-volume-loader')
    throw new Error('Cornerstone3D packages not available. Please install them first.')
  }

  // Cornerstone3D exports 'init' not 'initCornerstone3D'
  const { 
    init, 
    cache, 
    imageLoader, 
    metaData, 
    volumeLoader,
    Enums, 
    CONSTANTS,
    utilities,
  } = coreModule

  // Initialize Cornerstone3D
  await init()

  // Register DICOM image loader with Cornerstone3D
  // Try to use @cornerstonejs/dicom-image-loader first (official Cornerstone3D loader)
  // Fall back to classic cornerstone-wado-image-loader if not available
  try {
    try {
      const cornerstoneDICOMImageLoader = await import('@cornerstonejs/dicom-image-loader')
      const dicomParser = await import('dicom-parser')
      
      // Initialize the Cornerstone3D DICOM image loader
      if (cornerstoneDICOMImageLoader.init) {
        cornerstoneDICOMImageLoader.init({
          maxWebWorkers: navigator.hardwareConcurrency || 4,
        })
      }
      
      // Configure external dependencies
      if (cornerstoneDICOMImageLoader.external) {
        cornerstoneDICOMImageLoader.external.cornerstone = coreModule
        cornerstoneDICOMImageLoader.external.dicomParser = dicomParser.default || dicomParser
      }
      
      console.log('Using @cornerstonejs/dicom-image-loader (recommended)')
    } catch (e) {
      console.warn('@cornerstonejs/dicom-image-loader not available, trying classic loader')
      
      // Fall back to classic cornerstone-wado-image-loader
      // Note: This may have compatibility issues with Cornerstone3D
      const wadoImageLoader = await import('cornerstone-wado-image-loader')
      const dicomParser = await import('dicom-parser')
      const cornerstone = await import('cornerstone-core')
      
      // Configure the classic wadouri loader with classic cornerstone
      if (wadoImageLoader.external) {
        wadoImageLoader.external.cornerstone = cornerstone.default || cornerstone
        wadoImageLoader.external.dicomParser = dicomParser.default || dicomParser
      }
      
      const wadouriLoadImage = wadoImageLoader?.wadouri?.loadImage ?? (wadoImageLoader as any).default?.wadouri?.loadImage
      
      if (wadouriLoadImage) {
        imageLoader.registerImageLoader('wadouri', wadouriLoadImage)
        console.log('Registered classic wadouri image loader (may have compatibility issues)')
        console.warn('For best results, install @cornerstonejs/dicom-image-loader: npm install @cornerstonejs/dicom-image-loader')
      }
    }
  } catch (e) {
    console.warn('Could not register any DICOM image loader:', e)
    console.error('Please install @cornerstonejs/dicom-image-loader: npm install @cornerstonejs/dicom-image-loader')
  }

  // Register the streaming image volume loader if available
  // This allows volumes to be created from 2D DICOM images
  if (streamingLoader) {
    volumeLoader.registerVolumeLoader(
      'cornerstoneStreamingImageVolume',
      streamingLoader
    )
    console.log('Cornerstone3D initialized successfully')
    console.log('Streaming image volume loader registered')
  } else {
    console.warn('cornerstoneStreamingImageVolumeLoader not found. Volume loading may not work.')
    console.log('Cornerstone3D initialized (without streaming loader)')
  }

  cornerstone3D = {
    initCornerstone3D: init,
    cache,
    imageLoader,
    metaData,
    volumeLoader,
    Enums,
    CONSTANTS,
    utilities,
  }

  cornerstone3DInitialized = true
  return cornerstone3D
}

/**
 * Get Cornerstone3D modules (must be initialized first)
 */
export function getCornerstone3D(): Cornerstone3DModules | null {
  return cornerstone3D
}
