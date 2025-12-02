// js/main.js
import { initMap } from './map.js';
import { loadLists } from './api.js';
import { IsochroneTool } from './isochrone.js';
// Wir importieren renderInitLists NEU dazu:
import { initUI, renderInitLists } from './ui.js';
import { ENABLE_ISOCHRONE_TOOL } from './config.js';
import { state } from './state.js';

window.addEventListener('DOMContentLoaded', async () => { // WICHTIG: async hinzugefügt
    // 1. Karte starten
    initMap();
    
    // 2. UI Event Listener registrieren
    initUI();

    // 3. Daten laden (API)
    // Wir warten, bis die Daten da sind (await)
    const success = await loadLists();
    
    if (success) {
        // 4. Wenn Daten da sind: Dropdowns befüllen (UI)
        renderInitLists();
    }
    
    // 5. Isochronen Tool starten (falls aktiviert)
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