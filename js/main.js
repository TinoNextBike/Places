// js/main.js
import { initMap, addPopulationLayer } from './map.js'; // NEU: Import hinzufügen
import { loadLists } from './api.js';
import { IsochroneTool } from './isochrone.js';
import { initUI, renderInitLists } from './ui.js';
import { ENABLE_ISOCHRONE_TOOL, POPULATION_TIF_URL } from './config.js'; // NEU: URL importieren
import { state } from './state.js';

window.addEventListener('DOMContentLoaded', async () => { 
    initMap();
    initUI();

    // 1. Nextbike Daten laden
    const success = await loadLists();
    if (success) {
        renderInitLists();
    }
    
    // 2. Bevölkerungsdaten laden (Async im Hintergrund)
    if (POPULATION_TIF_URL) {
        addPopulationLayer(POPULATION_TIF_URL);
    }
    
    // 3. Tools starten
    if (ENABLE_ISOCHRONE_TOOL) {
        IsochroneTool.init();
        state.map.on('click', (e) => {
            if (state.activeToolId === 'isochrone-controls') {
                IsochroneTool.addMarker(e.latlng);
            }
        });
    } else {
        const btn = document.querySelector('[data-target="isochrone-controls"]');
        if (btn) btn.style.display = 'none';
    }
});