// js/ui.js
import { state } from './state.js';
import { $, option, generateFilename } from './utils.js';
import { loadData, fetchCitiesForBrand } from './api.js';
import { IsochroneTool } from './isochrone.js';
import { ENABLE_ISOCHRONE_TOOL } from './config.js';
import { cityIcon } from './map.js'; 
// KEINE FUNKTIONEN AUS MAP.JS IMPORTIEREN, DIE STATE NUTZEN -> Zirkulärer Fehler!

const importedLayers = {}; 
let currentlyEditingId = null;

function getCleanedGeoJSON(data) {
    const cleanData = JSON.parse(JSON.stringify(data));
    const features = cleanData.features || (cleanData.type === 'Feature' ? [cleanData] : []);
    features.forEach(f => {
        if (f.properties) delete f.properties.serviceCases;
    });
    return cleanData;
}

// LOKALE KLICK-FUNKTION (vermeidet Absturz)
function localImportClick(e, layer) {
    L.DomEvent.stopPropagation(e);
    const isMultiSelect = e.originalEvent.ctrlKey || e.originalEvent.metaKey;
    
    // Aktuelles GeoJSON holen (inkl. edits)
    const geojson = layer.toGeoJSON();
    if(!geojson.properties) geojson.properties = {};
    
    // ID sicherstellen
    const id = geojson.properties.uid || 'import_' + Date.now() + Math.random();
    geojson.properties.uid = id;

    if (!isMultiSelect) {
        state.selectedFeatures.clear();
        // UI Reset visuell (etwas hacky, da wir keinen Zugriff auf resetLayerStyle haben, aber ok)
        Object.values(importedLayers).forEach(obj => {
            if(obj.layer.setStyle) obj.layer.setStyle({ color: '#3388ff', weight: 2, dashArray: '' });
        });
    }

    if (state.selectedFeatures.has(id)) {
        state.selectedFeatures.delete(id);
        layer.setStyle({ color: '#3388ff', weight: 2, dashArray: '' });
    } else {
        state.selectedFeatures.set(id, geojson);
        layer.setStyle({ color: '#EED75B', weight: 5, dashArray: '5, 5' });
    }
    
    const btn = document.getElementById('download-selection-btn');
    if (btn) {
        const count = state.selectedFeatures.size;
        btn.disabled = count === 0;
        btn.innerHTML = `<i class="fa-solid fa-mouse-pointer"></i> Auswahl (${count}) laden`;
    }
}

// SCANNT DIE KARTE NACH GEOMETRIEN
function getFeaturesFromMap(onlySelected = false) {
    const allFeatures = [];
    state.map.eachLayer(layer => {
        if (!layer.toGeoJSON || layer._pmTempLayer || layer instanceof L.TileLayer || layer instanceof L.Popup) return;
        
        let geojson;
        try { geojson = layer.toGeoJSON(); } catch(e) { return; }
        if (!geojson.properties) geojson.properties = {};

        // ID finden
        const id = geojson.properties.uid || layer.feature?.properties?.uid || layer.feature?.id;

        if (onlySelected) {
            let isSelected = false;
            if (id) {
                for (let key of state.selectedFeatures.keys()) {
                    if (String(key) === String(id)) { isSelected = true; break; }
                }
            }
            if (isSelected) allFeatures.push(geojson);
        } else {
            if (geojson.geometry) allFeatures.push(geojson);
        }
    });
    return { type: "FeatureCollection", features: allFeatures };
}

// --- STANDARD UI LOGIC ---

export function renderInitLists() {
    const cSel = $('#countrySelect'); 
    cSel.innerHTML = '';
    const defOpt = document.createElement('option'); defOpt.value = ''; defOpt.textContent = 'Alle Länder (Filter)';
    cSel.appendChild(defOpt);
    state.countryList.forEach(c => {
        const o = document.createElement('option');
        o.value = c.country_code;
        o.textContent = `${c.country_name} (${c.country_code})`;
        cSel.appendChild(o);
    });
    refreshBrandSelect();
    drawAllCityMarkers(); 
    refreshCitySelect();
    $('#load-status').textContent = 'Bitte Auswahl treffen.';
    $('#load-status').style.visibility = 'visible';
}

