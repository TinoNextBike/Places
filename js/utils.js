// js/utils.js

// Kurzer Selektor
export const $ = sel => document.querySelector(sel);

// Erstellt ein <option> Element
export function option(value, label){ 
    const o = document.createElement('option'); 
    o.value = value; 
    o.textContent = label; 
    return o; 
}

// Generiert Dateinamen für Downloads
export function generateFilename(cityAlias) {
    if (!cityAlias) cityAlias = "nextbike";
    const now = new Date();
    const p = v => v.toString().padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}_${cityAlias}_stations`;
}

// Entfernt doppelte Länder
export function dedupeCountries(countriesIn){
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

// Baut die Markenliste
export function buildBrands(dataCountries) {
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

// Konvertiert API-Response zu GeoJSON
export function fcFromNextbike(json){
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