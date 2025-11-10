const socket = io();

// Initialize map
const map = L.map('map').setView([0, 0], 15);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
}).addTo(map);

// Keep track of all user markers and colors
const markers = {};
const colors = {};  // store color for each user

// Function to generate random color
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Watch user location
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;

            // Send your position to server
            socket.emit('send-location', { lat: latitude, lng: longitude });
        },
        (error) => console.error('Geolocation error:', error),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
} else {
    alert('Geolocation not supported by this browser.');
}

// When receiving other users’ positions
socket.on('receive-location', (data) => {
    const { id, lat, lng } = data;

    // Assign a color if this user doesn't have one yet
    if (!colors[id]) {
        colors[id] = getRandomColor();
    }

    // Create a colored circle marker if it doesn't exist
    if (!markers[id]) {
        markers[id] = L.circleMarker([lat, lng], {
            radius: 10,
            color: colors[id],
            fillColor: colors[id],
            fillOpacity: 0.8
        }).addTo(map);
        markers[id].bindPopup(`Bus ID: ${id}`);
    } else {
        // Update position
        markers[id].setLatLng([lat, lng]);
    }
});

// Remove marker when a user disconnects
socket.on('user-disconnected', (id) => {
    if (markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
        delete colors[id];
    }
});
