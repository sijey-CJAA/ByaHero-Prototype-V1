const socket = io();

// Initialize map (default view)
const map = L.map('map').setView([14.0933849, 121.0233679], 15);

// Original OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
}).addTo(map);

// Track markers and colors
const markers = {};
const colors = {};

// Function to generate random color
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i=0; i<6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Center map on first location only
let firstUpdate = true;

// Watch user's geolocation
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;

            // Center map on first update
            if (firstUpdate) {
                map.setView([latitude, longitude], 15);
                firstUpdate = false;
            }

            // Send location to server
            socket.emit('send-location', { lat: latitude, lng: longitude });
        },
        (error) => console.error('Geolocation error:', error),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
} else {
    alert('Geolocation not supported by this browser.');
}

// Receive other users' locations
socket.on('receive-location', (data) => {
    const { id, lat, lng } = data;

    // Assign a random color for new users
    if (!colors[id]) colors[id] = getRandomColor();

    // Create or update markers
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
});

// Remove marker when user disconnects
socket.on('user-disconnected', (id) => {
    if (markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
        delete colors[id];
    }
});
