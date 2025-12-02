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
    activeToolId: 'filter-controls',
    
    // Map Referenzen (werden später gesetzt)
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