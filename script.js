// Neue Konstante für den API-Schlüssel (Bestätigter Wert)
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTEwMDFjZjYyNDgiLCJpZCI6IjJiMWZmNzYzNGZjMTRlYzlhODY0ZjMyOWE3ODFkNmVlIiwiaCI6Im11cm11cjY0In0='; // API-Schlüssel für den OpenRouteService (ORS)
const ORS_BASE_ENDPOINT = 'https://api.openrouteservice.org/v2/isochrones/'; // Basis-Endpunkt der ORS Isochronen-API

const $ = sel => document.querySelector(sel); // Vereinfachte Funktion für document.querySelector (DOM-Abfrage)
const corsProxy = 'https://corsproxy.io/?'; // CORS-Proxy-URL, um Cross-Origin-Probleme bei API-Anfragen zu umgehen

// --- Globale Karten- und Datenvariablen ---
let map, layer, currentGeoJSON = null; // Leaflet-Karteninstanz, Layer für Nextbike-Stationen, aktuell geladenes GeoJSON
let flexzoneLayer, businessAreaLayer; // Leaflet-Layer für Flexzonen und Business Areas
let countryList = [], rawCountries = [], brandList = [], availableBrands = []; // Listen zur Verwaltung von Ländern und Nextbike-Marken/Systemen
let selectedBrandDomain = null; // Die Domäne des aktuell ausgewählten Nextbike-Systems
let allFlexzones = []; // Speichert alle geladenen Flexzonen-Features
let allBusinessAreas = []; // Speichert alle geladenen Business Area-Features
let activeToolId = null; // ID des aktuell geöffneten Tools in der Sidebar

// --- Globale Variablen für Isochronen (ORS) ---
let cityLayer = L.featureGroup(); // Layer für die Städte des ausgewählten Nextbike-Systems
let isochroneLayer = null; // Layer für das Polygon der berechneten Isochrone
let clickMarkers = L.featureGroup(); // FeatureGroup zum Speichern der vom Benutzer gesetzten Start-Marker
let selectedRange = 0; // Die aktuell ausgewählte Zeit in Sekunden (für die Isochrone)
let mapLayersControl = null; // Variable für die Leaflet Layer Control (zur Steuerung der sichtbaren Layer)

// --- Icon-Definitionen ---
let markerIcon = L.divIcon({ // Ein einfacher, kreisförmiger Icon-Stil für die Punkte (Isochronen-Startpunkte)
    className: 'ors-marker-div',
    iconSize: [12, 12],
    html: '<div style="background-color: #FF4500; width: 100%; height: 100%; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>'
});

const nextbikeIcon = L.icon({ // Spezielles Icon für Nextbike-Stationen
    iconUrl: 'pic/marker/marker_nbblue.png',
    iconSize:     [35, 35],
    iconAnchor:   [17, 35],
    popupAnchor:  [0, -35]
});

const cityIcon = L.icon({ // Icon für Städte-Marker
    iconSize:     [50, 50],
    iconAnchor:   [25, 50],
    popupAnchor:  [0, -50],
    iconUrl: 'favicon.png'
});

/**
 * Steuert, welche Werkzeug-Sektion im linken Panel aktiv ist.
 * @param {string} toolId Die ID des zu aktivierenden Tools (z.B. 'isochrone-controls').
 */
function setActiveTool(toolId) {
    const isAlreadyActive = (toolId === activeToolId);
    
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelectorAll('.tool-section').forEach(el => {
        el.classList.add('hidden');
    });

    if (isAlreadyActive) {
        activeToolId = null;
        if (!$('#main-wrap').classList.contains('left-collapsed')) {
             $('#toggle-left-panel').click(); 
        }
    } else {
        activeToolId = toolId;
        const targetElement = $(`#${toolId}`);
        if (targetElement) {
            targetElement.classList.remove('hidden');
        }
        const targetButton = $(`[data-target="${toolId}"]`);
        if (targetButton) {
            targetButton.classList.add('active');
        }
        if ($('#main-wrap').classList.contains('left-collapsed')) {
             $('#toggle-left-panel').click();
        }
    }
}

