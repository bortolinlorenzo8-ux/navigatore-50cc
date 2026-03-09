// Riferimenti agli elementi della pagina (HTML)
const formEls = {
  from: document.getElementById("from"),
  to: document.getElementById("to"),
  distance: document.getElementById("distance"),
  speed: document.getElementById("speed"),
  planBtn: document.getElementById("plan-route"),
  summary: document.getElementById("summary"),
  etaTime: document.getElementById("eta-time"),
  etaArrival: document.getElementById("eta-arrival"),
  directions: document.getElementById("directions"),
  speakBtn: document.getElementById("speak"),
  fullscreenBtn: document.getElementById("toggle-fullscreen"),
  avoidMotorways: document.getElementById("avoid-motorways") || document.getElementById("solo-motorino"),
};

// Chiave GraphHopper
const GH_API_KEY = '86f927ef-fbd9-494a-a754-8bcb8f208490'; 

let currentDirections = [];
let map, routeLayer, liveMarker, endMarker, routeProfile = null;
let navState = { active: false, spokenIndex: -1, watchId: null, lastLat: null, lastLng: null };

// Icone Motorino e Arrivo
const motorinIcon = typeof L !== "undefined" ? L.icon({
  iconSize: [40, 40], iconAnchor: [20, 26], className: "motorin-icon",
  iconUrl: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg width="40" height="40" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="22" r="18" fill="#22c55e" fill-opacity="0.6"/><circle cx="16" cy="30" r="4" fill="black"/><circle cx="30" cy="30" r="4" fill="black"/><path d="M16 25 L32 25 L24 18 Z" fill="black"/></svg>`)
}) : null;

const arrivalIcon = typeof L !== "undefined" ? L.icon({
  iconSize: [30, 30], iconAnchor: [15, 28], iconUrl: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg width="30" height="30" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><path d="M17 7 L27 12 L17 17 Z" fill="red"/><rect x="15" y="7" width="2" height="20" fill="black"/></svg>`)
}) : null;

// --- INIZIALIZZA MAPPA (Corretto per togliere il messaggio "Carico mappa") ---
function initMap() {
  const mapDiv = document.getElementById("map");
  if (!mapDiv || typeof L === "undefined") return;

  // Se c'è il messaggio di "Carico mappa", lo togliamo
  const placeholder = mapDiv.querySelector(".map-placeholder");
  if (placeholder) placeholder.remove();

  map = L.map("map").setView([45.4064, 11.8768], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© OpenStreetMap'
  }).addTo(map);
}

// Calcolo coordinate (Nominatim)
async function geocodePlace(query) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}&countrycodes=it`);
  const data = await res.json();
  return data.length ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
}

// Rotte con GraphHopper (Blocco autostrade garantito)
async function fetchRouteGH(start, end, avoid) {
  const avoidParams = avoid ? "&avoid=motorway;trunk&ch.disable=true" : "";
  const url = `https://graphhopper.com/api/1/route?point=${start.lat},${start.lon}&point=${end.lat},${end.lon}&profile=car&points_encoded=false${avoidParams}&key=${GH_API_KEY}`;
  
  const res = await fetch(url);
  const data = await res.json();
  if (!data.paths) return null;
  return {
    distanceKm: data.paths[0].distance / 1000,
    coords: data.paths[0].points.coordinates.map(c => [c[1], c[0]])
  };
}

// Funzione principale quando clicchi "Calcola"
async function planRoute() {
  const from = formEls.from.value.trim();
  const to = formEls.to.value.trim();
  const speed = parseFloat(formEls.speed.value) || 45;

  if (!from || !to) { alert("Sveglia! Metti partenza e arrivo."); return; }

  try {
    formEls.summary.textContent = "Cerco un bel giro senza autostrada...";
    const [start, end] = await Promise.all([geocodePlace(from), geocodePlace(to)]);
    if (!start || !end) { alert("Posto non trovato!"); return; }

    const avoid = formEls.avoidMotorways ? formEls.avoidMotorways.checked : true;
    const route = await fetchRouteGH(start, end, avoid);

    if (!route) { alert("Problemi col navigatore, riprova."); return; }

    // Aggiorna Mappa
    if (routeLayer) routeLayer.remove();
    routeLayer = L.polyline(route.coords, { color: "#4ade80", weight: 6 }).addTo(map);
    map.fitBounds(routeLayer.getBounds());

    if (liveMarker) liveMarker.remove();
    liveMarker = L.marker([start.lat, start.lon], { icon: motorinIcon }).addTo(map);
    
    if (endMarker) endMarker.remove();
    endMarker = L.marker([end.lat, end.lon], { icon: arrivalIcon }).addTo(map);

    // Calcolo tempi
    const hours = route.distanceKm / speed;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    
    formEls.distance.value = route.distanceKm.toFixed(1);
    formEls.etaTime.textContent = `${h}h ${m}min`;
    formEls.summary.textContent = `Giro da ${route.distanceKm.toFixed(1)} km. Pronti a partir!`;
    
    // Voci venete
    currentDirections = [
      { atKm: 0, text: "Daghe gas, se parte!" },
      { atKm: route.distanceKm * 0.5, text: "Semo a metà strada, no sta dormir." },
      { atKm: route.distanceKm, text: "Riva'! Spegni el motorin e beve n'ombra." }
    ];
    renderDirections(currentDirections);
    formEls.speakBtn.disabled = false;

  } catch (err) {
    console.error(err);
    alert("Errore tecnico. Controlla la connessione!");
  }
}

function renderDirections(steps) {
  formEls.directions.innerHTML = "";
  steps.forEach((step, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${step.text}</span>`;
    formEls.directions.appendChild(li);
  });
}

// Inizializzazione al caricamento
formEls.planBtn.addEventListener("click", planRoute);
initMap();
