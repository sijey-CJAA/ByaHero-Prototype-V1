const socket = io();

// Initialize map
const map = L.map('map').setView([0, 0], 15);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
}).addTo(map);

// Keep track of all user markers
const markers = {};

// Watch user location
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude } = position.coords;

            // Send your position to server
            socket.emit('send-location', { lat: latitude, lng: longitude });
        },
        (error) => console.error('Geolocation error:', error),
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        }
    );
} else {
    alert('Geolocation not supported by this browser.');
}

// When other users send locations
socket.on('receive-location', (data) => {
    const { id, lat, lng } = data;

    // If marker already exists, update position
    if (markers[id]) {
        markers[id].setLatLng([lat, lng]);
    } else {
        // Otherwise, create a new marker
        markers[id] = L.marker([lat, lng]).addTo(map);
        markers[id].bindPopup(`Bus ID: ${id}`).openPopup();
    }
});

// When a user disconnects, remove their marker
socket.on('user-disconnected', (id) => {
    if (markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
    }
});
