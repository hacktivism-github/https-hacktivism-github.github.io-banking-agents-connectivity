// assets/js/coverage_viewer.js
document.addEventListener("DOMContentLoaded", () => {
  // -------------------- MAPA BASE (com fallback) --------------------
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

  // -------------------- HELPERs (download / CSV / cobertura) --------------------
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
    return s; // já normalizado
  }
  function bestOf(a, b) {
    const rank = { "NONE":0, "2G":1, "3G":2, "4G":3, "5G":4 };
    const A = normalizeTech(a) || "NONE";
    const B = normalizeTech(b) || "NONE";
    return (rank[A] >= rank[B]) ? A : B;
  }

  // -------------------- CAMADAS nPerf (tiles) --------------------
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

  // -------------------- ENERGIA (GeoJSON) + fallback Angola --------------------
  let energyLayer = null;          // L.geoJSON (polígonos)
  let energyFeatures = [];         // features cruas para PIP

  // Cobertura total (fallback) para garantir que todo o país cai num polígono
  const ANGOLA_FALLBACK = {
    "type": "Feature",
    "properties": { "grid_status": "unknown", "name": "Angola (fallback)" },
    "geometry": {
      "type": "Polygon",
      "coordinates": [[
        [11.6, -4.9],  [24.3, -4.9],
        [24.3, -18.2], [11.6, -18.2],
        [11.6, -4.9]
      ]]
    }
  };

  function styleEnergy(f) {
    const s = (f.properties?.grid_status || "unknown").toLowerCase();
    const color = s === "stable"   ? "#2ecc71"
               : s === "unstable" ? "#f1c40f"
               : s === "offgrid"  ? "#e74c3c" : "#95a5a6";
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
        if (pip(lat, lng, g)) return (f.properties?.grid_status || "unknown").toLowerCase();
      } else if (g?.type === "MultiPolygon") {
        for (const coords of g.coordinates) {
          if (pip(lat, lng, { type: "Polygon", coordinates: coords })) {
            return (f.properties?.grid_status || "unknown").toLowerCase();
          }
        }
      }
    }
    return "offgrid";
  }

  function applyEnergyFromGeoJSON(gj) {
    if (energyLayer) { map.removeLayer(energyLayer); energyLayer = null; }
    energyLayer = L.geoJSON(gj, { style: styleEnergy }).addTo(map);
    energyFeatures = (gj.features || []).slice();
    energyFeatures.push(ANGOLA_FALLBACK); // fallback
    try { map.fitBounds(energyLayer.getBounds(), { padding:[20,20] }); } catch {}
  }

  document.getElementById("energyGeojsonInput")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const gj = JSON.parse(await f.text());
      applyEnergyFromGeoJSON(gj);
    } catch (err) { alert("GeoJSON inválido."); }
  });

  document.getElementById("clearEnergy")?.addEventListener("click", () => {
    if (energyLayer) map.removeLayer(energyLayer);
    energyLayer = null; energyFeatures = [];
  });

  // -------------------- MUNICÍPIOS (ADMIN) --------------------
  let munLayer = null;
  let munFeatures = [];
  const munKeyFields = ["ADM2_PCODE","ADM2_CODE","GID_2","ID_2","HASC_2","OBJECTID","FID","id","ID"];
  const munNameFields = ["NAME_2","ADM2_PT","ADM2_EN","municipio","Municipio","MUNICIPIO","NAME"];
  const provNameFields = ["NAME_1","ADM1_PT","ADM1_EN","provincia","Provincia","PROVINCIA","STATE","REGION","NAME_1"];

  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/\s+/g," ").trim();
  }
  function buildMunKey(props) {
    for (const k of munKeyFields) if (props[k] != null && String(props[k]).trim() !== "") return String(props[k]);
    let m = ""; for (const k of munNameFields) if (props[k] != null) { m = props[k]; break; }
    let p = ""; for (const k of provNameFields) if (props[k] != null) { p = props[k]; break; }
    return `${norm(p)}:${norm(m)}`;
  }
  function pickField(props, candidates) {
    for (const k of candidates) if (props[k] != null) return k;
    return null;
  }
  function munStyle(feat) { return styleEnergy(feat); }

  document.getElementById("munGeojsonInput")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const gj = JSON.parse(await f.text());
      (gj.features || []).forEach(feat => {
        feat.properties = feat.properties || {};
        feat.properties.mun_key = buildMunKey(feat.properties);
        if (!feat.properties.grid_status) feat.properties.grid_status = "";
      });
      if (munLayer) map.removeLayer(munLayer);
      munLayer = L.geoJSON(gj, { style: munStyle }).addTo(map);
      munFeatures = gj.features || [];
      try { map.fitBounds(munLayer.getBounds(), { padding:[20,20] }); } catch {}
      alert("Municípios carregados. Gera o CSV-template, preenche e carrega em 'CSV Status'.");
    } catch (err) { console.error(err); alert("GeoJSON de municípios inválido."); }
  });

  document.getElementById("clearMun")?.addEventListener("click", () => {
    if (munLayer) map.removeLayer(munLayer);
    munLayer = null; munFeatures = [];
  });

  document.getElementById("exportMunTemplateBtn")?.addEventListener("click", () => {
    if (!munFeatures.length) { alert("Carrega primeiro o GeoJSON de municípios."); return; }
    const rows = [];
    for (const f of munFeatures) {
      const p = f.properties || {};
      const municipioField = pickField(p, munNameFields);
      const provinciaField = pickField(p, provNameFields);
      rows.push({
        mun_key: p.mun_key || buildMunKey(p),
        municipio: municipioField ? p[municipioField] : "",
        provincia: provinciaField ? p[provinciaField] : "",
        grid_status: ""  // por preencher: stable/unstable/offgrid
      });
    }
    const headers = ["mun_key","municipio","provincia","grid_status"];
    const csv = [headers.join(",")].concat(rows.map(r => headers.map(h => (r[h] ?? "")).join(","))).join("\n");
    downloadText("municipios_status_template.csv", csv);
  });

  document.getElementById("munStatusCsvInput")?.addEventListener("change", (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    Papa.parse(f, {
      header:true, skipEmptyLines:true,
      complete: (res) => {
        const rows = res.data || [];
        if (!rows.length) return alert("CSV de status vazio.");
        const byKey = {}, byName = {};
        rows.forEach(r => {
          const gs = String(r.grid_status || "").toLowerCase().trim();
          const normGs = (gs.includes("stable") || gs.includes("estavel")) ? "stable" :
                         (gs.includes("unstable") || gs.includes("instavel")) ? "unstable" :
                         (gs.includes("off")) ? "offgrid" : "";
          const rec = { grid_status: normGs };
          if (r.mun_key) byKey[String(r.mun_key)] = rec;
          const prov = norm(r.provincia || "");
          const mun  = norm(r.municipio || "");
          if (prov || mun) byName[`${prov}:${mun}`] = rec;
        });

        let applied = 0;
        munFeatures.forEach(f => {
          const p = f.properties || {};
          const key = p.mun_key || buildMunKey(p);
          let val = byKey[key];
          if (!val) {
            const municipioField = pickField(p, munNameFields);
            const provinciaField = pickField(p, provNameFields);
            const nm = `${norm(p[provinciaField] || "")}:${norm(p[municipioField] || "")}`;
            val = byName[nm];
          }
          if (val && val.grid_status) { p.grid_status = val.grid_status; applied++; }
        });

        if (munLayer) munLayer.setStyle(munStyle);
        // passa a usar municípios como base de energia + fallback
        energyFeatures = munFeatures.slice(); energyFeatures.push(ANGOLA_FALLBACK);
        energyLayer && map.removeLayer(energyLayer);
        energyLayer = munLayer;

        alert(`Status aplicado a ${applied} municípios. Estes polígonos passam a ser usados na classificação A–D.`);
      }
    });
  });

  // -------------------- AGENTES (CSV + CLUSTERS por zona) --------------------
  function predominantZone(childMarkers) {
    const tally = { A:0, B:0, C:0, D:0 };
    childMarkers.forEach(m => {
      const z = (m.zone || m.options.zone || "").replace("*","");
      if (tally[z] !== undefined) tally[z]++;
    });
    let best = "neutral", max = 0;
    for (const [z,v] of Object.entries(tally)) if (v > max) { max = v; best = z.toLowerCase(); }
    return best; // 'a'|'b'|'c'|'d'|'neutral'
  }
  function clusterIcon(cluster) {
    const count = cluster.getChildCount();
    const tier = count < 10 ? "sm" : count < 100 ? "md" : "lg";
    const zone = predominantZone(cluster.getAllChildMarkers());
    const size = tier === "sm" ? 32 : tier === "md" ? 40 : 48;
    return new L.DivIcon({
      html: `<div style="width:${size}px;height:${size}px;line-height:${size}px;"><span>${count}</span></div>`,
      className: `marker-cluster mc-${tier} zone-${zone}`,
      iconSize: L.point(size, size),
      iconAnchor: [size/2, size/2]
    });
  }
  const cluster = L.markerClusterGroup({
    showCoverageOnHover:false, spiderfyOnMaxZoom:true, iconCreateFunction: clusterIcon
  });
  map.addLayer(cluster);

  let agentsData = [];
  let agentMarkers = [];    // { marker, data, lat, lon, title, coverage }
  let classified = [];

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

  // -------------------- CLASSIFICAÇÃO A–D --------------------
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

  // ---- Overlays de Zona (círculos coloridos, 1 por marcador) ----
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

  // ---- Popups com botões de cobertura + reclassificação ----
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
    const out = {
      ...rec.data, lat: rec.lat, lon: rec.lon,
      grid_status: info.grid_status, coverage_best: info.coverage_best, zone: info.zone
    };
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

  // Botão CLASSIFICAR
  document.getElementById("classifyBtn")?.addEventListener("click", () => {
    if (!agentMarkers.length)   { alert("Carrega primeiro o CSV dos agentes."); return; }
    if (!energyFeatures.length) { alert("Carrega a camada de Energia (GeoJSON) ou aplica o CSV de status municipal."); return; }

    clearZoneOverlays();
    classified = [];

    agentMarkers.forEach(({ marker, data, lat, lon, title, coverage }) => {
      const info = classifyAgent({ lat, lon, coverage });
      updateMarkerPopup(marker, info, { name: title, lat, lon });

      marker.zone = info.zone;
      setZoneCircle(marker, info.zone);

      classified.push({
        ...data, lat, lon,
        grid_status: info.grid_status,
        coverage_best: info.coverage_best,
        zone: info.zone
      });
    });

    cluster.refreshClusters && cluster.refreshClusters();
    alert("Classificação concluída. Podes exportar CSV/GeoJSON.");
  });

  // Checkbox "Ver cores da Zona (A–D)"
  const toggleZones = document.getElementById("toggleZones");
  toggleZones?.addEventListener("change", (e) => setZonesVisible(e.target.checked));
  toggleZones && (toggleZones.checked = true);

  // -------------------- EXPORTS --------------------
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
    downloadText("agentes_classificados.geojson", JSON.stringify({ type:"FeatureCollection", features }, null, 2));
  });
});
