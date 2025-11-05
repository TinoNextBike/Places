// Neue Konstante für den API-Schlüssel (Bestätigter Wert)
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjJiMWZmNzYzNGZjMTRlYzlhODY0ZjMyOWE3ODFkNmVlIiwiaCI6Im11cm11cjY0In0=';
const ORS_BASE_ENDPOINT = 'https://api.openrouteservice.org/v2/isochrones/'; // Basis-Endpunkt ohne Profil

const $ = sel => document.querySelector(sel);
const corsProxy = 'https://corsproxy.io/?';

let map, layer, currentGeoJSON = null;
let flexzoneLayer, businessAreaLayer;
let countryList = [], rawCountries = [], brandList = [], availableBrands = [];
let selectedBrandDomain = null;
let allFlexzones = [];
let allBusinessAreas = [];
let activeToolId = null; // GEÄNDERT: Kein Tool ist beim Start aktiv

// Globale Variablen für Isochronen
let isochroneLayer = null; // Layer für das Isochronen-Polygon
let clickMarkers = L.featureGroup(); // FeatureGroup für alle gesetzten Marker
let selectedRange = 0; // Die aktuell ausgewählte Zeit in Sekunden (0 wenn nichts ausgewählt)
let mapLayersControl = null; // Variable für die Leaflet Layer Control (bleibt aktiv)

let markerIcon = L.divIcon({ // Ein einfacher, kreisförmiger Icon-Stil für die Punkte
    className: 'ors-marker-div',
    iconSize: [12, 12],
    html: '<div style="background-color: #FF4500; width: 100%; height: 100%; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>'
});

const nextbikeIcon = L.icon({
    iconUrl: 'pic/marker/marker_nbblue.png',
    iconSize:     [35, 35],
    iconAnchor:   [17, 35],
    popupAnchor:  [0, -35]
});

/**
 * Steuert, welche Werkzeug-Sektion im linken Panel aktiv ist.
 * Beim erneuten Klick auf das aktive Tool wird dieses geschlossen.
 * @param {string} toolId Die ID des zu aktivierenden Tools (z.B. 'isochrone-controls').
 */
function setActiveTool(toolId) {
    const isAlreadyActive = (toolId === activeToolId);
    
    // Deaktiviere alle Toolbar-Buttons
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Verstecke alle Tool-Sektionen
    document.querySelectorAll('.tool-section').forEach(el => {
        el.classList.add('hidden');
    });

    if (isAlreadyActive) {
        // Tool war bereits aktiv -> Deaktivieren und Panel schließen
        activeToolId = null;
        if (!$('#main-wrap').classList.contains('left-collapsed')) {
             $('#toggle-left-panel').click();
        }
    } else {
        // Neues Tool aktivieren
        activeToolId = toolId;

        // Zeige das neue aktive Tool an
        const targetElement = $(`#${toolId}`);
        if (targetElement) {
            targetElement.classList.remove('hidden');
        }
        
        // Aktiviere den entsprechenden Toolbar-Button
        const targetButton = $(`[data-target="${toolId}"]`);
        if (targetButton) {
            targetButton.classList.add('active');
        }
        
        // Panel links öffnen, falls es geschlossen ist
        if ($('#main-wrap').classList.contains('left-collapsed')) {
             $('#toggle-left-panel').click();
        }
    }
}

