// js/ui.js
import { state } from './state.js';
import { $, option, generateFilename } from './utils.js';
import { loadData, fetchCitiesForBrand } from './api.js';
import { IsochroneTool } from './isochrone.js';
import { ENABLE_ISOCHRONE_TOOL } from './config.js';
import { cityIcon } from './map.js';

const importedLayers = {}; 
let currentlyEditingId = null;

// NEUE FUNKTION: Übernimmt das Befüllen der Dropdowns nach dem Laden
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
    
    // UI zurücksetzen
    document.querySelectorAll('.toolbar-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tool-section').forEach(el => el.classList.add('hidden'));

    if (isAlreadyActive) {
        // --- DEAKTIVIEREN ---
        state.activeToolId = null;
        if (!$('#main-wrap').classList.contains('left-collapsed')) $('#toggle-left-panel').click(); 
        
        // CSS-Klasse entfernen (Cursor & Klickverhalten normalisieren)
        $('#map').classList.remove('isochrone-mode');

    } else {
        // --- AKTIVIEREN ---
        state.activeToolId = toolId;
        const targetElement = $(`#${toolId}`);
        if (targetElement) targetElement.classList.remove('hidden');
        const targetButton = $(`[data-target="${toolId}"]`);
        if (targetButton) targetButton.classList.add('active');
        if ($('#main-wrap').classList.contains('left-collapsed')) $('#toggle-left-panel').click();
        
        // Prüfen, welches Tool aktiv ist
        if (toolId === 'isochrone-controls') {
            // Aktiviert CSS für Fadenkreuz & Klick-Durchlässigkeit
            $('#map').classList.add('isochrone-mode'); 
        } else {
            // Bei anderen Tools wieder normal
            $('#map').classList.remove('isochrone-mode');
        }
    }
}

export function resetSystemView() {
    state.layers.stationLayer.clearLayers(); 
    state.layers.flexzoneLayer.clearLayers();
    state.layers.businessAreaLayer.clearLayers();
    if (ENABLE_ISOCHRONE_TOOL && IsochroneTool) IsochroneTool.clear();
    
    state.selectedBrandDomain = null;
    state.currentGeoJSON = null;
    
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

    if (state.layers.cityLayer.getLayers().length > 0) {
        state.map.fitBounds(state.layers.cityLayer.getBounds(), {padding: [50, 50]});
    } else {
        state.map.setView([51.1657, 10.4515], 6);
    }
}

// js/ui.js

