let player;
let videos = [];
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
        player.getIframe().setAttribute('tabindex', '-1');
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
  const failedVideoId = videos[currentIndex];

  console.warn(`Video playback error (code: ${errorCode}) on video ID: ${failedVideoId}. Skipping to next.`);
  
  if (errorCode === 100 || errorCode === 101 || errorCode === 150) {
    playNext();
  } else {
    alert(`YouTube Player Error (code: ${errorCode}) on video ID: ${failedVideoId}`);
  }
}

function isPlayerReady() {
  return (player && playerReady && typeof player.getPlayerState === 'function');
}

function playNext() {
  if (videos.length === 0) return;
  currentIndex = (currentIndex + 1) % videos.length;
  player.loadVideoById(videos[currentIndex].id);
  updateNowPlaying();
}

function playPrev() {
  if (videos.length === 0) return;
  currentIndex = (currentIndex - 1 + videos.length) % videos.length;
  player.loadVideoById(videos[currentIndex].id);
  updateNowPlaying();
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

function updateNowPlaying() {
  const nowPlayingEl = document.getElementById('nowPlaying');
  if (!videos.length) {
    nowPlayingEl.textContent = 'Currently playing: –';
    return;
  }

  const current = videos[currentIndex];
  const title = current?.title || 'Unknown Title';
  nowPlayingEl.textContent = `Currently playing: ${title}`;
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
  const videos = [];
  let nextPageToken = '';
  const maxResults = 50;

  while (true) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=${maxResults}&playlistId=${playlistId}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) throw new Error(data.error.message);
      if (!data.items || data.items.length === 0) break;

      data.items.forEach(item => {
        const videoId = item?.contentDetails?.videoId;
        const title = item?.snippet?.title;
        if (videoId && title && title !== 'Private video' && title !== 'Deleted video') {
          videos.push({ id: videoId, title });
        }
      });

      if (!data.nextPageToken) break;
      nextPageToken = data.nextPageToken;
    } catch (err) {
      console.warn('Skipping a page due to error:', err.message);
      break;
    }
  }

  console.log(`Fetched ${videos.length} videos for playlist ${playlistId}`);
  return videos;
}

async function loadPlaylist(playlistInput, apiKey, force = false) {
  let playlistId = extractPlaylistId(playlistInput);
  const statusEl = document.getElementById('status');
  const cacheKey = `playlist_${playlistId}`;
  const timestampKey = `playlist_${playlistId}_ts`;
  const cached = localStorage.getItem(cacheKey);
  const cachedTime = parseInt(localStorage.getItem(timestampKey), 10);

  if (!force && cached && cachedTime && Date.now() - cachedTime < CACHE_DURATION) {
    videos = JSON.parse(cached);
    shuffle(videos);
    currentIndex = 0;
    statusEl.innerText = `Loaded ${videos.length} videos from cache.`;
    player.loadVideoById(videos[currentIndex].id);
    updateNowPlaying();
    addPlaylistToRegistry(playlistId, apiKey);
    showGIFs(); // Display the GIFs
    return;
  }
  
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

  statusEl.innerText = 'Fetching playlist...';
  try {
    videos = await fetchPlaylistVideos(playlistId, apiKey);
    if (videos.length === 0) return alert('No videos found.');

    localStorage.setItem(cacheKey, JSON.stringify(videos));
    localStorage.setItem(timestampKey, Date.now());
    addPlaylistToRegistry(playlistId, apiKey);

    videoIds = videos;
    shuffle(videoIds);
    currentIndex = 0;
    statusEl.innerText = `Fetched ${videos.length} videos.`;
    player.loadVideoById(videos[currentIndex].id);
    updateNowPlaying();
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
  if (document.hidden) return;  
  if (document.activeElement !== document.body) return;
  
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
    setTimeout(() => {
      if (isPlayerReady()) player.playVideo();
    }, 0);
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    setTimeout(() => {
      if (isPlayerReady()) player.pauseVideo();
    }, 0);
  });
  navigator.mediaSession.setActionHandler('previoustrack', () => {
    setTimeout(() => {
      if (isPlayerReady() && canTriggerAction()) playPrev();
    }, 0);
  });
  navigator.mediaSession.setActionHandler('nexttrack', () => {
    setTimeout(() => {
      if (isPlayerReady() && canTriggerAction()) playNext();
    }, 0);
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