// Initialisiert den Isochronen-Layer und die Event-Handler
function initIsochroneFunctionality(baseMaps) {
    isochroneLayer = L.geoJSON(null, {
        style: {
            color: '#FF4500', 
            weight: 3,
            opacity: 0.7,
            fillColor: '#FF6347', 
            fillOpacity: 0.2
        },
        onEachFeature: (f, l) => {
            const minutes = selectedRange / 60;
            const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
            l.bindPopup(`<b>${minutes} Minuten (${profileText})</b>`);
        }
    }).addTo(map);
    
    // Fügt Marker-Gruppe zur Karte hinzu
    clickMarkers.addTo(map);

    // Fügt den Isochronen-Layer zu den Overlays hinzu (Zentralisierte Layer Control)
    mapLayersControl = L.control.layers(baseMaps, { 
        "Stationen": layer,
        "Flexzonen": flexzoneLayer,
        "Business Areas": businessAreaLayer,
        "ORS Isochrone": isochroneLayer,
        "Startpunkte": clickMarkers 
    }).addTo(map);
    
    // Click-Handler für die Karte, um den Ausgangspunkt zu setzen (aktiviert nur, wenn Zeit gewählt)
    map.on('click', onMapClickForIsochrone);
    
    // Event Listener für die Range-Buttons
    document.querySelectorAll('.ors-range-btn').forEach(button => {
        button.addEventListener('click', function() {
            // Deaktiviert alle anderen Buttons und aktiviert diesen
            document.querySelectorAll('.ors-range-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            selectedRange = parseInt(this.dataset.range);
            
            // Wenn bereits Punkte gesetzt sind, aktualisiere den Status und ermögliche die Berechnung
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

    // Event Listener für das neue Profil-Dropdown
    $('#orsProfileSelect').addEventListener('change', () => {
        // Status und Layer-Popup neu setzen (Isochrone muss neu berechnet werden)
        clearIsochrone(); 
        const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
        $('#isochrone-status').textContent = `Profil (${profileText}) gewählt. Bitte neue Zeit wählen.`;
        
        // Alle Zeit-Buttons deaktivieren, bis eine neue Zeit gewählt wird
        document.querySelectorAll('.ors-range-btn').forEach(btn => btn.classList.remove('active'));
        selectedRange = 0;
    });

    // Event Listener für Berechnen und Löschen
    $('#calculateIsochroneBtn').addEventListener('click', fetchIsochrone);
    $('#clearIsochroneBtn').addEventListener('click', clearIsochrone);
}

// Löscht alle Marker und das Polygon
function clearIsochrone() {
    clickMarkers.clearLayers();
    isochroneLayer.clearLayers();
    $('#calculateIsochroneBtn').disabled = true;
    $('#clearIsochroneBtn').disabled = true;
    
    // Setze Status basierend auf der Auswahl
    const activeBtn = document.querySelector('.ors-range-btn.active');
    const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();

    if (activeBtn) {
        $('#isochrone-status').textContent = `Profil (${profileText}) und Zeit (${activeBtn.textContent}) gewählt. Klicken Sie auf die Karte, um Punkte zu setzen.`;
    } else {
        $('#isochrone-status').textContent = `Profil (${profileText}) gewählt. Bitte wählen Sie eine Zeit aus.`;
    }
    
    $('#calcIcon').innerHTML = ''; // Entferne Spinner, falls vorhanden
}

// Behandelt Karten-Klicks für den Isochronen-Startpunkt
function onMapClickForIsochrone(e) {
    if (activeToolId !== 'isochrone-controls') return; // Nur aktiv, wenn Isochrone aktiv
    
    if (selectedRange === 0) {
        alert("Bitte wählen Sie zuerst eine Fahrzeit (z.B. 15 min) aus.");
        return;
    }
    
    // Max. 5 Locations pro ORS-Anfrage
    if (clickMarkers.getLayers().length >= 5) {
        alert("Sie können maximal 5 Startpunkte gleichzeitig setzen.");
        return;
    }
    
    const latlng = e.latlng;
    
    // Setzt neuen Marker
    const newMarker = L.marker(latlng, { icon: markerIcon }).addTo(clickMarkers);
    
    const count = clickMarkers.getLayers().length;
    newMarker.bindPopup(`Startpunkt ${count}: ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`).openPopup();
    
    // Status aktualisieren und Button aktivieren
    const rangeText = document.querySelector('.ors-range-btn.active')?.textContent || 'Zeit gewählt';
    const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
    $('#isochrone-status').textContent = `${profileText}, ${rangeText}. ${count} Punkt(e) gesetzt. Berechnen drücken.`;
    $('#calculateIsochroneBtn').disabled = false;
    $('#clearIsochroneBtn').disabled = false;
}

// Ruft die ORS Isochrone API auf
async function fetchIsochrone() {
    const statusDiv = $('#isochrone-status'); 
    const calculateBtn = $('#calculateIsochroneBtn');
    
    const locations = [];
    clickMarkers.eachLayer(marker => {
        const latlng = marker.getLatLng();
        locations.push([latlng.lng, latlng.lat]); // ORS erwartet [lon, lat]
    });
    
    if (locations.length === 0) {
        statusDiv.textContent = 'Es wurden keine Startpunkte gesetzt.';
        return;
    }

    const profile = $('#orsProfileSelect').value; // Dynamisch das Profil abrufen
    const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();

    // UI Feedback starten
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
        // smoothing: 5
    };

    try {
        // Der ORS Endpunkt MUSS das Profil enthalten
        const dynamicEndpoint = `${ORS_BASE_ENDPOINT}${profile}`; 

        // API-Schlüssel kodieren und als URL-Parameter übergeben
        const encodedApiKey = encodeURIComponent(ORS_API_KEY);
        const orsUrlWithKey = `${dynamicEndpoint}?api_key=${encodedApiKey}`;

        // Leite die vollständige URL durch den CORS-Proxy
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
    }
    finally {
        calculateBtn.disabled = false;
        $('#calcIcon').innerHTML = '';
    }
}


function initMap(){
    // Basemap-Definitionen
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    const positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    });
    const baseMaps = {
        "OSM Standard": osm,
        "Positron": positron,
        "Satellit (Esri)": satellite
    };

    // Initialisierung der Karte mit standardmäßiger Zoom Control (wieder aktiv)
    map = L.map('map', { 
        layers: [positron],
        zoomControl: true // Zoom Control ist wieder an
    }); 
    
    // Layer für die Daten
    layer = L.geoJSON(null, {
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon: nextbikeIcon}),
        onEachFeature: (f, l) => {
            const p = f.properties || {};
            l.bindPopup(`<strong>${p.name||'Station'}</strong><br>`+
                        `Fahrräder: ${p.num_bikes_available ?? '–'}<br>`+
                        `Freie Plätze: ${p.num_docks_available ?? '–'}<br>`+
                        `ID: ${p.station_id}`);
        }
    });
    
    flexzoneLayer = L.geoJSON(null, {
        style: function(feature) {
            const category = feature.properties.category;
            if (category === 'free_return') {
                return { color: '#000000', weight: 1, opacity: 1, fillColor: '#000000', fillOpacity: 0.2 };
            }
            if (category === 'chargeable_return') {
                return { color: '#FFA500', weight: 1, opacity: 1, fillColor: '#FFFF00', fillOpacity: 0.25 };
            }
            return { color: "#0098FF", weight: 2, opacity: 0.8, fillColor: "#0098FF", fillOpacity: 0.2 };
        },
        onEachFeature: (f, l) => {
            if(f.properties.name) l.bindPopup(`<b>${f.properties.name}</b>`);
        }
    });

    businessAreaLayer = L.geoJSON(null, {
        style: function(feature) {
            return { color: "#FF0000", weight: 2, opacity: 0.9, fillColor: "#FF69B4", fillOpacity: 0.2 };
        },
        onEachFeature: (f, l) => {
            if(f.properties.name)  {
                l.bindPopup(`<b>Business Area: ${f.properties.name}</b>`);
            }
        }
    });

    // Layer zur Karte hinzufügen (sichtbar machen)
    layer.addTo(map);
    // Nur zu Karte hinzufügen, wenn die Checkboxen initial gecheckt sind.
    if ($('#flexzonesCheckbox').checked) {
        flexzoneLayer.addTo(map);
    }
    if ($('#businessAreasCheckbox') && $('#businessAreasCheckbox').checked) {
        businessAreaLayer.addTo(map);
    }
    
    // map.setView initialisieren
    map.setView([51.1657, 10.4515], 6);
    
    // Zentralisierte Initialisierung der Isochronen-Funktionalität UND Layer-Kontrolle
    initIsochroneFunctionality(baseMaps); 
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
            if (!mapB.has(domain)) {
                mapB.set(domain, { key: domain, domain, name, country_codes: new Set() });
            }
            if (geo_country_code) mapB.get(domain).country_codes.add(geo_country_code);
        };
        processEntity(topLevelObject);
        if (topLevelObject.cities) {
            topLevelObject.cities.forEach(city => processEntity(city, city.city));
        }
    });
    return Array.from(mapB.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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
        cSel.appendChild(option('', 'Alle Länder'));
        countryList.forEach(c => cSel.appendChild(option(c.country_code, `${c.country_name} (${c.country_code})`)));
        
        updateAvailableBrands();
        $('#load-status').textContent = 'Bitte Auswahl treffen.';
        
        loadAllFlexzones();
        loadAllBusinessAreas();
    }catch(e){
        $('#load-status').textContent = 'Fehler beim Laden der System-Listen.';
        alert('Fehler beim Laden der System-Listen. Bitte prüfen Sie die Internetverbindung und laden Sie die Seite neu.');
    }
}

