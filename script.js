// ==========================
// Airtable configuration
// ==========================
//
// IMPORTANT: set these three to match your base.
// Use the same base/token Softr uses, but TABLE is "Location".[web:196]

const AIRTABLE_BASE_ID = "app2ZtDcYLBuNUM0f";
const AIRTABLE_TABLE_NAME = "Location";
const AIRTABLE_API_TOKEN = "patdC6IkNl0SFQTAY.96592e2cd802d52774805d228ac9a413d1cc9e5a2667f1e4033a8c075d9f5eb2";

// FRI campus center coordinates.[web:78][web:79][web:85]
const FRI_LAT = 30.343;
const FRI_LNG = 78.0015;

// Global data
let allRecords = [];
let baseRecordsForFiltering = []; // either all records or one species (from URL)

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

  // Use a valid view name here. If your Location table's view is not "Grid view",
  // replace it with the exact view name (spaces allowed).
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

    // Handle ?species=... URL param (botanical name) if present
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

    // Build dropdown options from the base set
    buildFilterOptions(baseRecordsForFiltering);

    // Initial render with no search/filters (except speciesParam)
    applyFiltersAndRender();
  } catch (err) {
    console.error("Error fetching from Airtable:", err);
  }
}

// ==========================
// Extract fields from one Location record
// ==========================
//
// Required fields in Location table:
// - Species name (lookup from Species table)
// - Common name (lookup from Species)
// - Family (lookup from Species)
// - Potential Use (lookup from Species / Uses)
// - Origin (lookup from Species)
// - Location Description
// - Latitude
// - Longitude

function normalizeLookup(value) {
  if (!value) return "";
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

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

  const locationDescription =
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

  return {
    speciesName,
    commonName,
    family,
    potentialUse,
    origin,
    locationDescription,
    lat,
    lng
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

  // Helper to populate a select
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
// Apply search + filters and render map
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
      locationDescription
    } = getFields(record);

    // Search: matches botanical name, common name, or location description
    if (query) {
      const haystack =
        (speciesName + " " + commonName + " " + locationDescription).toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    // Family filter
    if (selectedFamily && family !== selectedFamily) return false;

    // Potential Use filter
    if (selectedUse && potentialUse !== selectedUse) return false;

    // Origin filter
    if (selectedOrigin && origin !== selectedOrigin) return false;

    return true;
  });

  renderMapMarkers(filtered);
}

// ==========================
// Render markers
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
    if (commonName) popupLines.push(commonName);
    if (family) popupLines.push(`Family: ${family}`);
    if (origin) popupLines.push(`Origin: ${origin}`);
    if (potentialUse) popupLines.push(`Use: ${potentialUse}`);
    if (locationDescription) popupLines.push(locationDescription);

    marker.bindPopup(popupLines.join("<br/>"));
    marker.addTo(treeLayer);
  });
}

// ==========================
// Initialize on page load
// ==========================

document.addEventListener("DOMContentLoaded", () => {
  // Grab control elements
  searchInput = document.getElementById("search-input");
  familyFilter = document.getElementById("family-filter");
  useFilter = document.getElementById("use-filter");
  originFilter = document.getElementById("origin-filter");

  // Attach listeners
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      applyFiltersAndRender();
    });
  }
  if (familyFilter) {
    familyFilter.addEventListener("change", () => {
      applyFiltersAndRender();
    });
  }
  if (useFilter) {
    useFilter.addEventListener("change", () => {
      applyFiltersAndRender();
    });
  }
  if (originFilter) {
    originFilter.addEventListener("change", () => {
      applyFiltersAndRender();
    });
  }

  // Load data + initial render
  loadLocationsFromAirtable();
});
