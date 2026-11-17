import {
  AcApDocManager,
  AcApSettingManager,
  LIBREDWG_PARSER_WORKER_FILE,
  MTEXT_RENDERER_WORKER_FILE,
  type AcApOpenDatabaseOptions,
} from '@mlightcad/cad-simple-viewer'
import { disableMlightBuiltInNavigation } from './mlightCadCamera'
import { AcDbDatabaseConverterManager, AcDbFileType } from '@mlightcad/data-model'
import { AcDbLibreDwgConverter } from '@mlightcad/libredwg-converter'

const CAD_DATA_BASE_URL = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/'
const VIEWER_BG_RGB = 0x1a1a1a

let dwgConverterRegistered = false
/** Bumped on each create call so stale async inits (React StrictMode) cannot tear down a newer viewer. */
let createGeneration = 0
let createChain: Promise<unknown> = Promise.resolve()
let embedUiConfigured = false

function configureMlightEmbedUi(): void {
  if (embedUiConfigured) return
  AcApSettingManager.configure({ storageKey: 'guland.mlightcad.viewer' })
  AcApSettingManager.instance.apply(
    {
      isShowCommandLine: false,
      isShowRibbon: false,
      isShowToolbar: false,
      isShowShortCutToolbar: false,
      isShowStats: false,
      isShowCoordinate: false,
      isShowEntityInfo: false,
      isShowLanguageSelector: false,
    },
    { persist: false },
  )
  embedUiConfigured = true
}

export class MlightCadStaleInitError extends Error {
  constructor() {
    super('Stale CAD viewer init')
    this.name = 'MlightCadStaleInitError'
  }
}

function assertCreateGeneration(token: number): void {
  if (token !== createGeneration) {
    throw new MlightCadStaleInitError()
  }
}

function workersBaseUrl(): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${base}workers/`
}

function findReusableManager(container: HTMLElement): AcApDocManager | null {
  const manager = AcApDocManager.tryGetInstance()
  if (!manager) return null
  const canvas = manager.curView?.canvas
  if (!canvas) return null
  if (!container.contains(canvas)) return null
  return manager
}

function applyViewerChrome(manager: AcApDocManager): void {
  const view = manager.curView
  if (!view) return
  view.backgroundColor = VIEWER_BG_RGB
  disableMlightBuiltInNavigation(view)
}

export function registerMlightDwgConverter(): void {
  if (dwgConverterRegistered) return
  const dwgParserUrl = `${workersBaseUrl()}${LIBREDWG_PARSER_WORKER_FILE}`
  AcDbDatabaseConverterManager.instance.register(
    AcDbFileType.DWG,
    new AcDbLibreDwgConverter({
      convertByEntityType: false,
      useWorker: true,
      parserWorkerUrl: dwgParserUrl,
    }),
  )
  dwgConverterRegistered = true
}

async function createMlightDocManagerUnchecked(container: HTMLElement): Promise<AcApDocManager> {
  const token = ++createGeneration
  configureMlightEmbedUi()
  registerMlightDwgConverter()

  const reused = findReusableManager(container)
  if (reused) {
    applyViewerChrome(reused)
    return reused
  }

  const workerUrls = {
    dwgParser: `${workersBaseUrl()}${LIBREDWG_PARSER_WORKER_FILE}`,
    mtextRender: `${workersBaseUrl()}${MTEXT_RENDERER_WORKER_FILE}`,
  }

  const workersReady = await AcApDocManager.checkWebworkerReadiness(workerUrls)
  assertCreateGeneration(token)
  if (!workersReady) {
    throw new Error(
      'Không tìm thấy worker CAD (public/workers). Chạy lại npm install hoặc npm run postinstall.',
    )
  }

  assertCreateGeneration(token)
  const existing = AcApDocManager.tryGetInstance()
  if (existing) {
    await existing.destroy()
  }
  assertCreateGeneration(token)

  const manager = AcApDocManager.createInstance({
    container,
    autoResize: true,
    baseUrl: CAD_DATA_BASE_URL,
    webworkerFileUrls: workerUrls,
    checkWorkersOnInit: true,
  })
  if (!manager) {
    throw new Error('Không khởi tạo được AcApDocManager.')
  }
  if (token !== createGeneration) {
    const live = AcApDocManager.tryGetInstance()
    if (live === manager) {
      await manager.destroy()
    }
    throw new MlightCadStaleInitError()
  }

  applyViewerChrome(manager)
  return manager
}

/** Serializes viewer boot so StrictMode cleanups cannot interleave destroy/create. */
export function createMlightDocManager(container: HTMLElement): Promise<AcApDocManager> {
  const queued = createChain.then(
    () => createMlightDocManagerUnchecked(container),
    () => createMlightDocManagerUnchecked(container),
  )
  createChain = queued.then(
    () => undefined,
    () => undefined,
  )
  return queued
}

export const defaultMlightOpenOptions: AcApOpenDatabaseOptions = {
  progressiveRendering: true,
}