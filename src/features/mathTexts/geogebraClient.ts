export {};

interface GeoGebraApi { setXML(xml: string): void }
interface GeoGebraParams {
  appName: 'graphing' | '3d';
  width: number;
  height: number;
  scaleContainerClass: string;
  autoHeight: boolean;
  showToolBar: boolean;
  showMenuBar: boolean;
  showAlgebraInput: boolean;
  showResetIcon: boolean;
  enableRightClick: boolean;
  useBrowserForJS: boolean;
  preventFocus: boolean;
  appletOnLoad: (api: GeoGebraApi) => void;
}
interface GeoGebraApplet { inject(targetId: string): void }
declare global { interface Window { GGBApplet?: new (params: GeoGebraParams, html5?: boolean) => GeoGebraApplet } }

let loader: Promise<void> | undefined;
function loadGeoGebra(): Promise<void> {
  if (window.GGBApplet) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.geogebra.org/apps/deployggb.js';
    script.async = true;
    script.onload = () => window.GGBApplet ? resolve() : reject(new Error('No se pudo inicializar GeoGebra.'));
    script.onerror = () => reject(new Error('No se pudo cargar GeoGebra. Verifica tu conexión a internet.'));
    document.head.append(script);
  });
  return loader;
}

async function initializeGeoGebra(): Promise<void> {
  const widgets = [...document.querySelectorAll<HTMLElement>('[data-geogebra-widget]:not([data-geogebra-loaded])')];
  for (const widget of widgets) {
    widget.dataset.geogebraLoaded = 'true';
    const status = widget.querySelector<HTMLElement>('[data-geogebra-status]');
    const target = widget.querySelector<HTMLElement>('[data-geogebra-target]');
    const endpoint = widget.dataset.endpoint;
    if (!status || !target?.id || !endpoint) continue;
    try {
      const response = await fetch(endpoint, { credentials: 'same-origin', headers: { accept: 'application/json' } });
      const data = await response.json() as { xml?: unknown; appName?: unknown; error?: string };
      if (!response.ok) throw new Error(data.error || (response.status === 403 ? 'Completa las unidades anteriores para abrir esta gráfica.' : 'No se pudo cargar esta construcción.'));
      if (typeof data.xml !== 'string' || (data.appName !== 'graphing' && data.appName !== '3d')) throw new Error('La construcción guardada no tiene un formato reconocido.');
      await loadGeoGebra();
      const params: GeoGebraParams = {
        appName: data.appName,
        width: 900,
        height: 620,
        scaleContainerClass: 'geogebra-applet-container',
        autoHeight: true,
        showToolBar: false,
        showMenuBar: false,
        showAlgebraInput: false,
        showResetIcon: true,
        enableRightClick: false,
        useBrowserForJS: true,
        preventFocus: true,
        appletOnLoad(api) { api.setXML(data.xml as string); },
      };
      const GGBApplet = window.GGBApplet;
      if (!GGBApplet) throw new Error('No se pudo inicializar GeoGebra.');
      target.classList.add('geogebra-applet-container');
      new GGBApplet(params, true).inject(target.id);
      status.textContent = 'Construcción interactiva lista.';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'No se pudo cargar GeoGebra.';
      status.classList.add('text-red-700');
    }
  }
}

void initializeGeoGebra();
document.addEventListener('astro:page-load', () => void initializeGeoGebra());
