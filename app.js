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
  avoidMotorways: document.getElementById("avoid-motorways"),
};

let currentDirections = [];
const GH_API_KEY = '86f927ef-fbd9-494a-a754-8bcb8f208490'; 

// Stato mappa e navigazione
let map;
let routeLayer;
let startMarker;
let endMarker;
let liveMarker;
let routeProfile = null;
let navState = {
  active: false,
  spokenIndex: -1,
  watchId: null,
  lastLat: null,
  lastLng: null,
};

// Icona personalizzata tipo "motorin / Ciao Piaggio"
const motorinIcon = typeof L !== "undefined"
  ? L.icon({
      iconSize: [40, 40],
      iconAnchor: [20, 26],
      popupAnchor: [0, -16],
      className: "motorin-icon",
      iconUrl: "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg width="40" height="40" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="halo" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#22c55e" stop-opacity="0.95"/>
      <stop offset="65%" stop-color="#0ea5e9" stop-opacity="1"/>
      <stop offset="100%" stop-color="#020617" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <circle cx="24" cy="22" r="18" fill="url(#halo)" stroke="#020617" stroke-width="1.6" />
  <circle cx="16" cy="30" r="4.3" fill="#020617" />
  <circle cx="16" cy="30" r="2.3" fill="#0f172a" stroke="#16a34a" stroke-width="1"/>
  <circle cx="30" cy="30" r="4.3" fill="#020617" />
  <circle cx="30" cy="30" r="2.3" fill="#0f172a" stroke="#16a34a" stroke-width="1"/>
  <rect x="16" y="25" width="14" height="2.4" rx="1.2" fill="#e5e7eb" />
  <path d="M18 25 L18 19 L22 19" fill="none" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/>
  <rect x="20.5" y="20" width="2.2" height="7" rx="1.1" fill="#0f172a" />
  <rect x="22" y="23" width="5" height="2.2" rx="1.1" fill="#22c55e" />
  <path d="M24 16 L24 20" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/>
  <path d="M21 16 L27 16" stroke="#e5e7eb" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="22.2" y="13.3" width="3.6" height="2.4" rx="0.9" fill="#fefce8" stroke="#0f172a" stroke-width="0.8"/>
  <path d="M24 32 L27 37 L21 37 Z" fill="#22c55e" stroke="#16a34a" stroke-width="1" stroke-linejoin="round"/>
</svg>`)
    }) : null;

const arrivalIcon = typeof L !== "undefined"
  ? L.icon({
      iconSize: [30, 30],
      iconAnchor: [15, 28],
      iconUrl: "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg width="30" height="30" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
  <rect x="15" y="6" width="2.5" height="20" fill="#0f172a"/>
  <path d="M17 7 L27 10 L17 13 Z" fill="#22c55e" stroke="#16a34a" stroke-width="1"/>
  <circle cx="16.5" cy="29" r="3" fill="#0f172a"/>
</svg>`)
    }) : null;

// Utility funzioni
function haversineMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const c = 2 * Math.asin(Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2));
  return R * c;
}

