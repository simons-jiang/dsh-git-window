/**
 * Pick the platform implementation for this Host.
 *
 * Only macOS and Windows are supported. Following the plugin's rule elsewhere,
 * anything that is not macOS takes the Windows behaviour, so an unexpected
 * system still starts instead of failing to load.
 */
import { macPlatform } from './macos.js'
import { windowsPlatform } from './windows.js'

const IMPLEMENTATIONS = {
  mac: macPlatform,
  windows: windowsPlatform,
}

/**
 * @param os - `process.platform` value, or a short name (`macos`, `mac`, `windows`).
 * @returns the platform contract for that system.
 */
export function createPlatform(os) {
  const macOs = os === 'darwin' || os === 'macos' || os === 'mac'
  return macOs ? IMPLEMENTATIONS.mac : IMPLEMENTATIONS.windows
}

/** The running Host's platform. */
export const platform = createPlatform(process.platform)

export { macPlatform, windowsPlatform }
