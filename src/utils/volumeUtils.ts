/**
 * Volume utilities for Cornerstone3D
 * Creates volumes from DICOM images for MPR
 */

import { DicomImage } from '../store/viewerStore'
import { initCornerstone3D, getCornerstone3D } from './cornerstone3DConfig'

// Store the actual data range for VOI calculation
let lastVolumeDataRange: { min: number; max: number } | null = null

// Mutex map to prevent multiple simultaneous volume loads
const volumeLoadingPromises = new Map<string, Promise<any>>()

/**
 * Get the last calculated volume data range
 */
export function getVolumeDataRange(): { min: number; max: number } | null {
  return lastVolumeDataRange
}

export function resetVolumeDataRange(): void {
  lastVolumeDataRange = null
}

export async function releaseCachedVolume(volumeId: string): Promise<void> {
  const streamingVolumeId = `cornerstoneStreamingImageVolume:${volumeId}`

  volumeLoadingPromises.delete(streamingVolumeId)
  resetVolumeDataRange()

  try {
    await initCornerstone3D()
    const cs3D = getCornerstone3D()
    if (!cs3D?.cache?.getVolume?.(streamingVolumeId)) {
      return
    }

    cs3D.cache.removeVolumeLoadObject(streamingVolumeId)
  } catch (error) {
    console.warn(`Failed to release cached volume ${volumeId}:`, error)
  }
}

/**
 * Create a Cornerstone3D volume from DICOM images
 * Uses manual pixel data copying to handle blob URLs correctly
 */
export function createVolumeFromImages(
  images: DicomImage[],
  volumeId: string
): Promise<any> {
  if (images.length === 0) {
    return Promise.reject(new Error('No images provided'))
  }

  // Full volume ID with scheme - computed synchronously
  const streamingVolumeId = `cornerstoneStreamingImageVolume:${volumeId}`

  // SYNCHRONOUS mutex check - must happen before any async work
  const existingPromise = volumeLoadingPromises.get(streamingVolumeId)
  if (existingPromise) {
    console.log(`Volume ${volumeId} is already loading, waiting...`)
    return existingPromise
  }

  // Create the loading promise immediately and store it (synchronous mutex lock)
  // This ensures subsequent calls will wait for this promise
  const loadPromise = (async () => {
    try {
      // Initialize Cornerstone3D if not already done
      await initCornerstone3D()
      const cs3D = getCornerstone3D()
      if (!cs3D) {
        throw new Error('Cornerstone3D not initialized')
      }

      // Check if volume already exists and is loaded
      const existingVolume = cs3D.cache.getVolume(streamingVolumeId)
      if (existingVolume && existingVolume.loadStatus?.loaded) {
        console.log(`Volume ${volumeId} already loaded, returning cached`)
        return existingVolume
      }

      // Actually create and load the volume
      return await doCreateVolumeFromImages(images, volumeId, streamingVolumeId, cs3D)
    } finally {
      // Remove from loading map when done (mutex unlock)
      volumeLoadingPromises.delete(streamingVolumeId)
    }
  })()

  // Store promise SYNCHRONOUSLY before returning
  volumeLoadingPromises.set(streamingVolumeId, loadPromise)

  return loadPromise
}

/**
 * Internal function to actually create and load the volume
 */