// Initialisiert den Isochronen-Layer und die Event-Handler
function initIsochroneFunctionality(baseMaps) {
    isochroneLayer = L.geoJSON(null, {
        style: {
            color: '#FF4500', weight: 3, opacity: 0.7, fillColor: '#FF6347', fillOpacity: 0.2
        },
        onEachFeature: (f, l) => {
            const minutes = selectedRange / 60;
            const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
            l.bindPopup(`<b>${minutes} Minuten (${profileText})</b>`);
        }
    }).addTo(map);
    
    clickMarkers.addTo(map);
    cityLayer.addTo(map);

    map.on('click', onMapClickForIsochrone);
    
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
        clearIsochrone();
        const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
        $('#isochrone-status').textContent = `Profil (${profileText}) gewählt. Bitte neue Zeit wählen.`;
        
        document.querySelectorAll('.ors-range-btn').forEach(btn => btn.classList.remove('active'));
        selectedRange = 0;
    });

    $('#calculateIsochroneBtn').addEventListener('click', fetchIsochrone);
    $('#clearIsochroneBtn').addEventListener('click', clearIsochrone);
}

// Löscht alle Isochronen-Marker und das Polygon-Ergebnis
function clearIsochrone() {
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

/**
 * Setzt die Kartenansicht und den UI-Status zurück, um alle Nextbike-Systeme
 * (Städte-Marker) wieder anzuzeigen.
 */
function resetSystemView() {
    // 1. Karten-Layer und Marker löschen
    layer.clearLayers(); 
    flexzoneLayer.clearLayers();
    businessAreaLayer.clearLayers();
    isochroneLayer.clearLayers();
    clickMarkers.clearLayers();
    
    // 2. Globale Variablen zurücksetzen
    selectedBrandDomain = null;
    currentGeoJSON = null;
    
    // 3. UI-Elemente zurücksetzen
    $('#countrySelect').value = '';
    $('#brandInput').value = ''; // KORRIGIERT: Autocomplete Input löschen
    $('#brandSelect').value = ''; 
    $('#citySelect').innerHTML = '<option value="">Alle Städte im System</option>';
    $('#citySelect').disabled = true;
    $('#quickFilter').value = '';
    $('#load-status').textContent = 'Bitte Auswahl treffen.';
    $('#geojson-output').value = '';
    $('#flexzone-toggle-container').classList.add('hidden');
    $('#geojsonBtn').disabled = true;
    $('#zipBtn').disabled = true;
    
    // NEU: Setze das Tool-Panel auf den Standard (Daten/Filter) zurück und klappe es ggf. aus
    setActiveTool('filter-controls'); 

    // 4. City-Marker (alle) wieder anzeigen und auf ihre Bounds zoomen
    cityLayer.eachLayer(marker => {
        if (marker.getElement()) {
            marker.getElement().style.display = '';
        }
    });

    if (cityLayer.getLayers().length > 0) {
        map.fitBounds(cityLayer.getBounds(), {padding: [50, 50]});
    } else {
        map.setView([51.1657, 10.4515], 6);
    }
}

// Behandelt Karten-Klicks für den Isochronen-Startpunkt
function onMapClickForIsochrone(e) {
    if (activeToolId !== 'isochrone-controls') return;
    
    if (selectedRange === 0) {
        alert("Bitte wählen Sie zuerst eine Fahrzeit (z.B. 15 min) aus.");
        return;
    }
    
    if (clickMarkers.getLayers().length >= 5) {
        alert("Sie können maximal 5 Startpunkte gleichzeitig setzen.");
        return;
    }
    
    const latlng = e.latlng;
    
    const newMarker = L.marker(latlng, { icon: markerIcon }).addTo(clickMarkers);
    
    const count = clickMarkers.getLayers().length;
    newMarker.bindPopup(`Startpunkt ${count}: ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`).openPopup();
    
    const rangeText = document.querySelector('.ors-range-btn.active')?.textContent || 'Zeit gewählt';
    const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
    $('#isochrone-status').textContent = `${profileText}, ${rangeText}. ${count} Punkt(e) gesetzt. Berechnen drücken.`;
    $('#calculateIsochroneBtn').disabled = false;
    $('#clearIsochroneBtn').disabled = false;
}

// Ruft die ORS Isochrone API auf, um die Erreichbarkeitszone zu berechnen
async function fetchIsochrone() {
    const statusDiv = $('#isochrone-status'); 
    const calculateBtn = $('#calculateIsochroneBtn');
    
    const locations = [];
    clickMarkers.eachLayer(marker => {
        const latlng = marker.getLatLng();
        locations.push([latlng.lng, latlng.lat]);
    });
    
    if (locations.length === 0) {
        statusDiv.textContent = 'Es wurden keine Startpunkte gesetzt.';
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
    }
    finally {
        calculateBtn.disabled = false;
        $('#calcIcon').innerHTML = '';
    }
}

// Initialisiert die Leaflet-Karte und die Basis-Layer
function initMap(){
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
    const positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 20 });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' });
    const baseMaps = { "OSM Standard": osm, "Positron": positron, "Satellit (Esri)": satellite };

    map = L.map('map', { layers: [positron], zoomControl: true }); 
    
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
            if (category === 'free_return') { return { color: '#000000', weight: 1, opacity: 1, fillColor: '#000000', fillOpacity: 0.2 }; }
            if (category === 'chargeable_return') { return { color: '#FFA500', weight: 1, opacity: 1, fillColor: '#FFFF00', fillOpacity: 0.25 }; }
            return { color: "#0098FF", weight: 2, opacity: 0.8, fillColor: "#0098FF", fillOpacity: 0.2 };
        },
        onEachFeature: (f, l) => {
            if(f.properties.name) l.bindPopup(`<b>${f.properties.name}</b>`);
        }
    });

    businessAreaLayer = L.geoJSON(null, {
        style: function(feature) { return { color: "#FF0000", weight: 2, opacity: 0.9, fillColor: "#FF69B4", fillOpacity: 0.2 }; },
        onEachFeature: (f, l) => { if(f.properties.name)  { l.bindPopup(`<b>Business Area: ${f.properties.name}</b>`); } }
    });

    layer.addTo(map);
    if ($('#flexzonesCheckbox').checked) { flexzoneLayer.addTo(map); }
    if ($('#businessAreasCheckbox') && $('#businessAreasCheckbox').checked) { businessAreaLayer.addTo(map); }
    
    map.setView([51.1657, 10.4515], 6);
    
    initIsochroneFunctionality(baseMaps);

    mapLayersControl = L.control.layers(baseMaps, { 
        "Stationen": layer,
        "Flexzonen": flexzoneLayer,
        "Business Areas": businessAreaLayer,
        "ORS Isochrone": isochroneLayer,
        "Startpunkte": clickMarkers,
        "Nextbike Städte": cityLayer
    }).addTo(map);
}

