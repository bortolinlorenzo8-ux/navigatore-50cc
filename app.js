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

const GH_API_KEY = '86f927ef-fbd9-494a-a754-8bcb8f208490'; 

let currentDirections = [];
let map, routeLayer, liveMarker, endMarker, routeProfile = null;
let navState = { active: false, spokenIndex: -1, watchId: null, lastLat: null, lastLng: null };

// Icona Motorino
const motorinIcon = typeof L !== "undefined" ? L.icon({
  iconSize: [40, 40], iconAnchor: [20, 26], className: "motorin-icon",
  iconUrl: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg width="40" height="40" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="22" r="18" fill="#22c55e" fill-opacity="0.6"/><circle cx="16" cy="30" r="4" fill="black"/><circle cx="30" cy="30" r="4" fill="black"/><path d="M16 25 L32 25 L24 18 Z" fill="black"/></svg>`)
}) : null;

// INIZIALIZZA MAPPA SUBITO
function initMap() {
  const mapDiv = document.getElementById("map");
  if (!mapDiv) return;
  mapDiv.innerHTML = ""; // Pulisce il messaggio "Carico mappa..."
  
  map = L.map("map").setView([45.4064, 11.8768], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
}

async function geocodePlace(query) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}&countrycodes=it`);
    const data = await res.json();
    return data.length ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
  } catch(e) { return null; }
}

async function planRoute() {
  const from = formEls.from.value.trim();
  const to = formEls.to.value.trim();
  const speed = parseFloat(formEls.speed.value) || 45;

  if (!from || !to) { alert("Metti i posti, vecio!"); return; }

  formEls.summary.textContent = "Speta che cerco el giro...";

  const start = await geocodePlace(from);
  const end = await geocodePlace(to);

  if (!start || !end) { alert("Posto non trovato!"); return; }

  // GraphHopper per evitare autostrade
  const avoid = formEls.avoidMotorways ? formEls.avoidMotorways.checked : true;
  const avoidParams = avoid ? "&avoid=motorway;trunk&ch.disable=true" : "";
  const url = `https://graphhopper.com/api/1/route?point=${start.lat},${start.lon}&point=${end.lat},${end.lon}&profile=car&points_encoded=false${avoidParams}&key=${GH_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.paths) {
    const route = data.paths[0];
    const coords = route.points.coordinates.map(c => [c[1], c[0]]);
    
    if (routeLayer) routeLayer.remove();
    routeLayer = L.polyline(coords, { color: "#4ade80", weight: 6 }).addTo(map);
    map.fitBounds(routeLayer.getBounds());

    if (liveMarker) liveMarker.remove();
    liveMarker = L.marker([start.lat, start.lon], { icon: motorinIcon }).addTo(map);

    const distKm = route.distance / 1000;
    const hours = distKm / speed;
    formEls.distance.value = distKm.toFixed(1);
    formEls.etaTime.textContent = Math.floor(hours) + "h " + Math.round((hours % 1) * 60) + "min";
    formEls.summary.textContent = "Giro pronto! Circa " + distKm.toFixed(1) + " km.";

    // Istruzioni
    currentDirections = [
      { at: 0, txt: "Mòva pian, stemo partindo!" },
      { at: distKm * 0.5, txt: "Semo a metà strada, tèn bota!" },
      { at: distKm, txt: "Sè rivà! Beve n'ombra!" }
    ];
    renderSteps();
  }
}

function renderSteps() {
  formEls.directions.innerHTML = currentDirections.map(s => `<li>${s.txt}</li>`).join("");
}

// NAVIGATORE VOCALE (SISTEMATO)
function speak(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "it-IT";
  window.speechSynthesis.speak(u);
}

function startNav() {
  if (navState.active) {
    navigator.geolocation.clearWatch(navState.watchId);
    navState.active = false;
    formEls.speakBtn.textContent = "Avvia navigador";
    return;
  }

  // Chiedi il permesso GPS
  navState.active = true;
  formEls.speakBtn.textContent = "Ferma navigador";
  speak("Navigador attivo, varda la strada!");

  navState.watchId = navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude } = pos.coords;
    if (liveMarker) liveMarker.setLatLng([latitude, longitude]);
    map.setView([latitude, longitude], 17);
  }, (err) => {
    alert("Attiva il GPS del telefono, vecio!");
  }, { enableHighAccuracy: true });
}

formEls.planBtn.addEventListener("click", planRoute);
formEls.speakBtn.addEventListener("click", startNav);
window.onload = initMap;
