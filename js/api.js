// js/api.js
import { state } from './state.js';
import { CORS_PROXY, NEXTBIKE_OFFICIAL_API, NEXTBIKE_FLEXZONE_API, NEXTBIKE_API_KEY } from './config.js';
import { $, dedupeCountries, buildBrands, fcFromNextbike } from './utils.js';

// 1. Listen laden (Länder & Marken)
export async function loadLists(){
    $('#load-status').style.visibility = 'visible';
    $('#load-status').textContent = 'Systeme werden geladen...';
    try{
        const url = `${CORS_PROXY}${NEXTBIKE_OFFICIAL_API}?list_cities=1&bikes=0`;
        const resp = await fetch(url, { cache: 'no-store' });
        if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        
        if (!data || !data.countries) throw new Error("API-Antwort ist ungültig.");

        // Nur Daten in den State schreiben
        state.rawCountries = data.countries;
        state.countryList = dedupeCountries(state.rawCountries);
        state.brandList = buildBrands(state.rawCountries);

        // Hintergrund-Laden starten
        loadAllFlexzones();
        loadAllBusinessAreas();
        
        return true; // Erfolg
    }catch(e){
        $('#load-status').textContent = 'Fehler beim Laden der System-Listen.';
        console.error(e);
        return false; // Fehler
    }
}

// 2. Flexzonen laden
export async function loadAllFlexzones() {
    try {
        const resp = await fetch(`${CORS_PROXY}${NEXTBIKE_FLEXZONE_API}?api_key=${NEXTBIKE_API_KEY}`);
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        const data = await resp.json();
        if (data.geojson?.nodeValue?.features) state.allFlexzones = data.geojson.nodeValue.features;
        else if (data.geojson?.features) state.allFlexzones = data.geojson.features;
        else state.allFlexzones = [];
    } catch(e) { state.allFlexzones = []; }
}

// 3. Business Areas laden
export async function loadAllBusinessAreas() {
    try {
        const resp = await fetch(`${CORS_PROXY}${NEXTBIKE_FLEXZONE_API}?api_key=${NEXTBIKE_API_KEY}&categories=business_area`);
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        const data = await resp.json();
        if (data.geojson?.nodeValue?.features) state.allBusinessAreas = data.geojson.nodeValue.features;
        else if (data.geojson?.features) state.allBusinessAreas = data.geojson.features;
        else state.allBusinessAreas = [];
    } catch(e) { state.allBusinessAreas = []; }
}

