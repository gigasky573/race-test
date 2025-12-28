const DEFAULT_STATE = {
    teams: [
        { id: '1', name: '', color: '', icon: '', points: 0 }
    ],
    map: {
        image: '',
        path: []
    },
    config: {
        url: 'http://localhost:8000/api/scores',
        pointsPerStretch: 50,
        totalGoals: 10,
        adventureName: "test"
    }
};

const APP_VERSION = '0.1'; // Increment to force reset

// --- State Management ---
let appState = JSON.parse(localStorage.getItem('raceTrackerState'));


if (!appState || appState.version !== APP_VERSION) {
    console.log('Resetting state to default (New Version)');
    appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    appState.version = APP_VERSION;
    saveState();
}


function saveState() {
    try {
        localStorage.setItem('raceTrackerState', JSON.stringify(appState));
        render();
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            console.warn('Storage quota exceeded! Attempting to clear map image to save critical data.');
            alert('Storage Full! The map image is too large. It will be cleared to save your teams and configuration. Please try a smaller image.');
            
            // Clear map image to recover space
            appState.map.image = '';
            
            // Try saving again without the image
            try {
                localStorage.setItem('raceTrackerState', JSON.stringify(appState));
                render();
            } catch (retryError) {
                alert('Critical Error: Cannot save changes even after clearing map. Please reset the app.');
            }
        } else {
            console.error('Save failed:', e);
        }
    }
}

function resetState() {
    if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
        appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
        saveState();
        location.reload();
    }
}

// --- DOM Elements ---
const els = {
    app: document.getElementById('app'),
    settingsModal: document.getElementById('settings-modal'),
    settingsToggle: document.getElementById('settings-toggle'),
    closeSettings: document.getElementById('close-settings'),
    mapContainer: document.getElementById('map-container'),
    raceMapImg: document.getElementById('race-map-img'),
    carsContainer: document.getElementById('cars-container'),
    championDisplay: document.getElementById('champion-display'),
    championName: document.getElementById('champion-name'),
    adventureTitle: document.getElementById('adventure-title'),

    // Settings
    tabs: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    teamsGrid: document.getElementById('teams-settings-grid'),
    mapUploadInput: document.getElementById('map-upload-input'),
    mapEditorCanvas: document.getElementById('map-editor-canvas'),
    clearPathBtn: document.getElementById('clear-path-btn'),
    saveMapBtn: document.getElementById('save-map-btn'),

    // Config Inputs
    adventureNameInput: document.getElementById('adventure-name-input'),
    urlInput: document.getElementById('sheet-url-input'),
    pointsStretchInput: document.getElementById('points-stretch-input'),
    totalGoalsInput: document.getElementById('total-goals-input'),
    saveConfigBtn: document.getElementById('save-config-btn'),
    resetAppBtn: document.getElementById('reset-app-btn')
};

// --- Initialization ---
function init() {
    setupEventListeners();
    setupSettingsUI();

    // Load Map Image
    if (appState.map.image) {
        setMapImage(appState.map.image);
    }

    // Start Polling Loop
    setInterval(fetchScores, 5000); // Poll every 5 seconds
    fetchScores(); // Initial fetch

    render();
    window.addEventListener('resize', updateOverlayBounds);
}

function setMapImage(src) {
    if (!els.raceMapImg) return;
    els.raceMapImg.onload = () => {
        updateOverlayBounds();
        renderMainPath();
    };
    els.raceMapImg.src = src;
    els.raceMapImg.classList.remove('hidden');
}

