import { textoDialogoPerdida, type PerdidaAlRestaurar } from '../../domain/politica-respaldos';
import { formatearFecha, formatearFechaHora } from '../../shared/formato/fechas';
import { escaparHtml } from './plantillas';

/**
 * Muestra un momento guardado, con hora si la trae.
 *
 * @param iso - Fecha ISO o `AAAA-MM-DD`.
 * @returns Texto para el PDF.
 */
function textoMomento(iso: string): string {
  try {
    return iso.includes('T') ? formatearFechaHora(iso) : formatearFecha(iso);
  } catch {
    return iso;
  }
}

/**
 * Arma el HTML de la lista de documentos que se perderían al restaurar.
 *
 * @param perdida - Resumen calculado en el servidor.
 * @param fechaCopia - Momento ISO de la copia.
 * @returns HTML autónomo, con su propia CSP.
 */
export function htmlListaPerdida(perdida: PerdidaAlRestaurar, fechaCopia: string): string {
  const filas =
    perdida.documentos.length === 0
      ? '<tr><td colspan="4">Ningún documento posterior a esa copia.</td></tr>'
      : perdida.documentos
          .map(
            (d) =>
              `<tr><td>${escaparHtml(d.tipo)}</td><td>${escaparHtml(d.documento)}</td>` +
              `<td>${escaparHtml(textoMomento(d.momento))}</td><td>${escaparHtml(d.resumen)}</td></tr>`,
          )
          .join('');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
<title>Documentos que se perderían</title>
<style>
  body { font-family: "Segoe UI", Tahoma, sans-serif; font-size: 12px; color: #1d2733; }
  h1 { font-size: 16px; color: #2f4a6d; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #8a9bb0; padding: 4px 6px; text-align: left; }
  th { background: #e9edf2; }
</style>
</head>
<body>
<h1>Documentos que se perderían</h1>
<p>Copia del ${escaparHtml(textoMomento(fechaCopia))}. ${escaparHtml(textoDialogoPerdida(perdida))}.</p>
<table>
<thead><tr><th>Tipo</th><th>Documento</th><th>Fecha</th><th>Resumen</th></tr></thead>
<tbody>${filas}</tbody>
</table>
</body>
</html>`;
}