function bearingDegrees(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const lat1 = toRad(a[0]); const lat2 = toRad(b[0]);
  const dLon = toRad(b[1] - a[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function buildRouteProfile(points) {
  if (!points || points.length < 2) return null;
  const cumDist = [0];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    acc += haversineMeters(points[i - 1], points[i]);
    cumDist.push(acc);
  }
  return { coords: points, cumDist };
}

function initMap() {
  const mapElement = document.getElementById("map");
  if (!mapElement || typeof L === "undefined") return;
  map = L.map("map").setView([45.4064, 11.8768], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  map.whenReady(() => {
    const placeholder = mapElement.querySelector(".map-placeholder");
    if (placeholder) placeholder.remove();
  });
}

async function geocodePlace(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}&countrycodes=it`;
  const res = await fetch(url);
  const data = await res.json();
  return data.length ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), label: data[0].display_name } : null;
}

// NUOVA FUNZIONE ROUTING CON GRAPHHOPPER
async function fetchRouteGH(start, end, avoidMotorways) {
  const avoidParam = avoidMotorways ? "&avoid=motorway" : "";
  const url = `https://graphhopper.com/api/1/route?point=${start.lat},${start.lon}&point=${end.lat},${end.lon}&profile=car&points_encoded=false${avoidParam}&key=${GH_API_KEY}`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error("Errore GraphHopper");
  const data = await res.json();
  if (!data.paths || !data.paths.length) return null;

  const path = data.paths[0];
  return {
    distanceKm: path.distance / 1000,
    coordinates: path.points.coordinates.map(c => [c[1], c[0]]) // Invertiamo per Leaflet [lat, lon]
  };
}

function drawRouteOnMap(start, end, coordinates) {
  if (!map) return;
  if (routeLayer) routeLayer.remove();
  if (liveMarker) liveMarker.remove();
  if (endMarker) endMarker.remove();

  routeLayer = L.polyline(coordinates, { color: "#4ade80", weight: 5, opacity: 0.85 }).addTo(map);
  liveMarker = L.marker([start.lat, start.lon], { icon: motorinIcon }).addTo(map);
  endMarker = L.marker([end.lat, end.lon], { icon: arrivalIcon }).addTo(map);

  routeProfile = buildRouteProfile(coordinates);
  navState.spokenIndex = -1;
  navState.lastLat = start.lat;
  navState.lastLng = start.lon;

  map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
}

// Funzioni Interfaccia e Tempo
function formatTimeFromHours(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function formatArrivalTime(hoursFromNow) {
  const arrival = new Date(Date.now() + hoursFromNow * 3600000);
  return arrival.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function renderDirections(steps) {
  formEls.directions.innerHTML = "";
  steps.forEach((step, idx) => {
    const li = document.createElement("li");
    if (idx === 0) li.classList.add("active");
    li.innerHTML = `<span class="km">${step.atKm <= 0 ? "PARTENZA" : step.atKm.toFixed(1) + " km"}</span><span class="text">${step.text}</span>`;
    formEls.directions.appendChild(li);
  });
}

function buildVenetianSteps(distanceKm) {
  const steps = [{ atKm: 0, text: "Mòva pian, stemo partindo!" }];
  if (distanceKm > 2) {
    steps.push({ atKm: distanceKm * 0.3, text: "Tra un s-ciantin gira a drita." });
    steps.push({ atKm: distanceKm * 0.6, text: "Al prossimo girotondo va drito." });
    steps.push({ atKm: distanceKm * 0.9, text: "Ocio che semo quasi rivà." });
  }
  steps.push({ atKm: distanceKm, text: "Sè rivà: ferma el motorin e bevi un'ombra!" });
  return steps;
}

// LOGICA PRINCIPALE PIANIFICAZIONE
async function planRoute() {
  const from = formEls.from.value.trim();
  const to = formEls.to.value.trim();
  const speed = parseFloat(formEls.speed.value) || 45;

  if (from && to) {
    try {
      formEls.summary.textContent = "Cerco el giro col nuovo motor... (GraphHopper)";
      const [start, end] = await Promise.all([geocodePlace(from), geocodePlace(to)]);
      if (!start || !end) { alert("Posto non trovato!"); return; }

      const avoid = !!(formEls.avoidMotorways && formEls.avoidMotorways.checked);
      const route = await fetchRouteGH(start, end, avoid);

      if (!route) { alert("Nessun percorso trovato!"); return; }

      formEls.distance.value = route.distanceKm.toFixed(1);
      drawRouteOnMap(start, end, route.coordinates);

      const hours = route.distanceKm / speed;
      const timeStr = formatTimeFromHours(hours);
      formEls.summary.textContent = `Da ${from} a ${to}: ${route.distanceKm.toFixed(1)} km. Tempo: ${timeStr}.`;
      formEls.etaTime.textContent = timeStr;
      formEls.etaArrival.textContent = formatArrivalTime(hours);

      currentDirections = buildVenetianSteps(route.distanceKm);
      renderDirections(currentDirections);
      formEls.speakBtn.disabled = false;
    } catch (err) {
      console.error(err);
      alert("Errore calcolo percorso!");
    }
  }
}

// NAVIGAZIONE E VOCE
function speakStep(text) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "it-IT";
  window.speechSynthesis.speak(utterance);
}

function triggerDirectionsForProgress() {
  if (!routeProfile || !liveMarker) return;
  const userPos = liveMarker.getLatLng();
  let bestIdx = 0; let minD = Infinity;
  routeProfile.coords.forEach((c, i) => {
    const d = haversineMeters([userPos.lat, userPos.lng], c);
    if (d < minD) { minD = d; bestIdx = i; }
  });

  const progressKm = routeProfile.cumDist[bestIdx] / 1000;
  let next = navState.spokenIndex + 1;
  while (next < currentDirections.length && currentDirections[next].atKm <= progressKm + 0.05) {
    speakStep(currentDirections[next].text);
    const items = formEls.directions.querySelectorAll("li");
    items.forEach((li, i) => li.classList.toggle("active", i === next));
    navState.spokenIndex = next;
    next++;
  }
}

function speakDirections() {
  if (navState.active) {
    navState.active = false;
    navigator.geolocation.clearWatch(navState.watchId);
    formEls.speakBtn.textContent = "Avvia navigador";
    return;
  }
  
  navState.active = true;
  formEls.speakBtn.textContent = "Ferma navigador";
  setMapFullscreen(true);

  navState.watchId = navigator.geolocation.watchPosition((pos) => {
    const { latitude, longitude, heading } = pos.coords;
    if (liveMarker) {
      liveMarker.setLatLng([latitude, longitude]);
      let rot = heading || bearingDegrees([navState.lastLat, navState.lastLng], [latitude, longitude]);
      liveMarker._icon.style.transformOrigin = "50% 65%";
      liveMarker._icon.style.transform += ` rotate(${rot}deg)`;
    }
    navState.lastLat = latitude; navState.lastLng = longitude;
    map.setView([latitude, longitude], 18);
    triggerDirectionsForProgress();
  }, null, { enableHighAccuracy: true });
}

function setMapFullscreen(on) {
  const isFull = on ?? !document.body.classList.contains("map-full");
  document.body.classList.toggle("map-full", isFull);
  formEls.fullscreenBtn.textContent = isFull ? "⤡" : "⤢";
  setTimeout(() => map.invalidateSize(), 200);
}

// Event Listeners
formEls.planBtn.addEventListener("click", planRoute);
formEls.speakBtn.addEventListener("click", speakDirections);
formEls.fullscreenBtn.addEventListener("click", () => setMapFullscreen());
initMap();
