// js/map.js
import { state } from './state.js';

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

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

export function initMap() {
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
    const positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap, &copy; CARTO', subdomains: 'abcd', maxZoom: 20 });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' });
    const baseMaps = { "OSM Standard": osm, "Positron": positron, "Satellit (Esri)": satellite };

    state.map = L.map('map', { layers: [positron], zoomControl: true }); 

    state.layers.stationLayer = L.geoJSON(null, {
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon: nextbikeIcon}),
        onEachFeature: (f, l) => {
            const p = f.properties || {};
            l.bindPopup(`<strong>${p.name||'Station'}</strong><br>Bikes: ${p.num_bikes_available ?? '–'}<br>Slots: ${p.num_docks_available ?? '–'}<br>ID: ${p.station_id}`);
        }
    });

    state.layers.flexzoneLayer = L.geoJSON(null, {
        style: function(feature) {
            const category = feature.properties.category;
            if (category === 'free_return') return { color: '#000000', weight: 1, opacity: 1, fillColor: '#000000', fillOpacity: 0.2 };
            if (category === 'chargeable_return') return { color: '#FFA500', weight: 1, opacity: 1, fillColor: '#FFFF00', fillOpacity: 0.25 };
            return { color: "#0098FF", weight: 2, opacity: 0.8, fillColor: "#0098FF", fillOpacity: 0.2 };
        },
        onEachFeature: (f, l) => { if(f.properties.name) l.bindPopup(`<b>${f.properties.name}</b>`); }
    });

    state.layers.businessAreaLayer = L.geoJSON(null, {
        style: function(feature) { return { color: "#FF0000", weight: 2, opacity: 0.9, fillColor: "#FF69B4", fillOpacity: 0.2 }; },
        onEachFeature: (f, l) => { if(f.properties.name) l.bindPopup(`<b>Business Area: ${f.properties.name}</b>`); }
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
    console.log("Lade Bevölkerungsdaten von:", url);
    
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
            
            // 1. Farbskala definieren (mit Chroma.js)
            // Wir erstellen einen Verlauf von Hellblau über Gelb nach Rot (Heatmap Style)
            // domain([min, max]) definiert, welcher Einwohner-Wert welche Farbe bekommt.
            // Bei 100m Raster: Ein Wert von 50 ist schon dicht (5000/km²). 
            // Passe die '100' an deine Daten an! (z.B. 5000 wenn die Daten pro km² sind)
            const scale = chroma.scale(['#f7f7f7', '#4dac26', '#ffffbf', '#d7191c'])
                                .domain([0, 100]); 

            const layer = new GeoRasterLayer({
                georaster: georaster,
                opacity: 0.7,
                resolution: 96,
                pixelValuesToColorFn: values => {
                    const density = values[0];
                    
                    // Keine Einwohner oder Fehler -> Transparent
                    if (density <= 0 || isNaN(density)) return null;
                    
                    // Chroma.js nutzen, um die Farbe für den Wert zu holen
                    // .hex() gibt den Hex-Code (z.B. #ff0000) zurück
                    return scale(density).hex();
                }
            });
            
            state.mapLayersControl.addOverlay(layer, "Bevölkerungsdichte (Heatmap)");
        }
        
        console.log("Bevölkerungsdaten als Heatmap geladen!");

    } catch (e) {
        console.error("Fehler beim Laden des GeoTIFF:", e);
    }
}