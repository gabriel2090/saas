# Arquitectura

## Capas

La aplicación es una sola ventana de Electron. Las capas se comunican solo en el sentido de las flechas; ninguna se salta otra.

```mermaid
flowchart LR
  subgraph Renderer["Renderer (React, sin Node)"]
    UI[pantallas y ventanas internas]
    AT[motor de atajos + keymap]
  end
  subgraph Preload["Preload (contextBridge)"]
    API["window.api.invocar(canal, petición)"]
  end
  subgraph Main["Proceso principal"]
    IPC[manejadores IPC]
    SRV[servicios: autenticación, respaldos]
  end
  subgraph Data["src/data"]
    TX[ejecutor de transacciones]
    REP[repositorios]
    MIG[migrador + migraciones SQL]
  end
  DOM["src/domain (reglas puras)"]
  DB[(SQLite WAL)]
  UI --> API --> IPC --> SRV --> TX --> REP --> DB
  SRV --> DOM
  TX --> DOM
  MIG --> DB
```

- **`src/domain/`**: reglas de negocio puras, sin Electron ni base de datos. Es lo más probado.
- **`src/data/`**: SQLite con `better-sqlite3` (síncrono). Toda escritura pasa por el **ejecutor de transacciones**, que abre una transacción `IMMEDIATE`, registra el historial de cambios en la misma transacción y, al confirmar, programa el respaldo.
- **`src/main/`**: arranque, ventana segura (`contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP, sin navegación ni ventanas emergentes), IPC y servicios.
- **`src/preload/`**: expone solo `window.api` con una lista blanca de canales.
- **`src/shared/`**: contrato IPC tipado, `keymap`, catálogo de procesos y formatos. Lo usan todas las capas.
- **`src/renderer/`**: interfaz React.

## Contrato IPC

Los canales se declaran una sola vez en `src/shared/ipc/contrato.ts` (`ContratoIpc`). Cada respuesta es un `Resultado<T>`:

- `{ ok: true, datos }` si la operación salió bien.
- `{ ok: false, error: { codigo, mensaje } }` si falló. Los `ErrorDeNegocio` llevan su mensaje en español para el usuario; cualquier otro error se registra en `logs/sistema.log` y el usuario ve un mensaje genérico.

Los canales que modifican datos exigen sesión iniciada (contraseña ingresada).

## Flujo de una escritura

```mermaid
sequenceDiagram
  participant R as Renderer
  participant M as Main (IPC)
  participant S as Servicio
  participant T as Ejecutor de transacciones
  participant B as SQLite
  participant C as Respaldos
  R->>M: invocar('autenticacion:cambiar', {...})
  M->>S: cambiar(actual, nueva)
  S->>T: ejecutar(ctx => ...)
  T->>B: BEGIN IMMEDIATE
  S->>B: UPSERT configuracion
  S->>B: INSERT historial_cambios (mismo ctx)
  T->>B: COMMIT
  T->>C: programar() (debounce 3 s)
  C->>B: VACUUM INTO respaldo-AAAAMMDD-HHMMSS-mmm.db
  M-->>R: { ok: true }
```

Si algo falla antes del `COMMIT`, se revierte todo: ni el cambio ni su historial quedan guardados, y no se programa respaldo.

## Interfaz: ventanas internas y atajos

- **Gestor de ventanas** (`renderer/ventanas/gestor.ts`): reductor puro. El orden del arreglo es el orden de apilado; la última ventana es la activa. Un proceso abre una sola ventana (D-04).
- **Motor de atajos** (`renderer/atajos/`): un único escuchador de teclado en fase de captura despacha cada combinación a **capas** con prioridad `modal` > `ventana` > `global`. Una capa modal (diálogo, buscador) bloquea las de abajo. Un manejador puede devolver `false` para «no lo manejé» y dejar pasar la tecla (así Esc «retrocede»: primero la ventana, luego el cierre global).
- Las combinaciones reservadas por Chromium (Ctrl+P, Ctrl+D, Ctrl+0, zoom, recarga…) se interceptan siempre. Además, la app no tiene menú de aplicación y el zoom se fija al 100 %.

## Modelo de datos (Fase 0)

La Fase 0 crea solo la infraestructura. Las tablas de negocio llegan con migraciones nuevas en cada fase (`0002_maestros` en la Fase 1, y así).

```mermaid
erDiagram
  schema_migraciones {
    INTEGER version PK
    TEXT nombre
    TEXT checksum "SHA-256 del SQL"
    TEXT aplicada_en
  }
  configuracion {
    TEXT clave PK
    TEXT valor "JSON"
    TEXT actualizado_en
  }
  consecutivos {
    TEXT clave PK "producto, cliente, proveedor..."
    INTEGER siguiente
  }
  historial_cambios {
    INTEGER id PK
    TEXT fecha "ISO 8601 con desfase"
    TEXT entidad
    TEXT entidad_id
    TEXT accion "crear, editar, anular, inactivar, reactivar, sistema"
    TEXT antes "JSON"
    TEXT despues "JSON"
    TEXT motivo
  }
```

- `historial_cambios` es de solo inserción (triggers que abortan `UPDATE` y `DELETE`).
- `consecutivos` arranca en 101 (productos) y 10001 (clientes y proveedores).
- Todas las tablas son `STRICT`.

## Arranque

1. Bloqueo de instancia única (dos procesos sobre la misma base causarían bloqueos).
2. Log en `logs/sistema.log`.
3. Apertura de la base y `PRAGMA integrity_check`; si falla, la app no continúa (D-18).
4. Si la base ya existía, copia previa (D-19); luego se aplican las migraciones pendientes, verificando que las ya aplicadas no hayan cambiado.
5. Servicios, IPC y ventana.
6. Al salir: se hace la copia pendiente y se cierra la base.
