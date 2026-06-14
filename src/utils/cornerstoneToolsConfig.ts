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
  try {
    const csTools = await import('@cornerstonejs/tools')
    const {
      init: initCsTools,
      addTool,
      CrosshairsTool,
      WindowLevelTool,
      PanTool,
      ZoomTool,
      StackScrollTool,
      ToolGroupManager,
      Enums: ToolEnums,
    } = csTools

    // Initialize cornerstone tools (only once)
    if (!toolsInitialized) {
      await initCsTools()

      // Add tools globally (only once, wrapped in try-catch)
      const toolsToAdd = [
        CrosshairsTool,
        WindowLevelTool,
        PanTool,
        ZoomTool,
        StackScrollTool,
      ]

      for (const tool of toolsToAdd) {
        try {
          addTool(tool)
        } catch (e: any) {
          // Tool already added - this is fine
          if (!e.message?.includes('already been added')) {
            console.warn(`Failed to add tool ${tool.toolName}:`, e)
          }
        }
      }
    }

    // Create or get tool group
    let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID)
    if (!toolGroup) {
      toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID)

      if (toolGroup) {
        // Add tools to group with CrosshairsTool configuration
        toolGroup.addTool(CrosshairsTool.toolName, {
          getReferenceLineColor: (viewportId: string) => {
            if (viewportId.includes('axial')) return 'rgb(200, 0, 0)'
            if (viewportId.includes('coronal')) return 'rgb(0, 200, 0)'
            if (viewportId.includes('sagittal')) return 'rgb(0, 0, 200)'
            return 'rgb(200, 200, 0)'
          },
          getReferenceLineControllable: () => true,
          getReferenceLineDraggableRotatable: () => true,
          getReferenceLineSlabThicknessControlsOn: () => true,
        })

        toolGroup.addTool(WindowLevelTool.toolName)
        toolGroup.addTool(PanTool.toolName)
        toolGroup.addTool(ZoomTool.toolName)
        toolGroup.addTool(StackScrollTool.toolName)

        // Set tool bindings - but DON'T activate crosshairs yet
        // Window/Level on right mouse button
        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
        })

        // Pan on middle mouse button
        toolGroup.setToolActive(PanTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }],
        })

        // Zoom with Ctrl+left click
        toolGroup.setToolActive(ZoomTool.toolName, {
          bindings: [
            {
              mouseButton: ToolEnums.MouseBindings.Primary,
              modifierKey: ToolEnums.KeyboardBindings.Ctrl,
            },
          ],
        })

        // Stack scroll on mouse wheel - MUST include Wheel binding in Cornerstone3D v2+
        // Note: This works for stack viewports. For volume/orthographic viewports (MPR),
        // we use a custom wheel handler with viewport.scroll() in MPRViewerPanel
        toolGroup.setToolActive(StackScrollTool.toolName, {
          bindings: [{ mouseButton: (ToolEnums.MouseBindings as any).Wheel }],
        })
      }
    }

    toolGroupInstance = toolGroup
    toolsInitialized = true
    console.log('Cornerstone3D tools initialized successfully')
    return toolGroup
  } catch (error) {
    console.error('Failed to initialize Cornerstone3D tools:', error)
    throw error
  }
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
  if (!toolGroupInstance) {
    console.warn('Tool group not initialized')
    return
  }

  try {
    const csTools = await import('@cornerstonejs/tools')
    const { CrosshairsTool, Enums: ToolEnums } = csTools

    // Use our manual tracking for viewport count
    const viewportCount = registeredViewports.size
    console.log(`Activating CrosshairsTool with ${viewportCount} viewports (tracked)`)

    if (viewportCount >= 2) {
      toolGroupInstance.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
      })
      console.log('CrosshairsTool activated successfully')
    } else {
      console.warn('CrosshairsTool requires at least 2 viewports, currently have:', viewportCount)
    }
  } catch (error) {
    console.error('Failed to activate CrosshairsTool:', error)
  }
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

  try {
    const csTools = await import('@cornerstonejs/tools')
    csTools.ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID)
  } catch {
    // Ignore cleanup errors when the tool group was never created.
  }

  toolGroupInstance = null
  toolsInitialized = false
  initPromise = null
}
