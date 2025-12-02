// ==================================================================================
// HAUPT-SKRIPT: Nextbike Map Viewer mit integriertem ORS Isochronen-Tool
// ==================================================================================

// API-Schlüssel & Konfiguration
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTEwMDFjZjYyNDgiLCJpZCI6IjJiMWZmNzYzNGZjMTRlYzlhODY0ZjMyOWE3ODFkNmVlIiwiaCI6Im11cm11cjY0In0=';
const ORS_BASE_ENDPOINT = 'https://api.openrouteservice.org/v2/isochrones/';
const ENABLE_ISOCHRONE_TOOL = true;

const $ = sel => document.querySelector(sel);
const corsProxy = 'https://corsproxy.io/?';

// --- Globale Variablen ---
let map, layer, currentGeoJSON = null;
let flexzoneLayer, businessAreaLayer;
let countryList = [], rawCountries = [], brandList = []; 
let selectedBrandDomain = null;
let allFlexzones = [];
let allBusinessAreas = [];
let activeToolId = 'filter-controls';

let cityLayer = L.featureGroup();
let mapLayersControl = null;
let IsochroneTool = null;

// --- Icons ---
const nextbikeIcon = L.icon({
    iconUrl: 'bike-icon-dunkelblau.png',
    iconSize:    [25, 35],
    iconAnchor:      [17, 35],
    popupAnchor:    [0, -35]
});

const cityIcon = L.icon({
    iconSize:     [50, 50],
    iconAnchor:   [25, 50],
    popupAnchor:  [0, -50],
    iconUrl: 'favicon.png'
});

