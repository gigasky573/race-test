/**
 * Race Score Tracker - Main Logic
 */

// --- Default Configuration ---
const DEFAULT_STATE = {
    teams: [
        { id: 'red', name: 'Red Team', color: '#ef4444', icon: '', points: 0 },
        { id: 'yellow', name: 'Yellow Team', color: '#eab308', icon: '', points: 0 },
        { id: 'teal', name: 'Teal Team', color: '#14b8a6', icon: '', points: 0 },
        { id: 'green', name: 'Green Team', color: '#22c55e', icon: '', points: 0 }
    ],
    map: {
        image: '', // No default external image
        path: [] // Array of {x, y} coordinates (percentages)
    },
    config: {
        sheetUrl: '',
        pointsPerStretch: 10000,
        totalGoals: 10,
        adventureName: 'Bear's Hankel Race'
    }
};

const APP_VERSION = '1.1'; // Increment to force reset

// --- State Management ---
let appState = JSON.parse(localStorage.getItem('raceTrackerState'));

// Check version or if state is missing
if (!appState || appState.version !== APP_VERSION) {
    console.log('Resetting state to default (New Version)');
    appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    appState.version = APP_VERSION;
    saveState();
}

function saveState() {
    localStorage.setItem('raceTrackerState', JSON.stringify(appState));
    render();
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
    leaderboardList: document.getElementById('leaderboard-list'),
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
    sheetUrlInput: document.getElementById('sheet-url-input'),
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
        els.raceMapImg.src = appState.map.image;
        els.raceMapImg.classList.remove('hidden');
    }

    // Start Polling Loop
    setInterval(fetchScores, 5000); // Poll every 5 seconds
    fetchScores(); // Initial fetch

    render();
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

            if (tab.dataset.tab === 'maps') initMapEditor();
        });
    });

    // Config Actions
    els.saveConfigBtn.addEventListener('click', () => {
        appState.config.sheetUrl = els.sheetUrlInput.value;
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
    if (!appState.config.sheetUrl) return;

    try {
        const response = await fetch(appState.config.sheetUrl);
        const csvText = await response.text();
        parseCSV(csvText);
    } catch (error) {
        console.error("Error fetching scores:", error);
    }
}

function parseCSV(csvText) {
    // Simple CSV parser assuming "Team Name, Score" format or specific columns
    // For this demo, we'll look for rows that match our team IDs or Names
    const rows = csvText.split('\n').map(row => row.split(','));

    let updated = false;
    appState.teams.forEach(team => {
        // Try to find a row where the first column contains the team name (case insensitive)
        const row = rows.find(r => r[0] && r[0].toLowerCase().includes(team.name.toLowerCase()));
        if (row && row[1]) {
            const score = parseInt(row[1].replace(/[^0-9]/g, '')); // Remove non-numeric
            if (!isNaN(score) && score !== team.points) {
                team.points = score;
                updated = true;
            }
        }
    });

    if (updated) {
        saveState();
    }
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

    // Render Leaderboard
    els.leaderboardList.innerHTML = sortedTeams.map((team, index) => `
        <div class="leaderboard-item rank-${index + 1}" style="border-left: 4px solid ${team.color}">
            <div class="rank">#${index + 1}</div>
            <img src="${team.icon}" class="team-logo-small" alt="${team.name}">
            <div class="team-info">
                <h4>${team.name}</h4>
                <div class="team-score">${team.points.toLocaleString()} pts</div>
            </div>
        </div>
    `).join('');

    // Render Cars on Map
    renderCars(sortedTeams);
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
        carEl.innerHTML = `<img src="${team.icon}" style="border: 2px solid ${team.color}; border-radius: 50%; background: #fff;">`;

        els.carsContainer.appendChild(carEl);
    });
}

// --- Helper: Path Interpolation ---
function getPointOnPath(progress, path) {
    // Total length calculation could be complex. 
    // Simplified: Assume path segments are roughly equal or just interpolate based on index.
    // Better approach: Calculate total distance of path, then find segment.

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
        appState.map.path = tempPath;
        saveState();
        alert('Map Path Saved!');
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
        const reader = new FileReader();
        reader.onload = (event) => {
            appState.map.image = event.target.result;
            document.getElementById('map-file-name').textContent = file.name;
            initMapEditor(); // Reload editor with new image
        };
        reader.readAsDataURL(file);
    }
}

function setupSettingsUI() {
    // Populate Config Inputs
    els.sheetUrlInput.value = appState.config.sheetUrl;
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
}

// Global function for inline event handlers
window.updateTeam = (index, field, value) => {
    appState.teams[index][field] = value;
    saveState();
};

window.handleTeamIconUpload = (index, input) => {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            // Update state with Data URL
            appState.teams[index].icon = e.target.result;
            saveState();
            // Refresh UI to show new value/preview
            setupSettingsUI(); 
        };
        reader.readAsDataURL(file);
    }
};

// Start
init();
