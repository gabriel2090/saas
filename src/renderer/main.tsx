import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registrarErrorRenderer } from './servicios/api';
import './estilos/global.css';

window.addEventListener('error', (evento) =>
  registrarErrorRenderer('window.error', evento.error ?? evento.message),
);
window.addEventListener('unhandledrejection', (evento) =>
  registrarErrorRenderer('promesa-no-manejada', evento.reason),
);

/**
 * Elemento raíz del documento donde se monta React.
 */
const raiz = document.getElementById('raiz');
if (!raiz) {
  throw new Error('No se encontró el elemento #raiz.');
}

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
