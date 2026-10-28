// Runs the in-browser AI model (WebLLM) off the main thread, so the 3D core stays smooth.
import { WebWorkerMLCEngineHandler } from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
self.postMessage({ kind: 'jarvis-worker-ready' }); // lets the page know the worker loaded