// ==================================================================================
// MODUL: IsochroneToolFactory
// ==================================================================================
function IsochroneToolFactory(mapInstance, LInstance) {
    const map = mapInstance;
    const L = LInstance;
    let isochroneLayer = null;
    let clickMarkers = L.featureGroup();
    let selectedRange = 0;

    const markerIcon = L.divIcon({
        className: 'ors-marker-div',
        iconSize:    [12, 12],
        html: '<div style="background-color: #FF4500; width: 100%; height: 100%; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>'
    });

    async function fetchIsochrone() {
        const statusDiv = $('#isochrone-status'); 
        const calculateBtn = $('#calculateIsochroneBtn');
        
        const locations = [];
        clickMarkers.eachLayer(marker => {
            const latlng = marker.getLatLng();
            locations.push([latlng.lng, latlng.lat]);
        });
        
        if (locations.length === 0 || selectedRange === 0) {
            statusDiv.textContent = 'Fehler: Startpunkt(e) oder Zeitbereich fehlen.';
            return;
        }

        const profile = $('#orsProfileSelect').value;
        const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();

        calculateBtn.disabled = true;
        $('#calcIcon').innerHTML = '<span class="spinner"></span>';
        const rangeText = document.querySelector('.ors-range-btn.active')?.textContent || (selectedRange / 60) + ' Min.';
        statusDiv.textContent = `Berechne ${profileText}, ${rangeText} für ${locations.length} Punkt(e)...`;
        isochroneLayer.clearLayers();

        const requestBody = {
            locations: locations,
            range: [selectedRange],
            range_type: 'time',
            attributes: ['area', 'reachfactor'],
        };

        try {
            const dynamicEndpoint = `${ORS_BASE_ENDPOINT}${profile}`;
            const encodedApiKey = encodeURIComponent(ORS_API_KEY);
            const orsUrlWithKey = `${dynamicEndpoint}?api_key=${encodedApiKey}`;
            const urlWithProxy = `${corsProxy}${orsUrlWithKey}`;
            
            const resp = await fetch(urlWithProxy, { 
                method: 'POST',
                headers: {
                    'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify(requestBody)
            });

            if (!resp.ok) {
                const errorText = await resp.text();
                let errorMessage = `ORS API HTTP Fehler: ${resp.status}`;
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = `ORS API Fehler: ${errorData.error.message || errorData.error.info || 'Unbekannt'}`;
                } catch {
                    errorMessage = `ORS API Fehler: ${resp.status} - ${errorText.substring(0, 100)}...`;
                }
                throw new Error(errorMessage);
            }
            
            const geojson = await resp.json();
            isochroneLayer.addData(geojson);
            statusDiv.textContent = `${profileText}, ${rangeText} erfolgreich geladen für ${locations.length} Punkt(e).`;
            
        } catch (e) {
            console.error("Fehler beim Abrufen der Isochrone:", e);
            statusDiv.textContent = 'Fehler beim Laden der Isochrone: ' + e.message;
        } finally {
            calculateBtn.disabled = false;
            $('#calcIcon').innerHTML = '';
        }
    }

    function addMarker(latlng) {
        if (selectedRange === 0) {
            alert("Bitte wählen Sie zuerst eine Fahrzeit (z.B. 15 min) aus.");
            return;
        }
        if (clickMarkers.getLayers().length >= 5) {
            alert("Sie können maximal 5 Startpunkte gleichzeitig setzen.");
            return;
        }
        
        const newMarker = L.marker(latlng, { icon: markerIcon }).addTo(clickMarkers);
        const count = clickMarkers.getLayers().length;
        newMarker.bindPopup(`Startpunkt ${count}: ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`).openPopup();
        
        const rangeText = document.querySelector('.ors-range-btn.active')?.textContent || 'Zeit gewählt';
        const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
        $('#isochrone-status').textContent = `${profileText}, ${rangeText}. ${count} Punkt(e) gesetzt. Berechnen drücken.`;
        $('#calculateIsochroneBtn').disabled = false;
        $('#clearIsochroneBtn').disabled = false;
    }

    function clear() {
        clickMarkers.clearLayers();
        isochroneLayer.clearLayers();
        $('#calculateIsochroneBtn').disabled = true;
        $('#clearIsochroneBtn').disabled = true;
        
        const activeBtn = document.querySelector('.ors-range-btn.active');
        const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();

        if (activeBtn) {
            $('#isochrone-status').textContent = `Profil (${profileText}) und Zeit (${activeBtn.textContent}) gewählt. Klicken Sie auf die Karte, um Punkte zu setzen.`;
        } else {
            $('#isochrone-status').textContent = `Profil (${profileText}) gewählt. Bitte wählen Sie eine Zeit aus.`;
        }
        $('#calcIcon').innerHTML = '';
    }
    
    function init(baseMaps) {
        isochroneLayer = L.geoJSON(null, {
            style: { color: '#FF4500', weight: 3, opacity: 0.7, fillColor: '#FF6347', fillOpacity: 0.2 },
            onEachFeature: (f, l) => {
                const minutes = selectedRange / 60;
                const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
                l.bindPopup(`<b>${minutes} Minuten (${profileText})</b>`);
            }
        }).addTo(map); 
        clickMarkers.addTo(map);

        document.querySelectorAll('.ors-range-btn').forEach(button => {
            button.addEventListener('click', function() {
                document.querySelectorAll('.ors-range-btn').forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                selectedRange = parseInt(this.dataset.range);
                
                if (clickMarkers.getLayers().length > 0) {
                     $('#calculateIsochroneBtn').disabled = false;
                     $('#clearIsochroneBtn').disabled = false;
                     $('#isochrone-status').textContent = `${this.textContent} gewählt. ${clickMarkers.getLayers().length} Punkt(e) gesetzt. Berechnen drücken.`;
                } else {
                     $('#calculateIsochroneBtn').disabled = true;
                     $('#isochrone-status').textContent = `Klicken Sie auf die Karte, um den Startpunkt zu setzen.`;
                }
            });
        });

        $('#orsProfileSelect').addEventListener('change', () => {
            clear();
            const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
            $('#isochrone-status').textContent = `Profil (${profileText}) gewählt. Bitte neue Zeit wählen.`;
            document.querySelectorAll('.ors-range-btn').forEach(btn => btn.classList.remove('active'));
            selectedRange = 0;
        });
        
        $('#calculateIsochroneBtn').addEventListener('click', fetchIsochrone);
        $('#clearIsochroneBtn').addEventListener('click', clear);

        if (window.mapLayersControl) {
            window.mapLayersControl.addOverlay(isochroneLayer, "ORS Isochrone");
            window.mapLayersControl.addOverlay(clickMarkers, "Startpunkte");
        }
        $('#isochrone-status').textContent = `Klicken Sie auf das Werkzeug, um die Isochronen-Funktion zu nutzen.`;
    }

    return { init: init, addMarker: addMarker, clear: clear, clearAllLayers: clear };
}

// ==================================================================================
// HAUPT-FUNKTIONEN
// ==================================================================================

function setActiveTool(toolId) {
    const isAlreadyActive = (toolId === activeToolId);
    document.querySelectorAll('.toolbar-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tool-section').forEach(el => el.classList.add('hidden'));

    if (isAlreadyActive) {
        activeToolId = null;
        if (!$('#main-wrap').classList.contains('left-collapsed')) $('#toggle-left-panel').click(); 
    } else {
        activeToolId = toolId;
        const targetElement = $(`#${toolId}`);
        if (targetElement) targetElement.classList.remove('hidden');
        const targetButton = $(`[data-target="${toolId}"]`);
        if (targetButton) targetButton.classList.add('active');
        if ($('#main-wrap').classList.contains('left-collapsed')) $('#toggle-left-panel').click();
    }
}

