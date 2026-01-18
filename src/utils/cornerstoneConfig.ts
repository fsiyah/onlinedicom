// Cornerstone configuration
// This file is imported early to configure cornerstone before use

try {
  // Lazy load cornerstone to avoid blocking initial render
  if (typeof window !== 'undefined') {
    import('cornerstone-core').then((cornerstone) => {
      import('cornerstone-wado-image-loader').then((cornerstoneWADOImageLoader) => {
        import('dicom-parser').then((dicomParser) => {
          // Configure WADO Image Loader
          cornerstoneWADOImageLoader.external.cornerstone = cornerstone
          cornerstoneWADOImageLoader.external.dicomParser = dicomParser

          // Configure codec paths
          const codecPath = 'https://cdn.jsdelivr.net/npm/cornerstone-wado-image-loader/dist/'
          cornerstoneWADOImageLoader.webWorkerManager.initialize({
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
        })
      })
    })
  }
} catch (error) {
  console.warn('Cornerstone configuration error:', error)
}
