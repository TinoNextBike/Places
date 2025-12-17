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

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

// --- HELPER ---

function updateSelectionUI() {
    const btn = document.getElementById('download-selection-btn');
    if (btn) {
        const count = state.selectedFeatures.size;
        btn.disabled = count === 0;
        btn.innerHTML = `<i class="fa-solid fa-mouse-pointer"></i> Auswahl (${count}) laden`;
    }
}

function resetLayerStyle(layer) {
    if (layer.setStyle && layer.feature) {
        const category = layer.feature.properties.category;
        let style = { weight: 2, dashArray: '', fillOpacity: 0.2, opacity: 0.8 };
        if (category === 'free_return') {
            style.color = '#000000'; style.fillColor = '#000000'; style.weight = 1;
        } else if (category === 'chargeable_return') {
            style.color = '#FFA500'; style.fillColor = '#FFFF00'; style.weight = 1; style.fillOpacity = 0.25;
        } else if (category === 'business_area') {
            style.color = "#FF0000"; style.fillColor = "#FF69B4"; style.opacity = 0.9;
        } else {
            style.color = "#0098FF"; style.fillColor = "#0098FF";
        }
        layer.setStyle(style);
    }
}

function clearAllSelections() {
    state.selectedFeatures.clear();
    state.layers.stationLayer.eachLayer(l => resetLayerStyle(l));
    state.layers.flexzoneLayer.eachLayer(l => resetLayerStyle(l));
    state.layers.businessAreaLayer.eachLayer(l => resetLayerStyle(l));
    updateSelectionUI();
}

// Interne Klick-Logik
function handleFeatureClick(e, feature, layer) {
    L.DomEvent.stopPropagation(e);
    const isMultiSelect = e.originalEvent.ctrlKey || e.originalEvent.metaKey;
    
    const p = feature.properties || {};
    const featureId = p.uid || p.station_id || p.id || feature.id || layer._leaflet_id;

    if (!isMultiSelect) clearAllSelections();

    if (state.selectedFeatures.has(featureId)) {
        state.selectedFeatures.delete(featureId);
        resetLayerStyle(layer);
    } else {
        // Aktuelles GeoJSON speichern (wichtig nach Edits!)
        const currentGeoJSON = layer.toGeoJSON();
        if(!currentGeoJSON.properties) currentGeoJSON.properties = {};
        currentGeoJSON.properties.uid = featureId; // ID sicherstellen

        state.selectedFeatures.set(featureId, currentGeoJSON);
        
        if (layer.setStyle) {
            layer.setStyle({ weight: 5, color: '#EED75B', dashArray: '5, 5', fillOpacity: 0.5 });
        }
    }
    updateSelectionUI();
}

// --- INIT MAP ---

