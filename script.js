const socket = io();

// Initialize map
const map = L.map('map').setView([14.0933849, 121.0233679], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
}).addTo(map);

// Track markers, colors, and names
const markers = {};
const colors = {};
const names = {}; // socket.id -> bus name

const liveUsersContainer = document.getElementById('live-users');

// Random color generator
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i=0; i<6; i++) color += letters[Math.floor(Math.random()*16)];
    return color;
}

// Update live users panel
function updateLiveUsers() {
    liveUsersContainer.innerHTML = '';
    for (const id in colors) {
        const badge = document.createElement('div');
        badge.className = 'user-badge';
        badge.style.backgroundColor = colors[id];
        badge.textContent = names[id]; // use bus name
        liveUsersContainer.appendChild(badge);
    }
}

// First location center
let firstUpdate = true;

// Watch user's location
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            if (firstUpdate) { map.setView([latitude, longitude], 15); firstUpdate = false; }
            socket.emit('send-location', { lat: latitude, lng: longitude });
        },
        (error) => console.error('Geolocation error:', error),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
}

// Receive assigned name from server
let myName = '';
socket.on('assign-name', (name) => { myName = name; });

// Receive location updates
socket.on('receive-location', (data) => {
    const { id, lat, lng, name } = data;

    if (!colors[id]) colors[id] = getRandomColor();
    names[id] = name;

    if (!markers[id]) {
        markers[id] = L.circleMarker([lat, lng], {
            radius: 10,
            color: colors[id],
            fillColor: colors[id],
            fillOpacity: 0.8
        }).addTo(map);
        markers[id].bindPopup(`${name}`);
    } else {
        markers[id].setLatLng([lat, lng]);
        markers[id].bindPopup(`${name}`);
    }

    updateLiveUsers();
});

// Handle disconnect
socket.on('user-disconnected', (id) => {
    if (markers[id]) { map.removeLayer(markers[id]); delete markers[id]; delete colors[id]; delete names[id]; }
    updateLiveUsers();
});
