// random.js
"use strict";
let loc = document.getElementById("loc");

// Drag 'n Drop
function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev) {
    ev.dataTransfer.setData("text", ev.target.id);
}

function drop(ev) {
	ev.preventDefault();
	let data = ev.dataTransfer.getData("text");
	ev.target.appendChild(document.getElementById(data))
}

// Geolocation
function getLocation() {
	if (navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(showLocation);
	} else {
		loc.innerHTML = "Geolocation is not supported by your browser.";
	}
}

function showLocation(position) {
	let latlon = position.coords.latitude + "," + position.coords.longitude;
	loc.innerHTML = "<p>Latitude: </p>" + position.coords.latitude + "<p>Longitude: </p>" + position.coords.longitude;
	
	let img_url = "https://maps.googleapis.com/maps/api/staticmap?center="+latlon+"&zoom=10&size=400x300&sensor=false&key=AIzaSyDFTAsh2l_hmzfiQCG1hP-naKyMd_5YXxM";
	document.getElementById("map").innerHTML = "<img src='"+img_url+"'>";
}

function showError(error) {
	switch(error.code) {
		case error.PERMISSION_DENIED:
			loc.innerHTML = "User denied the request for geolocation."
			break;
		case error.POSITION_UNAVAILABLE:
			loc.innerHTML = "location information unavailable."
			break;
		case error.TIMEOUT:
			loc.innerHTML = "Request timed out."
			break;
		case error.UNKNOWN_ERROR:
			loc.innerHTML = "Unknown Error occurred."
			break;
	}
}

// Form Validation
function validateForm() {
	let number, text;
	number = document.getElementById("num").value;
	
	if(isNaN(number) || number < 1 || number > 100) {
		text = "Input not valid";
	} else {
		text = "input OK";
	}
	document.getElementById("numberOutput").innerHTML = text;
}
