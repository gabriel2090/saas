# Registro de decisiones y supuestos

Cada entrada indica su estado: **Confirmado** (aprobado por el cliente/desarrollador), **Supuesto** (en uso hasta que se confirme o se cambie) o **Pendiente** (requiere respuesta antes de la fase indicada).

## Supuestos de la especificación (§14)

| # | Decisión | Estado |
|---|----------|--------|
| S-01 | Los códigos de clientes y proveedores son autoincrementales, arrancan en **10001** y el inicio es configurable. | Supuesto |
| S-02 | Los datos obligatorios del cliente aplican al **registrarlo**; el «Consumidor final» no exige datos. | Supuesto |
| S-03 | El bloqueo por crédito aplica solo a clientes con tope asignado: se bloquea si la venta superaría el tope o si hay facturas vencidas. | Supuesto |
| S-04 | El flete se reparte proporcionalmente al valor de cada línea de la compra. | Supuesto |
| S-05 | El nombre impreso del documento es «FACTURA DE VENTA». | Supuesto |
| S-06 | El formato del archivo del sistema actual es desconocido; el importador usa mapeo de columnas. | Pendiente (Fase 1) |

## Decisiones propuestas para la Fase 0

| # | Decisión | Estado |
|---|----------|--------|
| D-01 | En el **primer arranque** (sin contraseña guardada) la app pide crear la contraseña única. No existe contraseña por defecto. | Confirmado |
| D-02 | Separador de miles: **coma** (`$ 1,250,000`), igual que la factura actual. Sin decimales. | Confirmado |
| D-03 | El archivo `keymap` es la **única fuente** de atajos. La clave «atajos» de `configuracion` queda reservada para una posible personalización futura. | Confirmado |
| D-04 | Cada proceso abre **una sola instancia** de ventana interna; si ya está abierta, se trae al frente. | Confirmado |
| D-05 | Los consecutivos se guardan en una tabla propia `consecutivos` (parte lógica de la configuración) para incrementarlos de forma atómica dentro de la transacción del documento. | Supuesto |
| D-06 | Las fechas se guardan en ISO 8601 **con desfase horario local** (p. ej. `2026-10-01T23:30:00-05:00`) para que el cierre de caja diario use el día local. | Supuesto |
| D-07 | Respaldos: copia con *debounce* de 3 s tras cada transacción confirmada. Se conservan las **últimas 20** copias, **una por hora de las últimas 48 horas** y **una diaria de los últimos 30 días** (la más reciente de cada hora/día). Carpeta por defecto: `<datos de la app>/respaldos`. | Confirmado |
| D-08 | SQLite con `journal_mode=WAL`, `synchronous=FULL` (prioriza durabilidad ante apagones) y `foreign_keys=ON`. | Supuesto |
| D-09 | `historial_cambios` es de solo inserción: triggers impiden `UPDATE` y `DELETE`. Los secretos (hash de contraseña) se registran como `"[OCULTO]"`. | Supuesto |
| D-10 | Las pruebas de integración con `better-sqlite3` se ejecutan con el binario de Electron en modo Node (`ELECTRON_RUN_AS_NODE=1`), para no compilar el módulo nativo dos veces. | Supuesto |
| D-11 | Atajo para cambiar a la siguiente ventana interna: **Ctrl+F6**. | Confirmado |
| D-12 | Se añade a la Fase 1 la pantalla **«Datos del negocio»** (nombre, NIT, régimen, dirección, teléfono) que alimenta el encabezado de la factura. | Confirmado |
