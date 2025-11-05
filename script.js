// Neue Konstante für den API-Schlüssel (Bestätigter Wert)
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjJiMWZmNzYzNGZjMTRlYzlhODY0ZjMyOWE3ODFkNmVlIiwiaCI6Im11cm11cjY0In0='; // API-Schlüssel für den OpenRouteService (ORS)
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
let activeToolId = null; // GEÄNDERT: Kein Tool ist beim Start aktiv - ID des aktuell geöffneten Tools in der Sidebar

// --- Globale Variablen für Isochronen (ORS) ---
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

/**
 * Steuert, welche Werkzeug-Sektion im linken Panel aktiv ist.
 * Beim erneuten Klick auf das aktive Tool wird dieses geschlossen.
 * @param {string} toolId Die ID des zu aktivierenden Tools (z.B. 'isochrone-controls').
 */
function setActiveTool(toolId) {
    const isAlreadyActive = (toolId === activeToolId);
    
    // Deaktiviere alle Toolbar-Buttons (visuelles Feedback)
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Verstecke alle Tool-Sektionen im linken Panel
    document.querySelectorAll('.tool-section').forEach(el => {
        el.classList.add('hidden');
    });

    if (isAlreadyActive) {
        // Tool war bereits aktiv -> Deaktivieren, Status zurücksetzen und Panel schließen
        activeToolId = null;
        if (!$('#main-wrap').classList.contains('left-collapsed')) {
             $('#toggle-left-panel').click(); // Simuliert Klick, um Panel zu schließen
        }
    } else {
        // Neues Tool aktivieren
        activeToolId = toolId;

        // Zeige das neue aktive Tool-Element an
        const targetElement = $(`#${toolId}`);
        if (targetElement) {
            targetElement.classList.remove('hidden');
        }
        
        // Aktiviere den entsprechenden Toolbar-Button (visuelles Feedback)
        const targetButton = $(`[data-target="${toolId}"]`);
        if (targetButton) {
            targetButton.classList.add('active');
        }
        
        // Panel links öffnen, falls es geschlossen ist
        if ($('#main-wrap').classList.contains('left-collapsed')) {
             $('#toggle-left-panel').click(); // Simuliert Klick, um Panel zu öffnen
        }
    }
}