// Hilfsfunktion zum Erstellen eines <option>-Elements
function option(value, label){ const o = document.createElement('option'); o.value = value; o.textContent = label; return o; }

// Verarbeitet die rohen Länderdaten und entfernt Duplikate
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

// Erstellt eine Liste eindeutiger Marken/Systeme aus den Länderdaten
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

// Lädt die Listen der verfügbaren Länder und Nextbike-Systeme von der API
// Lädt die Listen der verfüfbaren Länder und Nextbike-Systeme von der API
async function loadLists(){
    $('#load-status').style.visibility = 'visible';
    $('#load-status').textContent = 'Systeme werden geladen...';
    try{
        // ... (API-Aufruf zum Laden der Daten) ...
        const url = `${corsProxy}https://maps.nextbike.net/maps/nextbike-official.json?list_cities=1&bikes=0`;
        const resp = await fetch(url, { cache: 'no-store' });
        if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data || !data.countries) throw new Error("API-Antwort ist ungültig.");

        rawCountries = data.countries; // Speichert die rohen Länderdaten
        countryList = dedupeCountries(rawCountries); // Bereinigt und sortiert die Länderliste
        brandList = buildBrands(rawCountries); // Erstellt die Liste der verfügbaren Marken/Systeme

        // Füllt das Länder-Dropdown
        const cSel = $('#countrySelect'); cSel.innerHTML = '';
        cSel.appendChild(option('', 'Alle Länder'));
        countryList.forEach(c => cSel.appendChild(option(c.country_code, `${c.country_name} (${c.country_code})`)));
        
        // **WICHTIG:** drawAllCityMarkers MUSS nach loadLists laufen
        drawAllCityMarkers(); // <-- Zeichnet die Marker mit dem NEUEN Klick-Handler
        
        updateAvailableBrands(); // <-- Füllt jetzt das #brandSelect Dropdown
        
        $('#load-status').textContent = 'Bitte Auswahl treffen.';
        
        loadAllFlexzones(); // Startet das Laden aller Flexzonen-Daten im Hintergrund
        loadAllBusinessAreas(); // Startet das Laden aller Business Area-Daten im Hintergrund
    }catch(e){
        $('#load-status').textContent = 'Fehler beim Laden der System-Listen.';
        alert('Fehler beim Laden der System-Listen. Bitte prüfen Sie die Internetverbindung und laden Sie die Seite neu.');
    }
}

