let player;
let videoIds = [];
let currentIndex = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const REGISTRY_KEY = 'playlist_registry';
const API_KEY_STORAGE = 'youtube_api_key';

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function extractPlaylistId(input) {
  try {
    const url = new URL(input);
    if (url.searchParams.has('list')) {
      return url.searchParams.get('list');
    }
  } catch (e) {
    // Not a URL, assume ID
  }
  return input.trim();
}

function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '720',
    width: '1280',
    playerVars: { controls: 1 }, // 0 to hide native YouTube controls
    events: {
      'onReady': () => {
        const iframe = player.getIframe();
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      },
      'onStateChange': onPlayerStateChange
    }
  });
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    playNext();
  }
}

function playNext() {
  if (videoIds.length === 0) return;
  currentIndex = (currentIndex + 1) % videoIds.length;
  player.loadVideoById(videoIds[currentIndex]);
}

function playPrev() {
  if (videoIds.length === 0) return;
  currentIndex = (currentIndex - 1 + videoIds.length) % videoIds.length;
  player.loadVideoById(videoIds[currentIndex]);
}

function addPlaylistToRegistry(playlistId) {
  const registry = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '[]');
  if (!registry.includes(playlistId)) {
    registry.push(playlistId);
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
    updateDropdown();
  }
}

function getCachedPlaylists() {
  return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '[]');
}

function updateDropdown() {
  const dropdown = document.getElementById('cachedPlaylists');
  dropdown.innerHTML = '<option value="">-- Select cached playlist --</option>';
  getCachedPlaylists().forEach(id => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    dropdown.appendChild(option);
  });
}

async function fetchPlaylistVideos(playlistId, apiKey) {
  let ids = [];
  let nextPage = '';
  const maxResults = 50;

  while (true) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=${maxResults}&playlistId=${playlistId}&pageToken=${nextPage}&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) throw new Error(data.error.message);

      // Check for video availability? Maybe fixing random errors I've been having with large playlists
      data.items.forEach(item => {
        if (item && item.contentDetails && item.contentDetails.videoId) {
          ids.push(item.contentDetails.videoId);
        }
      });

      if (!data.nextPageToken) break;
      nextPage = data.nextPageToken;
    } catch (err) {
      console.warn('Skipping a page due to error:', err.message);
      break; // stop fetching if an unexpected error occurs
    }
  }

  return ids;
}

async function loadPlaylist(playlistInput, apiKey, force = false) {
  const playlistId = extractPlaylistId(playlistInput);
  const statusEl = document.getElementById('status');
  const cacheKey = `playlist_${playlistId}`;
  const timestampKey = `playlist_${playlistId}_ts`;

  const cached = localStorage.getItem(cacheKey);
  const cachedTime = parseInt(localStorage.getItem(timestampKey), 10);

  if (!force && cached && cachedTime && Date.now() - cachedTime < CACHE_DURATION) {
    videoIds = JSON.parse(cached);
    shuffle(videoIds);
    currentIndex = 0;
    statusEl.innerText = `Loaded ${videoIds.length} videos from cache. Playing first video.`;
    player.loadVideoById(videoIds[currentIndex]);
    addPlaylistToRegistry(playlistId);
    return;
  }

  statusEl.innerText = 'Fetching playlist...';
  try {
    videoIds = await fetchPlaylistVideos(playlistId, apiKey);
    if (videoIds.length === 0) return alert('No videos found.');

    localStorage.setItem(cacheKey, JSON.stringify(videoIds));
    localStorage.setItem(timestampKey, Date.now());
    addPlaylistToRegistry(playlistId);

    shuffle(videoIds);
    currentIndex = 0;
    statusEl.innerText = `Fetched ${videoIds.length} videos. Playing first video.`;
    player.loadVideoById(videoIds[currentIndex]);
  } catch (err) {
    statusEl.innerText = `Error fetching playlist: ${err.message}`;
  }
}

// Event listeners
document.getElementById('loadPlaylist').addEventListener('click', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const apiKey = apiKeyInput.value.trim();
  const playlistId = document.getElementById('playlistId').value.trim();

  if (!apiKey) return alert('Enter your API key');
  if (!playlistId) return alert('Enter a playlist URL or ID');
  
  localStorage.setItem(API_KEY_STORAGE, apiKey);

  loadPlaylist(playlistId, apiKey);
});

document.getElementById('refreshPlaylist').addEventListener('click', () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  const playlistId = document.getElementById('playlistId').value.trim();

  if (!apiKey) return alert('Enter your API key');
  if (!playlistId) return alert('Enter a playlist URL or ID');

  loadPlaylist(playlistId, apiKey, true); // force refresh
});

document.getElementById('nextVideo').addEventListener('click', playNext);
document.getElementById('prevVideo').addEventListener('click', playPrev);

document.getElementById('cachedPlaylists').addEventListener('change', (e) => {
  const apiKey = document.getElementById('apiKey').value.trim();
  const playlistId = e.target.value;
  if (!playlistId) return;
  if (!apiKey) return alert('Enter your API key');
  loadPlaylist(playlistId, apiKey);
});

window.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const savedKey = localStorage.getItem(API_KEY_STORAGE);
  if (savedKey) {
    apiKeyInput.value = savedKey;
  }
  updateDropdown();
});

