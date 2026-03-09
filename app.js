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

// La tua chiave GraphHopper (già inserita)
const GH_API_KEY = '86f927ef-fbd9-494a-a754-8bcb8f208490'; 

let currentDirections = [];
let map, routeLayer, startMarker, endMarker, liveMarker, routeProfile = null;
let navState = { active: false, spokenIndex: -1, watchId: null, lastLat: null, lastLng: null };

// --- ICONE ORIGINALI DI CURSOR ---
const motorinIcon = typeof L !== "undefined" ? L.icon({
  iconSize: [40, 40], iconAnchor: [20, 26], popupAnchor: [0, -16], className: "motorin-icon",
  iconUrl: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg width="40" height="40" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="halo" cx="50%" cy="40%" r="55%"><stop offset="0%" stop-color="#22c55e" stop-opacity="0.95"/><stop offset="65%" stop-color="#0ea5e9" stop-opacity="1"/><stop offset="100%" stop-color="#020617" stop-opacity="1"/></radialGradient></defs><circle cx="24" cy="22" r="18" fill="url(#halo)" stroke="#020617" stroke-width="1.6" /><circle cx="16" cy="30" r="4.3" fill="#020617" /><circle cx="16" cy="30" r="2.3" fill="#0f172a" stroke="#16a34a" stroke-width="1"/><circle cx="30" cy="30" r="4.3" fill="#020617" /><circle cx="30" cy="30" r="2.3" fill="#0f172a" stroke="#16a34a" stroke-width="1"/><rect x="16" y="25" width="14" height="2.4" rx="1.2" fill="#e5e7eb" /><path d="M18 25 L18 19 L22 19" fill="none" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/><rect x="20.5" y="20" width="2.2" height="7" rx="1.1" fill="#0f172a" /><rect x="22" y="23" width="5" height="2.2" rx="1.1" fill="#22c55e" /><path d="M24 16 L24 20" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/><path d="M21 16 L27 16" stroke="#e5e7eb" stroke-width="2.4" stroke-linecap="round"/><rect x="22.2" y="13.3" width="3.6" height="2.4" rx="0.9" fill="#fefce8" stroke="#0f172a" stroke-width="0.8"/><path d="M24 32 L27 37 L21 37 Z" fill="#22c55e" stroke="#16a34a" stroke-width="1" stroke-linejoin="round"/></svg>`)
}) : null;

const arrivalIcon = typeof L !== "undefined" ? L.icon({
  iconSize: [30, 30], iconAnchor: [15, 28], iconUrl: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg width="30" height="30" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><rect x="15" y="6" width="2.5" height="20" fill="#0f172a"/><path d="M17 7 L27 10 L17 13 Z" fill="#22c55e" stroke="#16a34a" stroke-width="1"/><circle cx="16.5" cy="29" r="3" fill="#0f172a"/></svg>`)
}) : null;

// --- FUNZIONI DI CALCOLO ---
function haversineMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]); const dLon = toRad(b[1] - a[1]);
  const c = 2 * Math.asin(Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.sin(dLon/2)**2));
  return R * c;
}

