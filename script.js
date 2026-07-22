// ==========================
// Airtable configuration
// ==========================
//
// IMPORTANT: Update these three values.[web:196]
//
// - AIRTABLE_BASE_ID: "app..." for your base
// - AIRTABLE_TABLE_NAME: "Location" (locations table)
// - AIRTABLE_API_TOKEN: personal access token with read-only access

const AIRTABLE_BASE_ID = "app2ZtDcYLBuNUM0f";
const AIRTABLE_TABLE_NAME = "Location";
const AIRTABLE_API_TOKEN = "patdC6IkNl0SFQTAY.96592e2cd802d52774805d228ac9a413d1cc9e5a2667f1e4033a8c075d9f5eb2";

// FRI campus center coordinates.[web:78][web:79][web:85]
const FRI_LAT = 30.343;
const FRI_LNG = 78.0015;

// Global data
let allRecords = [];
let baseRecordsForFiltering = []; // all records or single species (from ?species=)

// DOM elements
let searchInput;
let familyFilter;
let useFilter;
let originFilter;

// ==========================
// URL parameter helper
// ==========================

function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  return value && value.trim() ? value.trim() : null;
}

// ==========================
// Leaflet setup
// ==========================

const map = L.map("map").setView([FRI_LAT, FRI_LNG], 16);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const treeLayer = L.layerGroup().addTo(map);

// ==========================
// Fetch from Airtable
// ==========================