function setupGeoJsonDropZone() {
    const dropZone = $('#drag-drop-zone');
    ['dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); });
    });
    dropZone.addEventListener('drop', handleFileDrop);
}

function handleFileDrop(e) {
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.geojson')) {
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const geojson = JSON.parse(event.target.result);
                const importLayer = L.geoJSON(geojson).addTo(map);
                map.fitBounds(importLayer.getBounds(), {padding: [20, 20]});
                alert('GeoJSON erfolgreich geladen!');
            } catch (error) {
                alert('Fehler beim Parsen der GeoJSON-Datei.');
            }
        };
        reader.readAsText(file);
    } else {
        alert('Bitte ziehen Sie eine gültige .geojson-Datei hierher.');
    }
}

function clearIsochrone() {
    if (ENABLE_ISOCHRONE_TOOL && IsochroneTool) IsochroneTool.clear();
}

function resetSystemView() {
    layer.clearLayers(); 
    flexzoneLayer.clearLayers();
    businessAreaLayer.clearLayers();
    if (ENABLE_ISOCHRONE_TOOL && IsochroneTool) IsochroneTool.clearAllLayers();
    
    selectedBrandDomain = null;
    currentGeoJSON = null;
    
    $('#countrySelect').value = '';
    $('#brandSelect').value = ''; // Dropdown zurücksetzen
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

    // WICHTIG: Marke/System Dropdown neu laden (alle anzeigen), da Filter aufgehoben
    refreshBrandSelect();
    refreshCitySelect();

    if (cityLayer.getLayers().length > 0) {
        map.fitBounds(cityLayer.getBounds(), {padding: [50, 50]});
    } else {
        map.setView([51.1657, 10.4515], 6);
    }
}

function onMapClickForIsochrone(e) {
    if (!ENABLE_ISOCHRONE_TOOL || activeToolId !== 'isochrone-controls') return;
    if (IsochroneTool) IsochroneTool.addMarker(e.latlng);
}

function initMap(){
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
    const positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap, &copy; CARTO', subdomains: 'abcd', maxZoom: 20 });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' });
    const baseMaps = { "OSM Standard": osm, "Positron": positron, "Satellit (Esri)": satellite };

    map = L.map('map', { layers: [positron], zoomControl: true }); 
    
    layer = L.geoJSON(null, {
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon: nextbikeIcon}),
        onEachFeature: (f, l) => {
            const p = f.properties || {};
            l.bindPopup(`<strong>${p.name||'Station'}</strong><br>Bikes: ${p.num_bikes_available ?? '–'}<br>Slots: ${p.num_docks_available ?? '–'}<br>ID: ${p.station_id}`);
        }
    });
    
    flexzoneLayer = L.geoJSON(null, {
        style: function(feature) {
            const category = feature.properties.category;
            if (category === 'free_return') return { color: '#000000', weight: 1, opacity: 1, fillColor: '#000000', fillOpacity: 0.2 };
            if (category === 'chargeable_return') return { color: '#FFA500', weight: 1, opacity: 1, fillColor: '#FFFF00', fillOpacity: 0.25 };
            return { color: "#0098FF", weight: 2, opacity: 0.8, fillColor: "#0098FF", fillOpacity: 0.2 };
        },
        onEachFeature: (f, l) => { if(f.properties.name) l.bindPopup(`<b>${f.properties.name}</b>`); }
    });

    businessAreaLayer = L.geoJSON(null, {
        style: function(feature) { return { color: "#FF0000", weight: 2, opacity: 0.9, fillColor: "#FF69B4", fillOpacity: 0.2 }; },
        onEachFeature: (f, l) => { if(f.properties.name) l.bindPopup(`<b>Business Area: ${f.properties.name}</b>`); }
    });

    layer.addTo(map);
    cityLayer.addTo(map);
    map.setView([51.1657, 10.4515], 6);
    
    if (ENABLE_ISOCHRONE_TOOL) {
        IsochroneTool = IsochroneToolFactory(map, L);
    } else {
        IsochroneTool = null;
    }

    mapLayersControl = L.control.layers(baseMaps, { 
        "Stationen": layer, "Flexzonen": flexzoneLayer, "Business Areas": businessAreaLayer, "Nextbike Städte": cityLayer
    }).addTo(map);
    
    if (ENABLE_ISOCHRONE_TOOL && IsochroneTool) IsochroneTool.init(baseMaps);

    $('#flexzonesCheckbox').disabled = true;
    $('#businessAreasCheckbox').disabled = true;
}

