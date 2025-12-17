// js/map.js
import { state } from './state.js';

// --- ICONS ---
export const nextbikeIcon = L.icon({
    iconUrl: 'bike-icon-dunkelblau.png',
    iconSize:    [25, 35],
    iconAnchor:      [17, 35],
    popupAnchor:    [0, -35]
});

export const cityIcon = L.icon({
    iconSize:     [50, 50],
    iconAnchor:   [25, 50],
    popupAnchor:  [0, -50],
    iconUrl: 'favicon.png'
});

// Leaflet Default Icon Fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});


// --- SELECTION LOGIC ---

// Aktualisiert den Button im UI (rechter Panel)
function updateSelectionUI() {
    const btn = document.getElementById('download-selection-btn');
    if (btn) {
        const count = state.selectedFeatures.size;
        btn.disabled = count === 0;
        btn.innerHTML = `<i class="fa-solid fa-mouse-pointer"></i> Auswahl (${count}) laden`;
    }
}

// Setzt den Style eines Layers auf den Standard zurück
function resetLayerStyle(layer) {
    if (layer.setStyle && layer.feature) {
        const category = layer.feature.properties.category;
        let style = { weight: 2, dashArray: '', fillOpacity: 0.2, opacity: 0.8 };
        
        if (category === 'free_return') {
            style.color = '#000000';
            style.fillColor = '#000000';
            style.weight = 1;
        } else if (category === 'chargeable_return') {
            style.color = '#FFA500';
            style.fillColor = '#FFFF00';
            style.weight = 1;
            style.fillOpacity = 0.25;
        } else if (category === 'business_area') {
            style.color = "#FF0000";
            style.fillColor = "#FF69B4";
            style.opacity = 0.9;
        } else {
            // Standard Nextbike Blau
            style.color = "#0098FF";
            style.fillColor = "#0098FF";
        }
        layer.setStyle(style);
    }
}

// Zentrale Funktion zum Aufheben aller Auswahlen
function clearAllSelections() {
    state.selectedFeatures.clear();
    state.layers.stationLayer.eachLayer(l => resetLayerStyle(l));
    state.layers.flexzoneLayer.eachLayer(l => resetLayerStyle(l));
    state.layers.businessAreaLayer.eachLayer(l => resetLayerStyle(l));
    updateSelectionUI();
}

// Klick-Handler für Features (STRG für Mehrfachauswahl)
function handleFeatureClick(e, feature, layer) {
    L.DomEvent.stopPropagation(e);
    const isMultiSelect = e.originalEvent.ctrlKey || e.originalEvent.metaKey;
    const featureId = feature.properties.uid || feature.properties.station_id || feature.id || Math.random();

    if (!isMultiSelect) {
        // Bei einfachem Klick alles andere deselektieren
        clearAllSelections(); 
    }

    // Toggle Logik für das angeklickte Feature
    if (state.selectedFeatures.has(featureId)) {
        state.selectedFeatures.delete(featureId);
        resetLayerStyle(layer);
    } else {
        state.selectedFeatures.set(featureId, feature);
        if (layer.setStyle) {
            // Highlight Style (Grün gestrichelt)
            layer.setStyle({ 
                weight: 5, 
                color: '#EED75B', 
                fillOpacity: 0.5 
            });
        }
    }
    updateSelectionUI();
}


// --- MAP INITIALIZATION ---

export function initMap() {
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
    const positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap, &copy; CARTO', subdomains: 'abcd', maxZoom: 20 });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' });
    const baseMaps = { "OSM Standard": osm, "Positron": positron, "Satellit (Esri)": satellite };

    state.map = L.map('map', { layers: [positron], zoomControl: true }); 

    // NEU: Rechtsklick auf Karte hebt Auswahl auf
    state.map.on('contextmenu', (e) => {
        clearAllSelections();
        // Optional: Verhindert das Browser-Kontextmenü, falls gewünscht:
        // e.originalEvent.preventDefault(); 
    });

    // Optional: Auch Linksklick auf leere Karte hebt Auswahl auf
    state.map.on('click', () => {
        clearAllSelections();
    });

    // Station Layer
    state.layers.stationLayer = L.geoJSON(null, {
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon: nextbikeIcon}),
        onEachFeature: (f, l) => {
            const p = f.properties || {};
            l.bindPopup(`<strong>${p.name||'Station'}</strong><br>Bikes: ${p.num_bikes_available ?? '–'}<br>ID: ${p.station_id}`);
            l.on('click', (e) => handleFeatureClick(e, f, l));
        }
    });

    // Flexzone Layer
    state.layers.flexzoneLayer = L.geoJSON(null, {
        style: function(feature) {
            const category = feature.properties.category;
            if (category === 'free_return') return { color: '#000000', weight: 1, opacity: 1, fillColor: '#000000', fillOpacity: 0.2 };
            if (category === 'chargeable_return') return { color: '#FFA500', weight: 1, opacity: 1, fillColor: '#FFFF00', fillOpacity: 0.25 };
            return { color: "#0098FF", weight: 2, opacity: 0.8, fillColor: "#0098FF", fillOpacity: 0.2 };
        },
        onEachFeature: (f, l) => { 
            if(f.properties.name) l.bindPopup(`<b>${f.properties.name}</b>`); 
            l.on('click', (e) => handleFeatureClick(e, f, l));
        }
    });

    // Business Area Layer
    state.layers.businessAreaLayer = L.geoJSON(null, {
        style: function(feature) { return { color: "#FF0000", weight: 2, opacity: 0.9, fillColor: "#FF69B4", fillOpacity: 0.2 }; },
        onEachFeature: (f, l) => { 
            if(f.properties.name) l.bindPopup(`<b>Business Area: ${f.properties.name}</b>`); 
            l.on('click', (e) => handleFeatureClick(e, f, l));
        }
    });

    state.layers.cityLayer = L.featureGroup();

    state.layers.stationLayer.addTo(state.map);
    state.layers.cityLayer.addTo(state.map);

    state.map.setView([51.1657, 10.4515], 6);

    state.mapLayersControl = L.control.layers(baseMaps, { 
        "Stationen": state.layers.stationLayer, 
        "Flexzonen": state.layers.flexzoneLayer, 
        "Business Areas": state.layers.businessAreaLayer, 
        "Nextbike Städte": state.layers.cityLayer
    }).addTo(state.map);

    const flexCheck = document.getElementById('flexzonesCheckbox');
    const busCheck = document.getElementById('businessAreasCheckbox');
    if(flexCheck) flexCheck.disabled = true;
    if(busCheck) busCheck.disabled = true;
}

export async function addPopulationLayer(url) {
    if (typeof parseGeoraster === 'undefined') {
        console.error("FEHLER: 'georaster' fehlt.");
        return;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const georaster = await parseGeoraster(arrayBuffer);
        
        state.populationGeoRaster = georaster; 

        if (typeof GeoRasterLayer !== 'undefined') {
            const scale = chroma.scale(['#f7f7f7', '#4dac26', '#ffffbf', '#d7191c']).domain([0, 100]); 

            const layer = new GeoRasterLayer({
                georaster: georaster,
                opacity: 0.7,
                resolution: 96,
                pixelValuesToColorFn: values => {
                    const density = values[0];
                    if (density <= 0 || isNaN(density)) return null;
                    return scale(density).hex();
                }
            });
            state.mapLayersControl.addOverlay(layer, "Bevölkerungsdichte (Heatmap)");
        }
    } catch (e) {
        console.error("Fehler beim Laden des GeoTIFF:", e);
    }
}