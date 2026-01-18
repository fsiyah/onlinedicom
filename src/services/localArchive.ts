// Local Archive Service - Stores DICOM studies in browser's IndexedDB

const DB_NAME = 'RadiantCloneDB'
const DB_VERSION = 1
const STORE_NAME = 'studies'

export interface ArchiveStudy {
  id: string
  patientId?: string
  patientName?: string
  studyDate?: string
  studyTime?: string
  studyDescription?: string
  series: ArchiveSeries[]
  importedAt: number
}

export interface ArchiveSeries {
  id: string
  seriesNumber: number
  seriesDescription?: string
  modality?: string
  images: ArchiveImage[]
  studyId: string
}

export interface ArchiveImage {
  id: string
  instanceNumber?: number
  imageData: ArrayBuffer
  metadata: any
}

class LocalArchiveService {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'))
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          objectStore.createIndex('patientId', 'patientId', { unique: false })
          objectStore.createIndex('studyDate', 'studyDate', { unique: false })
          objectStore.createIndex('importedAt', 'importedAt', { unique: false })
        }
      }
    })
  }

  async saveStudy(study: ArchiveStudy): Promise<void> {
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(study)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('Failed to save study'))
    })
  }

  async getAllStudies(): Promise<ArchiveStudy[]> {
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result || [])
      }
      request.onerror = () => {
        reject(new Error('Failed to retrieve studies'))
      }
    })
  }

  async getStudy(studyId: string): Promise<ArchiveStudy | null> {
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(studyId)

      request.onsuccess = () => {
        resolve(request.result || null)
      }
      request.onerror = () => {
        reject(new Error('Failed to retrieve study'))
      }
    })
  }

  async deleteStudy(studyId: string): Promise<void> {
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(studyId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('Failed to delete study'))
    })
  }

  async searchStudies(query: {
    patientId?: string
    patientName?: string
    studyDate?: string
  }): Promise<ArchiveStudy[]> {
    const allStudies = await this.getAllStudies()
    
    return allStudies.filter((study) => {
      if (query.patientId && study.patientId !== query.patientId) {
        return false
      }
      if (query.patientName && !study.patientName?.toLowerCase().includes(query.patientName.toLowerCase())) {
        return false
      }
      if (query.studyDate && study.studyDate !== query.studyDate) {
        return false
      }
      return true
    })
  }

  async clearArchive(): Promise<void> {
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('Failed to clear archive'))
    })
  }
}

export const localArchiveService = new LocalArchiveService()