// 4. Haupt-Daten (Stationen) laden
export async function loadData(){
    const loadBtn = $('#loadBtn');
    loadBtn.disabled = true; 
    $('#loadIcon').innerHTML = '<span class="spinner"></span>'; 
    $('#load-status').textContent = 'Lade Stationen...';
    $('#load-status').style.visibility = 'visible';
    
    if (!state.selectedBrandDomain) {
        if (state.map.hasLayer(state.layers.flexzoneLayer)) state.map.removeLayer(state.layers.flexzoneLayer);
        if (state.map.hasLayer(state.layers.businessAreaLayer)) state.map.removeLayer(state.layers.businessAreaLayer);
    }

    try{
        const domain = state.selectedBrandDomain;
        const cityUid = $('#citySelect').value;
        const countryCode = ($('#countrySelect').value || '').toUpperCase();
        let baseUrl = `${NEXTBIKE_OFFICIAL_API}?bikes=0`;
        let loadScope = 'Stationen';
        const isCitySelected = !!cityUid; 

        if(cityUid) { 
            baseUrl += `&city=${cityUid}`;
            // Optional chaining (?.) verhindert Fehler, falls Option noch nicht existiert
            const cityName = $('#citySelect').options[$('#citySelect').selectedIndex]?.text.split('(')[0].trim() || 'Stadt';
            loadScope = `Stationen in ${cityName}`;
        }
        else if(domain) { 
            baseUrl += `&domains=${domain}`;
            const brandName = $('#brandSelect').options[$('#brandSelect').selectedIndex]?.text.trim() || domain;
            loadScope = `Stationen von ${brandName}`;
        }
        else if(countryCode) { 
            baseUrl += `&countries=${countryCode}`;
            const countryName = $('#countrySelect').options[$('#countrySelect').selectedIndex]?.text.split('(')[0].trim() || countryCode;
            loadScope = `Stationen in ${countryName}`;
        } else {
             $('#load-status').textContent = 'Bitte System, Stadt oder Land wählen.';
             state.layers.stationLayer.clearLayers(); 
             state.currentGeoJSON = null;
             $('#geojsonBtn').disabled = true; $('#zipBtn').disabled = true;
             return;
        }

        const resp = await fetch(`${CORS_PROXY}${baseUrl}`, { cache: 'no-store' }); 
        if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        let fc = fcFromNextbike(data); 

        const filterTxt = ($('#quickFilter').value||'').trim().toLowerCase();
        if(filterTxt){
            fc.features = fc.features.filter(f => `${f.properties.name} ${f.properties.address}`.toLowerCase().includes(filterTxt));
        }

        state.currentGeoJSON = fc; 
        const stationCount = fc.features.length;
        const timestamp = new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
        $('#load-status').innerHTML = `<strong>${stationCount}</strong> ${loadScope} geladen (${timestamp})`; 

        $('#geojson-output').value = JSON.stringify(fc, null, 2); 
        state.layers.stationLayer.clearLayers().addData(fc); 
        
        $('#geojsonBtn').disabled = stationCount === 0;
        $('#zipBtn').disabled = stationCount === 0;

        state.layers.flexzoneLayer.clearLayers();
        if ($('#flexzonesCheckbox').checked && state.allFlexzones.length > 0 && domain) {
            if (!state.map.hasLayer(state.layers.flexzoneLayer)) state.map.addLayer(state.layers.flexzoneLayer);
            const rel = state.allFlexzones.filter(f => f.properties?.domain === domain);
            if (rel.length > 0) state.layers.flexzoneLayer.addData({ type: "FeatureCollection", features: rel });
        } else {
            if (state.map.hasLayer(state.layers.flexzoneLayer)) state.map.removeLayer(state.layers.flexzoneLayer);
        }

        state.layers.businessAreaLayer.clearLayers();
        if ($('#businessAreasCheckbox').checked && state.allBusinessAreas.length > 0 && domain) {
            if (!state.map.hasLayer(state.layers.businessAreaLayer)) state.map.addLayer(state.layers.businessAreaLayer);
            const rel = state.allBusinessAreas.filter(f => f.properties?.domain === domain);
            if (rel.length > 0) state.layers.businessAreaLayer.addData({ type: "FeatureCollection", features: rel });
        } else {
            if (state.map.hasLayer(state.layers.businessAreaLayer)) state.map.removeLayer(state.layers.businessAreaLayer);
        }
        
        let targetLayer;
        if (isCitySelected) {
            targetLayer = state.layers.stationLayer;
        } else {
            targetLayer = L.featureGroup([
                ...state.layers.stationLayer.getLayers(), 
                ...state.layers.flexzoneLayer.getLayers(), 
                ...state.layers.businessAreaLayer.getLayers()
            ]);
        }
        
        if (targetLayer.getLayers().length > 0) {
            const bounds = targetLayer.getBounds();
            if (bounds.isValid()) state.map.fitBounds(bounds, {padding: [50, 50]});
        }
        
    }catch(e){ 
        $('#load-status').textContent = 'Fehler: '+e.message; 
        console.error(e);
        $('#geojsonBtn').disabled = true; $('#zipBtn').disabled = true;
    }
    finally{ loadBtn.disabled = false; $('#loadIcon').innerHTML = ''; }
}

// --- DIESE FUNKTION FEHLTE ---
export function fetchCitiesForBrand(domain, countryCode) { 
    const out = [];
    const domainLower = domain ? domain.toLowerCase() : null;
    const countryCodeUpper = countryCode ? countryCode.toUpperCase() : null;

    if (!state.rawCountries) return [];

    state.rawCountries.forEach(co => {
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