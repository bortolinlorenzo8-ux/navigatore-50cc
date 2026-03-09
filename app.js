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
  // Qui cerchiamo il bottone della spunta. Se Cursor l'ha chiamato diversamente, lo troviamo noi.
  avoidMotorways: document.getElementById("avoid-motorways") || document.getElementById("solo-motorino"),
};

let currentDirections = [];
// La tua chiave GraphHopper
const GH_API_KEY = '86f927ef-fbd9-494a-a754-8bcb8f208490'; 

let map, routeLayer, liveMarker, endMarker, routeProfile = null;
let navState = { active: false, spokenIndex: -1, watchId: null, lastLat: null, lastLng: null };

// Icona Motorino Ciao
const motorinIcon = typeof L !== "undefined" ? L.icon({
  iconSize: [40, 40], iconAnchor: [20, 26], className: "motorin-icon",
  iconUrl: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg width="40" height="40" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="22" r="18" fill="green" opacity="0.5"/><circle cx="16" cy="30" r="4" fill="black"/><circle cx="30" cy="30" r="4" fill="black"/><path d="M16 25 L32 25 L24 15 Z" fill="black"/></svg>`)
}) : null;

// Funzioni base mappa
function initMap() {
  if (typeof L === "undefined") return;
  map = L.map("map").setView([45.4064, 11.8768], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: 'OSM' }).addTo(map);
}

async function geocodePlace(query) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}&countrycodes=it`);
  const data = await res.json();
  return data.length ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
}

// --- QUESTA È LA PARTE CHE ABBIAMO POTENZIATO PER LE AUTOSTRADE ---
async function fetchRouteGH(start, end, avoid) {
  // Aggiungiamo "ch.disable=true" per forzare GraphHopper a seguire i nostri blocchi
  // Blocchiamo "motorway" (autostrada) e "trunk" (superstrada)
  const avoidParams = avoid ? "&avoid=motorway;trunk&ch.disable=true" : "";
  const url = `https://graphhopper.com/api/1/route?point=${start.lat},${start.lon}&point=${end.lat},${end.lon}&profile=car&points_encoded=false${avoidParams}&key=${GH_API_KEY}`;
  
  const res = await fetch(url);
  const data = await res.json();
  if (!data.paths) return null;

  return {
    distanceKm: data.paths[0].distance / 1000,
    coordinates: data.paths[0].points.coordinates.map(c => [c[1], c[0]])
  };
}

async function planRoute() {
  const from = formEls.from.value.trim();
  const to = formEls.to.value.trim();
  const speed = parseFloat(formEls.speed.value) || 45;

  if (!from || !to) { alert("Metti partenza e arrivo!"); return; }

  try {
    formEls.summary.textContent = "Calcolo el giro senza autostrade...";
    const [start, end] = await Promise.all([geocodePlace(from), geocodePlace(to)]);
    
    // Controlliamo se la spunta è attiva
    const avoid = formEls.avoidMotorways ? formEls.avoidMotorways.checked : true;
    
    const route = await fetchRouteGH(start, end, avoid);
    if (!route) { alert("Ghe xe un problema: percorso non trovato!"); return; }

    // Disegna e calcola
    if (routeLayer) routeLayer.remove();
    routeLayer = L.polyline(route.coordinates, { color: "#4ade
