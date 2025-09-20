// assets/js/coverage_viewer.js
document.addEventListener("DOMContentLoaded", () => {
  // ===== MAPA BASE + FALLBACK =====
  const map = L.map("map", { zoomControl: true }).setView([-11.5, 17], 6);

  const osmStd = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  });
  const osmHOT = L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors, tiles style: Humanitarian"
  });
  const cartoPositron = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  });

  let activeBase = osmStd.addTo(map);
  function attachFallback(layer, nextLayer) {
    layer.on("tileerror", () => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
        activeBase = nextLayer.addTo(map);
        console.warn("Base trocada por fallback.");
      }
    });
  }
  attachFallback(osmStd, osmHOT);
  attachFallback(osmHOT, cartoPositron);
  attachFallback(cartoPositron, osmStd);

  L.control.layers(
    { "OSM": osmStd, "OSM HOT": osmHOT, "Carto Positron": cartoPositron },
    null, { position: "topleft", collapsed: true }
  ).addTo(map);
  setTimeout(() => map.invalidateSize(), 0);

  // Pane para energia (acima dos tiles)
  map.createPane("energyPane");
  map.getPane("energyPane").style.zIndex = 450;

  // ===== HELPERS =====
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  function toCsv(arr) {
    if (!arr.length) return "";
    const headers = Object.keys(arr[0]);
    const lines = [headers.join(",")];
    for (const row of arr) lines.push(headers.map(h => (row[h] ?? "")).join(","));
    return lines.join("\n");
  }
  function normalizeTech(v) {
    const s = String(v || "").toUpperCase().trim();
    if (!s) return "";
    if (["NONE","NO","N/A","SEM","0"].includes(s)) return "NONE";
    if (["2G","GSM","EDGE","E"].includes(s)) return "2G";
    if (["3G","UMTS","H","H+","HSPA"].includes(s)) return "3G";
    if (["4G","LTE","LTE-A","4G+"].includes(s)) return "4G";
    if (["5G","NR","5G NSA","5G SA"].includes(s)) return "5G";
    return s;
  }
  function bestOf(a, b) {
    const rank = { "NONE":0, "2G":1, "3G":2, "4G":3, "5G":4 };
    const A = normalizeTech(a) || "NONE";
    const B = normalizeTech(b) || "NONE";
    return (rank[A] >= rank[B]) ? A : B;
  }

  // ===== nPerf (tiles) =====
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

  // ===== ENERGIA (GeoJSON) =====
  let energyLayer = null;
  let energyFeatures = [];
  let currentEnergyOpacity = 0.45;

  // Fallback Angola (para não haver “buracos” na classificação)
  const ANGOLA_FALLBACK = {
    "type":"Feature","properties":{"grid_status":"unknown","name":"Angola (fallback)"},
    "geometry":{"type":"Polygon","coordinates":[
      [[11.6,-4.9],[24.3,-4.9],[24.3,-18.2],[11.6,-18.2],[11.6,-4.9]]
    ]}
  };

  function normStatus(v){
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return "unknown";
    if (s.startsWith("stab")) return "stable";
    if (s.startsWith("inst") || s.startsWith("unst")) return "unstable";
    if (s.startsWith("off")) return "offgrid";
    return s;
  }
  function styleEnergy(f){
    const s = normStatus(f.properties?.grid_status);
    const color = s==="stable" ? "#2ecc71" :
                  s==="unstable" ? "#f1c40f" :
                  s==="offgrid" ? "#e74c3c" : "#95a5a6";
    return { color, opacity: 0.9, weight: 1, fillColor: color, fillOpacity: currentEnergyOpacity };
  }
  // PIP simples (ray-casting)
  function pip(lat, lng, polygon){
    const x = lng, y = lat; let inside=false;
    const ring = polygon.coordinates[0];
    for (let i=0, j=ring.length-1; i<ring.length; j=i++){
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/((yj-yi)+1e-12)+xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function gridStatusAt(lat, lng){
    for (const f of energyFeatures){
      const s = normStatus(f.properties?.grid_status);
      const g = f.geometry;
      if (g?.type==="Polygon"){
        if (pip(lat,lng,g)) return s;
      } else if (g?.type==="MultiPolygon"){
        for (const coords of g.coordinates){
          if (pip(lat,lng,{type:"Polygon",coordinates:coords})) return s;
        }
      }
    }
    return "offgrid";
  }
  function applyEnergyFromGeoJSON(gj){
    (gj.features||[]).forEach(ft=>{
      ft.properties = ft.properties || {};
      ft.properties.grid_status = normStatus(ft.properties.grid_status);
    });
    if (energyLayer){ map.removeLayer(energyLayer); energyLayer=null; }
    energyLayer = L.geoJSON(gj, { style: styleEnergy, pane:"energyPane" }).addTo(map);
    energyFeatures = (gj.features||[]).slice();
    energyFeatures.push(ANGOLA_FALLBACK);
    energyLayer.bringToFront(); setTimeout(()=>energyLayer && energyLayer.bringToFront(),0);
    try { map.fitBounds(energyLayer.getBounds(), { padding:[20,20] }); } catch {}
  }
  document.getElementById("energyGeojsonInput")?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0]; if (!f) return;
    try { applyEnergyFromGeoJSON(JSON.parse(await f.text())); }
    catch (err){ console.error(err); alert("GeoJSON inválido (coords devem ser [lon,lat])."); }
  });
  document.getElementById("clearEnergy")?.addEventListener("click", ()=>{
    if (energyLayer) map.removeLayer(energyLayer);
    energyLayer=null; energyFeatures=[];
  });
  document.getElementById("energyOpacity")?.addEventListener("input", (e)=>{
    currentEnergyOpacity = parseFloat(e.target.value);
    energyLayer && energyLayer.setStyle(styleEnergy);
  });
  // Demo de energia (sanity check)
  document.getElementById("loadDemoEnergy")?.addEventListener("click", ()=>{
    const demo = {"type":"FeatureCollection","features":[
      {"type":"Feature","properties":{"grid_status":"stable","name":"Noroeste"},
       "geometry":{"type":"Polygon","coordinates":[[[12.0,-7.0],[15.5,-7.0],[15.5,-14.0],[12.0,-14.0],[12.0,-7.0]]]}},
      {"type":"Feature","properties":{"grid_status":"unstable","name":"Centro"},
       "geometry":{"type":"Polygon","coordinates":[[[15.5,-8.0],[19.5,-8.0],[19.5,-15.0],[15.5,-15.0],[15.5,-8.0]]]}},
      {"type":"Feature","properties":{"grid_status":"offgrid","name":"Leste"},
       "geometry":{"type":"Polygon","coordinates":[[[19.5,-8.0],[24.0,-8.0],[24.0,-18.0],[19.5,-18.0],[19.5,-8.0]]]}},
      {"type":"Feature","properties":{"grid_status":"stable","name":"Sudoeste"},
       "geometry":{"type":"Polygon","coordinates":[[[12.0,-14.0],[15.5,-14.0],[15.5,-18.0],[12.0,-18.0],[12.0,-14.0]]]}}
    ]};
    applyEnergyFromGeoJSON(demo);
  });

  // ===== AGENTES + CLUSTERS =====
  function predominantZone(childMarkers) {
    const tally = { A:0, B:0, C:0, D:0 };
    childMarkers.forEach(m => {
      const z = (m.zone || m.options.zone || "").replace("*","");
      if (tally[z] !== undefined) tally[z]++;
    });
    let best = "neutral", max = 0;
    for (const [z,v] of Object.entries(tally)) if (v > max) { max = v; best = z.toLowerCase(); }
    return best;
  }
  function clusterIcon(cluster) {
    const count = cluster.getChildCount();
    const tier = count < 10 ? "sm" : count < 100 ? "md" : "lg";
    const zone = predominantZone(cluster.getAllChildMarkers());
    const size = tier === "sm" ? 32 : tier === "md" ? 40 : 48;
    return new L.DivIcon({
      html: `<div style="width:${size}px;height:${size}px;line-height:${size}px;"><span>${count}</span></div>`,
      className: `marker-cluster mc-${tier} zone-${zone}`,
      iconSize: L.point(size, size), iconAnchor: [size/2, size/2]
    });
  }
  const cluster = L.markerClusterGroup({
    showCoverageOnHover:false, spiderfyOnMaxZoom:true, iconCreateFunction: clusterIcon
  });
  map.addLayer(cluster);

  let agentsData = [];
  let agentMarkers = [];    // { marker, data, lat, lon, title, coverage }
  let classified = [];      // <<< única declaração

  function pickColumn(columns, candidates) {
    const lc = columns.map(c => c.toLowerCase());
    for (const cand of candidates) {
      const i = lc.indexOf(cand.toLowerCase());
      if (i !== -1) return columns[i];
    }
    return null;
  }

  function addCsvPoints(rows) {
    cluster.clearLayers(); agentMarkers = []; classified = []; clearZoneOverlays();
    if (!rows.length) return;

    const cols   = Object.keys(rows[0]);
    const latCol = pickColumn(cols, ["latitude","lat"]);
    const lonCol = pickColumn(cols, ["longitude","lon","lng"]);
    const nameCol = pickColumn(cols, ["display","displayName","displayname","nome","name","title"]);
    const covCol  = pickColumn(cols, ["coverage_best","cobertura","tech","tecnologia","signal","melhor_cobertura"]);
    const uniCol  = pickColumn(cols, ["unitel_best","unitel"]);
    const afrCol  = pickColumn(cols, ["africell_best","africell"]);

    if (!latCol || !lonCol) { alert("Não encontrei colunas de latitude/longitude."); return; }

    let count = 0;
    rows.forEach(r => {
      const lat = parseFloat(String(r[latCol]).replace(",", "."));
      const lon = parseFloat(String(r[lonCol]).replace(",", "."));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const title = nameCol ? String(r[nameCol]) : "Agente";

      const rawCoverage = covCol ? r[covCol] : "";
      let coverage = normalizeTech(rawCoverage);
      if (!coverage) {
        const uni = uniCol ? r[uniCol] : "";
        const afr = afrCol ? r[afrCol] : "";
        const derived = bestOf(uni, afr);
        coverage = derived !== "NONE" ? derived : ""; // se ambos NONE, mantém vazio -> B*
      }

      const m = L.marker([lat, lon]).bindPopup(`<b>${title}</b><br>${lat.toFixed(5)}, ${lon.toFixed(5)}`);
      cluster.addLayer(m);
      agentMarkers.push({ marker: m, data: r, lat, lon, title, coverage });
      count++;
    });

    if (count) map.fitBounds(cluster.getBounds().pad(0.2));
    cluster.refreshClusters && cluster.refreshClusters();
  }

  function loadCsvFile(file) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        agentsData = res.data;
        if (!agentsData.length) return alert("CSV vazio.");
        addCsvPoints(agentsData);
      },
      error: () => alert("Não foi possível ler o CSV.")
    });
  }

  document.getElementById("csvFile")?.addEventListener("change", (e) => {
    const f = e.target.files?.[0]; if (f) loadCsvFile(f);
  });

  document.getElementById("clearPoints")?.addEventListener("click", () => {
    cluster.clearLayers(); agentMarkers = []; classified = []; clearZoneOverlays();
    cluster.refreshClusters && cluster.refreshClusters();
  });

  // Drag & drop CSV
  const dropHint = document.getElementById("dropHint");
  const showHint = (show) => dropHint && (dropHint.style.display = show ? "block" : "none");
  window.addEventListener("dragover", e => { e.preventDefault(); showHint(true); });
  window.addEventListener("dragleave", () => showHint(false));
  window.addEventListener("drop", e => {
    e.preventDefault(); showHint(false);
    const f = e.dataTransfer?.files?.[0]; if (!f) return;
    const name = (f.name || "").toLowerCase();
    if (name.endsWith(".csv")) return loadCsvFile(f);
    alert("Formato não suportado. Use CSV.");
  });

  // ===== CLASSIFICAÇÃO A–D =====
  function classifyAgent({ lat, lon, coverage }) {
    let grid = gridStatusAt(lat, lon); // stable | unstable | offgrid | unknown
    const cov  = (coverage || "").toUpperCase() || "UNKNOWN";
    const assumeUnstable = !!document.getElementById("unknownAsUnstable")?.checked;
    if (grid === "unknown" && assumeUnstable) grid = "unstable";

    let zone = "D";
    if (grid === "offgrid") zone = "C";
    else if (grid === "stable" && (cov === "4G" || cov === "5G")) zone = "A";
    else if (grid === "stable" || grid === "unstable" || grid === "unknown") {
      zone = (cov === "2G" || cov === "3G" || cov === "4G") ? "B" : "B*";
    }
    return { grid_status: grid, coverage_best: cov, zone };
  }

  // Círculos A–D (1 por marcador)
  let zonesVisible = true;
  const zoneCircleByMarker = new Map();
  function colorByZone(zone) {
    return zone === "A" ? "#2ecc71" :
           (zone === "B" || zone === "B*") ? "#f1c40f" :
           zone === "C" ? "#e74c3c" : "#3498db";
  }
  function setZoneCircle(marker, zone) {
    const old = zoneCircleByMarker.get(marker);
    if (old) { try { map.removeLayer(old); } catch {} }
    const col = colorByZone(zone);
    const cm = L.circleMarker(marker.getLatLng(), {
      radius: 6, color: col, fillColor: col, fillOpacity: 0.85, weight: 1
    });
    zoneCircleByMarker.set(marker, cm);
    if (zonesVisible) cm.addTo(map);
  }
  function setZonesVisible(flag) {
    zonesVisible = flag;
    zoneCircleByMarker.forEach(cm => flag ? map.addLayer(cm) : map.removeLayer(cm));
  }
  function clearZoneOverlays() {
    zoneCircleByMarker.forEach(cm => { try { map.removeLayer(cm); } catch {} });
    zoneCircleByMarker.clear();
  }

  // Popups com botões de cobertura (edição in-place)
  function popupControlsHTML() {
    return `
      <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-mini" data-tech="NONE">NONE</button>
        <button class="btn btn-mini" data-tech="2G">2G</button>
        <button class="btn btn-mini" data-tech="3G">3G</button>
        <button class="btn btn-mini" data-tech="4G">4G</button>
        <button class="btn btn-mini" data-tech="5G">5G</button>
      </div>`;
  }
  function upsertClassified(rec, info) {
    const tol = 1e-6;
    const idx = classified.findIndex(row =>
      Math.abs(parseFloat(row.lat) - rec.lat) < tol &&
      Math.abs(parseFloat(row.lon) - rec.lon) < tol &&
      String(row.display || row.nome || row.name || row.title || "") === String(rec.title || "")
    );
    const out = { ...rec.data, lat: rec.lat, lon: rec.lon,
      grid_status: info.grid_status, coverage_best: info.coverage_best, zone: info.zone };
    if (idx >= 0) classified[idx] = out; else classified.push(out);
  }
  function setCoverageAndReclass(marker, tech) {
    const rec = agentMarkers.find(a => a.marker === marker);
    if (!rec) return;
    rec.coverage = normalizeTech(tech);
    const info = classifyAgent({ lat: rec.lat, lon: rec.lon, coverage: rec.coverage });

    const html =
      `<b>${rec.title || "Agente"}</b><br>
       Lat/Lon: ${(+rec.lat).toFixed(5)}, ${(+(rec.lon)).toFixed(5)}<br>
       Energia: <b>${info.grid_status}</b><br>
       Cobertura: <b>${info.coverage_best}</b><br>
       Zona sugerida: <b>${info.zone}</b>
       ${popupControlsHTML()}`;
    marker.bindPopup(html);
    marker.off("popupopen").on("popupopen", (e) => {
      const cont = e.popup.getElement();
      cont.querySelectorAll(".btn-mini").forEach(btn => {
        btn.addEventListener("click", () => {
          const t = btn.getAttribute("data-tech");
          setCoverageAndReclass(marker, t);
          marker.openPopup();
        });
      });
    });
    marker.openPopup();

    marker.zone = info.zone;
    setZoneCircle(marker, info.zone);
    cluster.refreshClusters && cluster.refreshClusters();

    upsertClassified(rec, info);
  }
  function updateMarkerPopup(marker, info, meta) {
    const html =
      `<b>${meta.name || meta.title || meta.id || "Agente"}</b><br>
       Lat/Lon: ${(+meta.lat).toFixed(5)}, ${(+(meta.lon)).toFixed(5)}<br>
       Energia: <b>${info.grid_status}</b><br>
       Cobertura: <b>${info.coverage_best}</b><br>
       Zona sugerida: <b>${info.zone}</b>
       ${popupControlsHTML()}`;
    marker.bindPopup(html);
    marker.off("popupopen").on("popupopen", (e) => {
      const cont = e.popup.getElement();
      cont.querySelectorAll(".btn-mini").forEach(btn => {
        btn.addEventListener("click", () => {
          const tech = btn.getAttribute("data-tech");
          setCoverageAndReclass(marker, tech);
        });
      });
    });
  }

  // Classificar
  document.getElementById("classifyBtn")?.addEventListener("click", () => {
    if (!agentMarkers.length)   { alert("Carrega primeiro o CSV dos agentes."); return; }
    if (!energyFeatures.length) { alert("Carrega a camada de Energia (GeoJSON)."); return; }

    clearZoneOverlays();
    classified = [];

    agentMarkers.forEach(({ marker, data, lat, lon, title, coverage }) => {
      const info = classifyAgent({ lat, lon, coverage });
      updateMarkerPopup(marker, info, { name: title, lat, lon });

      marker.zone = info.zone;
      setZoneCircle(marker, info.zone);

      classified.push({ ...data, lat, lon,
        grid_status: info.grid_status, coverage_best: info.coverage_best, zone: info.zone });
    });

    cluster.refreshClusters && cluster.refreshClusters();
    alert("Classificação concluída. Podes exportar CSV/GeoJSON.");
  });

  // Toggle de círculos
  const toggleZones = document.getElementById("toggleZones");
  toggleZones?.addEventListener("change", (e) => setZonesVisible(e.target.checked));
  toggleZones && (toggleZones.checked = true);

  // ===== CSV EXPORT (ordenado e sem duplicados) =====
  const CSV_SEP_DEFAULT = /^(pt|pt-|fr|de|es|it)/i.test(navigator.language || "") ? ";" : ",";
  function csvEscape(v, sep) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCsvOrdered(rows, columns, sep = CSV_SEP_DEFAULT) {
    const header = columns.map(c => c.label).join(sep);
    const lines  = rows.map(r => columns.map(c => csvEscape(r[c.key], sep)).join(sep));
    return [header, ...lines].join("\n");
  }
  const coalesce = (...vals) => {
    for (const v of vals) if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    return "";
  };
  const fmtCoord = (n) => {
    const x = Number(n);
    return Number.isFinite(x) ? x.toFixed(6) : "";
  };
  const EXPORT_COLUMNS = [
    { key: "provincia",    label: "provincia" },
    { key: "municipio",    label: "municipio" },
    { key: "rua",          label: "rua" },
    { key: "nome",         label: "nome" },
    { key: "latitude",     label: "latitude" },
    { key: "longitude",    label: "longitude" },
    { key: "metodo",       label: "metodo" },
    { key: "display",      label: "display" },
    { key: "unitel_best",  label: "unitel_best" },
    { key: "africell_best",label: "africell_best" },
    { key: "coverage_best",label: "coverage_best" },
    { key: "grid_status",  label: "grid_status" },
    { key: "zone",         label: "zone" }
  ];

  document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
    if (!classified.length) { alert("Nada para exportar. Classifica primeiro."); return; }

    const rows = classified.map(a => {
      const nome = coalesce(a.nome, a.name, a.displayName, a.title, a.display);
      return {
        provincia:     coalesce(a.provincia, a.province),
        municipio:     coalesce(a.municipio, a.municipality, a.mun, a.munic),
        rua:           coalesce(a.rua, a.address, a.logradouro),
        nome,

        latitude:      fmtCoord(a.lat ?? a.latitude),
        longitude:     fmtCoord(a.lon ?? a.longitude),

        metodo:        coalesce(a.metodo, a.method),
        display:       a.display ?? "",
        unitel_best:   coalesce(a.unitel_best, a.unitel),
        africell_best: coalesce(a.africell_best, a.africell),
        coverage_best: a.coverage_best,

        grid_status:   a.grid_status,
        zone:          a.zone
      };
    });

    // Ordenar por província → município → nome
    rows.sort((r1, r2) =>
      (r1.provincia || "").localeCompare(r2.provincia || "", "pt") ||
      (r1.municipio || "").localeCompare(r2.municipio || "", "pt") ||
      (r1.nome || "").localeCompare(r2.nome || "", "pt")
    );

    const SEP = CSV_SEP_DEFAULT; // força vírgula se preferires: const SEP = ",";
    const csv = "\ufeff" + toCsvOrdered(rows, EXPORT_COLUMNS, SEP); // BOM p/ Excel/Numbers
    downloadText("agentes_classificados.csv", csv);
  });

  // GeoJSON export (mantido)
  document.getElementById("exportGeojsonBtn")?.addEventListener("click", () => {
    if (!classified.length) { alert("Nada para exportar. Classifica primeiro."); return; }
    const features = classified.map(a => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [parseFloat(a.lon), parseFloat(a.lat)] },
      properties: a
    }));
    downloadText("agentes_classificados.geojson", JSON.stringify({ type:"FeatureCollection", features }, null, 2));
  });

  // Helper para debugging rápido no console
  window.__energyDebug = () => ({
    hasLayer: !!energyLayer && map.hasLayer(energyLayer),
    features: energyFeatures.length,
    bounds: (energyLayer && energyLayer.getBounds && energyLayer.getBounds().toBBoxString()) || null
  });
});
