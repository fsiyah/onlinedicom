import { DicomImage } from '../store/viewerStore'

/**
 * MPR (Multi-Planar Reconstruction) utility functions
 * Based on DICOM ImagePositionPatient and ImageOrientationPatient tags
 */

export type Plane = 'axial' | 'coronal' | 'sagittal'

export interface VolumeData {
  images: DicomImage[]
  spacing: [number, number, number] // [x, y, z] spacing in mm
  origin: [number, number, number] // [x, y, z] origin in patient coordinates
  dimensions: [number, number, number] // [width, height, depth] in pixels
  rowCosines: [number, number, number] // row direction cosines
  columnCosines: [number, number, number] // column direction cosines
  normalCosines: [number, number, number] // normal (slice) direction cosines
}

export interface ReformatPlane {
  plane: Plane
  rowCosines: [number, number, number]
  columnCosines: [number, number, number]
  normalCosines: [number, number, number]
}

export interface ObliqueRotation {
  pitch: number // Rotation around X-axis (degrees)
  yaw: number // Rotation around Y-axis (degrees)
  roll: number // Rotation around Z-axis (degrees)
}

export interface CrossReferenceLine {
  type: 'horizontal' | 'vertical' | 'diagonal'
  color: 'green' | 'red' | 'yellow' | 'blue'
  position: [number, number] // [col, row] in image pixel coordinates
  targetPlane: Plane // which plane this line represents (for thickness/rotation)
  start?: [number, number] // For diagonal lines
  end?: [number, number] // For diagonal lines
}

/**
 * Calculate volume data from DICOM series
 */
export function calculateVolumeData(images: DicomImage[]): VolumeData | null {
  if (images.length === 0) return null

  // Filter images with required metadata
  const validImages = images.filter(
    (img) =>
      img.imagePositionPatient &&
      img.imageOrientationPatient &&
      img.pixelSpacing &&
      img.metadata
  )

  if (validImages.length === 0) return null

  // Get image dimensions from first image
  const firstImg = validImages[0]
  const rows = firstImg.metadata.uint16('x00280010') || 512
  const columns = firstImg.metadata.uint16('x00280011') || 512

  // Extract direction cosines
  const [rowX, rowY, rowZ, colX, colY, colZ] = firstImg.imageOrientationPatient!
  const rowCosines: [number, number, number] = [rowX, rowY, rowZ]
  const columnCosines: [number, number, number] = [colX, colY, colZ]

  // Calculate normal (slice) direction cosines (cross product of row × column)
  const normalX = rowY * colZ - rowZ * colY
  const normalY = rowZ * colX - rowX * colZ
  const normalZ = rowX * colY - rowY * colX
  const normalLength = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ)
  const normalCosines: [number, number, number] = [
    normalX / normalLength,
    normalY / normalLength,
    normalZ / normalLength,
  ]

  // Calculate spacing
  const [rowSpacing, colSpacing] = firstImg.pixelSpacing!
  const sliceSpacing = calculateSliceSpacing(validImages)
  const spacing: [number, number, number] = [rowSpacing, colSpacing, sliceSpacing]

  // Calculate origin (use first image position)
  const origin: [number, number, number] = [...firstImg.imagePositionPatient!]

  // Calculate dimensions
  const depth = validImages.length
  const dimensions: [number, number, number] = [columns, rows, depth]

  return {
    images: validImages,
    spacing,
    origin,
    dimensions,
    rowCosines,
    columnCosines,
    normalCosines,
  }
}

/**
 * Calculate slice spacing from image positions
 */