async function loadAllFlexzones() {
    try {
        const flexzoneResp = await fetch(`${corsProxy}https://api.nextbike.net/api/v1.1/getFlexzones.json?api_key=API_KEY_GELOESCHT`);
        if (!flexzoneResp.ok) {
            const errorText = await flexzoneResp.text();
            console.error(`Flexzonen-API HTTP Fehler: ${flexzoneResp.status} - ${errorText}`);
            throw new Error(`Flexzonen-API HTTP ${flexzoneResp.status}`);
        }
        const flexzoneData = await flexzoneResp.json();
        if (flexzoneData.geojson && flexzoneData.geojson.nodeValue && flexzoneData.geojson.nodeValue.features) {
            allFlexzones = flexzoneData.geojson.nodeValue.features;
        } else if (flexzoneData.geojson && flexzoneData.geojson.features) {
            allFlexzones = flexzoneData.geojson.features;
        } else {
            console.warn("Flexzonen-API-Antwort enthielt kein erwartetes GeoJSON-Format.");
            allFlexzones = [];
        }
    } catch(e) {
        console.error("Fehler beim Laden der Flexzonen-Liste:", e);
        allFlexzones = [];
    }
}

async function loadAllBusinessAreas() {
    try {
        const businessAreaResp = await fetch(`${corsProxy}https://api.nextbike.net/api/v1.1/getFlexzones.json?api_key=API_KEY_GELOESCHT&categories=business_area`);
        if (!businessAreaResp.ok) {
            const errorText = await businessAreaResp.text();
            console.error(`BusinessArea-API HTTP Fehler: ${businessAreaResp.status} - ${errorText}`);
            throw new Error(`BusinessArea-API HTTP ${businessAreaResp.status}`);
        }
        const businessAreaData = await businessAreaResp.json();
        if (businessAreaData.geojson && businessAreaData.geojson.nodeValue && businessAreaData.geojson.nodeValue.features) {
            allBusinessAreas = businessAreaData.geojson.nodeValue.features;
        } else if (businessAreaData.geojson && businessAreaData.geojson.features) {
            allBusinessAreas = businessAreaData.geojson.features;
        } else {
            console.warn("BusinessArea-API-Antwort enthielt kein erwartetes GeoJSON-Format.");
            allBusinessAreas = [];
        }
    } catch(e) {
        console.error("Fehler beim Laden der BusinessArea-Liste:", e);
        allBusinessAreas = [];
    }
}

