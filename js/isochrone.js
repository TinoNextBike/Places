// js/isochrone.js
import { state } from './state.js';
import { ORS_API_KEY, ORS_BASE_ENDPOINT, CORS_PROXY } from './config.js';
import { $ } from './utils.js';

let selectedRange = 0;

const markerIcon = L.divIcon({
    className: 'ors-marker-div',
    iconSize:    [12, 12],
    html: '<div style="background-color: #FF4500; width: 100%; height: 100%; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>'
});

export const IsochroneTool = {
    init: function() {
        // Layer erstellen
        state.layers.isochroneLayer = L.geoJSON(null, {
            style: { color: '#FF4500', weight: 3, opacity: 0.7, fillColor: '#FF6347', fillOpacity: 0.2 },
            onEachFeature: (f, l) => {
                const minutes = selectedRange / 60;
                const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
                l.bindPopup(`<b>${minutes} Minuten (${profileText})</b>`);
            }
        }).addTo(state.map);
        
        state.layers.clickMarkers = L.featureGroup().addTo(state.map);

        // Zur Layer Control hinzufügen
        if (state.mapLayersControl) {
            state.mapLayersControl.addOverlay(state.layers.isochroneLayer, "ORS Isochrone");
            state.mapLayersControl.addOverlay(state.layers.clickMarkers, "Startpunkte");
        }

        // Event Listener für Range Buttons
        document.querySelectorAll('.ors-range-btn').forEach(button => {
            button.addEventListener('click', function() {
                document.querySelectorAll('.ors-range-btn').forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                selectedRange = parseInt(this.dataset.range);
                
                if (state.layers.clickMarkers.getLayers().length > 0) {
                     $('#calculateIsochroneBtn').disabled = false;
                     $('#clearIsochroneBtn').disabled = false;
                     $('#isochrone-status').textContent = `${this.textContent} gewählt. ${state.layers.clickMarkers.getLayers().length} Punkt(e) gesetzt. Berechnen drücken.`;
                } else {
                     $('#calculateIsochroneBtn').disabled = true;
                     $('#isochrone-status').textContent = `Klicken Sie auf die Karte, um den Startpunkt zu setzen.`;
                }
            });
        });

        // Profil Change
        $('#orsProfileSelect').addEventListener('change', () => {
            this.clear();
            const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
            $('#isochrone-status').textContent = `Profil (${profileText}) gewählt. Bitte neue Zeit wählen.`;
            document.querySelectorAll('.ors-range-btn').forEach(btn => btn.classList.remove('active'));
            selectedRange = 0;
        });

        // Buttons
        $('#calculateIsochroneBtn').addEventListener('click', () => this.fetchIsochrone());
        $('#clearIsochroneBtn').addEventListener('click', () => this.clear());

        $('#isochrone-status').textContent = `Klicken Sie auf das Werkzeug, um die Isochronen-Funktion zu nutzen.`;
    },

    addMarker: function(latlng) {
        if (selectedRange === 0) {
            alert("Bitte wählen Sie zuerst eine Fahrzeit (z.B. 15 min) aus.");
            return;
        }
        if (state.layers.clickMarkers.getLayers().length >= 5) {
            alert("Sie können maximal 5 Startpunkte gleichzeitig setzen.");
            return;
        }
        
        const newMarker = L.marker(latlng, { icon: markerIcon }).addTo(state.layers.clickMarkers);
        const count = state.layers.clickMarkers.getLayers().length;
        newMarker.bindPopup(`Startpunkt ${count}: ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`).openPopup();
        
        const rangeText = document.querySelector('.ors-range-btn.active')?.textContent || 'Zeit gewählt';
        const profileText = $('#orsProfileSelect').options[$('#orsProfileSelect').selectedIndex].text.trim();
        $('#isochrone-status').textContent = `${profileText}, ${rangeText}. ${count} Punkt(e) gesetzt. Berechnen drücken.`;
        $('#calculateIsochroneBtn').disabled = false;
        $('#clearIsochroneBtn').disabled = false;
    },

    clear: function() {
        state.layers.clickMarkers.clearLayers();
        state.layers.isochroneLayer.clearLayers();
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
    },

fetchIsochrone: async function() {
        const statusDiv = $('#isochrone-status'); 
        const calculateBtn = $('#calculateIsochroneBtn');
        
        const locations = [];
        state.layers.clickMarkers.eachLayer(marker => {
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
        state.layers.isochroneLayer.clearLayers();

        const requestBody = {
            locations: locations,
            range: [selectedRange],
            range_type: 'time',
            attributes: ['area', 'reachfactor'],
        };

        try {
            // 1. Die "echte" Ziel-URL zusammenbauen (inkl. Key)
            const dynamicEndpoint = `${ORS_BASE_ENDPOINT}${profile}`;
            const targetUrl = `${dynamicEndpoint}?api_key=${ORS_API_KEY}`;
            
            // 2. WICHTIG: Die Ziel-URL kodieren, damit der Proxy sie nicht "kaputt macht"
            // CORS_PROXY ist 'https://corsproxy.io/?'
            const urlWithProxy = `${CORS_PROXY}${encodeURIComponent(targetUrl)}`;
            
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
                // Versuche JSON-Fehler zu lesen
                let errorMsg = `HTTP ${resp.status}`;
                try {
                    const jsonErr = JSON.parse(errorText);
                    if (jsonErr.error && jsonErr.error.message) errorMsg = jsonErr.error.message;
                    else if (jsonErr.error) errorMsg = JSON.stringify(jsonErr.error);
                } catch(e) { 
                    errorMsg = `HTTP ${resp.status} - ${errorText.substring(0, 50)}`;
                }
                throw new Error(errorMsg);
            }
            
            const geojson = await resp.json();
            state.layers.isochroneLayer.addData(geojson);
            statusDiv.textContent = `${profileText}, ${rangeText} erfolgreich geladen für ${locations.length} Punkt(e).`;
            
        } catch (e) {
            console.error("Fehler bei Isochrone:", e);
            statusDiv.textContent = 'Fehler: ' + e.message;
        } finally {
            calculateBtn.disabled = false;
            $('#calcIcon').innerHTML = '';
        }
    }
};