function calculateSliceSpacing(images: DicomImage[]): number {
  if (images.length < 2) return 1.0

  // Sort by imagePositionZ
  const sorted = [...images].sort((a, b) => (a.imagePositionZ || 0) - (b.imagePositionZ || 0))

  // Calculate average spacing
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

/**
 * Rotate a vector around an axis
 */
function rotateVector(
  vector: [number, number, number],
  axis: [number, number, number],
  angleDegrees: number
): [number, number, number] {
  const angle = (angleDegrees * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const [vx, vy, vz] = vector
  const [ax, ay, az] = axis
  const dot = vx * ax + vy * ay + vz * az

  // Rodrigues' rotation formula
  const rx = vx * cos + (ay * vz - az * vy) * sin + ax * dot * (1 - cos)
  const ry = vy * cos + (az * vx - ax * vz) * sin + ay * dot * (1 - cos)
  const rz = vz * cos + (ax * vy - ay * vx) * sin + az * dot * (1 - cos)

  // Normalize
  const len = Math.sqrt(rx * rx + ry * ry + rz * rz)
  return len > 0 ? [rx / len, ry / len, rz / len] : vector
}

/**
 * Get reformat plane definition for a given plane type with optional oblique rotation
 */
export function getReformatPlane(
  plane: Plane,
  volume: VolumeData,
  rotation?: ObliqueRotation
): ReformatPlane | null {
  if (!volume) return null

  let { rowCosines, columnCosines, normalCosines } = volume

  // Apply base rotation for plane type
  switch (plane) {
    case 'axial':
      // Axial: use original row/column cosines
      break

    case 'coronal':
      // Coronal: rotate 90° around X-axis
      // Row: original row, Column: normal, Normal: -column
      columnCosines = normalCosines
      normalCosines = [-columnCosines[0], -columnCosines[1], -columnCosines[2]] as [
        number,
        number,
        number,
      ]
      break

    case 'sagittal':
      // Sagittal: rotate 90° around Y-axis
      // Row: normal, Column: original column, Normal: -row
      rowCosines = normalCosines
      normalCosines = [-rowCosines[0], -rowCosines[1], -rowCosines[2]] as [number, number, number]
      break

    default:
      return null
  }

  // Apply oblique rotation if provided
  if (rotation) {
    const { pitch, yaw, roll } = rotation

    // Rotation axes in patient coordinates
    const xAxis: [number, number, number] = [1, 0, 0]
    const yAxis: [number, number, number] = [0, 1, 0]
    const zAxis: [number, number, number] = [0, 0, 1]

    // Apply rotations in order: pitch (X), yaw (Y), roll (Z)
    if (pitch !== 0) {
      rowCosines = rotateVector(rowCosines, xAxis, pitch)
      columnCosines = rotateVector(columnCosines, xAxis, pitch)
      normalCosines = rotateVector(normalCosines, xAxis, pitch)
    }
    if (yaw !== 0) {
      rowCosines = rotateVector(rowCosines, yAxis, yaw)
      columnCosines = rotateVector(columnCosines, yAxis, yaw)
      normalCosines = rotateVector(normalCosines, yAxis, yaw)
    }
    if (roll !== 0) {
      rowCosines = rotateVector(rowCosines, zAxis, roll)
      columnCosines = rotateVector(columnCosines, zAxis, roll)
      normalCosines = rotateVector(normalCosines, zAxis, roll)
    }
  }

  return {
    plane,
    rowCosines,
    columnCosines,
    normalCosines,
  }
}

/**
 * Calculate cross-reference line position for a given point in one plane
 * Returns the corresponding position in another plane
 */
export function calculateCrossReference(
  point: [number, number], // [x, y] in source plane (pixels)
  sourcePlane: Plane,
  targetPlane: Plane,
  volume: VolumeData,
  sourceRotation?: ObliqueRotation,
  targetRotation?: ObliqueRotation
): [number, number] | null {
  if (!volume || sourcePlane === targetPlane) return null

  // Convert pixel coordinates to patient coordinates
  const sourceReformat = getReformatPlane(sourcePlane, volume, sourceRotation)
  if (!sourceReformat) return null

  const [row, col] = point
  const [rowSpacing, colSpacing] = volume.spacing

  // Calculate position in patient coordinates
  const patientPos: [number, number, number] = [
    volume.origin[0] +
      row * rowSpacing * sourceReformat.rowCosines[0] +
      col * colSpacing * sourceReformat.columnCosines[0],
    volume.origin[1] +
      row * rowSpacing * sourceReformat.rowCosines[1] +
      col * colSpacing * sourceReformat.columnCosines[1],
    volume.origin[2] +
      row * rowSpacing * sourceReformat.rowCosines[2] +
      col * colSpacing * sourceReformat.columnCosines[2],
  ]

  // Convert to target plane pixel coordinates
  const targetReformat = getReformatPlane(targetPlane, volume, targetRotation)
  if (!targetReformat) return null

  // Project patient position onto target plane
  const relativePos: [number, number, number] = [
    patientPos[0] - volume.origin[0],
    patientPos[1] - volume.origin[1],
    patientPos[2] - volume.origin[2],
  ]

  // Calculate dot products with row/column cosines
  const targetRow =
    (relativePos[0] * targetReformat.rowCosines[0] +
      relativePos[1] * targetReformat.rowCosines[1] +
      relativePos[2] * targetReformat.rowCosines[2]) /
    volume.spacing[0]

  const targetCol =
    (relativePos[0] * targetReformat.columnCosines[0] +
      relativePos[1] * targetReformat.columnCosines[1] +
      relativePos[2] * targetReformat.columnCosines[2]) /
    volume.spacing[1]

  return [targetRow, targetCol]
}

/**
 * Calculate cross-reference lines for all planes
 * Returns lines to draw on each viewport showing the position of other planes
 */
export function calculateCrossReferenceLines(
  currentPlane: Plane,
  volume: VolumeData,
  rotations: Record<Plane, ObliqueRotation>,
  crossReferencePoint?: [number, number] | null
): CrossReferenceLine[] {
  const lines: CrossReferenceLine[] = []

  if (!crossReferencePoint) return lines

  // Calculate cross-reference point in other planes
  const otherPlanes: Plane[] = ['axial', 'coronal', 'sagittal'].filter((p) => p !== currentPlane) as Plane[]

  for (const otherPlane of otherPlanes) {
    const targetReformat = getReformatPlane(otherPlane, volume, rotations[otherPlane])
    if (!targetReformat) continue

    // Calculate where the cross-reference point appears in this plane
    const currentReformat = getReformatPlane(currentPlane, volume, rotations[currentPlane])
    if (!currentReformat) continue

    const [row, col] = crossReferencePoint
    const [rowSpacing, colSpacing] = volume.spacing

    // Convert to patient coordinates
    const patientPos: [number, number, number] = [
      volume.origin[0] +
        row * rowSpacing * currentReformat.rowCosines[0] +
        col * colSpacing * currentReformat.columnCosines[0],
      volume.origin[1] +
        row * rowSpacing * currentReformat.rowCosines[1] +
        col * colSpacing * currentReformat.columnCosines[1],
      volume.origin[2] +
        row * rowSpacing * currentReformat.rowCosines[2] +
        col * colSpacing * currentReformat.columnCosines[2],
    ]

    // Project onto other plane
    const relativePos: [number, number, number] = [
      patientPos[0] - volume.origin[0],
      patientPos[1] - volume.origin[1],
      patientPos[2] - volume.origin[2],
    ]

    const otherRow =
      (relativePos[0] * targetReformat.rowCosines[0] +
        relativePos[1] * targetReformat.rowCosines[1] +
        relativePos[2] * targetReformat.rowCosines[2]) /
      rowSpacing

    const otherCol =
      (relativePos[0] * targetReformat.columnCosines[0] +
        relativePos[1] * targetReformat.columnCosines[1] +
        relativePos[2] * targetReformat.columnCosines[2]) /
      colSpacing

    // Determine line type and color based on plane combination
    let lineType: 'horizontal' | 'vertical' | 'diagonal' = 'horizontal'
    let color: 'green' | 'red' | 'yellow' | 'blue' = 'green'
    let start: [number, number] | undefined
    let end: [number, number] | undefined

    // Düşey = sarı, yatay = yeşil (horizontal = green, vertical = yellow)
    if (currentPlane === 'axial') {
      if (otherPlane === 'coronal') {
        lineType = 'horizontal'
        color = 'green'
      } else if (otherPlane === 'sagittal') {
        lineType = 'vertical'
        color = 'yellow'
      }
    } else if (currentPlane === 'coronal') {
      if (otherPlane === 'axial') {
        lineType = 'horizontal'
        color = 'green'
      } else if (otherPlane === 'sagittal') {
        color = 'yellow' // vertical or diagonal for sagittal
        const sagittalRotation = rotations.sagittal
        if (sagittalRotation.pitch !== 0 || sagittalRotation.yaw !== 0 || sagittalRotation.roll !== 0) {
          lineType = 'diagonal'
          const width = volume.dimensions[0]
          const height = volume.dimensions[1]
          const angle = Math.atan2(sagittalRotation.yaw, sagittalRotation.pitch) * (180 / Math.PI)
          const rad = (angle * Math.PI) / 180
          start = [otherCol - Math.cos(rad) * width * 0.5, otherRow - Math.sin(rad) * height * 0.5]
          end = [otherCol + Math.cos(rad) * width * 0.5, otherRow + Math.sin(rad) * height * 0.5]
        } else {
          lineType = 'vertical'
        }
      }
    } else if (currentPlane === 'sagittal') {
      if (otherPlane === 'axial') {
        lineType = 'vertical'
        color = 'yellow'
      } else if (otherPlane === 'coronal') {
        color = 'green' // horizontal or diagonal for coronal
        const coronalRotation = rotations.coronal
        if (coronalRotation.pitch !== 0 || coronalRotation.yaw !== 0 || coronalRotation.roll !== 0) {
          lineType = 'diagonal'
          const width = volume.dimensions[0]
          const height = volume.dimensions[1]
          const angle = Math.atan2(coronalRotation.pitch, coronalRotation.yaw) * (180 / Math.PI)
          const rad = (angle * Math.PI) / 180
          start = [otherCol - Math.cos(rad) * width * 0.5, otherRow - Math.sin(rad) * height * 0.5]
          end = [otherCol + Math.cos(rad) * width * 0.5, otherRow + Math.sin(rad) * height * 0.5]
        } else {
          lineType = 'horizontal'
        }
      }
    }

    lines.push({
      type: lineType,
      color,
      position: [otherCol, otherRow],
      targetPlane: otherPlane,
      start,
      end,
    })
  }

  return lines
}

/**
 * Calculate which slice index corresponds to a given position in a plane
 * This is used for spatial alignment - when cross-reference point changes,
 * we need to find the corresponding slice in other planes
 */
export function calculateSliceIndexForPosition(
  position: [number, number], // [row, col] in plane coordinates
  plane: Plane,
  volume: VolumeData,
  rotation?: ObliqueRotation
): number {
  if (!volume) return 0

  const reformat = getReformatPlane(plane, volume, rotation)
  if (!reformat) return 0

  const [row, col] = position
  const [rowSpacing, colSpacing] = volume.spacing

  // Calculate position in patient coordinates
  const patientPos: [number, number, number] = [
    volume.origin[0] +
      row * rowSpacing * reformat.rowCosines[0] +
      col * colSpacing * reformat.columnCosines[0],
    volume.origin[1] +
      row * rowSpacing * reformat.rowCosines[1] +
      col * colSpacing * reformat.columnCosines[1],
    volume.origin[2] +
      row * rowSpacing * reformat.rowCosines[2] +
      col * colSpacing * reformat.columnCosines[2],
  ]

  // Project onto normal direction to find slice index
  const relativePos: [number, number, number] = [
    patientPos[0] - volume.origin[0],
    patientPos[1] - volume.origin[1],
    patientPos[2] - volume.origin[2],
  ]

  // Calculate distance along normal direction
  const distanceAlongNormal =
    relativePos[0] * reformat.normalCosines[0] +
    relativePos[1] * reformat.normalCosines[1] +
    relativePos[2] * reformat.normalCosines[2]

  // Convert to slice index
  const sliceSpacing = volume.spacing[2]
  const sliceIndex = Math.round(distanceAlongNormal / sliceSpacing)

  return Math.max(0, Math.min(volume.dimensions[2] - 1, sliceIndex))
}

/**
 * Check if a series is suitable for MPR (has required metadata)
 */
export function isMPRCompatible(images: DicomImage[]): boolean {
  if (images.length < 2) return false

  const validCount = images.filter(
    (img) =>
      img.imagePositionPatient &&
      img.imageOrientationPatient &&
      img.pixelSpacing &&
      img.metadata
  ).length

  // At least 80% of images should have required metadata
  return validCount >= images.length * 0.8
}

/**
 * Reformat volume along a plane with rotation and slab thickness
 * Returns a Canvas ImageData for the reformatted slice
 */
export async function reformatVolumeSlice(
  volume: VolumeData,
  plane: Plane,
  sliceIndex: number,
  rotation: ObliqueRotation,
  slabThicknessMm: number,
  outputWidth: number,
  outputHeight: number,
  loadImagePixelData: (imageId: string) => Promise<ImageData | null>
): Promise<ImageData | null> {
  if (!volume || sliceIndex < 0 || sliceIndex >= volume.dimensions[2]) return null

  const reformatPlane = getReformatPlane(plane, volume, rotation)
  if (!reformatPlane) return null

  // Calculate plane position in patient coordinates
  const sliceSpacing = volume.spacing[2]
  const distanceAlongNormal = sliceIndex * sliceSpacing
  const planeOrigin: [number, number, number] = [
    volume.origin[0] + distanceAlongNormal * reformatPlane.normalCosines[0],
    volume.origin[1] + distanceAlongNormal * reformatPlane.normalCosines[1],
    volume.origin[2] + distanceAlongNormal * reformatPlane.normalCosines[2],
  ]

  // Slab thickness in number of slices
  const slabThicknessSlices = Math.max(1, Math.ceil(slabThicknessMm / sliceSpacing))
  const halfSlab = Math.floor(slabThicknessSlices / 2)
  const startSlice = Math.max(0, sliceIndex - halfSlab)
  const endSlice = Math.min(volume.dimensions[2] - 1, sliceIndex + halfSlab)

  // Create output image
  const outputData = new Uint8ClampedArray(outputWidth * outputHeight * 4)
  const outputImageData = new ImageData(outputData, outputWidth, outputHeight)

  // Sample volume along the reformat plane
  const [rowSpacing, colSpacing] = volume.spacing
  const rowStep = rowSpacing
  const colStep = colSpacing

  // For each output pixel, sample from volume
  for (let outRow = 0; outRow < outputHeight; outRow++) {
    for (let outCol = 0; outCol < outputWidth; outCol++) {
      // Convert output pixel to patient coordinates
      const rowOffset = (outRow - outputHeight / 2) * rowStep
      const colOffset = (outCol - outputWidth / 2) * colStep

      const patientPos: [number, number, number] = [
        planeOrigin[0] +
          rowOffset * reformatPlane.rowCosines[0] +
          colOffset * reformatPlane.columnCosines[0],
        planeOrigin[1] +
          rowOffset * reformatPlane.rowCosines[1] +
          colOffset * reformatPlane.columnCosines[1],
        planeOrigin[2] +
          rowOffset * reformatPlane.rowCosines[2] +
          colOffset * reformatPlane.columnCosines[2],
      ]

      // Sample along slab thickness (MIP - Maximum Intensity Projection)
      let maxIntensity = 0
      const sampleCount = endSlice - startSlice + 1

      for (let s = startSlice; s <= endSlice; s++) {
        const sliceImage = volume.images[s]
        if (!sliceImage) continue

        // Project patient position onto original slice
        const relativePos: [number, number, number] = [
          patientPos[0] - volume.origin[0],
          patientPos[1] - volume.origin[1],
          patientPos[2] - volume.origin[2],
        ]

        // Calculate pixel coordinates in original slice
        const sliceRow =
          (relativePos[0] * volume.rowCosines[0] +
            relativePos[1] * volume.rowCosines[1] +
            relativePos[2] * volume.rowCosines[2]) /
          rowSpacing

        const sliceCol =
          (relativePos[0] * volume.columnCosines[0] +
            relativePos[1] * volume.columnCosines[1] +
            relativePos[2] * volume.columnCosines[2]) /
          colSpacing

        // Sample pixel (nearest neighbor for now)
        const imgRow = Math.round(sliceRow)
        const imgCol = Math.round(sliceCol)

        if (imgRow >= 0 && imgRow < volume.dimensions[1] && imgCol >= 0 && imgCol < volume.dimensions[0]) {
          // Load pixel data if not already loaded
          // For now, use a simple approach: load image and sample
          // In production, you'd cache pixel data
          try {
            const pixelData = await loadImagePixelData(sliceImage.imageId)
            if (pixelData) {
              const pixelIdx = imgRow * volume.dimensions[0] + imgCol
              if (pixelIdx < pixelData.data.length / 4) {
                const intensity = pixelData.data[pixelIdx * 4] // grayscale
                maxIntensity = Math.max(maxIntensity, intensity)
              }
            }
          } catch {
            // Skip if can't load
          }
        }
      }

      // Write to output
      const outIdx = (outRow * outputWidth + outCol) * 4
      outputImageData.data[outIdx] = maxIntensity // R
      outputImageData.data[outIdx + 1] = maxIntensity // G
      outputImageData.data[outIdx + 2] = maxIntensity // B
      outputImageData.data[outIdx + 3] = 255 // A
    }
  }

  return outputImageData
}