function updateAvailableBrands(){
    const countryCode = ($('#countrySelect').value || '').toUpperCase();
    const brandInput = $('#brandInput');
    
    availableBrands = brandList.filter(b => !countryCode || b.country_codes.has(countryCode));
    
    brandInput.value = '';
    selectedBrandDomain = null;
    brandInput.disabled = false;
    brandInput.placeholder = `${availableBrands.length} Marken/Systeme verfügbar...`;
    
    $('#flexzone-toggle-container').classList.add('hidden');
    refreshCitySelect();
}

async function fetchCitiesForBrand(domain){
    const url = `${corsProxy}https://maps.nextbike.net/maps/nextbike-official.json?domains=${encodeURIComponent(domain)}&bikes=0`;
    const resp = await fetch(url, { cache: 'no-store' });
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const out = [];
    data.countries?.forEach(co => {
        const cc = (co.country || co.country_code || '').toUpperCase();
        co.cities?.forEach(city => out.push({ uid: city.uid, name: city.name || city.alias || city.city || `#${city.uid}`, country_code: cc }));
    });
    return [...new Map(out.map(item => [item.uid, item])).values()];
}

async function refreshCitySelect(){
    const brandKey = selectedBrandDomain;
    const citySel = $('#citySelect');
    const countryCode = ($('#countrySelect').value || '').toUpperCase();
    citySel.innerHTML = '<option value="">Alle Städte im System</option>';
    if(!brandKey){ citySel.disabled = true; return; }
    try{
        let items = await fetchCitiesForBrand(brandKey);
        if(countryCode) items = items.filter(c => (c.country_code||'') === countryCode);
        items.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
        items.forEach(c => citySel.appendChild(option(String(c.uid), c.name)));
        citySel.disabled = false;
    }catch(e){ console.error(e); citySel.disabled = true; }
}

