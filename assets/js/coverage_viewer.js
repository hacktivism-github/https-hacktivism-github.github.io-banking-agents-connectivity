// assets/js/coverage_viewer.js
document.addEventListener("DOMContentLoaded", () => {
  // Base map
  const map = L.map("map", { zoomControl: true }).setView([-11.5, 17], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  // nPerf tile URLs
  const URL_UNITEL = "https://app.nperf.com/signal-220836-{z}-{x}-{y}.webp";
  const URL_AFRICELL = "https://app.nperf.com/signal-2019555-{z}-{x}-{y}.webp";

  // Last update labels (edit when needed)
  const LAST_UPDATE_UNITEL = "09/07/2025 10:37 UTC";
  const LAST_UPDATE_AFRICELL = "09/04/2025 18:53 UTC";

  // Coverage layers (quick-fix: scale last native zoom)
  const initialOpacity = 0.6;
  const unitelLayer = L.tileLayer(URL_UNITEL, {
    opacity: initialOpacity,
    maxNativeZoom: 9,
    maxZoom: 18,
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

  // UI
  const chkUnitel = document.getElementById("chkUnitel");
  const chkAfricell = document.getElementById("chkAfricell");
  const opacityCtrl = document.getElementById("opacity");
  const lastUpdateEl = document.getElementById("lastUpdate");

  if (lastUpdateEl) {
    lastUpdateEl.textContent = `Last update — Unitel: ${LAST_UPDATE_UNITEL}, Africell: ${LAST_UPDATE_AFRICELL}`;
  }

  chkUnitel?.addEventListener("change", (e) => {
    if (e.target.checked) map.addLayer(unitelLayer);
    else map.removeLayer(unitelLayer);
  });
  chkAfricell?.addEventListener("change", (e) => {
    if (e.target.checked) map.addLayer(africellLayer);
    else map.removeLayer(africellLayer);
  });
  opacityCtrl?.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    unitelLayer.setOpacity(v);
    africellLayer.setOpacity(v);
  });

  // Clustered CSV points
  const cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
  });
  map.addLayer(cluster);

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
    let count = 0;

    const cols = Object.keys(rows[0] || {});
    const latCol = pickColumn(cols, ["latitude", "lat"]);
    const lonCol = pickColumn(cols, ["longitude", "lon", "lng"]);
    const nameCol = pickColumn(cols, [
      "nome",
      "name",
      "displayName",
      "displayname",
      "title",
    ]);

    if (!latCol || !lonCol) {
      alert("Não encontrei colunas de latitude/longitude.");
      return;
    }

    rows.forEach((r) => {
      const lat = parseFloat(String(r[latCol]).replace(",", "."));
      const lon = parseFloat(String(r[lonCol]).replace(",", "."));
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const title = nameCol ? String(r[nameCol]) : "Agente";
        const m = L.marker([lat, lon]).bindPopup(
          `<b>${title}</b><br>${lat.toFixed(5)}, ${lon.toFixed(5)}`
        );
        cluster.addLayer(m);
        count++;
      }
    });

    if (count) map.fitBounds(cluster.getBounds().pad(0.2));
  }

  function loadCsvFile(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data;
        if (!rows.length) return alert("CSV vazio.");
        addCsvPoints(rows);
      },
    });
  }

  document.getElementById("csvFile")?.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) loadCsvFile(f);
  });

  document.getElementById("clearPoints")?.addEventListener("click", () =>
    cluster.clearLayers()
  );

  // Drag & drop CSV
  const dropHint = document.getElementById("dropHint");
  const showHint = (show) => dropHint && (dropHint.style.display = show ? "block" : "none");

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    showHint(true);
  });
  window.addEventListener("dragleave", () => showHint(false));
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    showHint(false);
    const f = e.dataTransfer?.files?.[0] || null;
    if (!f) return;
    const name = (f.name || "").toLowerCase();
    if (name.endsWith(".csv")) return loadCsvFile(f);
    alert("Formato não suportado aqui. Use CSV.");
  });
});

