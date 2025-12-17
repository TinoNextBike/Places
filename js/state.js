// js/state.js

export const state = {
    // Daten
    rawCountries: [],
    countryList: [],
    brandList: [],
    allFlexzones: [],
    allBusinessAreas: [],
    
    // Aktuelle Auswahl & Status
    selectedBrandDomain: null,
    currentGeoJSON: null,
    populationGeoRaster: null,
    activeToolId: 'filter-controls',
    
    // NEU: Speicher für die STRG-Auswahl (Map: ID -> Feature)
    selectedFeatures: new Map(),
    
    // Map Referenzen
    map: null,
    layers: {
        stationLayer: null,
        cityLayer: null,
        flexzoneLayer: null,
        businessAreaLayer: null,
        isochroneLayer: null,
        clickMarkers: null
    },
    mapLayersControl: null,
    IsochroneTool: null
};