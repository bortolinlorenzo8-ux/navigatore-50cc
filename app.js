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

let map, routeLayer, liveMarker;
let navState = { active: false, watchId: null };

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
  
  if (!from || !to) return alert("Inserisci partenza e arrivo!");

  formEls.summary.textContent = "Calcolo in corso... speta...";

  try {
    const p1 = await geocode(from);
    const p2 = await geocode(to);

    if (!p1 || !p2) throw new Error("Posto non trovato");

    // Costruiamo l'URL in modo super pulito
    const avoid = formEls.avoidMotorways?.checked ? "motorway,trunk" : "";
    const url = `https://graphhopper.com/api/1/route?point=${p1.lat},${p1.lon}&point=${p2.lat},${p2.lon}&profile=car&layer=osm&points_encoded=false&key=${GH_API_KEY}` + (avoid ? `&ch.disable=true&custom_model={"priority":[{"if":"road_class==MOTORWAY || road_class==TRUNK","multiply_by":0.0}]}` : "");

    const res = await fetch(url);
    const data = await res.json();

    if (data.message) {
        // Se GraphHopper risponde con un errore specifico
        console.error(data.message);
        throw new Error("Errore API: " + data.message);
    }

    const path = data.paths[0];
    const coords = path.points.coordinates.map(c => [c[1], c[0]]);

    if (routeLayer) routeLayer.remove();
    routeLayer = L.polyline(coords, { color: "#4ade80", weight: 6 }).addTo(map);
    map.fitBounds(routeLayer.getBounds());

    const dist = path.distance / 1000;
    const speed = parseFloat(formEls.speed.value) || 45;
    const time = dist / speed;

    formEls.distance.value = dist.toFixed(1);
    formEls.etaTime.textContent = Math.floor(time) + "h " + Math.round((time % 1) * 60) + "m";
    formEls.summary.textContent = `Trovà un giro de ${dist.toFixed(1)} km. Daghe gas!`;

  } catch (err) {
    console.error(err);
    formEls.summary.textContent = "Errore: " + err.message;
    alert("Niente da fare, vecio. Prova un tragitto più corto o riprova tra un minuto.");
  }
}

formEls.planBtn.addEventListener("click", planRoute);
window.onload = initMap;