export function refreshBrandSelect() {
    const countryCode = ($('#countrySelect').value || '').toUpperCase();
    const brandSel = $('#brandSelect');
    const currentVal = brandSel.value; 

    brandSel.innerHTML = '<option value="">Alle Systeme</option>';

    state.brandList.forEach(brand => {
        if (!countryCode || brand.country_codes.has(countryCode)) {
            // UPDATED LINE: Added the domain in brackets to the label
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
    }catch(e){ 
        citySel.disabled = true; 
    }
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

// Event Listeners Setup
export function initUI() {
    const wrap = $('#main-wrap');
    
    // --- PANEL TOGGLES ---
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

    // --- TAB LOGIK (RECHTES PANEL) ---
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
        $('#view-imports').classList.add('tab-view-active'); // CSS Hilfsklasse
        $('#view-system').classList.add('hidden');
    });

    // --- EDITOR SPEICHER-LOGIK ---
    $('#save-import-btn').addEventListener('click', () => {
        if (!currentlyEditingId) {
            alert("Bitte wähle erst eine Ebene zum Bearbeiten aus.");
            return;
        }
        try {
            const updatedGeoJSON = JSON.parse($('#import-editor').value);
            // Alten Layer entfernen
            state.map.removeLayer(importedLayers[currentlyEditingId].layer);
            // Neuen Layer mit aktualisierten Daten hinzufügen
            const newLayer = L.geoJSON(updatedGeoJSON).addTo(state.map);
            importedLayers[currentlyEditingId].layer = newLayer;
            importedLayers[currentlyEditingId].data = updatedGeoJSON;
            alert("Änderungen erfolgreich auf Karte übernommen!");
        } catch (e) {
            alert("Fehler: Ungültiges GeoJSON-Format!");
            console.error(e);
        }
    });

    // --- DRAG & DROP LOGIK ---
    const dropZone = $('#drag-drop-zone');
    ['dragover', 'dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
    });
    
    dropZone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.geojson')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const geojson = JSON.parse(event.target.result);
                    const layerId = 'import_' + Date.now();
                    const layer = L.geoJSON(geojson).addTo(state.map);
                    
                    // Im Speicher ablegen
                    importedLayers[layerId] = { layer, data: geojson, name: file.name };
                    
                    // Automatisch zum Import-Tab wechseln
                    $('#tab-imports').click();

                    const list = $('#imported-files-list');
                    const li = document.createElement('li');
                    li.className = 'file-item';
                    li.id = `item-${layerId}`;
                    li.innerHTML = `
                        <span class="file-name" title="Zoom zu: ${file.name}">
                            <i class="fa-solid fa-layer-group"></i> ${file.name}
                        </span>
                        <div class="actions">
                            <button class="edit-btn" title="Bearbeiten"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button class="remove-btn" title="Löschen"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    `;

                    // Zoom bei Klick auf Namen
                    li.querySelector('.file-name').addEventListener('click', () => {
                        state.map.fitBounds(importedLayers[layerId].layer.getBounds(), {padding: [20, 20]});
                    });

                    // Bearbeiten Modus aktivieren
                    li.querySelector('.edit-btn').addEventListener('click', () => {
                        currentlyEditingId = layerId;
                        $('#import-editor').value = JSON.stringify(importedLayers[layerId].data, null, 2);
                        document.querySelectorAll('.file-item').forEach(el => el.classList.remove('editing'));
                        li.classList.add('editing');
                    });

                    // Ebene löschen
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
                    li.querySelector('.edit-btn').click(); // Direkt zum Editor laden
                    state.map.fitBounds(layer.getBounds(), {padding: [20, 20]});

                } catch (err) { alert('Fehler beim Parsen der Datei.'); }
            };
            reader.readAsText(file);
        } else { alert('Bitte eine .geojson Datei wählen.'); }
    });

    // --- NEXTBIKE SYSTEM LISTENERS ---
    $('#countrySelect').addEventListener('change', () => {
        updateAvailableBrands();
        $('#flexzone-toggle-container').classList.add('hidden');
    });

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
            state.layers.cityLayer.eachLayer(marker => { if (marker.getElement()) marker.getElement().style.display = 'none'; });
        } else {
            state.selectedBrandDomain = null;
            $('#flexzonesCheckbox').disabled = true;
            $('#businessAreasCheckbox').disabled = true;
            $('#flexzone-toggle-container').classList.add('hidden');
            
            refreshCitySelect(); 
            resetSystemView(); 
        }
    });

    $('#citySelect').addEventListener('change', () => {
        const cityUid = $('#citySelect').value;
        $('#brandSelect').value = ''; 
        state.selectedBrandDomain = null; 
        
        $('#flexzonesCheckbox').checked = false;
        $('#businessAreasCheckbox').checked = false;
        $('#flexzonesCheckbox').disabled = true;
        $('#businessAreasCheckbox').disabled = true;
        $('#flexzone-toggle-container').classList.add('hidden'); 

        if (cityUid) {
            const selectedCityData = state.rawCountries.flatMap(co => {
                const countryDomain = (co.domain || '').toLowerCase();
                return (co.cities || []).map(city => ({
                    ...city, domain: (city.domain || '').toLowerCase() || countryDomain
                }));
            }).find(c => String(c.uid) === cityUid);
                                                            
            if (selectedCityData && selectedCityData.domain) {
                state.selectedBrandDomain = selectedCityData.domain;
                $('#flexzonesCheckbox').checked = true;
                $('#businessAreasCheckbox').checked = true;
                $('#flexzonesCheckbox').disabled = false;
                $('#businessAreasCheckbox').disabled = false;
                $('#flexzone-toggle-container').classList.remove('hidden'); 
            }
        } 
        loadData();
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
            if (state.selectedBrandDomain || state.activeToolId) {
                 resetSystemView();
            } else {
                 if (!wrap.classList.contains('left-collapsed')) $('#toggle-left-panel').click();
                 if (!wrap.classList.contains('right-collapsed')) $('#toggle-right-panel').click();
            }
        }
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
        if(!state.currentGeoJSON) return;
        const filename = generateFilename(state.selectedBrandDomain) + '.geojson';
        const blob = new Blob([$('#geojson-output').value], {type:'application/geo+json;charset=utf-8'}); 
        saveAs(blob, filename); 
    });
    
    $('#zipBtn').addEventListener('click', async () => {
        if (!state.currentGeoJSON) return;
        const zip = new JSZip(); 
        const baseFilename = generateFilename(state.selectedBrandDomain);
        zip.file("stations.geojson", JSON.stringify(state.currentGeoJSON, null, 2));

        const getSanitizedFeatureName = (feature, defaultPrefix) => {
             const props = feature.properties || {};
             let rawName = props.name || props.id || props.uid || '';
             if (!rawName) return defaultPrefix;
             return String(rawName).replace(/[\W_]+/g, "_").toLowerCase() || defaultPrefix; 
        };

        const flexzoneGeoJSON = state.layers.flexzoneLayer.toGeoJSON();
        if (flexzoneGeoJSON.features.length > 0) {
             zip.file("fullsystem_flexzones.geojson", JSON.stringify(flexzoneGeoJSON, null, 2));
             flexzoneGeoJSON.features.forEach(feature => {
                 const sanitizedName = getSanitizedFeatureName(feature, 'unbenannte_flexzone');
                 zip.file(`flexzone_${sanitizedName}.geojson`, JSON.stringify({ type: "FeatureCollection", features: [feature] }, null, 2));
             });
        }
        
        const baGeoJSON = state.layers.businessAreaLayer.toGeoJSON();
        if (baGeoJSON.features.length > 0) {
             zip.file("fullsystem_business_areas.geojson", JSON.stringify(baGeoJSON, null, 2));
             baGeoJSON.features.forEach(feature => {
                 const sanitizedName = getSanitizedFeatureName(feature, 'unbenannte_business_area');
                 zip.file(`businessarea_${sanitizedName}.geojson`, JSON.stringify({ type: "FeatureCollection", features: [feature] }, null, 2));
             });
        }
        const zipBlob = await zip.generateAsync({type:"blob"});
        saveAs(zipBlob, baseFilename + ".zip"); 
    });
}