export function setActiveTool(toolId) {
    const isAlreadyActive = (toolId === state.activeToolId);
    document.querySelectorAll('.toolbar-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tool-section').forEach(el => el.classList.add('hidden'));
    if (isAlreadyActive) {
        state.activeToolId = null;
        if (!$('#main-wrap').classList.contains('left-collapsed')) $('#toggle-left-panel').click(); 
        $('#map').classList.remove('isochrone-mode');
    } else {
        state.activeToolId = toolId;
        const targetElement = $(`#${toolId}`);
        if (targetElement) targetElement.classList.remove('hidden');
        const targetButton = $(`[data-target="${toolId}"]`);
        if (targetButton) targetButton.classList.add('active');
        if ($('#main-wrap').classList.contains('left-collapsed')) $('#toggle-left-panel').click();
        if (toolId === 'isochrone-controls') $('#map').classList.add('isochrone-mode'); 
        else $('#map').classList.remove('isochrone-mode');
    }
}

export function resetSystemView() {
    state.layers.stationLayer.clearLayers(); 
    state.layers.flexzoneLayer.clearLayers();
    state.layers.businessAreaLayer.clearLayers();
    if (ENABLE_ISOCHRONE_TOOL && IsochroneTool) IsochroneTool.clear();
    state.selectedBrandDomain = null;
    state.currentGeoJSON = null;
    state.selectedFeatures.clear();
    $('#countrySelect').value = '';
    $('#brandSelect').value = ''; 
    $('#citySelect').value = '';
    $('#quickFilter').value = '';
    $('#load-status').textContent = 'Bitte Auswahl treffen.';
    $('#geojson-output').value = '';
    $('#flexzonesCheckbox').checked = true;
    $('#businessAreasCheckbox').checked = true;
    $('#flexzonesCheckbox').disabled = true;
    $('#businessAreasCheckbox').disabled = true;
    $('#flexzone-toggle-container').classList.add('hidden');
    $('#geojsonBtn').disabled = true;
    $('#zipBtn').disabled = true;
    setActiveTool('filter-controls'); 
    $('#toolbar-filter-btn').classList.add('active');
    refreshBrandSelect();
    refreshCitySelect();
    if (state.layers.cityLayer.getLayers().length > 0) state.map.fitBounds(state.layers.cityLayer.getBounds(), {padding: [50, 50]});
    else state.map.setView([51.1657, 10.4515], 6);
}

export function refreshBrandSelect() {
    const countryCode = ($('#countrySelect').value || '').toUpperCase();
    const brandSel = $('#brandSelect');
    const currentVal = brandSel.value; 
    brandSel.innerHTML = '<option value="">Alle Systeme</option>';
    state.brandList.forEach(brand => {
        if (!countryCode || brand.country_codes.has(countryCode)) {
            const labelWithDomain = `${brand.name} (${brand.domain})`;
            brandSel.appendChild(option(brand.domain, labelWithDomain));
        }
    });
    brandSel.value = currentVal;
}

export async function refreshCitySelect(){
    const brandKey = state.selectedBrandDomain;
    const countryCode = ($('#countrySelect').value || '').toUpperCase();
    const citySel = $('#citySelect');
    state.layers.cityLayer.eachLayer(marker => {
        const markerDomain = marker.options._domain;
        const domainMatch = !brandKey || markerDomain === brandKey;
        const markerCountryCode = marker.options.feature?.properties?.country_code || '';
        const countryMatch = !countryCode || markerCountryCode === countryCode;
        if (marker.getElement()) marker.getElement().style.display = (domainMatch && countryMatch) ? '' : 'none';
    });
    citySel.innerHTML = '<option value="">Alle Städte im System / Land</option>';
    if (state.rawCountries.length === 0) { citySel.disabled = true; return; }
    try{
        let items = await fetchCitiesForBrand(brandKey, countryCode); 
        items.forEach(city => {
            const labelSuffix = (city.country_code && !countryCode) ? ` (${city.country_code})` : '';
            citySel.appendChild(option(String(city.uid), `${city.name}${labelSuffix}`));
        });
        citySel.disabled = false;
        if (items.length > 0) citySel.options[0].textContent = `Alle ${items.length} Städte im Filterbereich`;
    }catch(e){ citySel.disabled = true; }
}