function setupEventListeners() {
    // Modal Toggles
    els.settingsToggle.addEventListener('click', () => els.settingsModal.classList.remove('hidden'));
    els.closeSettings.addEventListener('click', () => els.settingsModal.classList.add('hidden'));

    // Tabs
    els.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            els.tabs.forEach(t => t.classList.remove('active'));
            els.tabPanes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

            // Only init editor if on maps tab AND if it hasn't been initialized or path is empty (prevents overwriting unsaved work)
            if (tab.dataset.tab === 'maps') {
                // If we already have a tempPath with points, don't reset it from appState unless explicit clear
                if (tempPath.length === 0 && appState.map.path.length > 0) {
                     initMapEditor();
                } else if (!editorCtx) {
                     initMapEditor();
                } else {
                    // Just redraw if already initialized
                    drawEditor();
                }
            }
        });
    });

    // Config Actions
    els.saveConfigBtn.addEventListener('click', () => {
        appState.config.adventureName = els.adventureNameInput.value.trim() || DEFAULT_STATE.config.adventureName;
        appState.config.url = els.urlInput.value;
        appState.config.pointsPerStretch = parseInt(els.pointsStretchInput.value) || 10000;
        appState.config.totalGoals = parseInt(els.totalGoalsInput.value) || 10;
        saveState();
        alert('Configuration Saved!');
    });

    els.resetAppBtn.addEventListener('click', resetState);

    // Map Upload
    els.mapUploadInput.addEventListener('change', handleMapUpload);
}

// --- Core Logic: Data Fetching ---
async function fetchScores() {
    if (!appState.config.url) return;

    try {
        const response = await fetch(appState.config.url);
        const data = await response.json();
        console.log('API data:', data);
        applyApiData(data);
    } catch (error) {
        console.error("Error fetching scores:", error);
    }
}

function applyApiData(data) {
    const teamsData = extractTeamsFromApi(data);
    console.log('Parsed teams:', teamsData);
    if (!teamsData.length) return;

    const existingById = new Map(appState.teams.map(team => [String(team.id), team]));
    const mergedTeams = teamsData.map(team => {
        const existing = existingById.get(team.id);
        return {
            ...team,
            // Keep icons from local storage by team id; API doesn't supply icon
            icon: existing && existing.icon ? existing.icon : ''
        };
    });

    appState.teams = mergedTeams;
    saveState();
}

function extractTeamsFromApi(data) {
    if (!data) return [];

    const rawTeams = Array.isArray(data) ? data : data.teams;
    console.log('Raw teams:', rawTeams);
    if (!Array.isArray(rawTeams)) return [];

    return rawTeams.map((team, index) => {
        const points = Number(team.points ?? team.score ?? 0);
        return {
            id: String(team.id ?? index + 1),
            name: String(team.name ?? '').trim(),
            color: String(team.color ?? '#ffffff'),
            icon: '',
            points: Number.isFinite(points) ? points : 0
        };
    });
}
// --- Core Logic: Rendering ---
function render() {
    // Update Header
    els.adventureTitle.textContent = appState.config.adventureName;

    // Sort Teams by Score
    const sortedTeams = [...appState.teams].sort((a, b) => b.points - a.points);
    const leader = sortedTeams[0];

    // Update Champion Display
    if (leader.points > 0) {
        els.championDisplay.classList.remove('hidden');
        els.championName.textContent = leader.name;
        els.championDisplay.style.background = `linear-gradient(135deg, ${leader.color} 0%, #fff 100%)`;
    } else {
        els.championDisplay.classList.add('hidden');
    }

    // Render Cars on Map
    renderCars(sortedTeams);
    
    // Render Path on Main Map
    renderMainPath();
}

function renderMainPath() {
    const svg = document.getElementById('path-overlay');
    if (!svg) return;
    
    svg.innerHTML = '';

    if (!appState.map.path || appState.map.path.length < 2) return;

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none'); 
    
    const pointsStr = appState.map.path.map(p => `${p.x},${p.y}`).join(' ');
    
    polyline.setAttribute('points', pointsStr);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', 'rgba(255, 255, 255, 0.6)');
    polyline.setAttribute('stroke-width', '1');
    polyline.setAttribute('stroke-dasharray', '2,1');
    
    svg.appendChild(polyline);
    updateOverlayBounds();
}

