// ==========================
// Airtable configuration
// ==========================
//
// IMPORTANT:
// Replace these three values with the real ones from your Airtable base:
//
// 1. AIRTABLE_BASE_ID: "app..." (Base ID from Airtable API docs)
// 2. AIRTABLE_TABLE_NAME: "Location"  (we read locations, not species now)
// 3. AIRTABLE_API_TOKEN: your personal access token with read-only access
//
// Use the same base and token you already use for Softr.[web:18][web:196]

const AIRTABLE_BASE_ID = "app2ZtDcYLBuNUM0f";
const AIRTABLE_TABLE_NAME = "Location";
const AIRTABLE_API_TOKEN = "patdC6IkNl0SFQTAY.96592e2cd802d52774805d228ac9a413d1cc9e5a2667f1e4033a8c075d9f5eb2";

// Approximate FRI campus coordinates for map center.[web:78][web:79][web:85]
const FRI_LAT = 30.343;
const FRI_LNG = 78.0015;

// Storage for all location records
let allRecords = [];

// ==========================
// Helper: read URL parameter
// ===========================
//
// Example:
//   https://shreeshgaur56-glitch.github.io/fri-tree-map/?species=Pinus%20roxburghii
// getUrlParam("species") -> "Pinus roxburghii"

function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  return value && value.trim() ? value.trim() : null;
}

// ==========================
// Leaflet map setup
// ==========================

const map = L.map("map").setView([FRI_LAT, FRI_LNG], 16);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const treeLayer = L.layerGroup().addTo(map);

// ==========================
// Fetch location records from Airtable
// ==========================

async function loadLocationsFromAirtable() {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_TOKEN) {
    console.error("You must set AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN in script.js");
    return;
  }

  const url =
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/` +
    encodeURIComponent(AIRTABLE_TABLE_NAME) +
    `?view=Grid%20view`; // adjust view name if needed[web:18][web:196]

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_TOKEN}`
      }
    });

    if (!response.ok) {
      console.error("Airtable API error:", response.status, response.statusText);
      return;
    }

    const data = await response.json();
    console.log("Location table data:", data);

    if (!data.records || !Array.isArray(data.records)) {
      console.error("Unexpected Airtable response format");
      return;
    }

    allRecords = data.records;

    // Apply species filter if ?species=... is present
    const speciesParam = getUrlParam("species");
    let recordsToShow = allRecords;

    if (speciesParam) {
      const target = speciesParam.toLowerCase();

      recordsToShow = allRecords.filter(record => {
        const { speciesName } = getFields(record);
        if (!speciesName) return false;
        return speciesName.toLowerCase() === target;
      });

      if (recordsToShow.length === 0) {
        console.warn("No locations found for species:", speciesParam);
      }
    }

    renderMapMarkers(recordsToShow);
  } catch (err) {
    console.error("Error fetching from Airtable:", err);
  }
}

// ==========================
// Helper: extract fields from Location record
// ==========================
//
// Location table fields (based on your description):
// - Location ID (optional)
// - Linked Species (linked field to Species table)
// - Location Description
// - Latitude
// - Longitude
// - LatLong (combined text, not needed here)
// - Species name (lookup of species name from Species table)  <-- we added this

function getFields(record) {
  const fields = record.fields || {};

  // Species name from lookup field (may be string or array)
  let speciesName = "";
  const lookup = fields["Species name"];
  if (lookup) {
    if (Array.isArray(lookup) && lookup.length > 0) {
      speciesName = lookup[0];
    } else if (typeof lookup === "string") {
      speciesName = lookup;
    }
  }

  const locationDescription =
    fields["Location Description"] ||
    fields["Location description"] ||
    "";

  const lat =
    fields.Latitude ||
    fields["Latitude "] || // just in case of trailing space
    null;

  const lng =
    fields.Longitude ||
    fields["Longitude "] ||
    null;

  return {
    speciesName,
    locationDescription,
    lat,
    lng
  };
}

// ==========================
// Render markers on the map
// ==========================

function renderMapMarkers(records) {
  treeLayer.clearLayers();

  records.forEach(record => {
    const {
      speciesName,
      locationDescription,
      lat,
      lng
    } = getFields(record);

    if (lat == null || lng == null) {
      return;
    }

    const marker = L.marker([lat, lng]);

    const popupLines = [];
    if (speciesName) popupLines.push(`<strong>${speciesName}</strong>`);
    if (locationDescription) popupLines.push(locationDescription);

    marker.bindPopup(popupLines.join("<br/>"));
    marker.addTo(treeLayer);
  });
}

// ==========================
// Initialize on page load
// ==========================

document.addEventListener("DOMContentLoaded", () => {
  loadLocationsFromAirtable();
});
