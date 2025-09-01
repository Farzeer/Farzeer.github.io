let player;
let videoIds = [];
let currentIndex = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const REGISTRY_KEY = 'playlist_registry';
const API_KEY_STORAGE = 'youtube_api_key';
let lastActionTime = 0;
const ACTION_DELAY = 1000; // ms

function canTriggerAction() {
  const now = Date.now();
  if (now - lastActionTime >= ACTION_DELAY) {
    lastActionTime = now;
    return true;
  }
  return false;
}

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
        playerReady = true;
        const iframe = player.getIframe();
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      },
      'onStateChange': onPlayerStateChange,
      'onError': onPlayerError
    }
  });
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    playNext();
  }
}

function onPlayerError(event) {
  const errorCode = event.data;
  console.warn('Video playback error, skipping to next:', errorCode);
  if (errorCode === 100 || errorCode === 101 || errorCode === 150) {
    playNext();
  } else {
    alert(`YouTube Player Error: ${errorCode}`);
  }
}

function isPlayerReady() {
  return (player && playerReady && typeof player.getPlayerState === 'function');
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

async function fetchPlaylistTitle(playlistId, apiKey) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.items || !data.items.length) return playlistId;
    return data.items[0].snippet.title;
  } catch (err) {
    console.warn('Could not fetch playlist title:', err.message);
    return playlistId;
  }
}

async function addPlaylistToRegistry(playlistId, apiKey) {
  const registry = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '[]');
  if (!registry.find(p => p.id === playlistId)) {
    const title = await fetchPlaylistTitle(playlistId, apiKey);
    registry.push({ id: playlistId, title });
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
  getCachedPlaylists().forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.title;
    dropdown.appendChild(option);
  });
}

function showGIFs() {
  const gifContainer = document.getElementById('gif-container');
  if (!gifContainer) return;
  gifContainer.innerHTML = `
    <div class="tenor-gif-embed" data-postid="18110512" data-share-method="host" data-aspect-ratio="1.77778" data-width="100%">
      <a href="https://tenor.com/view/cat-jam-gif-18110512">Cat Jam GIF</a> from <a href="https://tenor.com/search/cat-gifs">Cat GIFs</a>
    </div>
    <div class="tenor-gif-embed" data-postid="16989864924126703156" data-share-method="host" data-aspect-ratio="0.797189" data-width="100%">
      <a href="https://tenor.com/view/catjam-cat-disco-catjamming-gif-16989864924126703156">Catjam Disco GIF</a> from <a href="https://tenor.com/search/catjam-gifs">Catjam GIFs</a>
    </div>
  `;

  // Load Tenor script to render embeds
  if (window.TenorEmbed) {
    TenorEmbed.load();
  } else {
    const tenorScript = document.createElement('script');
    tenorScript.src = "https://tenor.com/embed.js";
    tenorScript.async = true;
    document.body.appendChild(tenorScript);
  }
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
  let playlistId = extractPlaylistId(playlistInput);
  const statusEl = document.getElementById('status');

  if (!playerReady) {
    statusEl.innerText = 'Waiting for player to initialize...';
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (playerReady) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
  }

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
    addPlaylistToRegistry(playlistId, apiKey);
    showGIFs(); // Display the GIFs
    return;
  }

  statusEl.innerText = 'Fetching playlist...';
  try {
    videoIds = await fetchPlaylistVideos(playlistId, apiKey);
    if (videoIds.length === 0) return alert('No videos found.');

    localStorage.setItem(cacheKey, JSON.stringify(videoIds));
    localStorage.setItem(timestampKey, Date.now());
    addPlaylistToRegistry(playlistId, apiKey);

    shuffle(videoIds);
    currentIndex = 0;
    statusEl.innerText = `Fetched ${videoIds.length} videos. Playing first video.`;
    player.loadVideoById(videoIds[currentIndex]);
    showGIFs(); // Display the GIFs
  } catch (err) {
    statusEl.innerText = `Error fetching playlist: ${err.message}`;
  }
}

// Event listeners
document.getElementById('loadPlaylist').addEventListener('click', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const apiKey = apiKeyInput.value.trim();
  const playlistInput  = document.getElementById('playlistId').value.trim();

  if (!apiKey) return alert('Enter your API key');
  if (!playlistInput ) return alert('Enter a playlist URL or ID');
  
  localStorage.setItem(API_KEY_STORAGE, apiKey);
  const playlistId = extractPlaylistId(playlistInput);

  await addPlaylistToRegistry(playlistId, apiKey);

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

window.addEventListener('keydown', (e) => {
  if (!isPlayerReady()) return;
  
  if (e.code === 'ArrowRight') {
    if (canTriggerAction()) playNext();
  } else if (e.code === 'ArrowLeft') {
    if (canTriggerAction()) playPrev();
  } else if (e.code === 'Space') {
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
    e.preventDefault(); // prevent page scrolling on space
  } 
});

// Media keys
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => {
    if (isPlayerReady()) player.playVideo();
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    if (isPlayerReady()) player.pauseVideo();
  });
  navigator.mediaSession.setActionHandler('previoustrack', () => {
    if (isPlayerReady() && canTriggerAction()) playPrev();
  });
  navigator.mediaSession.setActionHandler('nexttrack', () => {
    if (isPlayerReady() && canTriggerAction()) playNext();
  });
}

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