async function loadLocationsFromAirtable() {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_TOKEN) {
    console.error("You must set AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN in script.js");
    return;
  }

  // If your view name is not "Grid view", replace Grid%20view with your view name.
  const url =
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/` +
    encodeURIComponent(AIRTABLE_TABLE_NAME) +
    `?view=Grid%20view`; // no pageSize to avoid 422[web:196]

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

    // Handle ?species=... (botanical name)
    const speciesParam = getUrlParam("species");
    baseRecordsForFiltering = allRecords;

    if (speciesParam) {
      const target = speciesParam.toLowerCase();
      baseRecordsForFiltering = allRecords.filter(record => {
        const { speciesName } = getFields(record);
        return speciesName && speciesName.toLowerCase() === target;
      });

      if (baseRecordsForFiltering.length === 0) {
        console.warn("No locations found for species:", speciesParam);
      }
    }

    // Build dropdown options from base set
    buildFilterOptions(baseRecordsForFiltering);

    // Initial render
    applyFiltersAndRender();
  } catch (err) {
    console.error("Error fetching from Airtable:", err);
  }
}

// ==========================
// Field extraction helpers
// ==========================

function normalizeLookup(value) {
  if (!value) return "";
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function getCoverImageUrl(rawField) {
  // rawField may be an array of attachment objects (from a lookup of attachments)
  if (!rawField) return null;
  if (Array.isArray(rawField) && rawField.length > 0 && rawField[0].url) {
    return rawField[0].url;
  }
  if (typeof rawField === "string") {
    return rawField;
  }
  return null;
}

// Extract fields from a Location record
function getFields(record) {
  const fields = record.fields || {};

  const speciesName = normalizeLookup(fields["Species name"]);

  const commonName =
    normalizeLookup(fields["Common name"]) ||
    normalizeLookup(fields["Common Name"]);

  const family = normalizeLookup(fields["Family"]);

  const potentialUse =
    normalizeLookup(fields["Potential Use"]) ||
    normalizeLookup(fields["Potential use"]);

  const origin = normalizeLookup(fields["Origin"]);

  const locationInCampus =
    fields["Location in campus"] ||
    fields["Location Description"] ||
    fields["Location description"] ||
    "";

  const lat =
    fields.Latitude ||
    fields["Latitude "] ||
    null;

  const lng =
    fields.Longitude ||
    fields["Longitude "] ||
    null;

  const coverImageUrl = getCoverImageUrl(fields["Cover Image"]);

  return {
    speciesName,
    commonName,
    family,
    potentialUse,
    origin,
    locationInCampus,
    lat,
    lng,
    coverImageUrl
  };
}

// ==========================
// Build filter dropdown options
// ==========================

function buildFilterOptions(records) {
  const families = new Set();
  const uses = new Set();
  const origins = new Set();

  records.forEach(record => {
    const { family, potentialUse, origin } = getFields(record);
    if (family) families.add(family);
    if (potentialUse) uses.add(potentialUse);
    if (origin) origins.add(origin);
  });

  function populateSelect(selectEl, values, placeholder) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = placeholder;
    selectEl.appendChild(defaultOpt);

    Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
      });
  }

  populateSelect(familyFilter, families, "Family (all)");
  populateSelect(useFilter, uses, "Potential use (all)");
  populateSelect(originFilter, origins, "Origin (all)");
}

// ==========================
// Apply search + filters and render
// ==========================

function applyFiltersAndRender() {
  const query = (searchInput.value || "").trim().toLowerCase();
  const selectedFamily = familyFilter.value || "";
  const selectedUse = useFilter.value || "";
  const selectedOrigin = originFilter.value || "";

  const filtered = baseRecordsForFiltering.filter(record => {
    const {
      speciesName,
      commonName,
      family,
      potentialUse,
      origin,
      locationInCampus
    } = getFields(record);

    // Search on botanical name, common name, or campus location
    if (query) {
      const haystack =
        (speciesName + " " + commonName + " " + locationInCampus).toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (selectedFamily && family !== selectedFamily) return false;
    if (selectedUse && potentialUse !== selectedUse) return false;
    if (selectedOrigin && origin !== selectedOrigin) return false;

    return true;
  });

  renderMapMarkers(filtered);
}

// ==========================
// Render markers with popup image + directions
// ==========================

function renderMapMarkers(records) {
  treeLayer.clearLayers();

  records.forEach(record => {
    const {
      speciesName,
      commonName,
      family,
      potentialUse,
      origin,
      locationInCampus,
      lat,
      lng,
      coverImageUrl
    } = getFields(record);

    if (lat == null || lng == null) return;

    const marker = L.marker([lat, lng]);

    // Google Maps directions URL from current location to this lat,lng.[web:208][web:212][web:214][web:215]
    const dest = encodeURIComponent(`${lat},${lng}`);
    const directionsUrl =
      `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=walking`;

    const popupHtml = `
      <div class="popup-content">
        ${
          coverImageUrl
            ? `<img src="${coverImageUrl}" class="popup-img" alt="${speciesName || "Tree"}" />`
            : ""
        }
        <div class="popup-text">
          ${
            speciesName
              ? `<div><strong>${speciesName}</strong></div>`
              : ""
          }
          ${
            commonName
              ? `<div>${commonName}</div>`
              : ""
          }
          ${
            locationInCampus
              ? `<div class="popup-location"><strong>Location:</strong> ${locationInCampus}</div>`
              : ""
          }
          <div class="popup-meta">
            ${
              family
                ? `<div>Family: ${family}</div>`
                : ""
            }
            ${
              origin
                ? `<div>Origin: ${origin}</div>`
                : ""
            }
            ${
              potentialUse
                ? `<div>Use: ${potentialUse}</div>`
                : ""
            }
          </div>
          <div class="popup-directions">
            <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer">
              Get directions
            </a>
          </div>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml);
    marker.addTo(treeLayer);
  });
}

// ==========================
// Initialize on page load
// ==========================

document.addEventListener("DOMContentLoaded", () => {
  searchInput = document.getElementById("search-input");
  familyFilter = document.getElementById("family-filter");
  useFilter = document.getElementById("use-filter");
  originFilter = document.getElementById("origin-filter");

  if (searchInput) {
    searchInput.addEventListener("input", () => applyFiltersAndRender());
  }
  if (familyFilter) {
    familyFilter.addEventListener("change", () => applyFiltersAndRender());
  }
  if (useFilter) {
    useFilter.addEventListener("change", () => applyFiltersAndRender());
  }
  if (originFilter) {
    originFilter.addEventListener("change", () => applyFiltersAndRender());
  }

  loadLocationsFromAirtable();
});