function updateOverlayBounds() {
    const svg = document.getElementById('path-overlay');
    if (!svg || !els.mapContainer || !els.raceMapImg) return;

    const containerRect = els.mapContainer.getBoundingClientRect();
    const imgRect = els.raceMapImg.getBoundingClientRect();

    const offsetLeft = imgRect.left - containerRect.left;
    const offsetTop = imgRect.top - containerRect.top;

    svg.style.position = 'absolute';
    svg.style.left = `${offsetLeft}px`;
    svg.style.top = `${offsetTop}px`;
    svg.style.width = `${imgRect.width}px`;
    svg.style.height = `${imgRect.height}px`;
}

function renderCars(teams) {
    els.carsContainer.innerHTML = '';

    if (!appState.map.path || appState.map.path.length < 2) return;

    const totalRacePoints = appState.config.pointsPerStretch * appState.config.totalGoals;

    teams.forEach((team, index) => {
        // Calculate Progress (0 to 1)
        let progress = Math.min(1, Math.max(0, team.points / totalRacePoints));

        // Get Position on Path
        const pos = getPointOnPath(progress, appState.map.path);

        const carEl = document.createElement('div');
        carEl.className = `car-marker ${index === 0 ? 'leader' : ''}`;
        carEl.style.left = `${pos.x}%`;
        carEl.style.top = `${pos.y}%`;
        carEl.innerHTML = `
            <img src="${team.icon}" style="border: 2px solid ${team.color}; border-radius: 50%; background: #fff;">
            <div class="car-label" style="border-color: ${team.color};">
                <span class="car-label-name">${team.name}</span>
                <span class="car-label-points">${team.points.toLocaleString()} pts</span>
            </div>
        `;

        els.carsContainer.appendChild(carEl);
    });
}

// --- Helper: Path Interpolation ---
function getPointOnPath(progress, path) {

    if (path.length < 2) return { x: 0, y: 0 };

    // Calculate total path length
    let totalLength = 0;
    const segments = [];
    for (let i = 0; i < path.length - 1; i++) {
        const dx = path[i + 1].x - path[i].x;
        const dy = path[i + 1].y - path[i].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        segments.push({ len, start: path[i], end: path[i + 1] });
        totalLength += len;
    }

    let targetDist = totalLength * progress;

    // Find which segment we are on
    let currentDist = 0;
    for (const seg of segments) {
        if (currentDist + seg.len >= targetDist) {
            // We are in this segment
            const remaining = targetDist - currentDist;
            const ratio = remaining / seg.len;
            return {
                x: seg.start.x + (seg.end.x - seg.start.x) * ratio,
                y: seg.start.y + (seg.end.y - seg.start.y) * ratio
            };
        }
        currentDist += seg.len;
    }

    return path[path.length - 1]; // End of path
}

// --- Settings: Map Editor ---
let editorCtx = null;
let editorImage = null;
let tempPath = [];

function initMapEditor() {
    const canvas = els.mapEditorCanvas;
    editorCtx = canvas.getContext('2d');

    // Load image into canvas
    editorImage = new Image();
    editorImage.onload = () => {
        // Resize canvas to fit image aspect ratio but max width
        const aspect = editorImage.width / editorImage.height;
        canvas.width = 800;
        canvas.height = 800 / aspect;
        drawEditor();
    };
    editorImage.src = appState.map.image;

    // Load existing path
    tempPath = [...appState.map.path];

    // Click Listener
    canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / canvas.width * 100;
        const y = (e.clientY - rect.top) / canvas.height * 100;
        tempPath.push({ x, y });
        drawEditor();
    };

    els.clearPathBtn.onclick = () => {
        tempPath = [];
        drawEditor();
    };

    els.saveMapBtn.onclick = () => {
        appState.map.path = [...tempPath]; // Clone it
        saveState();
        alert('Map Path Saved! Coordinates: ' + appState.map.path.length);
        renderMainPath(); // Update the main view immediately
    };
}

