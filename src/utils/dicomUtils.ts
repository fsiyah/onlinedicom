import dicomParser from 'dicom-parser'

export interface DicomMetadata {
  patientId?: string
  patientName?: string
  patientBirthDate?: string
  patientSex?: string
  studyDate?: string
  studyTime?: string
  studyDescription?: string
  studyInstanceUID?: string
  seriesNumber?: number
  seriesDescription?: string
  seriesInstanceUID?: string
  instanceNumber?: number
  modality?: string
  sopInstanceUID?: string
  rows?: number
  columns?: number
  bitsAllocated?: number
  bitsStored?: number
  samplesPerPixel?: number
  photometricInterpretation?: string
  windowWidth?: number
  windowCenter?: number
  rescaleSlope?: number
  rescaleIntercept?: number
  [key: string]: any
}

export function parseDicomFile(file: File): Promise<DicomMetadata> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        const byteArray = new Uint8Array(arrayBuffer)
        const dataset = dicomParser.parseDicom(byteArray)
        
        const metadata: DicomMetadata = {
          patientId: dataset.string('x00100020'),
          patientName: dataset.string('x00100010'),
          patientBirthDate: dataset.string('x00100030'),
          patientSex: dataset.string('x00100040'),
          studyDate: dataset.string('x00080020'),
          studyTime: dataset.string('x00080030'),
          studyDescription: dataset.string('x00081030'),
          studyInstanceUID: dataset.string('x0020000d'),
          seriesNumber: dataset.intString('x00200011'),
          seriesDescription: dataset.string('x0008103e'),
          seriesInstanceUID: dataset.string('x0020000e'),
          instanceNumber: dataset.intString('x00200013'),
          modality: dataset.string('x00080060'),
          sopInstanceUID: dataset.string('x00080018'),
          rows: dataset.uint16('x00280010'),
          columns: dataset.uint16('x00280011'),
          bitsAllocated: dataset.uint16('x00280100'),
          bitsStored: dataset.uint16('x00280101'),
          samplesPerPixel: dataset.uint16('x00280002'),
          photometricInterpretation: dataset.string('x00280004'),
        }

        // Try to get window/level
        const windowWidthElement = dataset.elements.x00281051
        const windowCenterElement = dataset.elements.x00281050
        
        if (windowWidthElement && windowCenterElement) {
          metadata.windowWidth = dataset.floatString('x00281051')
          metadata.windowCenter = dataset.floatString('x00281050')
        }

        // Rescale slope/intercept
        metadata.rescaleSlope = dataset.floatString('x00281053') || 1
        metadata.rescaleIntercept = dataset.floatString('x00281052') || 0

        resolve(metadata)
      } catch (error) {
        reject(error)
      }
    }
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    
    reader.readAsArrayBuffer(file)
  })
}

export function formatPatientName(name?: string): string {
  if (!name) return 'Unknown'
  
  // DICOM name format: LAST^FIRST^MIDDLE^PREFIX^SUFFIX
  const parts = name.split('^')
  if (parts.length === 1) return name
  
  const [last, first, middle] = parts
  const nameParts = [first, middle, last].filter(Boolean)
  return nameParts.join(' ')
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  
  // DICOM date format: YYYYMMDD
  if (dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
  }
  
  return dateStr
}

export function formatTime(timeStr?: string): string {
  if (!timeStr) return ''
  
  // DICOM time format: HHMMSS.FFFFFF
  if (timeStr.length >= 6) {
    const hours = timeStr.slice(0, 2)
    const minutes = timeStr.slice(2, 4)
    const seconds = timeStr.slice(4, 6)
    return `${hours}:${minutes}:${seconds}`
  }
  
  return timeStr
}
