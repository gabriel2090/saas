import type { ApiPreload } from '../shared/ipc/contrato';

declare global {
  /**
   * Ventana del navegador con la API segura que expone el preload.
   */
  interface Window {
    /** API del preload (`contextBridge`). */
    api: ApiPreload;
  }
}

export {};
