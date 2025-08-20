/* ffmpeg.wasm worker wrapper (for @ffmpeg/core 0.12.x)
   The worker should load the core script in worker scope. */
try {
  // Load ffmpeg-core.js from the same directory
  self.importScripts('ffmpeg-core.js');
} catch (e) {
  // Surface error back to main thread if any
  self.postMessage({ type: 'ffmpeg-worker-error', message: String(e && e.message ? e.message : e) });
}