export function drawAllCityMarkers() {
    state.layers.cityLayer.clearLayers();
    const out = [];
    state.rawCountries.forEach(co => {
        const cc = (co.country || co.country_code || '').toUpperCase();
        const countryDomain = (co.domain || '').toLowerCase(); 
        co.cities?.forEach(city => {
            const domain = (city.domain || '').toLowerCase() || countryDomain; 
            if (typeof city.lat === 'number' && typeof city.lng === 'number') {
                out.push({ 
                    uid: city.uid, name: city.name || city.alias || city.city || `#${city.uid}`, 
                    country_code: cc, domain: domain, lat: city.lat, lng: city.lng
                });
            }
        });
    });
    out.forEach(city => {
        const marker = L.marker([city.lat, city.lng], { 
            icon: cityIcon,
            _domain: city.domain,
            feature: { properties: { country_code: city.country_code, domain: city.domain } }
        });
        marker.on('click', function() {
            const brandSelect = $('#brandSelect');
            const domain = city.domain;
            $('#countrySelect').value = city.country_code;
            refreshBrandSelect();
            brandSelect.value = domain; 
            $('#flexzonesCheckbox').checked = true;
            $('#businessAreasCheckbox').checked = true;
            $('#flexzonesCheckbox').disabled = false;
            $('#businessAreasCheckbox').disabled = false;
            brandSelect.dispatchEvent(new Event('change'));
            setActiveTool('filter-controls');
        });
        marker.bindPopup(`<b>${city.name}</b><br>System: ${city.domain || 'N/A'}<br>Land: ${city.country_code}`);
        state.layers.cityLayer.addLayer(marker);
    });
    if (state.layers.cityLayer.getLayers().length > 0) state.map.fitBounds(state.layers.cityLayer.getBounds(), {padding: [50, 50]});
}

function updateAvailableBrands(){
    $('#brandSelect').value = ''; 
    state.selectedBrandDomain = null; 
    $('#citySelect').value = ''; 
    $('#flexzone-toggle-container').classList.add('hidden');
    $('#flexzonesCheckbox').disabled = true;
    $('#businessAreasCheckbox').disabled = true;
    refreshBrandSelect(); 
    refreshCitySelect();
}

