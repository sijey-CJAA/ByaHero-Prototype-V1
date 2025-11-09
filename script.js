const map = L.map('map');
map.setView([0, 0], 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'c OpenStreetMap contributors',
}).addTo(map);

const marker = L.marker([0, 0]).addTo(map)
marker.bindTooltip(`<img src='bus.png' alt='Icon' style="width:10px;" /> You are here   `).openTooltip();

if (navigator.geolocation) {
    navigator.geolocation.watchPosition((position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        marker.setLatLng([userLat, userLng]);
        map.setView([userLat, userLng], 15);
    },
        (error) => {
            console.error(`Geolocation Error: ${error.message}`);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        }
    );
} else {
    console.log("Geolocation is not supported");
}