// Initialisiert den Isochronen-Layer und die Event-Handler
function initIsochroneFunctionality(baseMaps) {
    // Erstellt den GeoJSON-Layer für die Isochrone mit Styling und Popup-Funktionalität
    isochroneLayer = L.geoJSON(null, {
        style: {
            color: '#FF4500', // Farbe der Kontur
            weight: 3, // Dicke der Kontur
            opacity: 0.7,
            fillColor: '#FF6347', // Füllfarbe
            fillOpacity: 0.2
        },
        // Definiert, was bei Klick auf ein Isochronen-Polygon im Popup angezeigt wird
        onEachFeature: (f, l) => {
            const minutes = selectedRange / 60;
            const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
            l.bindPopup(`<b>${minutes} Minuten (${profileText})</b>`);
        }
    }).addTo(map); // Fügt den Isochronen-Layer zur Karte hinzu
    
    // Fügt Marker-Gruppe (Startpunkte) zur Karte hinzu
    clickMarkers.addTo(map);

    // Fügt den Isochronen-Layer zur zentralisierten Leaflet Layer Control hinzu
    mapLayersControl = L.control.layers(baseMaps, { 
        "Stationen": layer, // Nextbike-Stationen
        "Flexzonen": flexzoneLayer, // Flexzonen
        "Business Areas": businessAreaLayer, // Business Areas
        "ORS Isochrone": isochroneLayer, // Isochrone-Ergebnis
        "Startpunkte": clickMarkers // Isochronen-Startpunkte
    }).addTo(map);
    
    // Click-Handler für die Karte, um den Ausgangspunkt zu setzen (aktiviert nur, wenn Zeit gewählt)
    map.on('click', onMapClickForIsochrone);
    
    // Event Listener für die Range-Buttons (Zeitwahl für Isochrone)
    document.querySelectorAll('.ors-range-btn').forEach(button => {
        button.addEventListener('click', function() {
            // Deaktiviert alle anderen Buttons und aktiviert diesen (visuelles Feedback)
            document.querySelectorAll('.ors-range-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            selectedRange = parseInt(this.dataset.range); // Speichert die gewählte Zeit in Sekunden
            
            // Aktualisiert den Status und Buttons basierend auf der Auswahl und gesetzten Punkten
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

    // Event Listener für das Profil-Dropdown (ORS-Verkehrsmittel)
    $('#orsProfileSelect').addEventListener('change', () => {
        // Status und Layer-Popup neu setzen (Isochrone muss neu berechnet werden)
        clearIsochrone(); // Löscht bestehende Isochrone und Marker
        const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
        $('#isochrone-status').textContent = `Profil (${profileText}) gewählt. Bitte neue Zeit wählen.`;
        
        // Alle Zeit-Buttons deaktivieren, bis eine neue Zeit gewählt wird
        document.querySelectorAll('.ors-range-btn').forEach(btn => btn.classList.remove('active'));
        selectedRange = 0; // Setzt die gewählte Zeit zurück
    });

    // Event Listener für Berechnen und Löschen-Buttons
    $('#calculateIsochroneBtn').addEventListener('click', fetchIsochrone); // Startet die API-Anfrage
    $('#clearIsochroneBtn').addEventListener('click', clearIsochrone); // Löscht Marker und Isochrone
}

// Löscht alle Isochronen-Marker und das Polygon-Ergebnis
function clearIsochrone() {
    clickMarkers.clearLayers(); // Entfernt alle Startpunkte-Marker
    isochroneLayer.clearLayers(); // Entfernt das Isochronen-Polygon
    $('#calculateIsochroneBtn').disabled = true; // Deaktiviert den Berechnen-Button
    $('#clearIsochroneBtn').disabled = true; // Deaktiviert den Löschen-Button
    
    // Setzt Status basierend auf der aktuellen Auswahl
    const activeBtn = document.querySelector('.ors-range-btn.active');
    const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();

    if (activeBtn) {
        $('#isochrone-status').textContent = `Profil (${profileText}) und Zeit (${activeBtn.textContent}) gewählt. Klicken Sie auf die Karte, um Punkte zu setzen.`;
    } else {
        $('#isochrone-status').textContent = `Profil (${profileText}) gewählt. Bitte wählen Sie eine Zeit aus.`;
    }
    
    $('#calcIcon').innerHTML = ''; // Entfernt den Lade-Spinner, falls vorhanden
}

// Behandelt Karten-Klicks für den Isochronen-Startpunkt
function onMapClickForIsochrone(e) {
    if (activeToolId !== 'isochrone-controls') return; // Funktion nur ausführen, wenn das Isochronen-Tool aktiv ist
    
    if (selectedRange === 0) {
        alert("Bitte wählen Sie zuerst eine Fahrzeit (z.B. 15 min) aus."); // Warnt, wenn keine Zeit gewählt wurde
        return;
    }
    
    // Max. 5 Locations pro ORS-Anfrage (Limit der ORS API)
    if (clickMarkers.getLayers().length >= 5) {
        alert("Sie können maximal 5 Startpunkte gleichzeitig setzen.");
        return;
    }
    
    const latlng = e.latlng; // Breitengrad- und Längengrad-Objekt vom Klick-Ereignis
    
    // Setzt neuen Marker an der Klickposition
    const newMarker = L.marker(latlng, { icon: markerIcon }).addTo(clickMarkers);
    
    const count = clickMarkers.getLayers().length;
    // Bindet ein Popup an den Marker
    newMarker.bindPopup(`Startpunkt ${count}: ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`).openPopup();
    
    // Status in der UI aktualisieren und Berechnen-Button aktivieren
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
    // Extrahiert die Koordinaten aller gesetzten Marker
    clickMarkers.eachLayer(marker => {
        const latlng = marker.getLatLng();
        locations.push([latlng.lng, latlng.lat]); // ORS erwartet [lon, lat] (umgekehrte Reihenfolge)
    });
    
    if (locations.length === 0) {
        statusDiv.textContent = 'Es wurden keine Startpunkte gesetzt.';
        return;
    }

    const profile = $('#orsProfileSelect').value; // Abrufen des gewählten Verkehrsprofils (z.B. 'cycling-regular')
    const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();

    // UI Feedback starten (Button deaktivieren, Spinner anzeigen)
    calculateBtn.disabled = true;
    $('#calcIcon').innerHTML = '<span class="spinner"></span>';
    const rangeText = document.querySelector('.ors-range-btn.active')?.textContent || (selectedRange / 60) + ' Min.';
    statusDiv.textContent = `Berechne ${profileText}, ${rangeText} für ${locations.length} Punkt(e)...`;
    isochroneLayer.clearLayers(); // Löscht vorherige Ergebnisse

    // Request-Body für die ORS API
    const requestBody = {
        locations: locations, // Startkoordinaten
        range: [selectedRange], // Reichweite in Sekunden
        range_type: 'time', // Art der Reichweite (Zeit)
        attributes: ['area', 'reachfactor'], // Zusätzliche gewünschte Attribute
        // smoothing: 5 // Optional: Glättung des Isochronen-Polygons
    };

    try {
        // Der ORS Endpunkt MUSS das Profil enthalten (z.B. .../isochrones/cycling-regular)
        const dynamicEndpoint = `${ORS_BASE_ENDPOINT}${profile}`; 

        // API-Schlüssel kodieren und als URL-Parameter übergeben
        const encodedApiKey = encodeURIComponent(ORS_API_KEY);
        const orsUrlWithKey = `${dynamicEndpoint}?api_key=${encodedApiKey}`;

        // Leitet die vollständige URL durch den CORS-Proxy
        const urlWithProxy = `${corsProxy}${orsUrlWithKey}`; 
        
        // Führt den POST-Request an die ORS API über den Proxy durch
        const resp = await fetch(urlWithProxy, { 
            method: 'POST',
            headers: {
                'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(requestBody) // Sendet die Konfiguration als JSON
        });

        // Fehlerbehandlung bei HTTP-Fehlern
        if (!resp.ok) {
            const errorText = await resp.text();
            let errorMessage = `ORS API HTTP Fehler: ${resp.status}`;
            try {
                const errorData = JSON.parse(errorText); // Versucht, detaillierte Fehlermeldung zu parsen
                errorMessage = `ORS API Fehler: ${errorData.error.message || errorData.error.info || 'Unbekannt'}`;
            } catch {
                errorMessage = `ORS API Fehler: ${resp.status} - ${errorText.substring(0, 100)}...`;
            }
            throw new Error(errorMessage);
        }
        
        const geojson = await resp.json(); // Erwartet GeoJSON-Antwort
        
        isochroneLayer.addData(geojson); // Fügt das erhaltene GeoJSON-Polygon dem Layer hinzu
        
        statusDiv.textContent = `${profileText}, ${rangeText} erfolgreich geladen für ${locations.length} Punkt(e).`; // Erfolgsmeldung
        
    } catch (e) {
        console.error("Fehler beim Abrufen der Isochrone:", e);
        statusDiv.textContent = 'Fehler beim Laden der Isochrone: ' + e.message; // Fehlermeldung
    }
    finally {
        calculateBtn.disabled = false; // Button wieder aktivieren
        $('#calcIcon').innerHTML = ''; // Spinner entfernen
    }
}

// Initialisiert die Leaflet-Karte und die Basis-Layer
function initMap(){
    // --- Basemap-Definitionen ---
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
    const baseMaps = { // Objekt mit allen verfügbaren Basemaps
        "OSM Standard": osm,
        "Positron": positron,
        "Satellit (Esri)": satellite
    };

    // Initialisierung der Karte mit Positron als Standard-Basemap
    map = L.map('map', { 
        layers: [positron],
        zoomControl: true // Zoom Control ist wieder an
    }); 
    
    // --- Layer für die Daten (Nextbike Stationen) ---
    layer = L.geoJSON(null, {
        // Funktion zum Erstellen der Marker mit dem nextbikeIcon
        pointToLayer: (feature, latlng) => L.marker(latlng, {icon: nextbikeIcon}),
        // Funktion zum Binden von Popups an jeden Marker
        onEachFeature: (f, l) => {
            const p = f.properties || {};
            l.bindPopup(`<strong>${p.name||'Station'}</strong><br>`+
                        `Fahrräder: ${p.num_bikes_available ?? '–'}<br>`+
                        `Freie Plätze: ${p.num_docks_available ?? '–'}<br>`+
                        `ID: ${p.station_id}`);
        }
    });
    
    // --- Layer für Flexzonen ---
    flexzoneLayer = L.geoJSON(null, {
        // Funktion zum Stylen der Flexzonen basierend auf der Kategorie
        style: function(feature) {
            const category = feature.properties.category;
            if (category === 'free_return') {
                return { color: '#000000', weight: 1, opacity: 1, fillColor: '#000000', fillOpacity: 0.2 };
            }
            if (category === 'chargeable_return') {
                return { color: '#FFA500', weight: 1, opacity: 1, fillColor: '#FFFF00', fillOpacity: 0.25 };
            }
            return { color: "#0098FF", weight: 2, opacity: 0.8, fillColor: "#0098FF", fillOpacity: 0.2 }; // Standard-Stil
        },
        onEachFeature: (f, l) => {
            if(f.properties.name) l.bindPopup(`<b>${f.properties.name}</b>`); // Popup mit Namen
        }
    });

    // --- Layer für Business Areas ---
    businessAreaLayer = L.geoJSON(null, {
        // Standard-Styling für Business Areas
        style: function(feature) {
            return { color: "#FF0000", weight: 2, opacity: 0.9, fillColor: "#FF69B4", fillOpacity: 0.2 };
        },
        onEachFeature: (f, l) => {
            if(f.properties.name)  {
                l.bindPopup(`<b>Business Area: ${f.properties.name}</b>`); // Popup mit Namen
            }
        }
    });

    // Layer zur Karte hinzufügen (sichtbar machen)
    layer.addTo(map);
    // Bedient das anfängliche Sichtbarkeits-Setting der Checkboxen
    if ($('#flexzonesCheckbox').checked) {
        flexzoneLayer.addTo(map);
    }
    if ($('#businessAreasCheckbox') && $('#businessAreasCheckbox').checked) {
        businessAreaLayer.addTo(map);
    }
    
    // Setzt die anfängliche Kartenansicht auf Deutschland (ungefähr)
    map.setView([51.1657, 10.4515], 6);
    
    // Zentralisierte Initialisierung der Isochronen-Funktionalität UND Layer-Kontrolle
    initIsochroneFunctionality(baseMaps); 
}

// Hilfsfunktion zum Erstellen eines <option>-Elements
function option(value, label){ const o = document.createElement('option'); o.value = value; o.textContent = label; return o; }

// Verarbeitet die rohen Länderdaten und entfernt Duplikate
function dedupeCountries(countriesIn){
    const mapC = new Map(); // Verwendet eine Map zur Duplikatsprüfung basierend auf dem Ländercode
    countriesIn.forEach(c => {
        const code = (c.country || c.country_code || '').toUpperCase();
        const name = c.country_name || '';
        if(name && code && !mapC.has(code)) mapC.set(code, { country_code: code, country_name: name });
    });
    let arr = Array.from(mapC.values());
    // Sortiert die Länderliste, Deutschland zuerst
    arr.sort((a,b) => (a.country_name==='Germany' ? -1 : b.country_name==='Germany' ? 1 : (a.country_name||'').localeCompare(b.country_name||'')));
    return arr;
}

// Erstellt eine Liste eindeutiger Marken/Systeme aus den Länderdaten
function buildBrands(dataCountries) {
    const mapB = new Map(); // Verwendet Map zur Speicherung eindeutiger Domänen
    dataCountries.forEach(topLevelObject => {
        const geo_country_code = (topLevelObject.country || '').toUpperCase();
        // Hilfsfunktion zum Verarbeiten eines Marken-/Systemobjekts
        const processEntity = (entity, nameFallback) => {
            const domain = (entity.domain || '').toLowerCase(); // Eindeutige Domäne/Schlüssel
            if (!domain) return;
            const name = entity.name || entity.alias || nameFallback || `System ${domain}`;
            if (!mapB.has(domain)) {
                // Neues System gefunden
                mapB.set(domain, { key: domain, domain, name, country_codes: new Set() });
            }
            // Fügt den Ländercode dem Set hinzu (um Duplikate zu vermeiden)
            if (geo_country_code) mapB.get(domain).country_codes.add(geo_country_code);
        };
        processEntity(topLevelObject); // Verarbeitet Top-Level-Länderobjekt
        if (topLevelObject.cities) {
            // Verarbeitet auch Domänen in den Stadt-Objekten
            topLevelObject.cities.forEach(city => processEntity(city, city.city));
        }
    });
    // Konvertiert Map-Werte in Array und sortiert nach Namen
    return Array.from(mapB.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// Lädt die Listen der verfügbaren Länder und Nextbike-Systeme von der API
async function loadLists(){
    $('#load-status').style.visibility = 'visible';
    $('#load-status').textContent = 'Systeme werden geladen...';
    try{
        // API-Endpunkt zum Abrufen aller Städte/Länder/Domänen
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
        
        updateAvailableBrands(); // Aktualisiert die verfügbaren Marken (relevant für die Suche)
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
        const flexzoneResp = await fetch(`${corsProxy}https://api.nextbike.net/api/v1.1/getFlexzones.json?api_key=API_KEY_GELOESCHT`);
        if (!flexzoneResp.ok) {
            const errorText = await flexzoneResp.text();
            console.error(`Flexzonen-API HTTP Fehler: ${flexzoneResp.status} - ${errorText}`);
            throw new Error(`Flexzonen-API HTTP ${flexzoneResp.status}`);
        }
        const flexzoneData = await flexzoneResp.json();
        // Navigiert durch die möglichen JSON-Strukturen, um die Features zu extrahieren
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
        // Spezieller API-Aufruf mit categories=business_area
        const businessAreaResp = await fetch(`${corsProxy}https://api.nextbike.net/api/v1.1/getFlexzones.json?api_key=API_KEY_GELOESCHT&categories=business_area`);
        if (!businessAreaResp.ok) {
            const errorText = await businessAreaResp.text();
            console.error(`BusinessArea-API HTTP Fehler: ${businessAreaResp.status} - ${errorText}`);
            throw new Error(`BusinessArea-API HTTP ${businessAreaResp.status}`);
        }
        const businessAreaData = await businessAreaResp.json();
        // Navigiert durch die möglichen JSON-Strukturen, um die Features zu extrahieren
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

// Aktualisiert die Liste der verfügbaren Marken basierend auf der Länderauswahl
function updateAvailableBrands(){
    const countryCode = ($('#countrySelect').value || '').toUpperCase();
    const brandInput = $('#brandInput');
    
    // Filtert die Markenliste nach dem gewählten Land
    availableBrands = brandList.filter(b => !countryCode || b.country_codes.has(countryCode));
    
    // Setzt die Eingabe und den ausgewählten Brand/Domain zurück
    brandInput.value = '';
    selectedBrandDomain = null;
    brandInput.disabled = false;
    brandInput.placeholder = `${availableBrands.length} Marken/Systeme verfügbar...`;
    
    $('#flexzone-toggle-container').classList.add('hidden'); // Versteckt die Flexzonen-Umschaltung
    refreshCitySelect(); // Aktualisiert das Städte-Dropdown
}

// Ruft die Städte für eine spezifische Nextbike-Domäne ab
async function fetchCitiesForBrand(domain){
    // API-Aufruf, um die Städte für die angegebene Domäne zu erhalten
    const url = `${corsProxy}https://maps.nextbike.net/maps/nextbike-official.json?domains=${encodeURIComponent(domain)}&bikes=0`;
    const resp = await fetch(url, { cache: 'no-store' });
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const out = [];
    // Extrahiert Städte-Informationen aus der API-Antwort
    data.countries?.forEach(co => {
        const cc = (co.country || co.country_code || '').toUpperCase();
        co.cities?.forEach(city => out.push({ uid: city.uid, name: city.name || city.alias || city.city || `#${city.uid}`, country_code: cc }));
    });
    // Entfernt Duplikate nach der UID und gibt die Liste zurück
    return [...new Map(out.map(item => [item.uid, item])).values()];
}

// Aktualisiert das Städte-Dropdown, nachdem eine Marke ausgewählt oder das Land geändert wurde
async function refreshCitySelect(){
    const brandKey = selectedBrandDomain;
    const citySel = $('#citySelect');
    const countryCode = ($('#countrySelect').value || '').toUpperCase();
    citySel.innerHTML = '<option value="">Alle Städte im System</option>';
    if(!brandKey){ citySel.disabled = true; return; } // Wenn keine Marke ausgewählt ist
    try{
        let items = await fetchCitiesForBrand(brandKey); // Lädt Städte für die Marke
        // Filtert zusätzlich nach Land, falls ausgewählt
        if(countryCode) items = items.filter(c => (c.country_code||'') === countryCode);
        items.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
        // Füllt das Dropdown mit den Städten
        items.forEach(c => citySel.appendChild(option(String(c.uid), c.name)));
        citySel.disabled = false;
    }catch(e){ console.error(e); citySel.disabled = true; }
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
                    // Geometrie im [lon, lat]-Format
                    geometry:{ type:'Point', coordinates:[place.lng, place.lat] }, 
                    properties: { // Wichtige Stationsinformationen
                        station_id: String(place.number ?? place.uid ?? ''), name: place.name || '', address: place.address || '',
                        capacity: place.bike_racks ?? null, num_bikes_available: place.bikes ?? null, num_docks_available: place.free_racks ?? null,
                        city_uid: city.uid ?? null, city_name: city.name || city.city || city.alias || '', domain, country_name: country.country_name || ''
                    }
                });
            });
        });
    });
    return { type:'FeatureCollection', features }; // Gibt die finale GeoJSON FeatureCollection zurück
}

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
        // Filtert und zeigt nur die Flexzonen für die aktuell ausgewählte Domäne an
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

        // --- Business Area Logik ---
        businessAreaLayer.clearLayers();
        // Filtert und zeigt nur die Business Areas für die Domäne an
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
        
        // Passt den Kartenausschnitt an die geladenen Daten an (Stationen, Flexzonen, Business Areas)
        const combinedLayer = L.featureGroup([...layer.getLayers(), ...flexzoneLayer.getLayers(), ...businessAreaLayer.getLayers()]);
        if (combinedLayer.getLayers().length > 0) {
            const bounds = combinedLayer.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, {padding: [50, 50]}); // Zoomt auf die Ausdehnung der Daten
            }
        } else {
             map.setView([51.1657, 10.4515], 6); // Setzt auf Standardansicht zurück
        }

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
    // Formatiert Datum und Uhrzeit
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    // Beispiel: "2023-10-27_14-35-00_le_stations"
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}_${cityAlias}_stations`;
}

// Erstellt ein ZIP-Archiv mit Stations- und Zonen-GeoJSONs zum Download
async function downloadZip() {
    if (!currentGeoJSON) return;

    const zip = new JSZip(); // Erstellt eine neue JSZip-Instanz
    // Generiert den Basis-Dateinamen
    const baseFilename = generateFilename(selectedBrandDomain);
    
    // Stations-GeoJSON hinzufügen
    zip.file("stations.geojson", JSON.stringify(currentGeoJSON, null, 2));

    const flexzoneGeoJSON = flexzoneLayer.toGeoJSON(); // Konvertiert Flexzonen-Layer in GeoJSON
    
    // Überprüft, ob Flexzonen-Features vorhanden sind
    if (flexzoneGeoJSON.features.length > 0) {
        // Die komplette Flexzonen-Datei hinzufügen
        zip.file("fullsystem_flexzones.geojson", JSON.stringify(flexzoneGeoJSON, null, 2));

        // Jedes Flexzonen-Feature als separate Datei hinzufügen (zum besseren Import)
        flexzoneGeoJSON.features.forEach(feature => {
            const featureName = feature.properties.name;
            // Erstellt einen gültigen, bereinigten Dateinamen
            const sanitizedName = featureName ? featureName.replace(/[\W_]+/g, "_") : 'unbenannte_flexzone';
            
            // Erstellt ein GeoJSON FeatureCollection-Objekt nur für dieses eine Feature
            const singleFeatureGeoJSON = {
                type: "FeatureCollection",
                features: [feature]
            };

            // Fügt die Datei zum ZIP-Archiv hinzu
            zip.file(`${sanitizedName}.geojson`, JSON.stringify(singleFeatureGeoJSON, null, 2));
        });
    }

    // --- Business Areas-Logik (analog zu Flexzonen) ---
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

    // Generiert die ZIP-Datei und startet den Download
    const zipBlob = await zip.generateAsync({type:"blob"});
    saveAs(zipBlob, baseFilename + ".zip"); // saveAs ist eine Funktion der library FileSaver.js
}

// Richtet die Event Listener für das Ein- und Ausklappen der Sidebars ein
function setupSidebars() {
    const wrap = $('#main-wrap');
    const toggleLeftBtn = $('#toggle-left-panel');
    const toggleRightBtn = $('#toggle-right-panel');

    // Event Listener für die linke Sidebar
    toggleLeftBtn.addEventListener('click', () => {
        wrap.classList.toggle('left-collapsed'); // Schaltet die CSS-Klasse um
        toggleLeftBtn.textContent = wrap.classList.contains('left-collapsed') ? '▶' : '◀'; // Ändert den Button-Text
        // Verzögerte Größenanpassung der Karte nach dem Umklappen (Leaflet-Anforderung)
        setTimeout(() => map.invalidateSize({debounceMoveend: true}), 350); 
    });

    // Event Listener für die rechte Sidebar (falls vorhanden)
    if (toggleRightBtn) {
        toggleRightBtn.addEventListener('click', () => {
            wrap.classList.toggle('right-collapsed');
            toggleRightBtn.textContent = wrap.classList.contains('right-collapsed') ? '◀' : '▶';
            setTimeout(() => map.invalidateSize({debounceMoveend: true}), 350);
        });
    }
}

// Richtet die Autovervollständigungs- und Suchfunktionen für Nextbike-Marken ein
function setupBrandSearch() {
    const brandInput = $('#brandInput');
    const brandResults = $('#brandResults');
    const countrySelect = $('#countrySelect');
    const flexzoneToggle = $('#flexzone-toggle-container');

    // Hauptfunktion zur Filterung und Anzeige der Suchergebnisse
    function filterAndDisplay() {
        const query = brandInput.value.toLowerCase();
        selectedBrandDomain = null; // Setze Domain zurück, wenn Input geändert wird
        refreshCitySelect(); // Aktualisiert das Städte-Dropdown
        flexzoneToggle.classList.add('hidden'); // Versteckt Flexzonen-Umschaltung

        if (!query) {
            brandResults.style.display = 'none'; // Versteckt Ergebnisse bei leerer Eingabe
            return;
        }
        
        let filtered = availableBrands;
        // Filtert nach Land, falls ausgewählt
        if (countrySelect.value) {
            filtered = filtered.filter(s => s.country_codes.has(countrySelect.value.toUpperCase()));
        }
        
        // Filtert nach eingegebenem Text in Name oder Domain
        filtered = filtered.filter(s => s.name.toLowerCase().includes(query) || s.domain.toLowerCase().includes(query));
        
        brandResults.innerHTML = '';
        if (filtered.length > 0) {
            // Zeigt maximal 100 Ergebnisse an
            filtered.slice(0, 100).forEach(system => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.innerHTML = `${system.name} <small>(${system.domain})</small>`;
                // Klick-Handler für ein Suchergebnis
                item.addEventListener('click', () => {
                    brandInput.value = system.name;
                    selectedBrandDomain = system.key; // Setzt die ausgewählte Domäne
                    brandResults.style.display = 'none';
                    refreshCitySelect();
                    flexzoneToggle.classList.remove('hidden'); // Zeigt Flexzonen-Umschaltung
                });
                brandResults.appendChild(item);
            });
            brandResults.style.display = 'block';
        } else {
            brandResults.style.display = 'none';
        }
    }
    
    // Event Listener für Eingabe im Suchfeld und Änderung der Länderauswahl
    brandInput.addEventListener('input', filterAndDisplay);
    countrySelect.addEventListener('change', () => {
        brandInput.value = '';
        updateAvailableBrands(); // Aktualisiert die verfügbare Markenliste
    });

    // Schließt die Autovervollständigung, wenn außerhalb geklickt wird
    document.addEventListener('click', (e) => {
        if (!$('.autocomplete-container').contains(e.target)) {
            brandResults.style.display = 'none';
        }
    });
}

/**
 * Fügt Event Listener zur neuen Top-Toolbar hinzu (für die Tool-Auswahl)
 */
function setupToolbar() {
    // Fügt Event Listener zur neuen Top-Toolbar hinzu
    document.querySelectorAll('#top-toolbar .toolbar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.currentTarget.dataset.target; // Liest die Ziel-ID des Tools
            setActiveTool(targetId); // Ruft die Funktion zur Aktivierung des Tools auf
        });
    });
}


// Wird ausgeführt, wenn das DOM vollständig geladen ist
window.addEventListener('DOMContentLoaded', () => {
    initMap(); // Initialisiert die Karte
    loadLists(); // Lädt die Listen von Ländern und Marken
    setupSidebars(); // Richtet die Funktionalität der Sidebars ein
    setupBrandSearch(); // Richtet die Markensuche ein
    setupToolbar(); // Richtet die Toolbar-Logik ein
    
    $('#loadBtn').addEventListener('click', loadData); // Event Listener für den Daten-Laden-Button
    
    // ANPASSUNG 1: GeoJSON Download Button
    $('#geojsonBtn').addEventListener('click', () => {
        if(!currentGeoJSON) return; 

        // Generiere den Dateinamen dynamisch
        const filename = generateFilename(selectedBrandDomain) + '.geojson';
        
        // Erstellt einen Blob und startet den Download (nutzt saveAs von FileSaver.js)
        const blob = new Blob([$('#geojson-output').value], {type:'application/geo+json;charset=utf-8'}); 
        saveAs(blob, filename); 
    });
    
    // ANPASSUNG 2: Zip Download Button ruft die angepasste Funktion auf
    $('#zipBtn').addEventListener('click', downloadZip);
    
    // Event Listener für die Flexzonen-Checkbox (Layer ein-/ausblenden)
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

    // Event Listener für die Business Areas-Checkbox (Layer ein-/ausblenden)
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