async function doCreateVolumeFromImages(
  images: DicomImage[],
  volumeId: string,
  streamingVolumeId: string,
  cs3D: any
): Promise<any> {
  const { metaData } = cs3D

  // Import required modules
  const coreModule = await import('@cornerstonejs/core')
  const { volumeLoader, imageLoader } = coreModule

  // Sort images by position for correct slice ordering
  const sortedImages = [...images].sort((a, b) => {
    const posA = a.imagePositionPatient?.[2] || 0
    const posB = b.imagePositionPatient?.[2] || 0
    return posA - posB
  })

  // Create image IDs array from sorted images
  const imageIds = sortedImages.map((img) => img.imageId)

  // Register metadata provider for all images
  metaData.addProvider(
    (type: string, imgId: string) => {
      const image = sortedImages.find((img) => img.imageId === imgId)
      
      if (!image || !image.metadata) return undefined

      if (type === 'generalSeriesModule') {
        return {
          modality: image.metadata.string('x00080060') || 'CT',
          seriesInstanceUID: image.metadata.string('x0020000e') || '',
          seriesNumber: image.metadata.intString('x00200011') || 1,
          studyInstanceUID: image.metadata.string('x0020000d') || '',
          seriesDate: image.metadata.string('x00080021') || '',
          seriesTime: image.metadata.string('x00080031') || '',
        }
      }

      if (type === 'imagePlaneModule') {
        const orientationPatient = image.imageOrientationPatient || [1, 0, 0, 0, 1, 0]
        const positionPatient = image.imagePositionPatient || [0, 0, 0]
        const spacing = image.pixelSpacing || [1, 1]
        
        return {
          frameOfReferenceUID: image.metadata.string('x00200052') || '',
          rows: image.metadata.uint16('x00280010') || 512,
          columns: image.metadata.uint16('x00280011') || 512,
          imageOrientationPatient: orientationPatient,
          rowCosines: orientationPatient.slice(0, 3),
          columnCosines: orientationPatient.slice(3, 6),
          imagePositionPatient: positionPatient,
          pixelSpacing: spacing,
          rowPixelSpacing: spacing[0],
          columnPixelSpacing: spacing[1],
          sliceThickness: image.sliceThickness || 1,
          sliceLocation: image.metadata.floatString('x00201041') || positionPatient[2],
        }
      }

      if (type === 'imagePixelModule') {
        return {
          samplesPerPixel: image.metadata.uint16('x00280002') || 1,
          photometricInterpretation: image.metadata.string('x00280004') || 'MONOCHROME2',
          bitsAllocated: image.metadata.uint16('x00280100') || 16,
          bitsStored: image.metadata.uint16('x00280101') || 16,
          highBit: image.metadata.uint16('x00280102') || 15,
          pixelRepresentation: image.metadata.uint16('x00280103') || 0,
        }
      }

      if (type === 'voiLutModule') {
        return {
          windowCenter: image.metadata.floatString('x00281050') || 40,
          windowWidth: image.metadata.floatString('x00281051') || 400,
        }
      }

      if (type === 'modalityLutModule') {
        return {
          rescaleIntercept: image.metadata.floatString('x00281052') || 0,
          rescaleSlope: image.metadata.floatString('x00281053') || 1,
          rescaleType: image.metadata.string('x00281054') || 'HU',
        }
      }

      if (type === 'scalingModule') {
        return {
          rescaleIntercept: image.metadata.floatString('x00281052') || 0,
          rescaleSlope: image.metadata.floatString('x00281053') || 1,
        }
      }

      return undefined
    },
    10000 // priority
  )

  // Create volume structure
  const volume = await volumeLoader.createAndCacheVolume(streamingVolumeId, {
    imageIds,
  })

  // Get volume scalar data array
  const scalarData = volume.getScalarData()
  const dimensions = volume.dimensions
  const [cols, rows, numSlices] = dimensions
  const pixelsPerSlice = rows * cols

  // Get rescale values from first image
  const firstImage = sortedImages[0]
  const rescaleSlope = firstImage?.metadata?.floatString?.('x00281053') || 1
  const rescaleIntercept = firstImage?.metadata?.floatString?.('x00281052') || 0

  // Track data range for proper VOI
  let dataMin = Infinity
  let dataMax = -Infinity
  let loadedSlices = 0

  // Load each image and copy pixel data manually
  // This bypasses the streaming loader which has issues with blob URLs
  console.log(`Loading ${numSlices} slices manually...`)

  // Load images in batches for better performance
  const batchSize = 20
  for (let batchStart = 0; batchStart < numSlices; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, numSlices)
    const batchPromises: Promise<void>[] = []

    for (let sliceIdx = batchStart; sliceIdx < batchEnd; sliceIdx++) {
      const imageId = imageIds[sliceIdx]
      
      batchPromises.push(
        (async () => {
          try {
            // Load image using Cornerstone image loader
            const image = await imageLoader.loadAndCacheImage(imageId)
            
            if (!image) {
              console.warn(`Failed to load image ${sliceIdx}: no image returned`)
              return
            }

            // Get pixel data from loaded image
            const pixelData = image.getPixelData()
            
            if (!pixelData || pixelData.length === 0) {
              console.warn(`Failed to load image ${sliceIdx}: no pixel data`)
              return
            }

            // Calculate offset in volume for this slice
            const sliceOffset = sliceIdx * pixelsPerSlice

            // Copy pixel data to volume, applying rescale slope/intercept
            // This converts raw pixel values to proper values (e.g., HU for CT)
            for (let i = 0; i < pixelsPerSlice && i < pixelData.length; i++) {
              const rawValue = pixelData[i]
              // Apply rescale: scaledValue = rawValue * slope + intercept
              const scaledValue = rawValue * rescaleSlope + rescaleIntercept
              scalarData[sliceOffset + i] = scaledValue

              // Track data range
              if (scaledValue < dataMin) dataMin = scaledValue
              if (scaledValue > dataMax) dataMax = scaledValue
            }

            loadedSlices++
          } catch (error) {
            console.warn(`Failed to load slice ${sliceIdx}:`, error)
          }
        })()
      )
    }

    // Wait for batch to complete
    await Promise.all(batchPromises)
    
    // Log progress
    if ((batchEnd % 100 === 0) || batchEnd === numSlices) {
      console.log(`Loaded ${loadedSlices}/${numSlices} slices...`)
    }
  }

  // Store data range for VOI calculation
  if (dataMin !== Infinity && dataMax !== -Infinity) {
    lastVolumeDataRange = { min: dataMin, max: dataMax }
  }

  // Mark volume as loaded
  volume.loadStatus.loaded = true
  volume.loadStatus.loading = false

  // Volume data has been modified - the rendering will pick up changes on next render

  console.log(`Volume ${volumeId} manually loaded: ${loadedSlices}/${numSlices} slices, range: ${dataMin} to ${dataMax}`)

  return volume
}

