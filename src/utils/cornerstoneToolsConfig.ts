/**
 * Cornerstone3D Tools Configuration
 * Centralized tool initialization to avoid duplicate registration
 */

let toolsInitialized = false
let toolGroupInstance: any = null
let initPromise: Promise<any> | null = null

// Track registered viewports manually to handle StrictMode re-renders
const registeredViewports = new Set<string>()

const TOOL_GROUP_ID = 'mpr-tool-group'
const RENDERING_ENGINE_ID = 'mpr-rendering-engine'

/**
 * Initialize Cornerstone3D tools (singleton pattern)
 * This should only be called once, subsequent calls return the same instance
 */
export async function initializeCornerstoneTools(): Promise<any> {
  // Return existing tool group if already initialized
  if (toolsInitialized && toolGroupInstance) {
    return toolGroupInstance
  }

  // Return existing promise if initialization is in progress (mutex)
  if (initPromise) {
    return initPromise
  }

  initPromise = doToolsInitialization()
  
  try {
    const result = await initPromise
    return result
  } catch (error) {
    // Reset promise on error so we can retry
    initPromise = null
    throw error
  }
}

/**
 * Internal initialization function
 */
async function doToolsInitialization(): Promise<any> {
  toolsInitialized = true
  toolGroupInstance = null
  console.warn('Cornerstone3D tools are disabled in production to avoid module initialization errors.')
  return null
}

/**
 * Add a viewport to the tool group
 */
export function addViewportToToolGroup(viewportId: string): void {
  if (!toolGroupInstance) {
    console.warn('Tool group not initialized yet')
    return
  }

  try {
    // Track viewport in our own set
    registeredViewports.add(viewportId)
    
    // Also add to tool group if not already there
    const viewportIds = toolGroupInstance.getViewportIds?.() || []
    if (!viewportIds.includes(viewportId)) {
      toolGroupInstance.addViewport(viewportId, RENDERING_ENGINE_ID)
      console.log(`Added viewport ${viewportId} to tool group (total: ${registeredViewports.size})`)
    }
  } catch (error) {
    console.error(`Failed to add viewport ${viewportId} to tool group:`, error)
  }
}

/**
 * Remove a viewport from the tool group (for cleanup)
 */
export function removeViewportFromToolGroup(viewportId: string): void {
  registeredViewports.delete(viewportId)
  
  if (!toolGroupInstance) return

  try {
    const viewportIds = toolGroupInstance.getViewportIds?.() || []
    if (viewportIds.includes(viewportId)) {
      toolGroupInstance.removeViewports(RENDERING_ENGINE_ID, [viewportId])
      console.log(`Removed viewport ${viewportId} from tool group`)
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
}

/**
 * Get the number of registered viewports
 */
export function getRegisteredViewportCount(): number {
  return registeredViewports.size
}

/**
 * Activate CrosshairsTool after all viewports are added
 * This should only be called once all viewports are registered
 */
export async function activateCrosshairsTool(): Promise<void> {
  console.warn('CrosshairsTool is disabled in production.')
}

/**
 * Get the tool group ID
 */
export function getToolGroupId(): string {
  return TOOL_GROUP_ID
}

/**
 * Get the rendering engine ID
 */
export function getRenderingEngineId(): string {
  return RENDERING_ENGINE_ID
}

/**
 * Get the current tool group instance
 */
export function getToolGroup(): any {
  return toolGroupInstance
}

/**
 * Fully reset the MPR tool group so a fresh session can be created after
 * switching away from MPR or destroying its rendering engine.
 */
export async function resetMprToolGroupState(): Promise<void> {
  registeredViewports.clear()
  toolGroupInstance = null
  toolsInitialized = false
  initPromise = null
}
