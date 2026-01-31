/**
 * Volume utilities for Cornerstone3D
 * Creates volumes from DICOM images for MPR
 */

import { DicomImage } from '../store/viewerStore'
import { initCornerstone3D, getCornerstone3D } from './cornerstone3DConfig'

/**
 * Create a Cornerstone3D volume from DICOM images
 */
export async function createVolumeFromImages(
  images: DicomImage[],
  volumeId: string
): Promise<any> {
  if (images.length === 0) {
    throw new Error('No images provided')
  }

  // Initialize Cornerstone3D if not already done
  await initCornerstone3D()
  const cs3D = getCornerstone3D()
  if (!cs3D) {
    throw new Error('Cornerstone3D not initialized')
  }

  const { cache, metaData } = cs3D

  // Import volumeLoader from @cornerstonejs/core
  const { volumeLoader } = await import('@cornerstonejs/core')

  // Check if volume already exists in cache
  const existingVolume = cache.getVolume(volumeId)
  if (existingVolume) {
    return existingVolume
  }

  // Create image IDs array
  const imageIds = images.map((img) => img.imageId)

  // Register metadata provider for all images (single provider handles all)
  metaData.addProvider(
    (type: string, imgId: string) => {
      const image = images.find((img) => img.imageId === imgId)
      
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
          windowCenter: image.windowCenter || 40,
          windowWidth: image.windowWidth || 400,
        }
      }

      return undefined
    },
    10000 // priority
  )

  // Create volume using streaming image volume loader
  // Volume ID must start with the loader scheme: 'cornerstoneStreamingImageVolume:'
  const streamingVolumeId = `cornerstoneStreamingImageVolume:${volumeId}`
  
  // Check cache with streaming volume ID
  const existingStreamingVolume = cache.getVolume(streamingVolumeId)
  if (existingStreamingVolume) {
    return existingStreamingVolume
  }
  
  const volume = await volumeLoader.createAndCacheVolume(streamingVolumeId, {
    imageIds,
  })

  // Load the volume
  await volume.load()

  return volume
}

/**
 * Calculate spacing between slices from image positions
 */
function calculateSpacingBetweenSlices(images: DicomImage[]): number {
  if (images.length < 2) return 1.0

  const sorted = [...images].sort((a, b) => {
    const posA = a.imagePositionPatient?.[2] || 0
    const posB = b.imagePositionPatient?.[2] || 0
    return posA - posB
  })

  let totalSpacing = 0
  let count = 0

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]

    if (prev.imagePositionPatient && curr.imagePositionPatient) {
      const dx = curr.imagePositionPatient[0] - prev.imagePositionPatient[0]
      const dy = curr.imagePositionPatient[1] - prev.imagePositionPatient[1]
      const dz = curr.imagePositionPatient[2] - prev.imagePositionPatient[2]
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

      if (distance > 0) {
        totalSpacing += distance
        count++
      }
    }
  }

  return count > 0 ? totalSpacing / count : 1.0
}
