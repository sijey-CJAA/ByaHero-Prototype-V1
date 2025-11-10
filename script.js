const socket = io();

// Initialize map
const map = L.map('map').setView([14.0933849, 121.0233679], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
}).addTo(map);

// Track markers and colors
const markers = {};
const colors = {};

// Track users in live panel
const liveUsersContainer = document.getElementById('live-users');

// Function to generate random color
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i=0; i<6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Function to update live users panel
function updateLiveUsers() {
    liveUsersContainer.innerHTML = '';
    for (const id in colors) {
        const badge = document.createElement('div');
        badge.className = 'user-badge';
        badge.style.backgroundColor = colors[id];
        badge.textContent = id; // Or "Bus 1", "Bus 2", etc.
        liveUsersContainer.appendChild(badge);
    }
}

// Center map on first location
let firstUpdate = true;

// Watch user's location
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;

            if (firstUpdate) {
                map.setView([latitude, longitude], 15);
                firstUpdate = false;
            }

            socket.emit('send-location', { lat: latitude, lng: longitude });
        },
        (error) => console.error('Geolocation error:', error),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
}

// Receive location updates from server
socket.on('receive-location', (data) => {
    const { id, lat, lng } = data;

    if (!colors[id]) colors[id] = getRandomColor();

    if (!markers[id]) {
        markers[id] = L.circleMarker([lat, lng], {
            radius: 10,
            color: colors[id],
            fillColor: colors[id],
            fillOpacity: 0.8
        }).addTo(map);
        markers[id].bindPopup(`Bus ID: ${id}`);
    } else {
        markers[id].setLatLng([lat, lng]);
    }

    updateLiveUsers();
});

// Remove marker when user disconnects
socket.on('user-disconnected', (id) => {
    if (markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
        delete colors[id];
    }
    updateLiveUsers();
});
