// ==========================
// Airtable configuration
// ==========================
//
// IMPORTANT:
// Replace these three values with the real ones from your Airtable:
//
// 1. AIRTABLE_BASE_ID: "app..." (Base ID from Airtable API docs)
// 2. AIRTABLE_TABLE_NAME: your table name (e.g. "Trees")
// 3. AIRTABLE_API_TOKEN: your personal access token with read-only access
//
// Use the same values that already work in your Softr/Airtable setup.[web:18][web:52][web:63]

const AIRTABLE_BASE_ID = "REPLACE_WITH_YOUR_BASE_ID";
const AIRTABLE_TABLE_NAME = "Trees"; // exact table name
const AIRTABLE_API_TOKEN = "REPLACE_WITH_YOUR_API_TOKEN";

// Approximate FRI campus coordinates for map center.[web:77][web:79][web:85]
const FRI_LAT = 30.343;
const FRI_LNG = 78.0015;

// Global storage for records
let allRecords = [];

// ==========================
// Helper: read URL parameter
// ==========================
//
// Example: https://yourusername.github.io/fri-tree-map/?species=Pinus%20roxburghii
// getUrlParam("species") will return "Pinus roxburghii"

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
// Fetch records from Airtable
// ==========================

async function loadTreesFromAirtable() {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_TOKEN) {
    console.error("You must set AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN in script.js");
    return;
  }

  const url =
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/` +
    encodeURIComponent(AIRTABLE_TABLE_NAME) +
    `?pageSize=100&view=Grid%20view`; // adjust view name if needed.[web:18][web:52][web:63]

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
    console.log("Airtable data:", data);

    if (!data.records || !Array.isArray(data.records)) {
      console.error("Unexpected Airtable response format");
      return;
    }

    allRecords = data.records;

    // Apply species filter, if any
    const speciesParam = getUrlParam("species");
    let recordsToShow = allRecords;

    if (speciesParam) {
      recordsToShow = allRecords.filter(record => {
        const { species, commonName } = getFields(record);
        const s = species.toLowerCase();
        const c = commonName.toLowerCase();
        const p = speciesParam.toLowerCase();
        return s === p || c === p;
      });

      if (recordsToShow.length === 0) {
        console.warn("No records found for species:", speciesParam);
      }
    }

    renderMapMarkers(recordsToShow);
  } catch (err) {
    console.error("Error fetching from Airtable:", err);
  }
}

// ==========================
// Helper: extract fields
// ==========================

function getFields(record) {
  const fields = record.fields || {};

  const species =
    fields.Species ||
    fields["Scientific name"] ||
    fields["Species name"] ||
    "Unnamed species";

  const family =
    fields.Family ||
    fields["Botanical family"] ||
    "Unknown family";

  const commonName =
    fields["Common name"] ||
    fields["Common Name"] ||
    "";

  const origin =
    fields.Origin ||
    fields["Origin category"] ||
    "";

  const uses =
    fields.Uses ||
    fields["Tree uses"] ||
    "";

  const lat =
    fields.Latitude ||
    fields.Lat ||
    fields.lat ||
    null;

  const lng =
    fields.Longitude ||
    fields.Lng ||
    fields.lng ||
    null;

  return {
    species,
    family,
    commonName,
    origin,
    uses,
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
      species,
      family,
      commonName,
      origin,
      uses,
      lat,
      lng
    } = getFields(record);

    if (lat == null || lng == null) {
      return;
    }

    const marker = L.marker([lat, lng]);

    const popupLines = [];
    popupLines.push(`<strong>${species}</strong>`);
    if (commonName) popupLines.push(commonName);
    popupLines.push(family);
    if (origin) popupLines.push(origin);
    if (uses) popupLines.push(`<em>${uses}</em>`);

    marker.bindPopup(popupLines.join("<br/>"));
    marker.addTo(treeLayer);
  });
}

// ==========================
// Initialize on page load
// ==========================

document.addEventListener("DOMContentLoaded", () => {
  loadTreesFromAirtable();
});