function drawEditor() {
    if (!editorCtx || !editorImage) return;
    const w = els.mapEditorCanvas.width;
    const h = els.mapEditorCanvas.height;

    editorCtx.clearRect(0, 0, w, h);
    editorCtx.drawImage(editorImage, 0, 0, w, h);

    // Draw Path
    if (tempPath.length > 0) {
        editorCtx.strokeStyle = '#ef4444';
        editorCtx.lineWidth = 3;
        editorCtx.beginPath();
        editorCtx.moveTo(tempPath[0].x / 100 * w, tempPath[0].y / 100 * h);
        for (let i = 1; i < tempPath.length; i++) {
            editorCtx.lineTo(tempPath[i].x / 100 * w, tempPath[i].y / 100 * h);
        }
        editorCtx.stroke();

        // Draw Points
        editorCtx.fillStyle = '#fff';
        tempPath.forEach(p => {
            editorCtx.beginPath();
            editorCtx.arc(p.x / 100 * w, p.y / 100 * h, 4, 0, Math.PI * 2);
            editorCtx.fill();
        });
    }
}

function handleMapUpload(e) {
    const file = e.target.files[0];
    if (file) {
        compressImage(file, 1024, 0.7).then(compressedDataUrl => {
            appState.map.image = compressedDataUrl;
            document.getElementById('map-file-name').textContent = file.name;
            saveState();
            setMapImage(compressedDataUrl);
            initMapEditor();
        }).catch(err => {
            console.error("Compression failed", err);
            alert("Failed to process image. Please try another.");
        });
    }
}

// Helper: Image Compression
function compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Resize if too large
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

function setupSettingsUI() {
    // Populate Config Inputs
    els.adventureNameInput.value = appState.config.adventureName;
    els.urlInput.value = appState.config.url;
    els.pointsStretchInput.value = appState.config.pointsPerStretch;
    els.totalGoalsInput.value = appState.config.totalGoals;

    // Populate Teams Grid
    els.teamsGrid.innerHTML = appState.teams.map((team, index) => `
        <div class="team-card">
            <div class="form-group">
                <label>Team Name</label>
                <input type="text" value="${team.name}" onchange="updateTeam(${index}, 'name', this.value)">
            </div>
            <div class="form-group">
                <label>Icon URL (or GIF)</label>
                <div class="icon-input-group">
                    <input type="text" value="${team.icon}" onchange="updateTeam(${index}, 'icon', this.value)" placeholder="https://...">
                    <label class="btn-secondary btn-sm">
                        Upload
                        <input type="file" accept="image/*" onchange="handleTeamIconUpload(${index}, this)" hidden>
                    </label>
                </div>
            </div>
            <div class="form-group">
                <label>Color</label>
                <input type="color" value="${team.color}" onchange="updateTeam(${index}, 'color', this.value)">
            </div>
        </div>
    `).join('');

    // Add Save Button
    const saveBtnContainer = document.createElement('div');
    saveBtnContainer.className = 'form-actions';
    saveBtnContainer.style.marginTop = '20px';
    saveBtnContainer.innerHTML = `<button class="btn-primary" onclick="alert('Teams Saved!')">Save Changes</button>`;
    els.teamsGrid.appendChild(saveBtnContainer);
}

// Global function for inline event handlers
window.updateTeam = (index, field, value) => {
    // Ensure index is valid
    if (appState.teams[index]) {
        appState.teams[index][field] = value;
        saveState();
    }
};

window.handleTeamIconUpload = (index, input) => {
    // Input might be null if called incorrectly, but 'this' is passed
    if (!input || !input.files) return;
    
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            // Update state with Data URL
            const result = e.target.result;
            if (appState.teams[index]) {
                appState.teams[index].icon = result;
                saveState();
                
                const textInput = input.closest('.icon-input-group').querySelector('input[type="text"]');
                if (textInput) {
                    textInput.value = result;
                }
                
            }
        };
        reader.readAsDataURL(file);
    }
};

// Start
init();
