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

// Icona personalizzata tipo "motorin / Ciao Piaggio" per il marker utente
const motorinIcon = typeof L !== "undefined"
  ? L.icon({
      iconSize: [40, 40],
      iconAnchor: [20, 26],
      popupAnchor: [0, -16],
      className: "motorin-icon",
      iconUrl:
        "data:image/svg+xml;utf8," +
        encodeURIComponent(`
<svg width="40" height="40" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="halo" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#22c55e" stop-opacity="0.95"/>
      <stop offset="65%" stop-color="#0ea5e9" stop-opacity="1"/>
      <stop offset="100%" stop-color="#020617" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <!-- alone attorno al motorin -->
  <circle cx="24" cy="22" r="18" fill="url(#halo)" stroke="#020617" stroke-width="1.6" />

  <!-- ruote tipo Ciao -->
  <circle cx="16" cy="30" r="4.3" fill="#020617" />
  <circle cx="16" cy="30" r="2.3" fill="#0f172a" stroke="#16a34a" stroke-width="1"/>

  <circle cx="30" cy="30" r="4.3" fill="#020617" />
  <circle cx="30" cy="30" r="2.3" fill="#0f172a" stroke="#16a34a" stroke-width="1"/>

  <!-- telaio basso del Ciao -->
  <rect x="16" y="25" width="14" height="2.4" rx="1.2" fill="#e5e7eb" />
  <path d="M18 25 L18 19 L22 19" fill="none" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/>

  <!-- pedana e tubo centrale -->
  <rect x="20.5" y="20" width="2.2" height="7" rx="1.1" fill="#0f172a" />
  <rect x="22" y="23" width="5" height="2.2" rx="1.1" fill="#22c55e" />

  <!-- manubrio alto e faro del Ciao -->
  <path d="M24 16 L24 20" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/>
  <path d="M21 16 L27 16" stroke="#e5e7eb" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="22.2" y="13.3" width="3.6" height="2.4" rx="0.9" fill="#fefce8" stroke="#0f172a" stroke-width="0.8"/>

  <!-- piccola freccia di direzione sotto il motorin -->
  <path d="M24 32 L27 37 L21 37 Z" fill="#22c55e" stroke="#16a34a" stroke-width="1" stroke-linejoin="round"/>
</svg>
      `),
    })
  : null;

// Icona per il punto di arrivo (bandierina)
const arrivalIcon = typeof L !== "undefined"
  ? L.icon({
      iconSize: [30, 30],
      iconAnchor: [15, 28],
      iconUrl:
        "data:image/svg+xml;utf8," +
        encodeURIComponent(`
<svg width="30" height="30" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
  <rect x="15" y="6" width="2.5" height="20" fill="#0f172a"/>
  <path d="M17 7 L27 10 L17 13 Z" fill="#22c55e" stroke="#16a34a" stroke-width="1"/>
  <circle cx="16.5" cy="29" r="3" fill="#0f172a"/>
</svg>
      `),
    })
  : null;

function haversineMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const c =
    2 *
    Math.asin(
      Math.sqrt(
        sinLat * sinLat +
          Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
      )
    );
  return R * c;
}

function bearingDegrees(a, b) {
  // a, b: [lat, lon] in degrees, return bearing 0..360 (0 = nord)
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLon = toRad(b[1] - a[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let brng = toDeg(Math.atan2(y, x));
  brng = (brng + 360) % 360;
  return brng;
}

function buildRouteProfile(geometry) {
  if (!geometry || !geometry.coordinates || !geometry.coordinates.length) {
    return null;
  }
  const coords = geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  if (coords.length < 2) return null;

  const cumDist = [0];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversineMeters(coords[i - 1], coords[i]);
    acc += d;
    cumDist.push(acc);
  }
  return {
    coords,
    cumDist,
  };
}

function initMap() {
  const mapElement = document.getElementById("map");
  if (!mapElement || typeof L === "undefined") return;

  map = L.map("map").setView([45.4064, 11.8768], 11); // zona Padova

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Rimuove il placeholder quando la mappa è pronta
  map.whenReady(() => {
    const placeholder = mapElement.querySelector(".map-placeholder");
    if (placeholder) placeholder.remove();
  });
}

async function geocodePlace(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "it");
  url.searchParams.set("q", query);

  const res = await fetch(url.toString(), {
    headers: {
      "Accept-Language": "it",
    },
  });
  if (!res.ok) throw new Error("Geocoding error");
  const data = await res.json();
  if (!data.length) return null;
  const item = data[0];
  return {
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    label: item.display_name,
  };
}

