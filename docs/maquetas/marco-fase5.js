/**
 * Marco común de las maquetas de la Fase 5: pinta la barra de iconos y la
 * barra de estado de la app, y aplica la variante pedida con `#variante`
 * como clase `ver-<variante>` en el <body>.
 */
(function () {
  const iconos = [
    ['Facturar', 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4'],
    ['Factura de proveedor', 'M3 7h13v10H3zM16 10h3l2 3v4h-5zM7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01'],
    ['Abono de cliente', 'M2 7h20v10H2zM12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M5 10v4M19 10v4'],
    ['Abono a proveedor', 'M2 7h20v10H2zM8 12h8M13 9l3 3-3 3'],
    ['Productos', 'M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10'],
    ['Clientes', 'M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21c0-4 4-6 8-6s8 2 8 6'],
    ['Proveedores', 'M3 21V9l6-4v4l6-4v4l6-4v16zM7 17h2M11 17h2M15 17h2'],
    ['Reimpresiones', 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z'],
  ];
  const svg = (d) =>
    `<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" /></svg>`;

  const nav = document.querySelector('nav[data-marco]');
  if (nav) {
    nav.className = 'barra-iconos';
    nav.innerHTML =
      iconos.map(([nombre, d]) => `<button class="barra-iconos__boton">${svg(d)}<span>${nombre}</span></button>`).join('') +
      `<button class="barra-iconos__boton barra-iconos__organizar">${svg('M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z')}<span>Organizar</span></button>` +
      `<button class="barra-iconos__boton barra-iconos__buscar">${svg('M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M15 15l6 6')}<span>Buscar (Ctrl+K)</span></button>`;
  }

  const variante = location.hash.slice(1);
  if (variante) document.body.classList.add(`ver-${variante}`);

  // `data-atajos-<variante>` reemplaza los atajos del pie en esa variante.
  const pie = document.querySelector('footer[data-atajos]');
  if (pie) {
    const clave = `atajos${variante.charAt(0).toUpperCase()}${variante.slice(1)}`;
    pie.className = 'barra-estado';
    pie.innerHTML =
      '<span>Versión 0.1.0</span><span>Último respaldo: 04/10/2026 3:10 p. m.</span>' +
      `<span class="barra-estado__atajos">${pie.dataset[clave] ?? pie.dataset.atajos}</span>`;
  }
})();
