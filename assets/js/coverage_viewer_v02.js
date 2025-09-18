// assets/js/coverage_viewer.js
document.addEventListener("DOMContentLoaded", () => {
  // -------------------- MAPA BASE --------------------
  const map = L.map("map", { zoomControl: true }).setView([-11.5, 17], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  // -------------------- CAMADAS nPerf (tiles) --------------------
  const URL_UNITEL   = "https://app.nperf.com/signal-220836-{z}-{x}-{y}.webp";
  const URL_AFRICELL = "https://app.nperf.com/signal-2019555-{z}-{x}-{y}.webp";

  const LAST_UPDATE_UNITEL   = "09/07/2025 10:37 UTC";
  const LAST_UPDATE_AFRICELL = "09/04/2025 18:53 UTC";

  const initialOpacity = 0.6;
  const unitelLayer = L.tileLayer(URL_UNITEL, {
    opacity: initialOpacity,
    maxNativeZoom: 9,
    maxZoom: 18,
    // 1px transparente para falhas de tile
    errorTileUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAQAAABx7n0/AAAAAElFTkSuQmCC",
  });
  const africellLayer = L.tileLayer(URL_AFRICELL, {
    opacity: initialOpacity,
    maxNativeZoom: 9,
    maxZoom: 18,
    errorTileUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAQAAABx7n0/AAAAAElFTkSuQmCC",
  });

  // UI nPerf
  const chkUnitel    = document.getElementById("chkUnitel");
  const chkAfricell  = document.getElementById("chkAfricell");
  const opacityCtrl  = document.getElementById("opacity");
  const lastUpdateEl = document.getElementById("lastUpdate");

  if (lastUpdateEl) {
    lastUpdateEl.textContent = `Last update — Unitel: ${LAST_UPDATE_UNITEL}, Africell: ${LAST_UPDATE_AFRICELL}`;
  }
  chkUnitel?.addEventListener("change", e =>
    e.target.checked ? map.addLayer(unitelLayer) : map.removeLayer(unitelLayer)
  );
  chkAfricell?.addEventListener("change", e =>
    e.target.checked ? map.addLayer(africellLayer) : map.removeLayer(africellLayer)
  );
  opacityCtrl?.addEventListener("input", e => {
    const v = parseFloat(e.target.value);
    unitelLayer.setOpacity(v);
    africellLayer.setOpacity(v);
  });

  // -------------------- ENERGIA (GeoJSON) --------------------
  let energyLayer = null;      // L.geoJSON (polígonos)
  let energyFeatures = [];     // features cruas para point-in-polygon

  function styleEnergy(f) {
    const s = f.properties?.grid_status || "unknown";
    const color =
      s === "stable"   ? "#2ecc71" :
      s === "unstable" ? "#f1c40f" :
      s === "offgrid"  ? "#e74c3c" : "#95a5a6";
    return { color, weight: 1, fillColor: color, fillOpacity: 0.25 };
  }

  // point-in-polygon (ray casting) — WGS84
  function pip(lat, lng, polygon) {
    const x = lng, y = lat;
    let inside = false;
    const ring = polygon.coordinates[0];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect =
        (yi > y) !== (yj > y) &&
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
    // fora de qualquer polígono → tratar como offgrid
    return "offgrid";
  }

  document.getElementById("energyGeojsonInput")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const gj = JSON.parse(text);
      if (energyLayer) { map.removeLayer(energyLayer); energyLayer = null; }
      energyLayer = L.geoJSON(gj, { style: styleEnergy }).addTo(map);
      energyFeatures = gj.features || [];
      try { map.fitBounds(energyLayer.getBounds(), { padding: [20, 20] }); } catch {}
    } catch (err) {
      console.error(err);
      alert("GeoJSON inválido.");
    }
  });

  document.getElementById("clearEnergy")?.addEventListener("click", () => {
    if (energyLayer) map.removeLayer(energyLayer);
    energyLayer = null;
    energyFeatures = [];
  });

  // -------------------- AGENTES (CSV + CLUSTER) --------------------
  const cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
  });
  map.addLayer(cluster);

  let agentsData   = [];  // linhas do CSV
  let agentMarkers = [];  // [{ marker, data, lat, lon, title, coverage }]
  let classified   = [];  // linhas consolidadas para export

  function pickColumn(columns, candidates) {
    const lc = columns.map((c) => c.toLowerCase());
    for (const cand of candidates) {
      const i = lc.indexOf(cand.toLowerCase());
      if (i !== -1) return columns[i];
    }
    return null;
  }

  function addCsvPoints(rows) {
    cluster.clearLayers();
    agentMarkers = [];
    classified = [];

    if (!rows.length) return;

    const cols   = Object.keys(rows[0]);
    const latCol = pickColumn(cols, ["latitude", "lat"]);
    const lonCol = pickColumn(cols, ["longitude", "lon", "lng"]);
    const nameCol = pickColumn(cols, ["display", "displayName", "displayname", "nome", "name", "title"]);
    const covCol  = pickColumn(cols, ["coverage_best","cobertura","tech","tecnologia","signal","melhor_cobertura"]);

    if (!latCol || !lonCol) {
      alert("Não encontrei colunas de latitude/longitude.");
      return;
    }

    let count = 0;
    rows.forEach((r) => {
      const lat = parseFloat(String(r[latCol]).replace(",", "."));
      const lon = parseFloat(String(r[lonCol]).replace(",", "."));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const title = nameCol ? String(r[nameCol]) : "Agente";
      const coverage = covCol ? String(r[covCol]).toUpperCase() : "";

      const m = L.marker([lat, lon]).bindPopup(
        `<b>${title}</b><br>${lat.toFixed(5)}, ${lon.toFixed(5)}`
      );
      cluster.addLayer(m);
      agentMarkers.push({ marker: m, data: r, lat, lon, title, coverage });
      count++;
    });

    if (count) map.fitBounds(cluster.getBounds().pad(0.2));
  }

  function loadCsvFile(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        agentsData = res.data;
        if (!agentsData.length) return alert("CSV vazio.");
        addCsvPoints(agentsData);
      },
      error: () => alert("Não foi possível ler o CSV."),
    });
  }

  document.getElementById("csvFile")?.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) loadCsvFile(f);
  });

  document.getElementById("clearPoints")?.addEventListener("click", () => {
    cluster.clearLayers();
    agentMarkers = [];
    classified = [];
    clearZoneOverlays();
  });

  // Drag & drop CSV
  const dropHint = document.getElementById("dropHint");
  const showHint = (show) => dropHint && (dropHint.style.display = show ? "block" : "none");
  window.addEventListener("dragover", (e) => { e.preventDefault(); showHint(true); });
  window.addEventListener("dragleave", () => showHint(false));
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    showHint(false);
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const name = (f.name || "").toLowerCase();
    if (name.endsWith(".csv")) return loadCsvFile(f);
    alert("Formato não suportado. Use CSV.");
  });

  // -------------------- CLASSIFICAÇÃO A–D --------------------
  function classifyAgent({ lat, lon, coverage }) {
    const grid = gridStatusAt(lat, lon);               // stable | unstable | offgrid
    const cov  = (coverage || "").toUpperCase() || "UNKNOWN"; // 2G/3G/4G/5G/NONE/UNKNOWN

    let zone = "D"; // default (manual/comunitária)
    if (grid === "offgrid") {
      zone = "C";
    } else if (grid === "stable" && (cov === "4G" || cov === "5G")) {
      zone = "A";
    } else if (grid === "stable" || grid === "unstable") {
      zone = (cov === "2G" || cov === "3G" || cov === "4G") ? "B" : "B*";
    }
    return { grid_status: grid, coverage_best: cov, zone };
  }

  function updateMarkerPopup(marker, info, meta) {
    const txt =
      `<b>${meta.name || meta.title || meta.id || "Agente"}</b><br>
       Lat/Lon: ${(+meta.lat).toFixed(5)}, ${(+(meta.lon)).toFixed(5)}<br>
       Energia: <b>${info.grid_status}</b><br>
       Cobertura: <b>${info.coverage_best}</b><br>
       Zona sugerida: <b>${info.zone}</b>`;
    marker.setPopupContent(txt);
  }

  // --- Overlays de Zona (círculos coloridos) ---
  let zoneOverlays = [];
  let zonesVisible = true;

  function colorByZone(zone) {
    return zone === "A" ? "#2ecc71" :
           (zone === "B" || zone === "B*") ? "#f1c40f" :
           zone === "C" ? "#e74c3c" : "#3498db"; // D
  }
  function addZoneCircle(latlng, zone) {
    const col = colorByZone(zone);
    const cm = L.circleMarker(latlng, {
      radius: 6, color: col, fillColor: col, fillOpacity: 0.85, weight: 1
    });
    if (zonesVisible) cm.addTo(map);
    zoneOverlays.push(cm);
  }
  function setZonesVisible(flag) {
    zonesVisible = flag;
    zoneOverlays.forEach(cm => flag ? map.addLayer(cm) : map.removeLayer(cm));
  }
  function clearZoneOverlays() {
    zoneOverlays.forEach(cm => map.removeLayer(cm));
    zoneOverlays = [];
  }

  // Botão CLASSIFICAR
  document.getElementById("classifyBtn")?.addEventListener("click", () => {
    if (!agentMarkers.length)      { alert("Carrega primeiro o CSV dos agentes."); return; }
    if (!energyFeatures.length)    { alert("Carrega o GeoJSON da rede eléctrica."); return; }

    clearZoneOverlays(); // evita duplicados
    classified = [];

    agentMarkers.forEach(({ marker, data, lat, lon, title, coverage }) => {
      const info = classifyAgent({ lat, lon, coverage });
      updateMarkerPopup(marker, info, { name: title, lat, lon });
      addZoneCircle(marker.getLatLng(), info.zone);

      const out = {
        ...data,
        lat, lon,
        grid_status: info.grid_status,
        coverage_best: info.coverage_best,
        zone: info.zone
      };
      classified.push(out);
    });

    alert("Classificação concluída. Podes exportar CSV/GeoJSON.");
  });

  // Checkbox "Ver cores da Zona (A–D)"
  const toggleZones = document.getElementById("toggleZones");
  toggleZones?.addEventListener("change", (e) => setZonesVisible(e.target.checked));
  toggleZones && (toggleZones.checked = true);

  // -------------------- EXPORTAÇÕES --------------------
  function toCsv(arr) {
    if (!arr.length) return "";
    const headers = Object.keys(arr[0]);
    const lines = [headers.join(",")];
    for (const row of arr) lines.push(headers.map(h => (row[h] ?? "")).join(","));
    return lines.join("\n");
  }
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
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
