// assets/js/coverage_viewer.js
document.addEventListener("DOMContentLoaded", () => {
  // -------------------- Base map --------------------
  const map = L.map("map", { zoomControl: true }).setView([-11.5, 17], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  // -------------------- nPerf tiles --------------------
  const URL_UNITEL   = "https://app.nperf.com/signal-220836-{z}-{x}-{y}.webp";
  const URL_AFRICELL = "https://app.nperf.com/signal-2019555-{z}-{x}-{y}.webp";

  const LAST_UPDATE_UNITEL   = "09/07/2025 10:37 UTC";
  const LAST_UPDATE_AFRICELL = "09/04/2025 18:53 UTC";

  const initialOpacity = 0.6;
  const unitelLayer = L.tileLayer(URL_UNITEL, {
    opacity: initialOpacity, maxNativeZoom: 9, maxZoom: 18,
    errorTileUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAQAAABx7n0/AAAAAElFTkSuQmCC",
  });
  const africellLayer = L.tileLayer(URL_AFRICELL, {
    opacity: initialOpacity, maxNativeZoom: 9, maxZoom: 18,
    errorTileUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAQAAABx7n0/AAAAAElFTkSuQmCC",
  });

  // UI
  const chkUnitel    = document.getElementById("chkUnitel");
  const chkAfricell  = document.getElementById("chkAfricell");
  const opacityCtrl  = document.getElementById("opacity");
  const lastUpdateEl = document.getElementById("lastUpdate");

  if (lastUpdateEl) {
    lastUpdateEl.textContent = `Last update — Unitel: ${LAST_UPDATE_UNITEL}, Africell: ${LAST_UPDATE_AFRICELL}`;
  }
  chkUnitel?.addEventListener("change", e => e.target.checked ? map.addLayer(unitelLayer) : map.removeLayer(unitelLayer));
  chkAfricell?.addEventListener("change", e => e.target.checked ? map.addLayer(africellLayer) : map.removeLayer(africellLayer));
  opacityCtrl?.addEventListener("input", e => {
    const v = parseFloat(e.target.value);
    unitelLayer.setOpacity(v); africellLayer.setOpacity(v);
  });

  // -------------------- Energy layer (GeoJSON) --------------------
  let energyLayer = null;          // L.geoJSON polygons
  let energyFeatures = [];         // raw features for point-in-polygon

  function styleEnergy(f) {
    const s = f.properties?.grid_status || "unknown";
    const color = (s === "stable")   ? "#2ecc71"
                : (s === "unstable") ? "#f1c40f"
                : (s === "offgrid")  ? "#e74c3c"
                : "#95a5a6";
    return { color, weight: 1, fillColor: color, fillOpacity: 0.25 };
  }

  // point-in-polygon (ray casting)
  function pip(lat, lng, polygon) {
    const x = lng, y = lat;
    let inside = false;
    const ring = polygon.coordinates[0];
    for (let i=0, j=ring.length-1; i<ring.length; j=i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
                        (x < (xj - xi) * (y - yi) / ((yj - yi) + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function gridStatusAt(lat, lng) {
    for (const f of energyFeatures) {
      const g = f.geometry;
      if (g?.type === "Polygon") {
        if (pip(lat, lng, g)) return f.properties?.grid_status || "unknown";
      } else if (g?.type === "MultiPolygon") {
        for (const coords of g.coordinates) {
          if (pip(lat, lng, { type: "Polygon", coordinates: coords })) {
            return f.properties?.grid_status || "unknown";
          }
        }
      }
    }
    return "offgrid";
  }

  document.getElementById("energyGeojsonInput")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text();
    const gj = JSON.parse(text);
    if (energyLayer) { map.removeLayer(energyLayer); energyLayer = null; }
    energyLayer = L.geoJSON(gj, { style: styleEnergy }).addTo(map);
    energyFeatures = gj.features || [];
    try { map.fitBounds(energyLayer.getBounds(), { padding:[20,20] }); } catch {}
  });

  document.getElementById("clearEnergy")?.addEventListener("click", () => {
    if (energyLayer) map.removeLayer(energyLayer);
    energyLayer = null; energyFeatures = [];
  });

  // -------------------- Agents (CSV) --------------------
  const cluster = L.markerClusterGroup({ showCoverageOnHover:false, spiderfyOnMaxZoom:true });
  map.addLayer(cluster);

  let agentsData = [];      // raw rows
  let agentMarkers = [];    // { marker, data, lat, lon }
  let classified = [];      // consolidated for export

  function pickColumn(columns, candidates) {
    const lc = columns.map(c => c.toLowerCase());
    for (const cand of candidates) {
      const i = lc.indexOf(cand.toLowerCase());
      if (i !== -1) return columns[i];
    }
    return null;
  }

  function addCsvPoints(rows) {
    cluster.clearLayers(); agentMarkers = []; classified = [];
    if (!rows.length) return;

    const cols = Object.keys(rows[0]);
    const latCol  = pickColumn(cols, ["latitude","lat"]);
    const lonCol  = pickColumn(cols, ["longitude","lon","lng"]);
    const nameCol = pickColumn(cols, ["display","displayName","displayname","nome","name","title"]);
    const covCol  = pickColumn(cols, ["coverage_best","cobertura","tech","tecnologia","signal","melhor_cobertura"]);

    if (!latCol || !lonCol) { alert("Não encontrei colunas de latitude/longitude."); return; }

    let count = 0;
    rows.forEach((r) => {
      const lat = parseFloat(String(r[latCol]).replace(",", "."));
      const lon = parseFloat(String(r[lonCol]).replace(",", "."));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const title = nameCol ? String(r[nameCol]) : "Agente";
      const m = L.marker([lat, lon]).bindPopup(`<b>${title}</b><br>${lat.toFixed(5)}, ${lon.toFixed(5)}`);
      cluster.addLayer(m);
      agentMarkers.push({ marker: m, data: r, lat, lon, title, coverage: covCol ? String(r[covCol]).toUpperCase() : "" });
      count++;
    });

    if (count) map.fitBounds(cluster.getBounds().pad(0.2));
  }

  function loadCsvFile(file) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        agentsData = res.data;
        if (!agentsData.length) return alert("CSV vazio.");
        addCsvPoints(agentsData);
      },
    });
  }

  document.getElementById("csvFile")?.addEventListener("change", (e) => {
    const f = e.target.files?.[0]; if (f) loadCsvFile(f);
  });

  document.getElementById("clearPoints")?.addEventListener("click", () => {
    cluster.clearLayers(); agentMarkers = []; classified = [];
  });

  // Drag & drop CSV
  const dropHint = document.getElementById("dropHint");
  const showHint = (show) => dropHint && (dropHint.style.display = show ? "block" : "none");
  window.addEventListener("dragover",  e => { e.preventDefault(); showHint(true);  });
  window.addEventListener("dragleave", e => showHint(false));
  window.addEventListener("drop",      e => {
    e.preventDefault(); showHint(false);
    const f = e.dataTransfer?.files?.[0]; if (!f) return;
    const name = (f.name || "").toLowerCase();
    if (name.endsWith(".csv")) return loadCsvFile(f);
    alert("Formato não suportado aqui. Use CSV.");
  });

  // -------------------- Classification A–D --------------------
  function classifyAgent(a) {
    const grid = gridStatusAt(a.lat, a.lon);  // stable|unstable|offgrid
    const cov  = (a.coverage || "").toUpperCase(); // 2G/3G/4G/5G/NONE/""...

    // Regras: se não houver cobertura no CSV, tratamos como "UNKNOWN" (resultado provisório)
    const covNorm = cov || "UNKNOWN";

    let zone = "D"; // default comunitária/manual
    if (grid === "offgrid") {
      zone = "C";
    } else if (grid === "stable" && (covNorm === "4G" || covNorm === "5G")) {
      zone = "A";
    } else if (grid === "stable" || grid === "unstable") {
      // Tem energia (estável ou intermitente). Sem cobertura declarada, assume provisoriamente B.
      if (covNorm === "2G" || covNorm === "3G" || covNorm === "4G") zone = "B";
      else zone = "B*"; // precisa confirmação de cobertura
    }

    return { grid_status: grid, coverage_best: covNorm, zone };
  }

  function colorByZone(zone) {
    return (zone === "A") ? "#2ecc71" :
           (zone === "B" || zone === "B*") ? "#f1c40f" :
           (zone === "C") ? "#e74c3c" : "#3498db"; // D
  }

  function updateMarkerPopup(m, a, info) {
    const txt =
      `<b>${a.title}</b><br>
       Lat/Lon: ${a.lat.toFixed(5)}, ${a.lon.toFixed(5)}<br>
       Energia: <b>${info.grid_status}</b><br>
       Cobertura: <b>${info.coverage_best}</b><br>
       Zona sugerida: <b>${info.zone}</b>`;
    m.setPopupContent(txt);
    const col = colorByZone(info.zone);
    m.setIcon(new L.Icon.Default()); // keep default pin
    m._icon && (m._icon.style.filter = `hue-rotate(0deg)`); // no-op to avoid broken styles
    // Use circle marker overlay for color (so não troca o ícone padrão do cluster)
    const cm = L.circleMarker(m.getLatLng(), {radius: 6, color: col, fillColor: col, fillOpacity: 0.85, weight: 1});
    cm.addTo(map);
  }

  document.getElementById("classifyBtn")?.addEventListener("click", () => {
    if (!agentMarkers.length) { alert("Carrega primeiro o CSV dos agentes."); return; }
    if (!energyFeatures.length) { alert("Carrega o GeoJSON da rede eléctrica."); return; }

    classified = [];
    agentMarkers.forEach(a => {
      const info = classifyAgent(a);
      updateMarkerPopup(a.marker, a, info);
      const out = { ...a.data,
        lat: a.lat, lon: a.lon,
        grid_status: info.grid_status,
        coverage_best: info.coverage_best,
        zone: info.zone
      };
      classified.push(out);
    });
    alert("Classificação concluída. Podes exportar CSV/GeoJSON.");
  });

  // -------------------- Export helpers --------------------
  function toCsv(arr) {
    if (!arr.length) return "";
    const headers = Object.keys(arr[0]);
    const lines = [headers.join(",")];
    for (const row of arr) lines.push(headers.map(h => (row[h] ?? "")).join(","));
    return lines.join("\n");
  }
  function downloadText(filename, text) {
    const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
    if (!classified.length) { alert("Nada para exportar. Classifica primeiro."); return; }
    downloadText("agentes_classificados.csv", toCsv(classified));
  });

  document.getElementById("exportGeojsonBtn")?.addEventListener("click", () => {
    if (!classified.length) { alert("Nada para exportar. Classifica primeiro."); return; }
    const features = classified.map(a => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [parseFloat(a.lon), parseFloat(a.lat)] },
      properties: a
    }));
    const gj = { type: "FeatureCollection", features };
    downloadText("agentes_classificados.geojson", JSON.stringify(gj, null, 2));
  });
});