export function initMap() {
    const positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', subdomains: 'abcd', maxZoom: 20 });
    state.map = L.map('map', { layers: [positron], zoomControl: true }); 

    state.map.on('contextmenu', () => clearAllSelections());
    state.map.on('click', () => clearAllSelections());

    const commonOnEachFeature = (f, l) => {
        if(f.properties.name) l.bindPopup(`<b>${f.properties.name}</b>`);
        l.on('click', (e) => handleFeatureClick(e, f, l));
    };

    state.layers.stationLayer = L.geoJSON(null, {
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon: nextbikeIcon}),
        onEachFeature: (f, l) => {
            const p = f.properties || {};
            l.bindPopup(`<strong>${p.name||'Station'}</strong><br>Bikes: ${p.num_bikes_available ?? '–'}<br>ID: ${p.station_id}`);
            l.on('click', (e) => handleFeatureClick(e, f, l));
        }
    });

    state.layers.flexzoneLayer = L.geoJSON(null, {
        style: function(feature) {
            const category = feature.properties.category;
            if (category === 'free_return') return { color: '#000000', weight: 1, opacity: 1, fillColor: '#000000', fillOpacity: 0.2 };
            if (category === 'chargeable_return') return { color: '#FFA500', weight: 1, opacity: 1, fillColor: '#FFFF00', fillOpacity: 0.25 };
            return { color: "#0098FF", weight: 2, opacity: 0.8, fillColor: "#0098FF", fillOpacity: 0.2 };
        },
        onEachFeature: commonOnEachFeature
    });

    state.layers.businessAreaLayer = L.geoJSON(null, {
        style: function(feature) { return { color: "#FF0000", weight: 2, opacity: 0.9, fillColor: "#FF69B4", fillOpacity: 0.2 }; },
        onEachFeature: commonOnEachFeature
    });

    // --- GEOMAN ---
    if (state.map.pm) {
        state.map.pm.addControls({
            position: 'topleft',
            drawCircle: false, drawCircleMarker: false, drawText: false,
            drawMarker: true, drawPolyline: true, drawPolygon: true, drawRectangle: true,
            editMode: true, dragMode: true, cutPolygon: true, removalMode: true, rotateMode: false,
        });

        setTimeout(() => {
            const destination = document.getElementById('geoman-tools-container');
            const toolbars = document.querySelectorAll('.leaflet-pm-toolbar');
            if(destination && toolbars.length > 0) {
                toolbars.forEach(bar => {
                    bar.classList.remove('leaflet-control');
                    bar.classList.remove('leaflet-bar');
                    destination.appendChild(bar);
                });
            }
        }, 100);

        state.map.pm.setGlobalOptions({ limitMarkersToCount: 20, snapDistance: 20, allowSelfIntersection: false });

        // 1. NEUES OBJEKT (Draw)
        state.map.on('pm:create', (e) => {
            const layer = e.layer;
            layer.feature = layer.feature || { type: 'Feature', properties: {} };
            
            // ID vergeben
            const newId = 'created_' + Date.now() + Math.floor(Math.random()*1000);
            layer.feature.properties.uid = newId;
            layer.feature.id = newId;

            layer.bindPopup(`<b>Neu</b><br>ID: ${newId}`);
            layer.on('click', (ev) => handleFeatureClick(ev, layer.toGeoJSON(), layer));
            
            // Direkt auswählen
            handleFeatureClick({ originalEvent: { ctrlKey: true }, stopPropagation: ()=>{} }, layer.toGeoJSON(), layer);
        });

        // 2. SCHNEIDEN (Cut) - PROPERTIES ÜBERTRAGEN
        state.map.on('pm:cut', (e) => {
            const originalLayer = e.originalLayer;
            const newLayer = e.layer;
            
            if (originalLayer.feature && originalLayer.feature.properties) {
                newLayer.feature = newLayer.feature || { type: 'Feature', properties: {} };
                newLayer.feature.properties = { ...originalLayer.feature.properties };
                // ID muss gleich bleiben für die Identifikation!
                newLayer.feature.properties.uid = originalLayer.feature.properties.uid; 
            }

            newLayer.on('click', (ev) => handleFeatureClick(ev, newLayer.toGeoJSON(), newLayer));

            // Falls alt ausgewählt war, neu auch auswählen
            const oldId = originalLayer.feature?.properties?.uid || originalLayer.feature?.id;
            if (state.selectedFeatures.has(oldId)) {
                setTimeout(() => {
                    handleFeatureClick({ originalEvent: { ctrlKey: true }, stopPropagation: ()=>{} }, newLayer.toGeoJSON(), newLayer);
                }, 50);
            }
        });
    }

    state.layers.cityLayer = L.featureGroup();
    state.layers.stationLayer.addTo(state.map);
    state.layers.cityLayer.addTo(state.map);

    state.map.setView([51.1657, 10.4515], 6);

    state.mapLayersControl = L.control.layers({ "Positron": positron }, { 
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
    if (typeof parseGeoraster === 'undefined') return;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const georaster = await parseGeoraster(arrayBuffer);
        state.populationGeoRaster = georaster; 
        if (typeof GeoRasterLayer !== 'undefined') {
            const scale = chroma.scale(['#f7f7f7', '#4dac26', '#ffffbf', '#d7191c']).domain([0, 100]); 
            const layer = new GeoRasterLayer({
                georaster: georaster, opacity: 0.7, resolution: 96,
                pixelValuesToColorFn: values => {
                    const density = values[0];
                    if (density <= 0 || isNaN(density)) return null;
                    return scale(density).hex();
                }
            });
            state.mapLayersControl.addOverlay(layer, "Bevölkerungsdichte (Heatmap)");
        }
    } catch (e) { console.error(e); }
}