async function fetchRoute(start, end, avoidMotorways) {
  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}`
  );
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");
  if (avoidMotorways) {
    url.searchParams.set("exclude", "motorway");
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Route error");
  const data = await res.json();
  if (!data.routes || !data.routes.length) return null;

  const route = data.routes[0];
  return {
    distanceKm: route.distance / 1000,
    geometry: route.geometry,
  };
}

function drawRouteOnMap(start, end, geometry) {
  if (!map) return;

  if (routeLayer) {
    routeLayer.remove();
    routeLayer = null;
  }
  if (startMarker) startMarker.remove();
  if (endMarker) endMarker.remove();
  if (liveMarker) liveMarker.remove();

  routeLayer = L.geoJSON(geometry, {
    style: {
      color: "#4ade80",
      weight: 5,
      opacity: 0.85,
    },
  }).addTo(map);

  // Marker "vivo" del motorino (come la freccia di Google Maps)
  liveMarker = L.marker([start.lat, start.lon], {
    title: "Motorin",
    icon: motorinIcon || undefined,
  }).addTo(map);

  // Marker bandierina di arrivo
  endMarker = L.marker([end.lat, end.lon], {
    title: "Arrivo",
    icon: arrivalIcon || undefined,
  }).addTo(map);

  routeProfile = buildRouteProfile(geometry);
  if (routeProfile) {
    navState.spokenIndex = -1;
    navState.lastLat = start.lat;
    navState.lastLng = start.lon;
  }

  const bounds = routeLayer.getBounds();
  map.fitBounds(bounds, { padding: [40, 40] });
}

function formatTimeFromHours(hours) {
  if (!isFinite(hours) || hours <= 0) return "0 min";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function formatArrivalTime(hoursFromNow) {
  if (!isFinite(hoursFromNow) || hoursFromNow <= 0) return "–";
  const now = new Date();
  const arrival = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
  return arrival.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function venetianIntro(from, to, distanceKm, timeStr) {
  const start = from || "da dove te sì";
  const end = to || "dove te ghè da ndar";
  const kmTxt =
    distanceKm > 0 ? `${distanceKm.toFixed(1).replace(".", ",")} km` : "na ciacola";
  return `Dal ${start} fin a ${end}: ghe xe circa ${kmTxt}. Col motorin a 45 all'ora te ghe meti sui ${timeStr}.`;
}

function buildVenetianSteps(distanceKm) {
  if (!isFinite(distanceKm) || distanceKm <= 0) {
    return [
      {
        atKm: 0,
        text: "Mòva pian: no ghe xe strada impostada. Scrivi qualche km prima.",
      },
    ];
  }

  const steps = [];
  const totalMeters = distanceKm * 1000;

  const pushStep = (metersLeft, variant) => {
    const distLabel =
      metersLeft >= 1000
        ? `${(metersLeft / 1000).toFixed(1).replace(".", ",")} km`
        : `${Math.round(metersLeft / 50) * 50} m`;

    const templates = {
      right: [
        `Tra ${distLabel} svolta a drita.`,
        `Dopo ${distLabel} taca a tegnèr la drita.`,
      ],
      left: [
        `Tra ${distLabel} sambla a man manca.`,
        `Dopo ${distLabel} ciapa man manca.`,
      ],
      straight: [
        `Par adesso tegn drito, va ben cusì.`,
        `Continua sempre drito, stai in 'sta corsia.`,
      ],
      roundabout: [
        `Al prox girotondo ciapa la seconda uscita.`,
        `Entra in rotonda e va fora alla terza uscita.`,
      ],
      arrival: [
        `Sè rivà: ferma el motorin dove che te par comodo.`,
        `Fine del giro: cerca un posto bono par parché.`,
      ],
    };

    const pool = templates[variant] || templates.straight;
    const idx = Math.floor(Math.random() * pool.length);
    steps.push({
      atKm: (totalMeters - metersLeft) / 1000,
      text: pool[idx],
    });
  };

  if (totalMeters <= 1500) {
    pushStep(totalMeters, "straight");
  } else {
    // First 500 m
    pushStep(totalMeters - 500, "straight");
    // Middle events
    const midEvents = [
      { metersLeft: totalMeters * 0.6, variant: "right" },
      { metersLeft: totalMeters * 0.3, variant: "roundabout" },
      { metersLeft: totalMeters * 0.1, variant: "left" },
    ];
    midEvents.forEach((e) => pushStep(e.metersLeft, e.variant));
  }

  // Arrival
  pushStep(0, "arrival");

  return steps.sort((a, b) => a.atKm - b.atKm);
}

