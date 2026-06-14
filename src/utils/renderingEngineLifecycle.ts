import { releaseCachedVolume } from './volumeUtils'
import { resetMprToolGroupState } from './cornerstoneToolsConfig'

export const MPR_RENDERING_ENGINE_ID = 'mpr-rendering-engine'
export const VOLUME_3D_RENDERING_ENGINE_ID = 'volume-3d-rendering-engine'
export const VOLUME_3D_TOOL_GROUP_ID = 'volume-3d-tool-group'

let tools3DInitPromise: Promise<any> | null = null

export function get3DToolGroupInitPromise(): Promise<any> | null {
  return tools3DInitPromise
}

export function set3DToolGroupInitPromise(promise: Promise<any> | null): void {
  tools3DInitPromise = promise
}

export async function destroyRenderingEngineById(engineId: string): Promise<void> {
  const { getRenderingEngine } = await import('@cornerstonejs/core')
  const renderingEngine = getRenderingEngine(engineId)

  if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
    return
  }

  try {
    renderingEngine.destroy()
  } catch (error) {
    console.warn(`Failed to destroy rendering engine ${engineId}:`, error)
  }
}

export async function reset3DToolGroupState(): Promise<void> {
  tools3DInitPromise = null

  try {
    const { ToolGroupManager } = await import('@cornerstonejs/tools')
    ToolGroupManager.destroyToolGroup(VOLUME_3D_TOOL_GROUP_ID)
  } catch {
    // Ignore cleanup errors when the tool group was never created.
  }
}

export async function destroy3DRenderingSession(volumeId?: string): Promise<void> {
  await destroyRenderingEngineById(VOLUME_3D_RENDERING_ENGINE_ID)
  await reset3DToolGroupState()

  if (volumeId) {
    await releaseCachedVolume(volumeId)
  }
}

export async function destroyMprRenderingSession(volumeId?: string): Promise<void> {
  await destroyRenderingEngineById(MPR_RENDERING_ENGINE_ID)
  await resetMprToolGroupState()

  if (volumeId) {
    await releaseCachedVolume(volumeId)
  }
}

export async function prepareVolumeRenderingSession(options: {
  mode: 'MPR' | '3D'
  volumeId: string
}): Promise<void> {
  if (options.mode === 'MPR') {
    await destroy3DRenderingSession(options.volumeId)
    return
  }

  await destroyMprRenderingSession(options.volumeId)
}

export async function getOrCreateRenderingEngine(engineId: string): Promise<any> {
  const { RenderingEngine, getRenderingEngine } = await import('@cornerstonejs/core')
  const existingEngine = getRenderingEngine(engineId)

  if (existingEngine && !existingEngine.hasBeenDestroyed) {
    return existingEngine
  }

  return new RenderingEngine(engineId)
}