export function initUI() {
    const wrap = $('#main-wrap');
    
    $('#toggle-left-panel').addEventListener('click', () => {
        wrap.classList.toggle('left-collapsed');
        $('#toggle-left-panel').textContent = wrap.classList.contains('left-collapsed') ? '▶' : '◀';
        setTimeout(() => state.map.invalidateSize({debounceMoveend: true}), 350); 
    });
    $('#toggle-right-panel')?.addEventListener('click', () => {
        wrap.classList.toggle('right-collapsed');
        $('#toggle-right-panel').textContent = wrap.classList.contains('right-collapsed') ? '◀' : '▶';
        setTimeout(() => state.map.invalidateSize({debounceMoveend: true}), 350);
    });
    $('#tab-system').addEventListener('click', () => {
        $('#tab-system').classList.add('active');
        $('#tab-imports').classList.remove('active');
        $('#view-system').classList.remove('hidden');
        $('#view-imports').classList.add('hidden');
    });
    $('#tab-imports').addEventListener('click', () => {
        $('#tab-imports').classList.add('active');
        $('#tab-system').classList.remove('active');
        $('#view-imports').classList.remove('hidden');
        $('#view-system').classList.add('hidden');
    });

    $('#save-import-btn').addEventListener('click', () => {
        if (!currentlyEditingId) { alert("Bitte wähle erst eine Ebene zum Bearbeiten aus."); return; }
        try {
            const updatedGeoJSON = JSON.parse($('#import-editor').value);
            state.map.removeLayer(importedLayers[currentlyEditingId].layer);
            const newLayer = L.geoJSON(updatedGeoJSON, {
                onEachFeature: (feature, l) => {
                    if(!feature.properties) feature.properties = {};
                    if(!feature.properties.uid) feature.properties.uid = 'import_' + Date.now() + Math.random();
                    l.on('click', (e) => localImportClick(e, l));
                }
            }).addTo(state.map);
            
            const sync = () => {
                const ud = newLayer.toGeoJSON();
                importedLayers[currentlyEditingId].data = ud;
                $('#import-editor').value = JSON.stringify(ud, null, 2);
            };
            newLayer.on('pm:edit', sync); newLayer.on('pm:dragend', sync); newLayer.on('pm:cut', sync);

            importedLayers[currentlyEditingId].layer = newLayer;
            importedLayers[currentlyEditingId].data = updatedGeoJSON;
            alert("Änderungen übernommen!");
        } catch (e) { alert("Fehler: Ungültiges GeoJSON-Format!"); }
    });

    const dropZone = $('#drag-drop-zone');
    ['dragover', 'dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }));
    
    dropZone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.geojson')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const geojson = JSON.parse(event.target.result);
                    const layerId = 'import_' + Date.now();
                    
                    const layer = L.geoJSON(geojson, {
                        onEachFeature: (feature, l) => {
                            if(!feature.properties) feature.properties = {};
                            if(!feature.properties.uid) feature.properties.uid = 'import_' + Date.now() + Math.random();
                            l.on('click', (e) => localImportClick(e, l));
                        }
                    }).addTo(state.map);
                    
                    importedLayers[layerId] = { layer, data: geojson, name: file.name };
                    
                    const updateData = () => {
                        const updatedData = layer.toGeoJSON();
                        importedLayers[layerId].data = updatedData;
                        if (currentlyEditingId === layerId) $('#import-editor').value = JSON.stringify(updatedData, null, 2);
                    };
                    layer.on('pm:edit', updateData);
                    layer.on('pm:dragend', updateData);
                    layer.on('pm:cut', updateData);

                    $('#tab-imports').click();

                    const list = $('#imported-files-list');
                    const li = document.createElement('li');
                    li.className = 'file-item';
                    li.id = `item-${layerId}`;
                    li.innerHTML = `
                        <span class="file-name"><i class="fa-solid fa-layer-group"></i> ${file.name}</span>
                        <div class="actions">
                            <button class="edit-btn"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button class="remove-btn"><i class="fa-solid fa-trash"></i></button>
                        </div>`;

                    li.querySelector('.file-name').addEventListener('click', () => state.map.fitBounds(importedLayers[layerId].layer.getBounds()));
                    li.querySelector('.edit-btn').addEventListener('click', () => {
                        currentlyEditingId = layerId;
                        $('#import-editor').value = JSON.stringify(importedLayers[layerId].data, null, 2);
                        document.querySelectorAll('.file-item').forEach(el => el.classList.remove('editing'));
                        li.classList.add('editing');
                    });
                    li.querySelector('.remove-btn').addEventListener('click', () => {
                        state.map.removeLayer(importedLayers[layerId].layer);
                        delete importedLayers[layerId];
                        li.remove();
                        if (currentlyEditingId === layerId) {
                            $('#import-editor').value = '';
                            currentlyEditingId = null;
                        }
                    });
                    list.appendChild(li);
                    li.querySelector('.edit-btn').click();
                } catch { alert('Fehler beim Parsen der Datei.'); }
            };
            reader.readAsText(file);
        } else { alert('Bitte eine .geojson Datei nutzen.'); }
    });

    $('#countrySelect').addEventListener('change', updateAvailableBrands);
    $('#brandSelect').addEventListener('change', () => {
        const selectedDomain = $('#brandSelect').value;
        state.layers.stationLayer.clearLayers(); 
        state.layers.flexzoneLayer.clearLayers(); 
        state.layers.businessAreaLayer.clearLayers(); 
        $('#citySelect').value = '';
        if (selectedDomain) {
            state.selectedBrandDomain = selectedDomain; 
            $('#flexzonesCheckbox').checked = true;
            $('#businessAreasCheckbox').checked = true;
            $('#flexzonesCheckbox').disabled = false;
            $('#businessAreasCheckbox').disabled = false;
            $('#flexzone-toggle-container').classList.remove('hidden'); 
            loadData(); 
            refreshCitySelect(); 
        } else {
            resetSystemView();
        }
    });
    $('#citySelect').addEventListener('change', () => {
        const cityUid = $('#citySelect').value;
        $('#brandSelect').value = ''; 
        state.selectedBrandDomain = null; 
        if (cityUid) loadData();
    });

    $('#flexzonesCheckbox').addEventListener('change', (e) => {
        if (state.selectedBrandDomain) loadData(); 
        else if (!e.target.checked && state.map.hasLayer(state.layers.flexzoneLayer)) state.map.removeLayer(state.layers.flexzoneLayer);
    });
    $('#businessAreasCheckbox').addEventListener('change', (e) => {
        if (state.selectedBrandDomain) loadData(); 
        else if (!e.target.checked && state.map.hasLayer(state.layers.businessAreaLayer)) state.map.removeLayer(state.layers.businessAreaLayer);
    });

    $('#geojsonBtn').addEventListener('click', () => {
        const currentData = getFeaturesFromMap(false); 
        if(currentData.features.length === 0) { alert("Keine Daten!"); return; }
        const cleaned = getCleanedGeoJSON(currentData);
        const filename = generateFilename(state.selectedBrandDomain) + '.geojson';
        const blob = new Blob([JSON.stringify(cleaned, null, 2)], {type:'application/geo+json;charset=utf-8'}); 
        saveAs(blob, filename); 
    });

    $('#zipBtn').addEventListener('click', async () => {
        const currentData = getFeaturesFromMap(false);
        if(currentData.features.length === 0) { alert("Keine Daten!"); return; }
        const zip = new JSZip(); 
        const baseFilename = generateFilename(state.selectedBrandDomain);
        const stations = { type: "FeatureCollection", features: currentData.features.filter(f => f.geometry.type === 'Point') };
        const polygons = { type: "FeatureCollection", features: currentData.features.filter(f => f.geometry.type !== 'Point') };
        if(stations.features.length) zip.file("stations.geojson", JSON.stringify(getCleanedGeoJSON(stations), null, 2));
        if (polygons.features.length > 0) {
             const cleanedPoly = getCleanedGeoJSON(polygons);
             zip.file("fullsystem_polygons.geojson", JSON.stringify(cleanedPoly, null, 2));
             cleanedPoly.features.forEach((feature, idx) => {
                 let name = feature.properties.name || feature.properties.uid || `zone_${idx}`;
                 name = String(name).replace(/[\W_]+/g, "_").toLowerCase();
                 zip.file(`${name}.geojson`, JSON.stringify({ type: "FeatureCollection", features: [feature] }, null, 2));
             });
        }
        const zipBlob = await zip.generateAsync({type:"blob"});
        saveAs(zipBlob, baseFilename + ".zip"); 
    });

    $('#download-selection-btn')?.addEventListener('click', () => {
        if (state.selectedFeatures.size === 0) { alert("Nichts ausgewählt!"); return; }
        const now = new Date();
        const dateStr = now.toISOString().slice(0,10).replace(/-/g, ""); 
        const systemName = state.selectedBrandDomain || 'nextbike';
        const filename = `${dateStr}_${systemName}_auswahl.geojson`;
        const collection = getFeaturesFromMap(true); 
        if (collection.features.length === 0) { alert("Fehler: ID Mismatch. Bitte neu auswählen."); return; }
        const cleaned = getCleanedGeoJSON(collection);
        const blob = new Blob([JSON.stringify(cleaned, null, 2)], {type:'application/geo+json'});
        saveAs(blob, filename);
    });

    $('#loadBtn').addEventListener('click', loadData);
    document.querySelectorAll('#top-toolbar .toolbar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveTool(e.currentTarget.dataset.target);
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault(); 
            if (state.selectedBrandDomain || state.activeToolId) resetSystemView();
            else {
                 if (!wrap.classList.contains('left-collapsed')) $('#toggle-left-panel').click();
                 if (!wrap.classList.contains('right-collapsed')) $('#toggle-right-panel').click();
            }
        }
    });
}