function renderDirections(steps) {
  formEls.directions.innerHTML = "";
  steps.forEach((step, idx) => {
    const li = document.createElement("li");
    if (idx === 0) li.classList.add("active");
    const kmBadge = document.createElement("span");
    kmBadge.className = "km";
    kmBadge.textContent =
      step.atKm <= 0 ? "PARTENZA" : `${step.atKm.toFixed(1).replace(".", ",")} km`;

    const textSpan = document.createElement("span");
    textSpan.className = "text";
    textSpan.textContent = step.text;

    li.appendChild(kmBadge);
    li.appendChild(textSpan);
    formEls.directions.appendChild(li);
  });
}

function updateActiveDirection(index) {
  const items = Array.from(formEls.directions.querySelectorAll("li"));
  items.forEach((li, i) => {
    li.classList.toggle("active", i === index);
  });
}

function updateLiveMarkerPosition() {
  // posizione già aggiornata dal GPS, niente da fare qui
}

function speakStep(text) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "it-IT";
  utterance.rate = 1.02;
  utterance.pitch = 0.95;
  window.speechSynthesis.speak(utterance);
}

function triggerDirectionsForProgress() {
  if (!currentDirections.length) return;
  if (!routeProfile || !liveMarker) return;

  const userLatLng = liveMarker.getLatLng();
  const { coords, cumDist } = routeProfile;

  // Trova il punto del percorso più vicino alla posizione attuale
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineMeters(
      [userLatLng.lat, userLatLng.lng],
      coords[i]
    );
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  const progressMeters = cumDist[bestIdx] || 0;
  const progressKm = progressMeters / 1000;
  let nextIndex = navState.spokenIndex + 1;

  while (
    nextIndex < currentDirections.length &&
    currentDirections[nextIndex].atKm <= progressKm + 0.02
  ) {
    const step = currentDirections[nextIndex];
    updateActiveDirection(nextIndex);
    speakStep(step.text);
    navState.spokenIndex = nextIndex;
    nextIndex += 1;
  }
}

function stopNavigation() {
  navState.active = false;
  if (navState.watchId != null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(navState.watchId);
    navState.watchId = null;
  }
  navState.lastLat = null;
  navState.lastLng = null;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  formEls.speakBtn.textContent = "Avvia navigador";
}

async function planRoute() {
  const from = formEls.from.value.trim();
  const to = formEls.to.value.trim();
  let distanceKm = parseFloat(formEls.distance.value.replace(",", "."));
  const speed = parseFloat(formEls.speed.value.replace(",", "."));

  // Se distanza mancante ma abbiamo partenza e arrivo, prova a calcolare dal percorso
  if ((!distanceKm || distanceKm <= 0 || !isFinite(distanceKm)) && from && to) {
    try {
      formEls.summary.style.color = "var(--text-soft)";
      formEls.summary.textContent =
        "Sto cercando el giro più furbo par el motorin…";
      formEls.etaTime.textContent = "–";
      formEls.etaArrival.textContent = "–";
      formEls.speakBtn.disabled = true;
      currentDirections = [];
      formEls.directions.innerHTML = "";
      formEls.planBtn.disabled = true;

      const [start, end] = await Promise.all([
        geocodePlace(from),
        geocodePlace(to),
      ]);

      if (!start || !end) {
        formEls.summary.style.color = "var(--danger)";
        formEls.summary.textContent =
          "No son rivà a trovar uno dei posti. Prova a metar un indirizzo più preciso (via, città…).";
        formEls.planBtn.disabled = false;
        return;
      }

      const avoidHighways = !!(formEls.avoidMotorways && formEls.avoidMotorways.checked);
      const route = await fetchRoute(start, end, avoidHighways);
      if (!route) {
        formEls.summary.style.color = "var(--danger)";
        formEls.summary.textContent = avoidHighways
          ? "No go trovà un percorso senza autostrade. Se te va ben anca le strade veloci, togli la spunta 'Solo strade da motorin'."
          : "No go trovà un percorso bono par el motorin. Prova con un'altra strada o città.";
        formEls.planBtn.disabled = false;
        return;
      }

      distanceKm = route.distanceKm;
      formEls.distance.value = distanceKm.toFixed(1);
      drawRouteOnMap(start, end, route.geometry);
    } catch (err) {
      formEls.summary.style.color = "var(--danger)";
      formEls.summary.textContent =
        "Ghe xe stà un problema co la mappa. Controlla internet e riprova.";
      formEls.planBtn.disabled = false;
      return;
    } finally {
      formEls.planBtn.disabled = false;
    }
  }

  if (!distanceKm || distanceKm <= 0 || !isFinite(distanceKm)) {
    formEls.summary.textContent =
      "Meti na distanza in chilòmetri valida (anche a spanne) o dammi partenza e destinazion par farla mi.";
    formEls.summary.style.color = "var(--danger)";
    formEls.etaTime.textContent = "–";
    formEls.etaArrival.textContent = "–";
    formEls.speakBtn.disabled = true;
    formEls.directions.innerHTML = "";
    currentDirections = [];
    return;
  }

  const safeSpeed = Math.min(Math.max(speed || 30, 5), 45);
  const hours = distanceKm / safeSpeed;
  const timeStr = formatTimeFromHours(hours);

  formEls.summary.style.color = "var(--text-soft)";
  formEls.summary.textContent = venetianIntro(from, to, distanceKm, timeStr);
  formEls.etaTime.textContent = timeStr;
  formEls.etaArrival.textContent = formatArrivalTime(hours);

  currentDirections = buildVenetianSteps(distanceKm);
  renderDirections(currentDirections);
  formEls.speakBtn.disabled = false;
}

