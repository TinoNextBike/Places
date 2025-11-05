# Places Tool
Dies ist ein interaktives Webtool, das GeoJSON-Daten von Nextbike (Stationen, Flexzonen, Business Areas) abruft und auf einer Leaflet-Karte visualisiert. Zusätzlich bietet es eine Funktion zur Berechnung von Isochronen (Erreichbarkeitszonen) mithilfe der OpenRouteService (ORS) API.

🌟 Funktionen
Systemauswahl: Länderauswahl und Markensuche mit Autovervollständigung, um Nextbike-Systeme gezielt zu laden.

Layer-Visualisierung: Anzeige von Stationen, Flexzonen (Rückgabegebiete) und Business Areas.

Interaktive Isochronen: Berechnung der Reichweite (z.B. 15, 30, 60 Minuten) für verschiedene Verkehrsprofile (Fahrrad, Auto, Fuß) von bis zu fünf frei wählbaren Startpunkten.

Daten-Export: Direkter Download der Stationsdaten als GeoJSON oder als ZIP-Archiv, das separate GeoJSON-Dateien für Stationen, Flexzonen und Business Areas enthält.

Responsives Layout: Ein modernes, einklappbares Sidebar-Layout, das für Desktop und Mobilgeräte optimiert ist

Technologie,Rolle
HTML5 / CSS3,Struktur und Layout (unterstützt durch CSS Grid).
JavaScript (Vanilla),"Die gesamte Logik, UI-Steuerung und API-Interaktion."
Leaflet,Die primäre Bibliothek für die Darstellung interaktiver Karten und Geo-Layer.
OpenRouteService (ORS),Bereitstellung des Isochronen-Dienstes zur Berechnung der Erreichbarkeitszonen.
Nextbike API,Datenquelle für alle Stations- und Zonendaten.
JSZip & FileSaver.js,Hilfsbibliotheken für den lokalen ZIP- und Datei-Download.
corsproxy.io,"Wird verwendet, um Cross-Origin (CORS) Beschränkungen beim Abrufen der APIs zu umgehen."
