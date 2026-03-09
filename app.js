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
};

const GH_API_KEY = '86f927ef-fbd9-494a-a754-8bcb8f208490'; 
let map, routeLayer, liveMarker, endMarker;
let navState = { active: false, watchId: null };

// Icone tornate al loro posto
const motorinIcon = L.icon({
  iconSize: [40, 40], iconAnchor: [20, 20],
  iconUrl: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg width="40" height="40" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="18" fill="#22c55e" fill-opacity="0.7"/><path d="M15 30 L33 30 L24 15 Z" fill="black"/></svg>`)
});

const arrivalIcon = L.icon({
  iconSize: [30, 30], iconAnchor: [15, 30],
  iconUrl: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg width="30" height="30" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><path d="M15 5 L15 30 M15 5 L30 12 L15 20" fill="red" stroke="black" stroke-width="2"/></svg>`)
});

function initMap() {
  const mapDiv = document.getElementById("map");
  if (!mapDiv) return;
  mapDiv.innerHTML = ""; 
  map = L.map("map").setView([45.4064, 11.8768], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
}

async function geocode(query) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}&countrycodes=it`);
  const data = await res.json();
  return data.length ? { lat: data[0].lat, lon: data[0].lon } : null;
}

async function planRoute() {
  const from = formEls.from.value.trim();
  const to = formEls.to.value.trim();
  if (!from || !to) return alert("Metti i posti, vecio!");

  formEls.summary.textContent = "Speta che fasso i conti...";

  try {
    const p1 = await geocode(from);
    const p2 = await geocode(to);
    if (!p1 || !p2) throw new Error("Posto non trovato");

    const url = `https://graphhopper.com/api/1/route?point=${p1.lat},${p1.lon}&point=${p2.lat},${p2.lon}&profile=bike&points_encoded=false&key=${GH_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.paths) {
      const path = data.paths[0];
      const coords = path.points.coordinates.map(c => [c[1], c[0]]);
      
      // Pulisce vecchia rotta e marker
      if (routeLayer) routeLayer.remove();
      if (liveMarker) liveMarker.remove();
      if (endMarker) endMarker.remove();

      routeLayer = L.polyline(coords, { color: "#4ade80", weight: 6 }).addTo(map);
      liveMarker = L.marker([p1.lat, p1.lon], { icon: motorinIcon }).addTo(map);
      endMarker = L.marker([p2.lat, p2.lon], { icon: arrivalIcon }).addTo(map);
      
      map.fitBounds(routeLayer.getBounds());

      // Distanza e Tempi
      const dist = path.distance / 1000;
      const speed = parseFloat(formEls.speed.value) || 45;
      const travelTimeHours = dist / speed;
      
      // Calcolo Arrivo Previsto
      const now = new Date();
      const arrivalDate = new Date(now.getTime() + travelTimeHours * 60 * 60 * 1000);
      const arrivalStr = arrivalDate.getHours().toString().padStart(2, '0') + ":" + arrivalDate.getMinutes().toString().padStart(2, '0');

      formEls.distance.value = dist.toFixed(1);
      formEls.etaTime.textContent = Math.floor(travelTimeHours) + "h " + Math.round((travelTimeHours % 1) * 60) + "m";
      formEls.etaArrival.textContent = arrivalStr;
      formEls.summary.textContent = `Giro de ${dist.toFixed(1)} km. Te rivi par le ${arrivalStr}.`;
      
      formEls.directions.innerHTML = "<li>Daghe gas! Segui la riga verde.</li>";
    }
  } catch (err) {
    alert("Errore: " + err.message);
  }
}

// Navigazione Vocale
function startNav() {
  if (navState.active) {
    navigator.geolocation.clearWatch(navState.watchId);
    navState.active = false;
    formEls.speakBtn.textContent = "Avvia navigador";
    return;
  }
  navState.active = true;
  formEls.speakBtn.textContent = "Stop Navigador";
  
  navState.watchId = navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude } = pos.coords;
    if (liveMarker) liveMarker.setLatLng([latitude, longitude]);
    map.setView([latitude, longitude], 17);
  }, (err) => alert("Accendi il GPS!"), { enableHighAccuracy: true });
}

formEls.planBtn.addEventListener("click", planRoute);
formEls.speakBtn.addEventListener("click", startNav);
window.onload = initMap;