function speakDirections() {
  if (!("speechSynthesis" in window)) {
    alert(
      "La sintesi vocale no la xe suportada da sto browser. Prova con Chrome o Edge."
    );
    return;
  }

  if (!("geolocation" in navigator)) {
    alert(
      "Sto dispositivo no supporta el GPS dal browser. Prova da telefono o da browser diverso."
    );
    return;
  }

  if (navState.active) {
    stopNavigation();
    return;
  }

  if (!routeProfile || !liveMarker) {
    alert(
      "Par aver la voce che parla al momento giusto, prima calcola un percorso su mappa con partenza e destinazion."
    );
    return;
  }

  if (!currentDirections.length) return;

  window.speechSynthesis.cancel();
  navState.spokenIndex = -1;
  navState.active = true;
  formEls.speakBtn.textContent = "Ferma navigador";

  // Passa subito alla vista mappa grande quando parte il navigatore
  setMapFullscreen(true);

  // Prima istruzione in partenza
  updateActiveDirection(0);
  speakStep(currentDirections[0].text);
  navState.spokenIndex = 0;

  // Avvia ascolto GPS: aggiorna la posizione della "macchinetta"
  navState.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      if (liveMarker) {
        liveMarker.setLatLng([latitude, longitude]);
      }
      // Orienta il motorino nella direzione di marcia
      let heading = typeof pos.coords.heading === "number"
        ? pos.coords.heading
        : null;
      if (heading == null && navState.lastLat != null && navState.lastLng != null) {
        heading = bearingDegrees(
          [navState.lastLat, navState.lastLng],
          [latitude, longitude]
        );
      }
      if (heading != null && liveMarker && liveMarker._icon) {
        liveMarker._icon.style.transformOrigin = "50% 65%";
        liveMarker._icon.style.transform =
          "rotate(" + heading + "deg) translateZ(0)";
      }
      navState.lastLat = latitude;
      navState.lastLng = longitude;

      if (map) {
        // avvicina la "telecamera" come se fossi a ~30m dal motorin
        const targetZoom = 18; // molto vicino
        const currentZoom = map.getZoom() || targetZoom;
        const nextZoom = currentZoom < targetZoom ? targetZoom : currentZoom;
        map.setView([latitude, longitude], nextZoom, {
          animate: true,
        });
      }
      triggerDirectionsForProgress();
    },
    () => {
      alert(
        "No rieso a legger el GPS. Controlla che el browser gà i permessi par la posizione."
      );
      stopNavigation();
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 10000,
    }
  );
}

formEls.planBtn.addEventListener("click", () => {
  planRoute();
});

["distance", "speed"].forEach((id) => {
  formEls[id].addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      planRoute();
    }
  });
});

formEls.speakBtn.addEventListener("click", speakDirections);

function setMapFullscreen(on) {
  if (!formEls.fullscreenBtn) return;
  const isFull = on ?? !document.body.classList.contains("map-full");
  if (isFull) {
    document.body.classList.add("map-full");
    formEls.fullscreenBtn.textContent = "⤡";
  } else {
    document.body.classList.remove("map-full");
    formEls.fullscreenBtn.textContent = "⤢";
  }
  if (map) {
    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }
}

// Fullscreen mappa (layout grande) tramite bottone
if (formEls.fullscreenBtn) {
  formEls.fullscreenBtn.addEventListener("click", () => {
    setMapFullscreen();
  });
}

// Init
initMap();
formEls.speakBtn.textContent = "Avvia navigador";