function fcFromNextbike(json){
    const features = [];
    json.countries?.forEach(country => {
        country.cities?.forEach(city => {
            const domain = city.domain || '';
            city.places?.forEach(place => {
                if(typeof place.lat !== 'number' || typeof place.lng !== 'number') return;
                features.push({ 
                    type:'Feature', 
                    geometry:{ type:'Point', coordinates:[place.lng, place.lat] }, 
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
    
    try{
        const domain = selectedBrandDomain, cityUid = $('#citySelect').value;
        const countryCode = ($('#countrySelect').value || '').toUpperCase();
        let baseUrl = 'https://maps.nextbike.net/maps/nextbike-official.json?bikes=0';
        if(cityUid) baseUrl += `&city=${cityUid}`;
        else if(domain) baseUrl += `&domains=${domain}`;
        else if(countryCode) baseUrl += `&countries=${countryCode}`;

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
        const statusDiv = $('#load-status');
        statusDiv.innerHTML = `<strong>${stationCount}</strong> Stationen geladen (${timestamp})`;
        statusDiv.style.visibility = 'visible';

        $('#geojson-output').value = JSON.stringify(fc, null, 2);
        layer.clearLayers().addData(fc);
        
        $('#geojsonBtn').disabled = stationCount === 0;
        $('#zipBtn').disabled = stationCount === 0;

        flexzoneLayer.clearLayers();
        if ($('#flexzonesCheckbox').checked && allFlexzones.length > 0 && selectedBrandDomain) {
            const relevantFeatures = allFlexzones.filter(f => f.properties?.domain === selectedBrandDomain);
            if (relevantFeatures.length > 0) {
                const flexzoneGeoJSON = {
                    type: "FeatureCollection",
                    features: relevantFeatures
                };
                flexzoneLayer.addData(flexzoneGeoJSON);
            }
        }

        businessAreaLayer.clearLayers();
        if ($('#businessAreasCheckbox').checked && allBusinessAreas.length > 0 && selectedBrandDomain) {
            const relevantBusinessAreas = allBusinessAreas.filter(f => f.properties?.domain === selectedBrandDomain);
            if (relevantBusinessAreas.length > 0) {
                const businessAreaGeoJSON = {
                    type: "FeatureCollection",
                    features: relevantBusinessAreas
                };
                businessAreaLayer.addData(businessAreaGeoJSON);
            }
        }
        
        const combinedLayer = L.featureGroup([...layer.getLayers(), ...flexzoneLayer.getLayers(), ...businessAreaLayer.getLayers()]);
        if (combinedLayer.getLayers().length > 0) {
            const bounds = combinedLayer.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, {padding: [50, 50]});
            }
        } else {
             map.setView([51.1657, 10.4515], 6);
        }

    }catch(e){ 
        $('#load-status').textContent = 'Fehler: '+e.message; 
        $('#geojsonBtn').disabled = true;
        $('#zipBtn').disabled = true;
    }
    finally{ 
        loadBtn.disabled = false; 
        $('#loadIcon').innerHTML = '';
    }
}

/**
 * Generiert einen Dateinamen basierend auf dem aktuellen Datum, der Uhrzeit und dem Nextbike city/alias.
 *
 * @param {string} cityAlias - Der 2-stellige Nextbike city/alias Parameter (z.B. "le", "dd").
 * @returns {string} Der generierte Dateiname (ohne Dateiendung).
 */
function generateFilename(cityAlias) {
    if (!cityAlias) {
        console.warn("City Alias ist nicht gesetzt, verwende Fallback für Dateinamen.");
        cityAlias = "nextbike"; // Fallback, falls kein Alias ausgewählt ist
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Monate sind 0-indiziert
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    // Beispiel: "2023-10-27_14-35-00_le_stations"
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}_${cityAlias}_stations`;
}

async function downloadZip() {
    if (!currentGeoJSON) return;

    const zip = new JSZip();
    // Verwende die neue Funktion zur Namensgenerierung
    const baseFilename = generateFilename(selectedBrandDomain);
    
    // Stations-GeoJSON hinzufügen
    zip.file("stations.geojson", JSON.stringify(currentGeoJSON, null, 2));

    const flexzoneGeoJSON = flexzoneLayer.toGeoJSON();
    
    // Überprüfe, ob es Flexzonen-Features gibt
    if (flexzoneGeoJSON.features.length > 0) {
        // Die komplette Flexzonen-Datei hinzufügen
        zip.file("fullsystem_flexzones.geojson", JSON.stringify(flexzoneGeoJSON, null, 2));

        // Jedes Flexzonen-Feature als separate Datei hinzufügen
        flexzoneGeoJSON.features.forEach(feature => {
            const featureName = feature.properties.name;
            // Erstelle einen gültigen Dateinamen: Buchstaben, Zahlen und Unterstriche
            // Ersetze alles, was kein Wort-Zeichen, Zahl oder Unterstrich ist, durch einen Unterstrich.
            const sanitizedName = featureName ? featureName.replace(/[\W_]+/g, "_") : 'unbenannte_flexzone';
            
            // Erstelle ein GeoJSON FeatureCollection-Objekt nur für dieses eine Feature
            const singleFeatureGeoJSON = {
                type: "FeatureCollection",
                features: [feature]
            };

            // Füge die Datei zum ZIP-Archiv hinzu
            zip.file(`${sanitizedName}.geojson`, JSON.stringify(singleFeatureGeoJSON, null, 2));
        });
    }

    const businessAreaGeoJSON = businessAreaLayer.toGeoJSON();
    if (businessAreaGeoJSON.features.length > 0) {
        zip.file("fullsystem_business_areas.geojson", JSON.stringify(businessAreaGeoJSON, null, 2));
        businessAreaGeoJSON.features.forEach(feature => {
            const featureName = feature.properties.name;
            const sanitizedName = featureName ? featureName.replace(/[\W_]+/g, "_") : 'unbenannte_business_area';
            const singleFeatureGeoJSON = {
                type: "FeatureCollection",
                features: [feature]
            };
            zip.file(`businessarea_${sanitizedName}.geojson`, JSON.stringify(singleFeatureGeoJSON, null, 2));
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

function setupBrandSearch() {
    const brandInput = $('#brandInput');
    const brandResults = $('#brandResults');
    const countrySelect = $('#countrySelect');
    const flexzoneToggle = $('#flexzone-toggle-container');

    function filterAndDisplay() {
        const query = brandInput.value.toLowerCase();
        selectedBrandDomain = null; // Setze Alias zurück, wenn Input geändert wird
        refreshCitySelect();
        flexzoneToggle.classList.add('hidden');
        
        if (!query) {
            brandResults.style.display = 'none';
            return;
        }
        
        let filtered = availableBrands;
        if (countrySelect.value) {
            filtered = filtered.filter(s => s.country_codes.has(countrySelect.value.toUpperCase()));
        }
        
        filtered = filtered.filter(s => s.name.toLowerCase().includes(query) || s.domain.toLowerCase().includes(query));
        
        brandResults.innerHTML = '';
        if (filtered.length > 0) {
            filtered.slice(0, 100).forEach(system => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.innerHTML = `${system.name} <small>(${system.domain})</small>`;
                item.addEventListener('click', () => {
                    brandInput.value = system.name;
                    selectedBrandDomain = system.key; // Hier wird der Alias gesetzt!
                    brandResults.style.display = 'none';
                    refreshCitySelect();
                    flexzoneToggle.classList.remove('hidden');
                });
                brandResults.appendChild(item);
            });
            brandResults.style.display = 'block';
        } else {
            brandResults.style.display = 'none';
        }
    }
    
    brandInput.addEventListener('input', filterAndDisplay);
    countrySelect.addEventListener('change', () => {
        brandInput.value = '';
        updateAvailableBrands();
    });

    document.addEventListener('click', (e) => {
        if (!$('.autocomplete-container').contains(e.target)) {
            brandResults.style.display = 'none';
        }
    });
}

/**
 * Fügt Event Listener zur neuen Top-Toolbar hinzu
 */
function setupToolbar() {
    // Fügt Event Listener zur neuen Top-Toolbar hinzu
    document.querySelectorAll('#top-toolbar .toolbar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.currentTarget.dataset.target;
            setActiveTool(targetId);
        });
    });
}


window.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadLists();
    setupSidebars();
    setupBrandSearch();
    setupToolbar(); 
    
    $('#loadBtn').addEventListener('click', loadData);
    
    // ANPASSUNG 1: GeoJSON Download Button
    $('#geojsonBtn').addEventListener('click', () => {
        if(!currentGeoJSON) return; 

        // Generiere den Dateinamen dynamisch
        const filename = generateFilename(selectedBrandDomain) + '.geojson';
        
        const blob = new Blob([$('#geojson-output').value], {type:'application/geo+json;charset=utf-8'}); 
        saveAs(blob, filename); // Verwende den generierten Dateinamen
    });
    
    // ANPASSUNG 2: Zip Download Button ruft die angepasste Funktion auf
    $('#zipBtn').addEventListener('click', downloadZip);
    
    $('#flexzonesCheckbox').addEventListener('change', (e) => {
        if (e.target.checked) {
            if (!map.hasLayer(flexzoneLayer)) {
                map.addLayer(flexzoneLayer);
            }
        } else {
            if (map.hasLayer(flexzoneLayer)) {
                map.removeLayer(flexzoneLayer);
            }
        }
    });

    $('#businessAreasCheckbox').addEventListener('change', (e) => {
        if (e.target.checked) {
            if (!map.hasLayer(businessAreaLayer)) {
                map.addLayer(businessAreaLayer);
            }
        } else {
            if (map.hasLayer(businessAreaLayer)) {
                map.removeLayer(businessAreaLayer);
            }
        }
    });

});