function option(value, label){ const o = document.createElement('option'); o.value = value; o.textContent = label; return o; }

function dedupeCountries(countriesIn){
    const mapC = new Map();
    countriesIn.forEach(c => {
        const code = (c.country || c.country_code || '').toUpperCase();
        const name = c.country_name || '';
        if(name && code && !mapC.has(code)) mapC.set(code, { country_code: code, country_name: name });
    });
    let arr = Array.from(mapC.values());
    arr.sort((a,b) => (a.country_name==='Germany' ? -1 : b.country_name==='Germany' ? 1 : (a.country_name||'').localeCompare(b.country_name||'')));
    return arr;
}

function buildBrands(dataCountries) {
    const mapB = new Map();
    dataCountries.forEach(topLevelObject => {
        const geo_country_code = (topLevelObject.country || '').toUpperCase();
        const processEntity = (entity, nameFallback) => {
            const domain = (entity.domain || '').toLowerCase();
            if (!domain) return;
            const name = entity.name || entity.alias || nameFallback || `System ${domain}`;
            if (!mapB.has(domain)) { mapB.set(domain, { key: domain, domain, name, country_codes: new Set() }); }
            if (geo_country_code) mapB.get(domain).country_codes.add(geo_country_code);
        };
        processEntity(topLevelObject);
        if (topLevelObject.cities) { topLevelObject.cities.forEach(city => processEntity(city, city.city)); }
    });
    return Array.from(mapB.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// ----------------------------------------------------------------------------------
// WICHTIG: Die fehlende Funktion "refreshBrandSelect" wurde hier eingefügt!
// ----------------------------------------------------------------------------------
function refreshBrandSelect() {
    const countryCode = ($('#countrySelect').value || '').toUpperCase();
    const brandSel = $('#brandSelect');
    const currentVal = brandSel.value; // Aktuelle Auswahl merken

    // Dropdown leeren
    brandSel.innerHTML = '<option value="">Alle Systeme</option>';

    // Optionen hinzufügen
    brandList.forEach(brand => {
        // Zeige Marke an, wenn KEIN Land gewählt ist ODER die Marke im gewählten Land verfügbar ist
        if (!countryCode || brand.country_codes.has(countryCode)) {
            brandSel.appendChild(option(brand.domain, brand.name));
        }
    });

    // Versuch, den alten Wert wiederherzustellen (falls er noch in der Liste ist)
    brandSel.value = currentVal;
}


async function loadLists(){
    $('#load-status').style.visibility = 'visible';
    $('#load-status').textContent = 'Systeme werden geladen...';
    try{
        const url = `${corsProxy}https://maps.nextbike.net/maps/nextbike-official.json?list_cities=1&bikes=0`;
        const resp = await fetch(url, { cache: 'no-store' });
        if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data || !data.countries) throw new Error("API-Antwort ist ungültig.");

        rawCountries = data.countries;
        countryList = dedupeCountries(rawCountries);
        brandList = buildBrands(rawCountries);

        const cSel = $('#countrySelect'); cSel.innerHTML = '';
        cSel.appendChild(option('', 'Alle Länder (Filter)'));
        countryList.forEach(c => cSel.appendChild(option(c.country_code, `${c.country_name} (${c.country_code})`)));
        
        // Initial Marke füllen
        refreshBrandSelect();

        drawAllCityMarkers(); 
        refreshCitySelect();
        
        $('#load-status').textContent = 'Bitte Auswahl treffen.';
        $('#load-status').style.visibility = 'visible';
        
        loadAllFlexzones();
        loadAllBusinessAreas();
    }catch(e){
        $('#load-status').textContent = 'Fehler beim Laden der System-Listen.';
        alert('Fehler beim Laden der System-Listen.');
    }
}

async function loadAllFlexzones() {
    try {
        const flexzoneResp = await fetch(`${corsProxy}https://api.nextbike.net/api/v1.1/getFlexzones.json?api_key=API_KEY_GELOESCHT`);
        if (!flexzoneResp.ok) throw new Error(`Flexzonen-API HTTP ${flexzoneResp.status}`);
        const flexzoneData = await flexzoneResp.json();
        if (flexzoneData.geojson?.nodeValue?.features) allFlexzones = flexzoneData.geojson.nodeValue.features;
        else if (flexzoneData.geojson?.features) allFlexzones = flexzoneData.geojson.features;
        else allFlexzones = [];
    } catch(e) { allFlexzones = []; }
}

async function loadAllBusinessAreas() {
    try {
        const businessAreaResp = await fetch(`${corsProxy}https://api.nextbike.net/api/v1.1/getFlexzones.json?api_key=API_KEY_GELOESCHT&categories=business_area`);
        if (!businessAreaResp.ok) throw new Error(`BusinessArea-API HTTP ${businessAreaResp.status}`);
        const businessAreaData = await businessAreaResp.json();
        if (businessAreaData.geojson?.nodeValue?.features) allBusinessAreas = businessAreaData.geojson.nodeValue.features;
        else if (businessAreaData.geojson?.features) allBusinessAreas = businessAreaData.geojson.features;
        else allBusinessAreas = [];
    } catch(e) { allBusinessAreas = []; }
}

// Aktualisiert beide Dropdowns bei Länderwechsel
function updateAvailableBrands(){
    $('#brandSelect').value = ''; // Reset Brand
    selectedBrandDomain = null; 
    $('#citySelect').value = ''; // Reset City
    
    $('#flexzone-toggle-container').classList.add('hidden');
    $('#flexzonesCheckbox').disabled = true;
    $('#businessAreasCheckbox').disabled = true;
    
    // Beide Dropdowns aktualisieren
    refreshBrandSelect(); 
    refreshCitySelect();
}

function fetchCitiesForBrand(domain, countryCode) { 
    const out = [];
    const domainLower = domain ? domain.toLowerCase() : null;
    const countryCodeUpper = countryCode ? countryCode.toUpperCase() : null;

    rawCountries.forEach(co => {
        const cc = (co.country || co.country_code || '').toUpperCase();
        const countryDomain = (co.domain || '').toLowerCase(); 
        if (countryCodeUpper && cc !== countryCodeUpper) return;

        co.cities?.forEach(city => {
            const cityDomain = (city.domain || '').toLowerCase(); 
            const domainMatch = !domainLower || cityDomain === domainLower || countryDomain === domainLower;
            if (domainMatch && typeof city.lat === 'number' && typeof city.lng === 'number') {
                 out.push({ 
                     uid: city.uid, name: city.name || city.alias || city.city || `#${city.uid}`, 
                     country_code: cc, lat: city.lat, lng: city.lng, domain: cityDomain || countryDomain 
                 });
            }
        });
    });
    return [...new Map(out.map(item => [item.uid, item])).values()].sort((a,b)=> (a.name||'').localeCompare(b.name||''));
}

function drawAllCityMarkers() {
    cityLayer.clearLayers();
    const out = [];

    rawCountries.forEach(co => {
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
        
        // CLICK HANDLER (Angepasst für Select)
        marker.on('click', function() {
            const brandSelect = $('#brandSelect');
            const domain = city.domain;

            $('#countrySelect').value = city.country_code;
            
            // Erst Liste filtern, dann Wert setzen
            refreshBrandSelect();
            brandSelect.value = domain; 
            
            $('#flexzonesCheckbox').checked = true;
            $('#businessAreasCheckbox').checked = true;
            $('#flexzonesCheckbox').disabled = false;
            $('#businessAreasCheckbox').disabled = false;
            
            brandSelect.dispatchEvent(new Event('change'));
            setActiveTool('filter-controls');
        });

        const popupContent = `<b>${city.name}</b><br>System: ${city.domain || 'N/A'}<br>Land: ${city.country_code}`;
        marker.bindPopup(popupContent);
        cityLayer.addLayer(marker);
    });
    
    if (cityLayer.getLayers().length > 0) map.fitBounds(cityLayer.getBounds(), {padding: [50, 50]});
}


async function refreshCitySelect(){
    const brandKey = selectedBrandDomain;
    const countryCode = ($('#countrySelect').value || '').toUpperCase();
    const citySel = $('#citySelect');
    
    cityLayer.eachLayer(marker => {
        const markerDomain = marker.options._domain;
        const domainMatch = !brandKey || markerDomain === brandKey;
        const markerCountryCode = marker.options.feature?.properties?.country_code || '';
        const countryMatch = !countryCode || markerCountryCode === countryCode;
        const displayStyle = domainMatch && countryMatch ? '' : 'none';
        if (marker.getElement()) marker.getElement().style.display = displayStyle;
    });

    citySel.innerHTML = '<option value="">Alle Städte im System / Land</option>';
    if (rawCountries.length === 0) { citySel.disabled = true; return; }
    
    try{
        let items = await fetchCitiesForBrand(brandKey, countryCode); 
        items.forEach(city => {
            const labelSuffix = (city.country_code && !countryCode) ? ` (${city.country_code})` : '';
            citySel.appendChild(option(String(city.uid), `${city.name}${labelSuffix}`));
        });
        citySel.disabled = false;
        if (items.length > 0) citySel.options[0].textContent = `Alle ${items.length} Städte im Filterbereich`;
    }catch(e){ 
        console.error("Fehler bei Cities:", e); 
        citySel.disabled = true; 
    }
}

function fcFromNextbike(json){
    const features = [];
    json.countries?.forEach(country => {
        country.cities?.forEach(city => {
            const domain = city.domain || '';
            city.places?.forEach(place => {
                if(typeof place.lat !== 'number' || typeof place.lng !== 'number') return;
                features.push({ 
                    type:'Feature', geometry:{ type:'Point', coordinates:[place.lng, place.lat] }, 
                    properties: {
                        station_id: String(place.number ?? place.uid ?? ''), name: place.name || '', address: place.address || '',
                        capacity: place.bike_racks ?? null, num_bikes_available: place.bikes ?? null, num_docks_available: place.free_racks ?? null,
                        city_uid: city.uid ?? null, city_name: city.name || city.city || city.alias || '', domain, country_name: country.country_name || ''
                    }
                });
            });
        });
    });
    return { type:'FeatureCollection', features };
}

async function loadData(){
    const loadBtn = $('#loadBtn');
    loadBtn.disabled = true; 
    $('#loadIcon').innerHTML = '<span class="spinner"></span>'; 
    $('#load-status').textContent = 'Lade Stationen...';
    $('#load-status').style.visibility = 'visible';
    
    if (!selectedBrandDomain) {
        if (map.hasLayer(flexzoneLayer)) map.removeLayer(flexzoneLayer);
        if (map.hasLayer(businessAreaLayer)) map.removeLayer(businessAreaLayer);
    }

    try{
        const domain = selectedBrandDomain, cityUid = $('#citySelect').value;
        const countryCode = ($('#countrySelect').value || '').toUpperCase();
        let baseUrl = 'https://maps.nextbike.net/maps/nextbike-official.json?bikes=0';
        let loadScope = 'Stationen';
        const isCitySelected = !!cityUid; 

        if(cityUid) { 
            baseUrl += `&city=${cityUid}`;
            const cityName = $('#citySelect').options[$('#citySelect').selectedIndex].text.split('(')[0].trim();
            loadScope = `Stationen in ${cityName}`;
        }
        else if(domain) { 
            baseUrl += `&domains=${domain}`;
            const brandName = $('#brandSelect').options[$('#brandSelect').selectedIndex].text.trim();
            loadScope = `Stationen von ${brandName}`;
        }
        else if(countryCode) { 
            baseUrl += `&countries=${countryCode}`;
            const countryName = $('#countrySelect').options[$('#countrySelect').selectedIndex].text.split('(')[0].trim();
            loadScope = `Stationen in ${countryName}`;
        } else {
             $('#load-status').textContent = 'Bitte System, Stadt oder Land wählen.';
             layer.clearLayers(); currentGeoJSON = null;
             $('#geojsonBtn').disabled = true; $('#zipBtn').disabled = true;
             return;
        }

        const resp = await fetch(`${corsProxy}${baseUrl}`, { cache: 'no-store' }); 
        if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        let fc = fcFromNextbike(data); 

        const filterTxt = ($('#quickFilter').value||'').trim().toLowerCase();
        if(filterTxt){
            fc.features = fc.features.filter(f => `${f.properties.name} ${f.properties.address}`.toLowerCase().includes(filterTxt));
        }

        currentGeoJSON = fc; 
        const stationCount = fc.features.length;
        const timestamp = new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
        $('#load-status').innerHTML = `<strong>${stationCount}</strong> ${loadScope} geladen (${timestamp})`; 

        $('#geojson-output').value = JSON.stringify(fc, null, 2); 
        layer.clearLayers().addData(fc); 
        $('#geojsonBtn').disabled = stationCount === 0;
        $('#zipBtn').disabled = stationCount === 0;

        const activeDomain = selectedBrandDomain; 
        flexzoneLayer.clearLayers();
        if ($('#flexzonesCheckbox').checked && allFlexzones.length > 0 && activeDomain) {
            if (!map.hasLayer(flexzoneLayer)) map.addLayer(flexzoneLayer);
            const rel = allFlexzones.filter(f => f.properties?.domain === activeDomain);
            if (rel.length > 0) flexzoneLayer.addData({ type: "FeatureCollection", features: rel });
        } else {
            if (map.hasLayer(flexzoneLayer)) map.removeLayer(flexzoneLayer);
        }

        businessAreaLayer.clearLayers();
        if ($('#businessAreasCheckbox').checked && allBusinessAreas.length > 0 && activeDomain) {
            if (!map.hasLayer(businessAreaLayer)) map.addLayer(businessAreaLayer);
            const rel = allBusinessAreas.filter(f => f.properties?.domain === activeDomain);
            if (rel.length > 0) businessAreaLayer.addData({ type: "FeatureCollection", features: rel });
        } else {
            if (map.hasLayer(businessAreaLayer)) map.removeLayer(businessAreaLayer);
        }
        
        let targetLayer;
        if (isCitySelected) {
            targetLayer = layer;
        } else {
            targetLayer = L.featureGroup([...layer.getLayers(), ...flexzoneLayer.getLayers(), ...businessAreaLayer.getLayers()]);
        }
        
        if (targetLayer.getLayers().length > 0) {
            const bounds = targetLayer.getBounds();
            if (bounds.isValid()) map.fitBounds(bounds, {padding: [50, 50]});
            else if (fc.features.length > 0) map.setView([fc.features[0].geometry.coordinates[1], fc.features[0].geometry.coordinates[0]], 14);
            else map.setView([51.1657, 10.4515], 6); 
        } else {
             map.setView([51.1657, 10.4515], 6); 
        }
        
    }catch(e){ 
        $('#load-status').textContent = 'Fehler: '+e.message; 
        $('#geojsonBtn').disabled = true; $('#zipBtn').disabled = true;
    }
    finally{ loadBtn.disabled = false; $('#loadIcon').innerHTML = ''; }
}

function generateFilename(cityAlias) {
    if (!cityAlias) cityAlias = "nextbike";
    const now = new Date();
    const p = v => v.toString().padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}_${cityAlias}_stations`;
}

async function downloadZip() {
    if (!currentGeoJSON) return;
    const zip = new JSZip(); 
    const baseFilename = generateFilename(selectedBrandDomain);
    zip.file("stations.geojson", JSON.stringify(currentGeoJSON, null, 2));

    const getSanitizedFeatureName = (feature, defaultPrefix) => {
         const props = feature.properties || {};
         let rawName = props.name || props.id || props.uid || '';
         if (!rawName) return defaultPrefix;
         return String(rawName).replace(/[\W_]+/g, "_").toLowerCase() || defaultPrefix; 
    };

    const flexzoneGeoJSON = flexzoneLayer.toGeoJSON();
    if (flexzoneGeoJSON.features.length > 0) {
         zip.file("fullsystem_flexzones.geojson", JSON.stringify(flexzoneGeoJSON, null, 2));
         flexzoneGeoJSON.features.forEach(feature => {
             const sanitizedName = getSanitizedFeatureName(feature, 'unbenannte_flexzone');
             zip.file(`flexzone_${sanitizedName}.geojson`, JSON.stringify({ type: "FeatureCollection", features: [feature] }, null, 2));
         });
    }

    const businessAreaGeoJSON = businessAreaLayer.toGeoJSON();
    if (businessAreaGeoJSON.features.length > 0) {
         zip.file("fullsystem_business_areas.geojson", JSON.stringify(businessAreaGeoJSON, null, 2));
         businessAreaGeoJSON.features.forEach(feature => {
             const sanitizedName = getSanitizedFeatureName(feature, 'unbenannte_business_area');
             zip.file(`businessarea_${sanitizedName}.geojson`, JSON.stringify({ type: "FeatureCollection", features: [feature] }, null, 2));
         });
    }

    const zipBlob = await zip.generateAsync({type:"blob"});
    saveAs(zipBlob, baseFilename + ".zip"); 
}

function setupSidebars() {
    const wrap = $('#main-wrap');
    const toggleLeftBtn = $('#toggle-left-panel');
    const toggleRightBtn = $('#toggle-right-panel');
    toggleLeftBtn.addEventListener('click', () => {
        wrap.classList.toggle('left-collapsed');
        toggleLeftBtn.textContent = wrap.classList.contains('left-collapsed') ? '▶' : '◀';
        setTimeout(() => map.invalidateSize({debounceMoveend: true}), 350); 
    });
    if (toggleRightBtn) {
        toggleRightBtn.addEventListener('click', () => {
            wrap.classList.toggle('right-collapsed');
            toggleRightBtn.textContent = wrap.classList.contains('right-collapsed') ? '◀' : '▶';
            setTimeout(() => map.invalidateSize({debounceMoveend: true}), 350);
        });
    }
}

// Angepasst für Select-Logik (kein Autocomplete mehr)
function setupBrandSearch() {
    const brandSelect = $('#brandSelect');
    const countrySelect = $('#countrySelect');
    const flexzoneToggle = $('#flexzone-toggle-container');
    
    countrySelect.addEventListener('change', () => {
        updateAvailableBrands();
        flexzoneToggle.classList.add('hidden');
    });

    brandSelect.addEventListener('change', () => {
        const selectedDomain = brandSelect.value;
        
        layer.clearLayers(); 
        flexzoneLayer.clearLayers(); 
        businessAreaLayer.clearLayers(); 
        $('#citySelect').value = '';

        if (selectedDomain) {
            selectedBrandDomain = selectedDomain; 
            $('#flexzonesCheckbox').checked = true;
            $('#businessAreasCheckbox').checked = true;
            $('#flexzonesCheckbox').disabled = false;
            $('#businessAreasCheckbox').disabled = false;
            flexzoneToggle.classList.remove('hidden'); 
            
            loadData(); 
            refreshCitySelect(); 
            
            // Marker ausblenden, da spezifisches System gewählt
            cityLayer.eachLayer(marker => { if (marker.getElement()) marker.getElement().style.display = 'none'; });
        } else {
            selectedBrandDomain = null;
            $('#flexzonesCheckbox').disabled = true;
            $('#businessAreasCheckbox').disabled = true;
            flexzoneToggle.classList.add('hidden');
            
            refreshCitySelect(); 
            resetSystemView(); 
        }
    });
}

function setupCitySelectHandler() {
    const citySelect = $('#citySelect');
    const flexzoneToggle = $('#flexzone-toggle-container');

    citySelect.addEventListener('change', () => {
        const cityUid = citySelect.value;
        $('#brandSelect').value = ''; // Reset Brand
        selectedBrandDomain = null; 
        
        $('#flexzonesCheckbox').checked = false;
        $('#businessAreasCheckbox').checked = false;
        $('#flexzonesCheckbox').disabled = true;
        $('#businessAreasCheckbox').disabled = true;
        flexzoneToggle.classList.add('hidden'); 

        if (cityUid) {
            const selectedCityData = rawCountries.flatMap(co => {
                const countryDomain = (co.domain || '').toLowerCase();
                return (co.cities || []).map(city => ({
                    ...city, domain: (city.domain || '').toLowerCase() || countryDomain
                }));
            }).find(c => String(c.uid) === cityUid);
                                                            
            if (selectedCityData && selectedCityData.domain) {
                selectedBrandDomain = selectedCityData.domain;
                $('#flexzonesCheckbox').checked = true;
                $('#businessAreasCheckbox').checked = true;
                $('#flexzonesCheckbox').disabled = false;
                $('#businessAreasCheckbox').disabled = false;
                flexzoneToggle.classList.remove('hidden'); 
            }
        } 
        loadData();
    });
}

function setupToolbar() {
    document.querySelectorAll('#top-toolbar .toolbar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.currentTarget.dataset.target;
            setActiveTool(targetId);
        });
    });
    $('#toolbar-filter-btn').classList.add('active'); 
}

// ==================================================================================
// INITIALISIERUNG
// ==================================================================================
window.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadLists();
    
    setupSidebars();
    setupBrandSearch(); 
    setupToolbar();
    setupGeoJsonDropZone(); 
    setupCitySelectHandler();

    // setupAutocomplete() wurde entfernt!

    if (!ENABLE_ISOCHRONE_TOOL) {
        const btn = document.querySelector('[data-target="isochrone-controls"]');
        if (btn) btn.style.display = 'none';
        if (activeToolId === 'isochrone-controls') activeToolId = 'filter-controls';
    }

    map.on('click', onMapClickForIsochrone); 
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault(); 
            if (selectedBrandDomain || activeToolId) {
                 resetSystemView();
            } else {
                 if (!$('#main-wrap').classList.contains('left-collapsed')) $('#toggle-left-panel').click();
                 if (!$('#main-wrap').classList.contains('right-collapsed')) $('#toggle-right-panel').click();
            }
        }
    });
    
    $('#loadBtn').addEventListener('click', loadData);
    $('#geojsonBtn').addEventListener('click', () => {
        if(!currentGeoJSON) return;
        const filename = generateFilename(selectedBrandDomain) + '.geojson';
        const blob = new Blob([$('#geojson-output').value], {type:'application/geo+json;charset=utf-8'}); 
        saveAs(blob, filename); 
    });
    
    $('#zipBtn').addEventListener('click', downloadZip);
    
    $('#flexzonesCheckbox').addEventListener('change', (e) => {
        if (selectedBrandDomain) loadData(); 
        else if (!e.target.checked && map.hasLayer(flexzoneLayer)) map.removeLayer(flexzoneLayer);
    });

    $('#businessAreasCheckbox').addEventListener('change', (e) => {
        if (selectedBrandDomain) loadData(); 
        else if (!e.target.checked && map.hasLayer(businessAreaLayer)) map.removeLayer(businessAreaLayer);
    });
});

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});