function bearingDegrees(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const y = Math.sin(toRad(b[1]-a[1])) * Math.cos(toRad(b[0]));
  const x = Math.cos(toRad(a[0]))*Math.sin(toRad(b[0])) - Math.sin(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.cos(toRad(b[1]-a[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// --- LOGICA NAVIGATORE ---
async function geocodePlace(query) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}&countrycodes=it`);
  const data = await res.json();
  return data.length ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), label: data[0].display_name } : null;
}

async function fetchRouteGH(start, end, avoid) {
  const avoidParams = avoid ? "&avoid=motorway;trunk&ch.disable=true" : "";
  const url = `https://graphhopper.com/api/1/route?point=${start.lat},${start.lon}&point=${end.lat},${end.lon}&profile=car&points_encoded=false${avoidParams}&key=${GH_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.paths) return null;
  return { distanceKm: data.paths[0].distance / 1000, geometry: data.paths[0].points };
}

// --- DISEGNO MAPPA E ISTRUZIONI ---
function drawRouteOnMap(start, end, geometry) {
  if (routeLayer) routeLayer.remove();
  const coords = geometry.coordinates.map(c => [c[1], c[0]]);
  routeLayer = L.polyline(coords, { color: "#4ade80", weight: 5, opacity: 0.85 }).addTo(map);
  if (liveMarker) liveMarker.remove();
  if (endMarker) endMarker.remove();
  liveMarker = L.marker([start.lat, start.lon], { icon: motorinIcon }).addTo(map);
  endMarker = L.marker([end.lat, end.lon], { icon: arrivalIcon }).addTo(map);
  
  routeProfile = { coords, cumDist: [0] };
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    acc += haversineMeters(coords[i-1], coords[i]);
    routeProfile.cumDist.push(acc);
  }
  map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
}

function buildVenetianSteps(distanceKm) {
  const totalMeters = distanceKm * 1000;
  const steps = [
    { atKm: 0, text: "Mòva pian, stemo partindo! Ocio a la strada." },
    { atKm: distanceKm * 0.2, text: "Tra un s-ciantin tèn la drita, varda se ghe xe i vigili." },
    { atKm: distanceKm * 0.5, text: "Semo a metà strada, tèn bota che el cinquantin va che è una meraviglia." },
    { atKm: distanceKm * 0.8, text: "Semo quasi rivà, taca a cercar dove parcheggiar el Ciao." },
    { atKm: distanceKm, text: "Sè rivà! Ferma el motorin e va a bevarte un'ombra. Fine del giro!" }
  ];
  return steps;
}

function renderDirections(steps) {
  formEls.directions.innerHTML = "";
  steps.forEach((step, idx) => {
    const li = document.createElement("li");
    if (idx === 0) li.className = "active";
    li.innerHTML = `<span class="km">${step.atKm.toFixed(1)} km</span><span class="text">${step.text}</span>`;
    formEls.directions.appendChild(li);
  });
}

async function planRoute() {
  const from = formEls.from.value.trim();
  const to = formEls.to.value.trim();
  const speed = parseFloat(formEls.speed.value) || 45;

  try {
    formEls.summary.textContent = "Sto cercando el giro più furbo col nuovo motore...";
    const [start, end] = await Promise.all([geocodePlace(from), geocodePlace(to)]);
    if (!start || !end) { alert("No go trovà el posto!"); return; }

    const avoid = formEls.avoidMotorways ? formEls.avoidMotorways.checked : true;
    const route = await fetchRouteGH(start, end, avoid);
    if (!route) { alert("Nissun percorso trovà senza autostrade!"); return; }

    drawRouteOnMap(start, end, route.geometry);
    const hours = route.distanceKm / speed;
    const h = Math.floor(hours); const m = Math.round((hours - h) * 60);
    
    formEls.distance.value = route.distanceKm.toFixed(1);
    formEls.etaTime.textContent = `${h}h ${m}min`;
    formEls.summary.textContent = `Dal ${from} fin a ${to}: circa ${route.distanceKm.toFixed(1)} km. Col motorin te ghe meti ${h}h e ${m}min.`;
    
    currentDirections = buildVenetianSteps(route.distanceKm);
    renderDirections(currentDirections);
    formEls.speakBtn.disabled = false;
  } catch (err) { alert("Errore! Riprova."); }
}

// --- NAVIGAZIONE VOCALE ---
function speakStep(text) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "it-IT";
  window.speechSynthesis.speak(utterance);
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
  speakStep(currentDirections[0].text);

  navState.watchId = navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, heading } = pos.coords;
    if (liveMarker) {
      liveMarker.setLatLng([latitude, longitude]);
      let rot = heading || (navState.lastLat ? bearingDegrees([navState.lastLat, navState.lastLng], [latitude, longitude]) : 0);
      liveMarker._icon.style.transformOrigin = "50% 65%";
      liveMarker._icon.style.transform += ` rotate(${rot}deg)`;
    }
    navState.lastLat = latitude; navState.lastLng = longitude;
    map.setView([latitude, longitude], 18);
    
    // Controlla se dire la prossima frase
    const userPos = [latitude, longitude];
    let bestIdx = 0; let minD = Infinity;
    routeProfile.coords.forEach((c, i) => {
      const d = haversineMeters(userPos, c);
      if (d < minD) { minD = d; bestIdx = i; }
    });
    const progKm = routeProfile.cumDist[bestIdx] / 1000;
    let next = navState.spokenIndex + 1;
    if (next < currentDirections.length && currentDirections[next].atKm <= progKm + 0.1) {
      speakStep(currentDirections[next].text);
      navState.spokenIndex = next;
      const items = formEls.directions.querySelectorAll("li");
      items.forEach((li, i) => li.classList.toggle("active", i === next));
    }
  }, null, { enableHighAccuracy: true });
}

function initMap() {
  map = L.map("map").setView([45.4064, 11.8768], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
}

formEls.planBtn.addEventListener("click", planRoute);
formEls.speakBtn.addEventListener("click", speakDirections);
formEls.fullscreenBtn.addEventListener("click", () => {
  document.body.classList.toggle("map-full");
  setTimeout(() => map.invalidateSize(), 200);
});
initMap();