// Lädt alle Flexzonen-GeoJSON-Daten von der Nextbike API
async function loadAllFlexzones() {
    try {
        const flexzoneResp = await fetch(`${corsProxy}https://api.nextbike.net/api/v1.1/getFlexzones.json?api_key=YxiJOFhh9s5X1YqZ`);
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

// Lädt alle Business Area GeoJSON-Daten von der Nextbike API
async function loadAllBusinessAreas() {
    try {
        const businessAreaResp = await fetch(`${corsProxy}https://api.nextbike.net/api/v1.1/getFlexzones.json?api_key=YxiJOFhh9s5X1YqZ&categories=business_area`);
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

// Aktualisiert die Anzeige (nur noch Filterung der City-Marker) nach Länderwahl
function updateAvailableBrands(){
    $('#brandInput').value = ''; // Leert das Autocomplete-Feld bei Länderwechsel
    $('#brandSelect').value = ''; // Leert den versteckten Wert
    selectedBrandDomain = null; 
    
    $('#flexzone-toggle-container').classList.add('hidden');
    refreshCitySelect(); // Löst das Filtern der City-Marker und das Füllen des Städte-Dropdowns aus
}

// Ruft die Städte für eine spezifische Nextbike-Domäne ODER das Land ab
function fetchCitiesForBrand(domain, countryCode) { 
    const out = [];

    rawCountries.forEach(co => {
        const cc = (co.country || co.country_code || '').toUpperCase();
        const countryDomain = (co.domain || '').toLowerCase(); 

        if (countryCode && cc !== countryCode) return;

        co.cities?.forEach(city => {
            const cityDomain = (city.domain || '').toLowerCase(); 

            if ((!domain || cityDomain === domain.toLowerCase() || countryDomain === domain.toLowerCase()) && 
                 typeof city.lat === 'number' && typeof city.lng === 'number') {
                out.push({ 
                    uid: city.uid, 
                    name: city.name || city.alias || city.city || `#${city.uid}`, 
                    country_code: cc,
                    lat: city.lat, 
                    lng: city.lng
                });
            }
        });
    });
    return [...new Map(out.map(item => [item.uid, item])).values()];
}

/**
 * Zeichnet alle verfügbaren Nextbike-Städte auf der Karte, bindet den Klick-Handler zum Laden des Systems
 * und zoomt auf deren gesamte Ausdehnung.
 */
function drawAllCityMarkers() {
    cityLayer.clearLayers();
    const out = [];

    rawCountries.forEach(co => {
        const cc = (co.country || co.country_code || '').toUpperCase();
        const countryDomain = (co.domain || '').toLowerCase(); 

        co.cities?.forEach(city => {
            const cityDomain = (city.domain || '').toLowerCase(); 

            if (typeof city.lat === 'number' && typeof city.lng === 'number') {
                out.push({ 
                    uid: city.uid, 
                    name: city.name || city.alias || city.city || `#${city.uid}`, 
                    country_code: cc,
                    domain: cityDomain || countryDomain || '',
                    lat: city.lat, 
                    lng: city.lng
                });
            }
        });
    });

    // Erstellt Marker für alle gefundenen Städte
    out.forEach(city => {
        const marker = L.marker([city.lat, city.lng], { 
            icon: cityIcon,
            _domain: city.domain,
            feature: { 
                properties: { 
                    country_code: city.country_code,
                    domain: city.domain
                } 
            }
        });
        
        // KORRIGIERT: Klick-Handler: Löst den Ladevorgang aus, indem das Marken-Dropdown aktualisiert wird
        marker.on('click', function() {
            const brandSelect = $('#brandSelect');
            const brandInput = $('#brandInput'); // NEU: Referenz auf das sichtbare Input-Feld
            
            // 1. Land auswählen, falls nicht schon gewählt
            $('#countrySelect').value = city.country_code;
            
            // 2. Marke/System im versteckten Feld setzen
            brandSelect.value = city.domain; 
            
            // NEU: Setze den Klartextnamen im sichtbaren Autocomplete-Feld
            const selectedBrand = brandList.find(b => b.domain === city.domain);
            if (selectedBrand) {
                brandInput.value = selectedBrand.name;
            } else {
                 brandInput.value = city.domain; // Fallback, falls Name nicht gefunden
            }
            
            // 3. Auslösen des Change-Events, um die gesamte Logik (Daten laden, Zoom) zu starten
            brandSelect.dispatchEvent(new Event('change'));
            
            // NEU: Wir öffnen sofort das Daten-/Filter-Panel, um Konsistenz zu gewährleisten
            setActiveTool('filter-controls');
        });

        const popupContent = `<b>${city.name}</b><br>System: ${city.domain || 'N/A'}<br>Land: ${city.country_code}`;
        marker.bindPopup(popupContent);
        
        cityLayer.addLayer(marker);
    });
    
    if (cityLayer.getLayers().length > 0) {
        map.fitBounds(cityLayer.getBounds(), {padding: [50, 50]});
    }
}


// Aktualisiert das Städte-Dropdown und filtert die Sichtbarkeit der Marker
async function refreshCitySelect(){
    const brandKey = selectedBrandDomain;
    const countryCode = ($('#countrySelect').value || '').toUpperCase();
    const citySel = $('#citySelect');
    
    // 1. Marker filtern: Zeige alle, wenn keine Marke gewählt, sonst nur die passenden.
    cityLayer.eachLayer(marker => {
        const markerDomain = marker.options._domain;
        
        const domainMatch = !brandKey || markerDomain === brandKey;
        
        const markerCountryCode = marker.options.feature?.properties?.country_code || '';
        const countryMatch = !countryCode || markerCountryCode === countryCode;
        
        const displayStyle = domainMatch && countryMatch ? '' : 'none';
        
        if (marker.getElement()) {
            marker.getElement().style.display = displayStyle;
        }
    });

    // 2. Dropdown zurücksetzen
    citySel.innerHTML = '<option value="">Alle Städte im System</option>';
    
    // Wenn KEIN Land gewählt UND KEIN Brand, ist das Dropdown deaktiviert.
    if (!countryCode && !brandKey) {
        citySel.disabled = true; 
        return; 
    }
    
    try{
        // 3. Dropdown-Inhalte laden: Wenn BrandKey gewählt -> lade Städte für Brand. 
        //                             Sonst (nur Land gewählt) -> lade Städte für Land.
        let items = await fetchCitiesForBrand(brandKey, countryCode); 
        
        items.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
        
        items.forEach(city => {
            citySel.appendChild(option(String(city.uid), city.name));
        });

        citySel.disabled = false;

    }catch(e){ 
        console.error("Fehler beim Laden/Anzeigen der Städte:", e); 
        citySel.disabled = true; 
    }
}

// Konvertiert das Nextbike-JSON-Format in ein GeoJSON FeatureCollection-Objekt
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

// Lädt die Stationsdaten basierend auf der aktuellen Auswahl (Land/Marke/Stadt)
// Lädt die Stationsdaten basierend auf der aktuellen Auswahl (Land/Marke/Stadt)
async function loadData(){
    const loadBtn = $('#loadBtn');
    loadBtn.disabled = true; // Deaktiviert den Button während des Ladens
    $('#loadIcon').innerHTML = '<span class="spinner"></span>'; // Zeigt den Lade-Spinner
    $('#load-status').textContent = 'Lade Stationen...';
    
    try{
        const domain = selectedBrandDomain, cityUid = $('#citySelect').value;
        const countryCode = ($('#countrySelect').value || '').toUpperCase();
        let baseUrl = 'https://maps.nextbike.net/maps/nextbike-official.json?bikes=0';

        // Baut die URL basierend auf der höchstspezifischen Auswahl
        if(cityUid) baseUrl += `&city=${cityUid}`;
        else if(domain) baseUrl += `&domains=${domain}`;
        else if(countryCode) baseUrl += `&countries=${countryCode}`;

        const resp = await fetch(`${corsProxy}${baseUrl}`, { cache: 'no-store' }); // Holt die Daten
        if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        let fc = fcFromNextbike(data); // Konvertiert in GeoJSON

        // Filterung der Stationen basierend auf der Schnellsuch-Eingabe
        const filterTxt = ($('#quickFilter').value||'').trim().toLowerCase();
        if(filterTxt){
            fc.features = fc.features.filter(f => `${f.properties.name} ${f.properties.address}`.toLowerCase().includes(filterTxt));
        }

        currentGeoJSON = fc; // Speichert das GeoJSON global
        const stationCount = fc.features.length;
        const timestamp = new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
        const statusDiv = $('#load-status');
        statusDiv.innerHTML = `<strong>${stationCount}</strong> Stationen geladen (${timestamp})`; // Aktualisiert den Status

        $('#geojson-output').value = JSON.stringify(fc, null, 2); // Zeigt das GeoJSON im Textfeld an
        layer.clearLayers().addData(fc); // Aktualisiert den Stations-Layer auf der Karte
        
        // Schaltet Download-Buttons je nach Ergebnis frei
        $('#geojsonBtn').disabled = stationCount === 0;
        $('#zipBtn').disabled = stationCount === 0;

        // --- Flexzonen-Logik ---
        flexzoneLayer.clearLayers();
        if ($('#flexzonesCheckbox').checked && allFlexzones.length > 0 && selectedBrandDomain) {
            const relevantFeatures = allFlexzones.filter(f => f.properties?.domain === selectedBrandDomain);
            if (relevantFeatures.length > 0) {
                const flexzoneGeoJSON = { type: "FeatureCollection", features: relevantFeatures };
                flexzoneLayer.addData(flexzoneGeoJSON);
            }
        }

        // --- Business Area Logik ---
        businessAreaLayer.clearLayers();
        if ($('#businessAreasCheckbox').checked && allBusinessAreas.length > 0 && selectedBrandDomain) {
            const relevantBusinessAreas = allBusinessAreas.filter(f => f.properties?.domain === selectedBrandDomain);
            if (relevantBusinessAreas.length > 0) {
                const businessAreaGeoJSON = { type: "FeatureCollection", features: relevantBusinessAreas };
                businessAreaLayer.addData(businessAreaGeoJSON);
            }
        }
        
        // START KORRIGIERTE ZOOM-LOGIK (Zur Behebung des "Kein Zoom"-Fehlers)
        
        // Erstellt eine FeatureGroup aus allen aktuell relevanten Layern für den Zoom
        const combinedLayer = L.featureGroup([
            ...layer.getLayers(), // Stations-Layer
            ...flexzoneLayer.getLayers(), // Flexzonen
            ...businessAreaLayer.getLayers() // Business Areas
        ]);
        
        if (combinedLayer.getLayers().length > 0) {
            const bounds = combinedLayer.getBounds();
            
            if (bounds.isValid()) {
                // Zoomt auf die Ausdehnung der geladenen Daten (Stationen/Zonen)
                map.fitBounds(bounds, {padding: [50, 50]});
            } else {
                 // Fallback: Wenn Bounds ungültig (z.B. nur ein Punkt/Marker geladen)
                 if (fc.features.length > 0) {
                     // Zoomt auf den ersten Punkt mit einem festen Zoomlevel (14)
                     map.setView([fc.features[0].geometry.coordinates[1], fc.features[0].geometry.coordinates[0]], 14);
                 } else {
                     map.setView([51.1657, 10.4515], 6); // Standardansicht, wenn keine Daten da sind
                 }
            }
        } else {
             map.setView([51.1657, 10.4515], 6); // Standardansicht, wenn keine Daten da sind
        }
        
        // ENDE KORRIGIERTE ZOOM-LOGIK
        
    }catch(e){ 
        $('#load-status').textContent = 'Fehler: '+e.message; 
        $('#geojsonBtn').disabled = true;
        $('#zipBtn').disabled = true;
    }
    finally{ 
        loadBtn.disabled = false; // Button wieder aktivieren
        $('#loadIcon').innerHTML = ''; // Spinner entfernen
    }
}

/**
 * Generiert einen Dateinamen basierend auf dem aktuellen Datum, der Uhrzeit und der Nextbike-Domäne.
 * @param {string} cityAlias - Der 2-stellige Nextbike city/alias Parameter.
 * @returns {string} Der generierte Dateiname (ohne Dateiendung).
 */
function generateFilename(cityAlias) {
    if (!cityAlias) { cityAlias = "nextbike"; }
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}_${cityAlias}_stations`;
}

// Erstellt ein ZIP-Archiv mit Stations- und Zonen-GeoJSONs zum Download
async function downloadZip() {
    if (!currentGeoJSON) return;

    const zip = new JSZip();
    const baseFilename = generateFilename(selectedBrandDomain);
    
    zip.file("stations.geojson", JSON.stringify(currentGeoJSON, null, 2));

    const flexzoneGeoJSON = flexzoneLayer.toGeoJSON();
    if (flexzoneGeoJSON.features.length > 0) {
        zip.file("fullsystem_flexzones.geojson", JSON.stringify(flexzoneGeoJSON, null, 2));
        flexzoneGeoJSON.features.forEach(feature => {
            const featureName = feature.properties.name;
            const sanitizedName = featureName ? featureName.replace(/[\W_]+/g, "_") : 'unbenannte_flexzone';
            const singleFeatureGeoJSON = { type: "FeatureCollection", features: [feature] };
            zip.file(`${sanitizedName}.geojson`, JSON.stringify(singleFeatureGeoJSON, null, 2));
        });
    }

    const businessAreaGeoJSON = businessAreaLayer.toGeoJSON();
    if (businessAreaGeoJSON.features.length > 0) {
        zip.file("fullsystem_business_areas.geojson", JSON.stringify(businessAreaGeoJSON, null, 2));
        businessAreaGeoJSON.features.forEach(feature => {
            const featureName = feature.properties.name;
            const sanitizedName = featureName ? featureName.replace(/[\W_]+/g, "_") : 'unbenannte_business_area';
            const singleFeatureGeoJSON = { type: "FeatureCollection", features: [feature] };
            zip.file(`businessarea_${sanitizedName}.geojson`, JSON.stringify(singleFeatureGeoJSON, null, 2));
        });
    }

    const zipBlob = await zip.generateAsync({type:"blob"});
    saveAs(zipBlob, baseFilename + ".zip");
}

// Richtet die Event Listener für das Ein- und Ausklappen der Sidebars ein
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
/**
 * Richtet die Autovervollständigung für die Markensuche ein.
 * Verwendet brandInput und brandSelect (hidden input).
 */
function setupAutocomplete() {
    const input = $('#brandInput');
    const resultsDiv = $('#autocomplete-results');
    const brandSelectHidden = $('#brandSelect');
    let currentFocus = -1; // Index des aktuell fokussierten Elements

    // Setzt den ausgewählten Wert und löst das Change-Event aus
    const selectItem = (domain, name) => {
        input.value = name; 
        brandSelectHidden.value = domain;
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'none';
        input.classList.remove('active-search');
        
        // Simuliere den Change-Event des alten Dropdowns, um die Lade-Logik zu triggern
        brandSelectHidden.dispatchEvent(new Event('change'));
    };

    // Erzeugt die Autocomplete-Ergebnis-Liste
    const renderResults = (arr) => {
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'none';
        currentFocus = -1;
        
        if (arr.length === 0) return;
        
        arr.slice(0, 10).forEach((item, index) => { // Zeige max. 10 Ergebnisse
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('autocomplete-item');
            
            // Hebt den Suchbegriff hervor
            const regex = new RegExp(input.value, 'gi');
            const highlightedName = item.name.replace(regex, (match) => `<strong>${match}</strong>`);
            
            itemDiv.innerHTML = `${highlightedName} <small>${item.domain}</small>`;
            itemDiv.dataset.domain = item.domain;
            itemDiv.dataset.name = item.name;

            itemDiv.addEventListener('click', () => {
                selectItem(item.domain, item.name);
            });
            resultsDiv.appendChild(itemDiv);
        });
        
        resultsDiv.style.display = 'block';
        input.classList.add('active-search');
    };
    
    // Tastatur-Navigation
    const addActive = (x) => {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add('active');
        x[currentFocus].scrollIntoView({ block: "nearest" });
    }
    
    const removeActive = (x) => {
        for (let i = 0; i < x.length; i++) {
            x[i].classList.remove('active');
        }
    }

    // Input-Event: Filtert die Markenliste
    input.addEventListener('input', function() {
        const val = this.value.toLowerCase();
        
        if (!val) {
            brandSelectHidden.value = ''; // Setze den Domain-Wert zurück
            renderResults([]);
            // Wenn das Suchfeld leer ist, zeige alle City-Marker an und zoome darauf
            refreshCitySelect();
            cityLayer.eachLayer(marker => { if (marker.getElement()) { marker.getElement().style.display = ''; } });
            if (cityLayer.getLayers().length > 0) { map.fitBounds(cityLayer.getBounds(), {padding: [50, 50]}); }
            return;
        }

        // Filtere basierend auf dem Suchtext
        const countryCode = ($('#countrySelect').value || '').toLowerCase();
        const filtered = brandList.filter(b => 
            (!countryCode || b.country_codes.has(countryCode.toUpperCase())) &&
            ((b.name || '').toLowerCase().includes(val) || (b.domain || '').toLowerCase().includes(val))
        );
        renderResults(filtered);
    });

    // Tastatur-Events (Pfeiltasten, Enter)
    input.addEventListener('keydown', function(e) {
        let x = resultsDiv.getElementsByClassName('autocomplete-item');
        if (e.key === 'ArrowDown') {
            currentFocus++;
            addActive(x);
        } else if (e.key === 'ArrowUp') {
            currentFocus--;
            addActive(x);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus > -1) {
                if (x) x[currentFocus].click();
            } else if (x.length > 0) {
                 // Wenn Enter gedrückt und kein Element ausgewählt, wähle das erste
                 x[0].click();
            }
        }
    });

    // Klick außerhalb des Autocomplete-Felds schließt die Ergebnisse
    document.addEventListener('click', (e) => {
        if (!resultsDiv.contains(e.target) && e.target !== input) {
            resultsDiv.innerHTML = '';
            resultsDiv.style.display = 'none';
            input.classList.remove('active-search');
        }
    });
    
    // Wenn das Eingabefeld den Fokus verliert und der Wert gesetzt ist,
    // ersetze den Domain-Wert durch den Klartextnamen.
    input.addEventListener('blur', () => {
         const currentDomain = brandSelectHidden.value;
         if (currentDomain) {
             const selectedBrand = brandList.find(b => b.domain === currentDomain);
             if (selectedBrand && input.value !== selectedBrand.name) {
                 input.value = selectedBrand.name;
             }
         }
    });

}
// Richtet die Logik für die Auswahl der Nextbike-Marken (Systeme) ein
// Richtet die Logik für die Auswahl der Nextbike-Marken (Systeme) ein
function setupBrandSearch() {
    const brandSelectHidden = $('#brandSelect'); // Das HIDDEN-Feld
    const countrySelect = $('#countrySelect');
    const flexzoneToggle = $('#flexzone-toggle-container');
    
    // Event Listener für das Land-Dropdown
    countrySelect.addEventListener('change', () => {
        updateAvailableBrands();
    });

    // Event Listener für das Marken/System-Feld (Jetzt ein verstecktes Feld, 
    // das durch Autocomplete mit Werten gefüllt wird)
    brandSelectHidden.addEventListener('change', () => {
        const selectedDomain = brandSelectHidden.value;
        
        layer.clearLayers(); 
        flexzoneLayer.clearLayers(); 
        businessAreaLayer.clearLayers(); 

        if (selectedDomain) {
            selectedBrandDomain = selectedDomain; 
            flexzoneToggle.classList.remove('hidden'); 
            
            loadData(); 
            
            refreshCitySelect(); 
            
            // Verstecke die City-Marker, sobald eine Brand gewählt ist
            cityLayer.eachLayer(marker => { if (marker.getElement()) { marker.getElement().style.display = 'none'; } });

        } else {
            selectedBrandDomain = null;
            flexzoneToggle.classList.add('hidden');
            
            refreshCitySelect(); 
            
            // Logik zum Zoomen auf sichtbare City-Marker (nur die des ausgewählten Landes)
            const visibleLayers = cityLayer.getLayers().filter(marker => marker.getElement().style.display !== 'none');
            const visibleLayerGroup = L.featureGroup(visibleLayers);

            if (visibleLayerGroup.getLayers().length > 0) {
                 map.fitBounds(visibleLayerGroup.getBounds(), {padding: [50, 50]});
            } else {
                 map.setView([51.1657, 10.4515], 6);
            }
        }
    });
}

/**
 * Fügt Event Listener zur neuen Top-Toolbar hinzu (für die Tool-Auswahl)
 */
function setupToolbar() {
    document.querySelectorAll('#top-toolbar .toolbar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.currentTarget.dataset.target;
            setActiveTool(targetId);
        });
    });
}


// Wird ausgeführt, wenn das DOM vollständig geladen ist
window.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadLists();
    setupSidebars();
    setupBrandSearch();
    setupToolbar();
    setupAutocomplete();

    // KORRIGIERT: Escape-Handler
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault(); 
            // Führe den Reset nur aus, wenn ein System aktiv ist ODER ein Tool geöffnet ist
            if (selectedBrandDomain || activeToolId) {
                 resetSystemView();
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
        if (e.target.checked) { if (!map.hasLayer(flexzoneLayer)) { map.addLayer(flexzoneLayer); } } 
        else { if (map.hasLayer(flexzoneLayer)) { map.removeLayer(flexzoneLayer); } }
    });

    $('#businessAreasCheckbox').addEventListener('change', (e) => {
        if (e.target.checked) { if (!map.hasLayer(businessAreaLayer)) { map.addLayer(businessAreaLayer); } } 
        else { if (map.hasLayer(businessAreaLayer)) { map.removeLayer(businessAreaLayer); } }
    });
});


// ENDE DER DATEI HINZUFÜGEN
// Leaflet Standard-Icon-Fix (falls Pfade für Standard-Assets fehlen)
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});
// ENDE DER DATEI HINZUFÜGEN