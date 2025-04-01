import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

// --- Configuration ---
const BASE_ORB_COUNT = 5; // Orbs needed for Level 1
const LEVEL_ORB_INCREMENT = 1; // How many more orbs needed per level
const BASE_LIGHT_FADE_RATE = 3; // Fade rate for Level 1
const LEVEL_FADE_INCREMENT = 1.5; // How much faster fade rate gets per level
const FINAL_LEVEL = 100; // Set the last level number
const INITIAL_LIGHT_LEVEL = 100.0; // Start with full light each level
const LIGHT_BOOST_PER_ORB = 10; // Adjusted boost
const MIN_LIGHT_LEVEL = 10;
const ORB_RADIUS = 0.3;
const PLAYER_HEIGHT = 1.8;
const PLAYER_SPEED = 5.0;
const PLAYER_RADIUS = 0.4; // Slightly smaller radius for easier collision navigation
const COLLECTION_DISTANCE = PLAYER_RADIUS + ORB_RADIUS + 0.2;
const WORLD_SIZE = 30;
const WALL_HEIGHT = 8;
const EXIT_RADIUS = 1.5;
const JUMP_FORCE = 7.0;
const GRAVITY = 18.0;
const OBSTACLE_COUNT = 7; // Number of obstacles

// --- Camera Shake Config ( INCREASED FOR TESTING ) ---
const WALK_SHAKE_FREQUENCY = 7.0; // Keep frequency for now
const WALK_SHAKE_AMOUNT = 0.3; // Max +/- 30cm bob - Should be very obvious
const WALK_SHAKE_ROLL_AMOUNT = 0.05; // Max +/- ~3 degrees roll
const LAND_SHAKE_INTENSITY = 0.8; // Max +/- 80cm landing shake - Should be huge
const LAND_SHAKE_DURATION = 0.3;
const SHAKE_DAMPING = 5.0;

// --- Asset Paths ---
const TEXTURE_PATHS = {
  ground: "textures/ground.jpg",
  wall: "textures/wall.jpg",
  obstacle: "textures/obstacle.jpg",
  ceiling: "textures/ceiling.jpg",
};
const AUDIO_PATHS = {
  background: "audio/background.mp3",
  collect: "audio/collect.mp3",
  win: "audio/win.mp3",
  lose: "audio/lose.mp3",
  portal: "audio/portal.mp3",
  walk: "audio/walk.mp3", // <<< NEW: Add path for walking sound (looping)
  jump: "audio/jump.mp3", // <<< NEW: Add path for jump sound
  land: "audio/land.wav", // <<< NEW: Add path for landing sound
};
// ---

// --- Global Variables ---
let scene, camera, renderer, controls;
let moveForward = false,
  moveBackward = false,
  moveLeft = false,
  moveRight = false;
let clock = new THREE.Clock();
let orbs = [];
let obstacles = [];
let score = 0;
let currentLevel = 1;
let orbsNeededForLevel = BASE_ORB_COUNT;
let currentFadeRate = BASE_LIGHT_FADE_RATE;
let ambientLight;
let directionalLight;
let currentLightLevel = INITIAL_LIGHT_LEVEL;
let isGameOver = false;
let exitPortal = null;
let exitPortalActive = false;
let playerVelocityY = 0;
let canJump = true;
let isOnGround = true;
let assetsLoaded = false;
let isWalking = false;

// --- NEW: Touch Control State ---
let isTouchDevice = false;
let joystickActive = false;
let joystickStartPos = { x: 0, y: 0 };
let joystickCurrentPos = { x: 0, y: 0 };
let joystickDelta = { x: 0, y: 0 };
let lookTouchId = null;
let lookStartPos = { x: 0, y: 0 };
let lookCurrentPos = { x: 0, y: 0 };
let lookDelta = { x: 0, y: 0 };
const JOYSTICK_MAX_RADIUS = 40; // Max distance thumb moves from center
const LOOK_SENSITIVITY = 0.003;

// --- NEW: Camera Shake State ---
let shakeIntensity = 0;
let shakeTime = 0;
let walkPhase = 0; // Tracks progress in the walk cycle for smooth shake
let previousCameraLocalPosition = new THREE.Vector3(); // To reset shake each frame

// --- Asset Loaders & Assets ---
const textureLoader = new THREE.TextureLoader();
const audioLoader = new THREE.AudioLoader();
let groundTexture, wallTexture, obstacleTexture, ceilingTexture;
let listener;
let backgroundMusic, collectSound, winSound, loseSound, portalSound;
let walkSound, jumpSound, landSound;

// --- DOM Elements ---
const blocker = document.getElementById("blocker");
const instructions = document.getElementById("instructions");
const scoreElement = document.getElementById("score");
const lightLevelElement = document.getElementById("light-level");
const messageElement = document.getElementById("message");
const canvas = document.getElementById("gameCanvas");
// --- NEW: Touch Control Elements ---
const touchControlsElement = document.getElementById("touch-controls");
const joystickArea = document.getElementById("touch-joystick-area");
const joystickThumb = document.getElementById("touch-joystick-thumb");
const lookArea = document.getElementById("touch-look-area");
const jumpButton = document.getElementById("touch-jump-button");

// --- Initialization ---
function init() {
  listener = new THREE.AudioListener(); // Needs to be created early

  loadAssets(() => {
    assetsLoaded = true;
    console.log("All assets loaded.");

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111); // Slightly lighter background with shadows
    scene.fog = new THREE.Fog(0x111111, 5, WORLD_SIZE * 0.75); // Match background, adjust fog distance

    camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.name = "PerspectiveCamera";
    // camera.add(listener); // Attach listener to camera

    // --- NEW: Create a Shake Container ---
    const cameraShakeContainer = new THREE.Group();
    cameraShakeContainer.name = "ShakeContainer"; // For debugging
    camera.add(cameraShakeContainer); // Add container as a child of the main camera object

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    // --- Enable Shadow Maps ---
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    // ---

    // --- Lighting (Configured for Shadows) ---
    ambientLight = new THREE.AmbientLight(0xffffff, 0.15); // Increase ambient slightly
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Adjusted intensity
    directionalLight.position.set(15, 25, 10); // Angled position for shadows
    directionalLight.castShadow = true; // Enable shadow casting
    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 1024; // Power of 2 (e.g., 1024, 2048)
    directionalLight.shadow.mapSize.height = 1024;
    const shadowCamSize = WORLD_SIZE * 0.7; // Area shadows cover
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50; // Must encompass scene height
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    directionalLight.shadow.bias = -0.001; // Tweak if shadow acne appears
    // ---
    scene.add(directionalLight);

    // Optional: Shadow camera helper (for debugging shadow frustum)
    // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // scene.add(shadowHelper);
    // Optional: Directional light helper
    // const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
    // scene.add(lightHelper);

    controls = new PointerLockControls(camera, document.body);
    scene.add(controls.getObject());
    setupControls();

    // Build Scene Geometry (AFTER configuring renderer/lights)
    createSceneGeometry();

    // Setup Initial Level State
    setupLevel(1);

    // Handle window resize
    window.addEventListener("resize", onWindowResize);

    // Start Animation Loop
    animate();
  });
}

// --- Asset Loading Function (Textures & Audio) ---
function loadAssets(callback) {
  let texturesLoaded = 0;
  let audioLoaded = 0;
  const totalTextures = Object.keys(TEXTURE_PATHS).length;
  const totalAudio = Object.keys(AUDIO_PATHS).length; // <<< UPDATED count

  const checkAllLoaded = () => {
    if (
      texturesLoaded === totalTextures &&
      audioLoaded === totalAudio &&
      callback
    ) {
      callback();
    }
  };
  const onTextureError = (url) => (err) => {
    console.error(`Error loading texture: ${url}`, err);
    texturesLoaded++;
    checkAllLoaded();
  };
  const onAudioError = (url) => (err) => {
    console.error(`Error loading audio: ${url}`, err);
    audioLoaded++;
    checkAllLoaded();
  };

  console.log("Loading assets...");
  // Load Textures
  groundTexture = textureLoader.load(
    TEXTURE_PATHS.ground,
    () => {
      texturesLoaded++;
      checkAllLoaded();
    },
    undefined,
    onTextureError(TEXTURE_PATHS.ground)
  );
  wallTexture = textureLoader.load(
    TEXTURE_PATHS.wall,
    () => {
      texturesLoaded++;
      checkAllLoaded();
    },
    undefined,
    onTextureError(TEXTURE_PATHS.wall)
  );
  obstacleTexture = textureLoader.load(
    TEXTURE_PATHS.obstacle,
    () => {
      texturesLoaded++;
      checkAllLoaded();
    },
    undefined,
    onTextureError(TEXTURE_PATHS.obstacle)
  );
  ceilingTexture = textureLoader.load(
    TEXTURE_PATHS.ceiling,
    () => {
      texturesLoaded++;
      checkAllLoaded();
    },
    undefined,
    onTextureError(TEXTURE_PATHS.ceiling)
  );

  // Load Audio
  backgroundMusic = new THREE.Audio(listener);
  audioLoader.load(
    AUDIO_PATHS.background,
    (buffer) => {
      backgroundMusic.setBuffer(buffer);
      backgroundMusic.setLoop(true);
      backgroundMusic.setVolume(0.3);
      audioLoaded++;
      checkAllLoaded();
    },
    undefined,
    onAudioError(AUDIO_PATHS.background)
  );

  portalSound = new THREE.Audio(listener);
  audioLoader.load(
    AUDIO_PATHS.portal,
    (buffer) => {
      portalSound.setBuffer(buffer);
      portalSound.setLoop(false);
      portalSound.setVolume(0.7);
      audioLoaded++;
      checkAllLoaded();
    },
    undefined,
    onAudioError(AUDIO_PATHS.collect) // Typo fixed from original code
  );

  collectSound = new THREE.Audio(listener);
  audioLoader.load(
    AUDIO_PATHS.collect,
    (buffer) => {
      collectSound.setBuffer(buffer);
      collectSound.setLoop(false);
      collectSound.setVolume(0.7);
      audioLoaded++;
      checkAllLoaded();
    },
    undefined,
    onAudioError(AUDIO_PATHS.collect)
  );
  winSound = new THREE.Audio(listener);
  audioLoader.load(
    AUDIO_PATHS.win,
    (buffer) => {
      winSound.setBuffer(buffer);
      winSound.setLoop(false);
      winSound.setVolume(0.8);
      audioLoaded++;
      checkAllLoaded();
    },
    undefined,
    onAudioError(AUDIO_PATHS.win)
  );
  loseSound = new THREE.Audio(listener);
  audioLoader.load(
    AUDIO_PATHS.lose,
    (buffer) => {
      loseSound.setBuffer(buffer);
      loseSound.setLoop(false);
      loseSound.setVolume(0.8);
      audioLoaded++;
      checkAllLoaded();
    },
    undefined,
    onAudioError(AUDIO_PATHS.lose)
  );

  // --- NEW: Load Movement Sounds ---
  walkSound = new THREE.Audio(listener);
  audioLoader.load(
    AUDIO_PATHS.walk,
    (buffer) => {
      walkSound.setBuffer(buffer);
      walkSound.setLoop(true); // Loop the walking sound
      walkSound.setVolume(0.2); // Adjust volume as needed
      audioLoaded++;
      checkAllLoaded();
    },
    undefined,
    onAudioError(AUDIO_PATHS.walk)
  );

  jumpSound = new THREE.Audio(listener);
  audioLoader.load(
    AUDIO_PATHS.jump,
    (buffer) => {
      jumpSound.setBuffer(buffer);
      jumpSound.setLoop(false);
      jumpSound.setVolume(0.1); // Adjust volume as needed
      audioLoaded++;
      checkAllLoaded();
    },
    undefined,
    onAudioError(AUDIO_PATHS.jump)
  );

  landSound = new THREE.Audio(listener);
  audioLoader.load(
    AUDIO_PATHS.land,
    (buffer) => {
      landSound.setBuffer(buffer);
      landSound.setLoop(false);
      landSound.setVolume(0.1); // Adjust volume as needed
      audioLoaded++;
      checkAllLoaded();
    },
    undefined,
    onAudioError(AUDIO_PATHS.land)
  );
  // --- End NEW ---
}

function setupControls() {
  if (isTouchDevice) {
    // --- Touch Device Setup ---
    blocker.style.display = "none"; // Hide blocker immediately
    touchControlsElement.style.display = "block"; // Show touch controls

    // Joystick Listeners
    joystickArea.addEventListener("touchstart", handleJoystickStart, {
      passive: false,
    });
    joystickArea.addEventListener("touchmove", handleJoystickMove, {
      passive: false,
    });
    joystickArea.addEventListener("touchend", handleJoystickEnd);
    joystickArea.addEventListener("touchcancel", handleJoystickEnd); // Handle cancellation

    // Look Area Listeners
    lookArea.addEventListener("touchstart", handleLookStart, {
      passive: false,
    });
    lookArea.addEventListener("touchmove", handleLookMove, { passive: false });
    lookArea.addEventListener("touchend", handleLookEnd);
    lookArea.addEventListener("touchcancel", handleLookEnd);

    // Jump Button Listener
    jumpButton.addEventListener("touchstart", handleJumpPress, {
      passive: false,
    });

    // Modify instructions element for touch (optional, could hide it too)
    instructions.innerHTML = `<p style="font-size: 1.2em;">Level: ${currentLevel}</p>
                              <p>Move: Left Stick / Look: Right Screen / Jump: Button</p>
                              <p>Collect ${orbsNeededForLevel} Orbs!</p>`;
    instructions.style.cursor = "default"; // No click needed

    // Prevent default touch behaviors like scrolling/zooming on the game area
    canvas.addEventListener("touchstart", (e) => e.preventDefault());
    canvas.addEventListener("touchmove", (e) => e.preventDefault());
    // Start background music automatically after a user interaction (like the first touch)
    // We'll add a flag and start it on the first touch event handled.
    let firstInteraction = false;
    const startMusicOnInteraction = () => {
      if (
        !firstInteraction &&
        backgroundMusic &&
        backgroundMusic.buffer &&
        !backgroundMusic.isPlaying &&
        !isGameOver
      ) {
        backgroundMusic
          .play()
          .catch((e) => console.error("Audio play failed:", e));
        firstInteraction = true;
        // Remove these listeners after first interaction
        joystickArea.removeEventListener("touchstart", startMusicOnInteraction);
        lookArea.removeEventListener("touchstart", startMusicOnInteraction);
        jumpButton.removeEventListener("touchstart", startMusicOnInteraction);
      }
    };
    joystickArea.addEventListener("touchstart", startMusicOnInteraction, {
      once: true,
    });
    lookArea.addEventListener("touchstart", startMusicOnInteraction, {
      once: true,
    });
    jumpButton.addEventListener("touchstart", startMusicOnInteraction, {
      once: true,
    });
  } else {
    // --- Desktop (Pointer Lock) Setup ---
    touchControlsElement.style.display = "none"; // Ensure touch controls are hidden
    instructions.addEventListener("click", () => {
      if (!assetsLoaded) {
        console.log("Assets not loaded yet.");
        messageElement.classList.remove("hidden");
        messageElement.textContent = "Loading assets, please wait...";
        return;
      }
      if (isGameOver) {
        resetGame();
      } else {
        controls.lock();
      }
    });

    controls.addEventListener("lock", () => {
      instructions.parentElement.style.display = "none";
      messageElement.textContent = "";
      messageElement.classList.add("hidden");
      if (backgroundMusic && !backgroundMusic.isPlaying && !isGameOver) {
        backgroundMusic.play();
      }
    });

    controls.addEventListener("unlock", () => {
      if (!isGameOver) {
        // Only show pause screen if not game over
        instructions.parentElement.style.display = "flex";
        // messageElement.textContent = "Paused";
        if (backgroundMusic && backgroundMusic.isPlaying) {
          backgroundMusic.pause();
        }
        if (walkSound && walkSound.isPlaying) {
          walkSound.pause();
        }
        isWalking = false;
      } else {
        // If game over, blocker stays visible but might show different text
        instructions.parentElement.style.display = "flex"; // Ensure it's visible for restart message
      }
    });

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
  }
}

// --- Helper to set Game Over instructions ---
function setGameOverInstructions(title = "Game Over! Tap/Click to Restart") {
  // Modified text
  instructions.querySelector("p:first-child").textContent = title;
  instructions.querySelector("p:nth-child(2)").innerHTML = `
         Final Score: ${score} Orbs<br> Reached Level: ${currentLevel}<br>---<br>
         ${
           isTouchDevice
             ? "Tap Screen to Restart"
             : "Move: WASD / Look: MOUSE / Jump: SPACE"
         }
     `;
  // On touch devices, we need a way to trigger the restart
  if (isTouchDevice) {
    const restartHandler = () => {
      resetGame();
      blocker.removeEventListener("click", restartHandler); // Remove listener after reset
      instructions.removeEventListener("click", restartHandler); // Also check instructions element
    };
    // Use blocker as the main restart trigger area on touch
    blocker.style.display = "flex"; // Make sure blocker is visible
    blocker.style.cursor = "pointer";
    blocker.addEventListener("click", restartHandler, { once: true });
    instructions.addEventListener("click", restartHandler, { once: true }); // Add to instructions too just in case
  } else {
    // Desktop uses the existing instruction click handler
    instructions.style.cursor = "pointer";
  }
}

// --- Create Static Scene Geometry ---
function createSceneGeometry() {
  // Ground (Receives Shadows)
  const groundGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
  groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(WORLD_SIZE / 4, WORLD_SIZE / 4);
  groundTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: groundTexture,
    color: 0xffffff,
  }); // Removed DoubleSide - not needed if camera stays above
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true; // <<< Enable receiving shadows
  scene.add(ground);

  // Ceiling (Receives Shadows)
  createCeiling();

  // Walls (Receive Shadows)
  createWalls();

  // Obstacles (Cast and Receive Shadows)
  addObstacles(OBSTACLE_COUNT);
}

// --- Ceiling Creation ---
function createCeiling() {
  const ceilingGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
  ceilingTexture.wrapS = ceilingTexture.wrapT = THREE.RepeatWrapping;
  ceilingTexture.repeat.set(WORLD_SIZE / 4, WORLD_SIZE / 4);
  ceilingTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    map: ceilingTexture,
    color: 0xffffff,
  }); // Removed DoubleSide
  const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
  ceiling.position.y = WALL_HEIGHT;
  ceiling.rotation.x = Math.PI / 2;
  ceiling.receiveShadow = true; // <<< Enable receiving shadows
  scene.add(ceiling);
}

// --- Wall Creation ---
function createWalls() {
  const wallThickness = 0.5;
  const wallSegmentLength = WORLD_SIZE + wallThickness;
  const wallGeometryEW = new THREE.BoxGeometry(
    wallSegmentLength,
    WALL_HEIGHT,
    wallThickness
  );
  const wallGeometryNS = new THREE.BoxGeometry(
    wallThickness,
    WALL_HEIGHT,
    wallSegmentLength
  );
  wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
  wallTexture.repeat.set(WORLD_SIZE / 4, WALL_HEIGHT / 4);
  wallTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const wallMaterial = new THREE.MeshStandardMaterial({
    map: wallTexture,
    color: 0xffffff,
  });

  const createWall = (geometry, position) => {
    const wall = new THREE.Mesh(geometry, wallMaterial);
    wall.position.copy(position);
    wall.receiveShadow = true; // <<< Enable receiving shadows
    scene.add(wall);
    return wall;
  };
  createWall(
    wallGeometryEW,
    new THREE.Vector3(0, WALL_HEIGHT / 2, -WORLD_SIZE / 2)
  ); // Z+ wall
  createWall(
    wallGeometryEW,
    new THREE.Vector3(0, WALL_HEIGHT / 2, WORLD_SIZE / 2)
  ); // Z- wall
  createWall(
    wallGeometryNS,
    new THREE.Vector3(WORLD_SIZE / 2, WALL_HEIGHT / 2, 0)
  ); // X+ wall
  createWall(
    wallGeometryNS,
    new THREE.Vector3(-WORLD_SIZE / 2, WALL_HEIGHT / 2, 0)
  ); // X- wall
}

// --- Obstacles (Store meshes, bounding boxes, cast/receive shadows) ---
function addObstacles(count) {
  obstacles = [];
  const boxGeometry = new THREE.BoxGeometry(1, 5, 1);
  boxGeometry.computeBoundingBox(); // Only need to compute once
  obstacleTexture.wrapS = obstacleTexture.wrapT = THREE.RepeatWrapping;
  obstacleTexture.repeat.set(1, 3);
  obstacleTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const boxMaterial = new THREE.MeshStandardMaterial({
    map: obstacleTexture,
    color: 0xffffff,
  });

  let attempts = 0;
  const maxAttempts = count * 5;
  for (let i = 0; i < count && attempts < maxAttempts; attempts++) {
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    box.userData.boundingBox = new THREE.Box3(); // Create unique BB per obstacle
    // --- Enable Shadow Casting/Receiving ---
    box.castShadow = true;
    box.receiveShadow = true;
    // ---
    box.position.set(
      (Math.random() - 0.5) * (WORLD_SIZE * 0.8),
      2.5, // Center height of the box
      (Math.random() - 0.5) * (WORLD_SIZE * 0.8)
    );
    box.updateMatrixWorld(true); // IMPORTANT: Update matrix before calculating world bounding box
    box.userData.boundingBox
      .copy(box.geometry.boundingBox)
      .applyMatrix4(box.matrixWorld);

    const distFromCenter = Math.max(
      Math.abs(box.position.x),
      Math.abs(box.position.z)
    );
    // Check proximity to origin and other obstacles (simple distance check)
    let tooClose = false;
    for (const existing of obstacles) {
      if (box.position.distanceTo(existing.position) < 3.0) {
        // Min distance between obstacles
        tooClose = true;
        break;
      }
    }

    if (
      box.position.distanceTo(new THREE.Vector3(0, PLAYER_HEIGHT, 0)) > 4 && // Not too close to spawn
      distFromCenter < WORLD_SIZE / 2 - 2 && // Not too close to outer walls
      !tooClose
    ) {
      scene.add(box);
      obstacles.push(box);
      i++;
    }
  }
  if (attempts >= maxAttempts) console.warn("Could not place all obstacles.");
}

// --- Light Orbs Creation ---
function createOrbs(count) {
  orbs.forEach((orb) => scene.remove(orb));
  orbs = [];
  const orbGeometry = new THREE.SphereGeometry(ORB_RADIUS, 16, 16);
  const orbMaterial = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    emissive: 0xffffaa,
    emissiveIntensity: 3,
  });
  let attempts = 0;
  const maxAttempts = count * 5;
  for (let i = 0; i < count && attempts < maxAttempts; attempts++) {
    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    const minHeight = PLAYER_HEIGHT * 0.8;
    const maxHeight = PLAYER_HEIGHT + 1.2;
    const yPosition = minHeight + Math.random() * (maxHeight - minHeight);
    const finalY = Math.min(yPosition, WALL_HEIGHT - ORB_RADIUS * 2); // Ensure below ceiling
    orb.position.set(
      (Math.random() - 0.5) * (WORLD_SIZE * 0.8),
      finalY,
      (Math.random() - 0.5) * (WORLD_SIZE * 0.8)
    );

    const distFromCenter = Math.max(
      Math.abs(orb.position.x),
      Math.abs(orb.position.z)
    );

    // Check proximity to obstacles
    let tooCloseToObstacle = false;
    const orbBox = new THREE.Box3().setFromCenterAndSize(
      orb.position,
      new THREE.Vector3(ORB_RADIUS * 2, ORB_RADIUS * 2, ORB_RADIUS * 2)
    );
    for (const obstacle of obstacles) {
      if (
        orbBox.intersectsBox(
          obstacle.userData.boundingBox.clone().expandByScalar(0.5)
        )
      ) {
        // Check slightly larger box
        tooCloseToObstacle = true;
        break;
      }
    }

    if (
      orb.position.distanceTo(new THREE.Vector3(0, PLAYER_HEIGHT, 0)) > 3 && // Min distance from spawn
      distFromCenter < WORLD_SIZE / 2 - 1 && // Not too close to outer walls
      !tooCloseToObstacle
    ) {
      orbs.push(orb);
      scene.add(orb);
      i++;
    }
  }
  if (attempts >= maxAttempts) console.warn("Could not place all orbs.");
}

// --- MODIFIED: Exit Portal Creation (Add Glow) ---
function createExitPortal() {
  if (exitPortal) {
    scene.remove(exitPortal);
    // Ensure light is removed if it exists
    const oldLight = exitPortal.children.find((child) => child.isPointLight);
    if (oldLight) exitPortal.remove(oldLight);
    exitPortal = null;
  } // Remove old one first

  const portalGeometry = new THREE.TorusGeometry(EXIT_RADIUS, 0.2, 16, 100);
  const portalColor = 0x00ffff; // Store color
  const portalMaterial = new THREE.MeshStandardMaterial({
    color: portalColor,
    emissive: portalColor, // Use same color for emission
    emissiveIntensity: 1.5, // Keep some base emission
    side: THREE.DoubleSide,
  });
  exitPortal = new THREE.Mesh(portalGeometry, portalMaterial);

  const angle = Math.random() * Math.PI * 2;
  const radius = WORLD_SIZE * 0.3 + Math.random() * (WORLD_SIZE * 0.15);
  exitPortal.position.set(
    Math.cos(angle) * radius,
    PLAYER_HEIGHT, // Place at player eye level for visibility
    Math.sin(angle) * radius
  );
  exitPortal.rotation.y = Math.PI / 2; // Rotate to face inwards generally

  // --- ADDED: Portal Glow Light ---
  const portalLight = new THREE.PointLight(portalColor, 2.5, EXIT_RADIUS * 3); // Color, Intensity, Distance
  portalLight.castShadow = false; // Portal light should not cast shadows
  exitPortal.add(portalLight); // Add light as a child of the portal mesh
  // ---

  scene.add(exitPortal);
  exitPortalActive = true;
  if (portalSound && portalSound.buffer) portalSound.play(); // Check buffer before playing
  messageElement.textContent = "Exit Portal Revealed!";
  messageElement.classList.remove("hidden");
  setTimeout(() => {
    if (messageElement.textContent === "Exit Portal Revealed!")
      messageElement.classList.add("hidden");
    messageElement.textContent = "";
  }, 2000);
  console.log("Exit portal created at:", exitPortal.position);
}

// --- Calculate Level Parameters ---
function getOrbsForLevel(level) {
  return BASE_ORB_COUNT + (level - 1) * LEVEL_ORB_INCREMENT;
}
function getFadeRateForLevel(level) {
  return BASE_LIGHT_FADE_RATE + (level - 1) * LEVEL_FADE_INCREMENT;
}

// --- Setup Level Function ---
function setupLevel(level) {
  console.log(`Setting up Level ${level}`);
  currentLevel = level;
  orbsNeededForLevel = getOrbsForLevel(level);
  currentFadeRate = getFadeRateForLevel(level);
  score = 0;
  currentLightLevel = INITIAL_LIGHT_LEVEL;
  isGameOver = false;
  exitPortalActive = false;
  isWalking = false; // <<< NEW: Reset walking state

  // Reset player position and orientation safely
  if (controls) {
    const p = controls.getObject();
    p.position.set(0, PLAYER_HEIGHT, 0);
    p.rotation.set(0, 0, 0); // Reset object rotation
  }

  playerVelocityY = 0;
  canJump = true;
  isOnGround = true;

  // Remove old portal and stop its sound
  if (exitPortal) {
    scene.remove(exitPortal);
    const oldLight = exitPortal.children.find((child) => child.isPointLight);
    if (oldLight) exitPortal.remove(oldLight);
    exitPortal = null;
  }
  if (portalSound && portalSound.isPlaying) portalSound.stop();

  // Clear existing obstacles and orbs before creating new ones
  obstacles.forEach((obstacle) => scene.remove(obstacle));
  obstacles = [];
  orbs.forEach((orb) => scene.remove(orb));
  orbs = [];

  // Create new level elements
  addObstacles(OBSTACLE_COUNT); // Create obstacles *before* orbs to avoid overlap checks
  createOrbs(orbsNeededForLevel);

  updateHUD();
  messageElement.textContent = `Level ${level}`;
  messageElement.classList.remove("hidden");
  setTimeout(() => {
    if (messageElement.textContent === `Level ${level}`)
      messageElement.classList.add("hidden");
    messageElement.textContent = "";
  }, 2500);

  // Update instructions
  instructions.querySelector("p:first-child").textContent = "Click to Play";
  instructions.querySelector(
    "p:nth-child(2)"
  ).innerHTML = `Level: ${currentLevel}<br>Move: WASD / Look: MOUSE / Jump: SPACE<br>Collect ${orbsNeededForLevel} Light Orbs!<br>Find the Exit Portal.`;

  // Stop end-game sounds
  if (winSound && winSound.isPlaying) winSound.stop();
  if (loseSound && loseSound.isPlaying) loseSound.stop();
  if (walkSound && walkSound.isPlaying) walkSound.stop(); // <<< NEW: Stop walk sound
  // if (backgroundMusic && backgroundMusic.isPlaying) backgroundMusic.pause(); // Keep background music playing potentially
}

// --- Event Handlers ---
function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
function onKeyDown(event) {
  if (isTouchDevice) return; // Ignore keyboard if touch is active
  switch (event.code) {
    case "KeyW":
    case "ArrowUp":
      moveForward = true;
      break;
    case "KeyA":
    case "ArrowLeft":
      moveLeft = true;
      break;
    case "KeyS":
    case "ArrowDown":
      moveBackward = true;
      break;
    case "KeyD":
    case "ArrowRight":
      moveRight = true;
      break;
    case "Space":
      if (canJump && !isGameOver && controls && controls.isLocked) {
        // Check if locked
        playerVelocityY = JUMP_FORCE;
        canJump = false;
        isOnGround = false;
        // <<< NEW: Play Jump Sound >>>
        if (jumpSound && jumpSound.buffer) {
          if (jumpSound.isPlaying) jumpSound.stop(); // Stop if playing, then play
          jumpSound.play();
        }
        // <<< NEW: Stop walking sound when jumping >>>
        if (walkSound && walkSound.isPlaying) {
          walkSound.stop();
          isWalking = false;
        }
      }
      break;
  }
}
function onKeyUp(event) {
  switch (event.code) {
    case "KeyW":
    case "ArrowUp":
      moveForward = false;
      break;
    case "KeyA":
    case "ArrowLeft":
      moveLeft = false;
      break;
    case "KeyS":
    case "ArrowDown":
      moveBackward = false;
      break;
    case "KeyD":
    case "ArrowRight":
      moveRight = false;
      break;
  }
}

// --- NEW: Touch Handlers ---
function handleJoystickStart(event) {
  event.preventDefault();
  if (isGameOver) return;
  joystickActive = true;
  const touch = event.changedTouches[0];
  const rect = joystickArea.getBoundingClientRect();
  joystickStartPos = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  joystickCurrentPos = { x: touch.clientX, y: touch.clientY };
  // Center thumb initially
  joystickThumb.style.transform = "translate(-50%, -50%)";
  handleJoystickMove(event); // Process initial position
}

function handleJoystickMove(event) {
  event.preventDefault();
  if (!joystickActive || isGameOver) return;
  const touch = event.changedTouches[0];
  joystickCurrentPos = { x: touch.clientX, y: touch.clientY };

  let dx = joystickCurrentPos.x - joystickStartPos.x;
  let dy = joystickCurrentPos.y - joystickStartPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Clamp movement vector to joystick radius
  if (distance > JOYSTICK_MAX_RADIUS) {
    dx = (dx / distance) * JOYSTICK_MAX_RADIUS;
    dy = (dy / distance) * JOYSTICK_MAX_RADIUS;
  }

  // Update thumb position visually (relative to joystick center)
  joystickThumb.style.left = `calc(50% + ${dx}px)`;
  joystickThumb.style.top = `calc(50% + ${dy}px)`;

  // Determine movement flags based on direction and threshold
  const threshold = JOYSTICK_MAX_RADIUS * 0.2; // Need to move thumb a bit

  joystickDelta = { x: dx / JOYSTICK_MAX_RADIUS, y: dy / JOYSTICK_MAX_RADIUS }; // Normalized delta [-1, 1]

  // Map Y delta to Forward/Backward (Inverted Y axis for screen coords)
  moveForward = joystickDelta.y < -threshold;
  moveBackward = joystickDelta.y > threshold;

  // Map X delta to Left/Right
  moveLeft = joystickDelta.x < -threshold;
  moveRight = joystickDelta.x > threshold;
}

function handleJoystickEnd(event) {
  if (!joystickActive) return;
  joystickActive = false;
  moveForward = moveBackward = moveLeft = moveRight = false;
  // Reset thumb position
  joystickThumb.style.left = "50%";
  joystickThumb.style.top = "50%";
  joystickThumb.style.transform = "translate(-50%, -50%)";
  joystickDelta = { x: 0, y: 0 };
}

function handleLookStart(event) {
  event.preventDefault();
  if (isGameOver || lookTouchId !== null) return; // Allow only one look touch
  const touch = event.changedTouches[0];
  lookTouchId = touch.identifier;
  lookStartPos = { x: touch.clientX, y: touch.clientY };
  lookCurrentPos = { x: touch.clientX, y: touch.clientY }; // Initialize current pos
  lookDelta = { x: 0, y: 0 };
}

function handleLookMove(event) {
  event.preventDefault();
  if (isGameOver || lookTouchId === null) return;

  let foundTouch = null;
  for (let i = 0; i < event.changedTouches.length; i++) {
    if (event.changedTouches[i].identifier === lookTouchId) {
      foundTouch = event.changedTouches[i];
      break;
    }
  }

  if (!foundTouch) return; // Touch not found

  const prevLookPos = { ...lookCurrentPos }; // Store previous position
  lookCurrentPos = { x: foundTouch.clientX, y: foundTouch.clientY };

  lookDelta = {
    x: lookCurrentPos.x - prevLookPos.x,
    y: lookCurrentPos.y - prevLookPos.y,
  };

  // --- Apply Manual Rotation ---
  const playerObject = controls.getObject();
  const cam = camera; // Camera is child of playerObject

  // Horizontal rotation (Yaw) - Rotate the parent object
  playerObject.rotation.y -= lookDelta.x * LOOK_SENSITIVITY;

  // Vertical rotation (Pitch) - Rotate the camera itself
  cam.rotation.x -= lookDelta.y * LOOK_SENSITIVITY;

  // Clamp vertical rotation to prevent looking upside down
  cam.rotation.x = Math.max(
    -Math.PI / 2 + 0.1,
    Math.min(Math.PI / 2 - 0.1, cam.rotation.x)
  );
  // ---
}

function handleLookEnd(event) {
  for (let i = 0; i < event.changedTouches.length; i++) {
    if (event.changedTouches[i].identifier === lookTouchId) {
      lookTouchId = null;
      lookDelta = { x: 0, y: 0 };
      break;
    }
  }
}

function handleJumpPress(event) {
  event.preventDefault(); // Prevent potential double actions (like zoom)
  triggerJump();
}

// --- Common Jump Logic ---
function triggerJump() {
  // Can jump if not game over and (on desktop: controls locked) or (on touch: touch is active)
  const canPerformAction =
    !isGameOver && (!isTouchDevice ? controls.isLocked : true);

  if (canJump && canPerformAction) {
    playerVelocityY = JUMP_FORCE;
    canJump = false;
    isOnGround = false;

    if (jumpSound && jumpSound.buffer) {
      if (jumpSound.isPlaying) jumpSound.stop();
      jumpSound.play();
    }
    if (walkSound && walkSound.isPlaying) {
      walkSound.stop();
      isWalking = false;
    }
    // Trigger landing shake (will activate when isOnGround becomes true) - handled in updatePlayer
  }
}

// --- Game Logic ---

function updatePlayer(delta) {
  const canMove = !isGameOver && (isTouchDevice || controls.isLocked);
  if (!controls || !canMove) {
    if (walkSound && walkSound.isPlaying) {
      walkSound.stop(); // Stop walk sound if paused/game over
    }
    isWalking = false;
    return;
  }

  const moveSpeed = PLAYER_SPEED * delta;
  const isTryingToMove = moveForward || moveBackward || moveLeft || moveRight;

  // --- Movement Calculation ---
  const playerObject = controls.getObject();
  const currentPosition = playerObject.position.clone();
  const forwardVector = new THREE.Vector3();
  const rightVector = new THREE.Vector3();

  // Get camera direction (already includes rotations from touch/mouse)
  camera.getWorldDirection(forwardVector);
  forwardVector.y = 0; // Project onto XZ plane
  forwardVector.normalize();

  rightVector.crossVectors(playerObject.up, forwardVector).normalize(); // Use player object's up

  const moveDirection = new THREE.Vector3();
  if (moveForward) moveDirection.add(forwardVector);
  if (moveBackward) moveDirection.sub(forwardVector);
  if (moveRight) moveDirection.sub(rightVector); // Camera right is world left relative to look direction
  if (moveLeft) moveDirection.add(rightVector); // Camera left is world right relative to look direction

  moveDirection.normalize(); // Ensure consistent speed diagonally

  const velocity = moveDirection.multiplyScalar(moveSpeed);

  // --- Collision Detection & Resolution (Simplified Slide) ---
  const checkCollision = (proposedPosition) => {
    const playerBox = new THREE.Box3(
      new THREE.Vector3(
        proposedPosition.x - PLAYER_RADIUS,
        proposedPosition.y - PLAYER_HEIGHT,
        proposedPosition.z - PLAYER_RADIUS
      ),
      new THREE.Vector3(
        proposedPosition.x + PLAYER_RADIUS,
        proposedPosition.y + 0.1,
        proposedPosition.z + PLAYER_RADIUS
      ) // Slightly above feet
    );

    for (const obstacle of obstacles) {
      if (
        obstacle.userData.boundingBox &&
        playerBox.intersectsBox(obstacle.userData.boundingBox)
      ) {
        return obstacle;
      }
    }
    return null; // No collision
  };

  let finalDelta = new THREE.Vector3();

  // Check desired position
  let proposedPos = currentPosition.clone().add(velocity);
  let collisionObject = checkCollision(proposedPos);

  if (collisionObject) {
    // Collision detected, attempt to slide
    const slideEpsilon = 0.01; // Small offset to prevent getting stuck in corners

    // Try moving along X only
    let tempVelX = new THREE.Vector3(velocity.x, 0, 0);
    let proposedPosX = currentPosition.clone().add(tempVelX);
    // Check slightly offset position to avoid immediate re-collision if already touching
    if (
      !checkCollision(
        proposedPosX.add(tempVelX.normalize().multiplyScalar(slideEpsilon))
      )
    ) {
      finalDelta.add(tempVelX);
    }

    // Try moving along Z only
    let tempVelZ = new THREE.Vector3(0, 0, velocity.z);
    let proposedPosZ = currentPosition.clone().add(tempVelZ);
    if (
      !checkCollision(
        proposedPosZ.add(tempVelZ.normalize().multiplyScalar(slideEpsilon))
      )
    ) {
      finalDelta.add(tempVelZ);
    }

    // If sliding in one direction caused a collision, don't use that component.
    // This simple slide might still get stuck in complex corners. More robust CCD is complex.
  } else {
    // No collision, allow full movement
    finalDelta.copy(velocity);
  }

  playerObject.position.add(finalDelta);

  // --- Vertical Movement (Gravity & Jumping) & Landing Sound/Shake ---
  const wasOnGround = isOnGround;
  playerVelocityY -= GRAVITY * delta;
  let verticalDelta = playerVelocityY * delta;
  let proposedY = playerObject.position.y + verticalDelta;

  // Basic ground collision check (with plane y=0)
  if (proposedY < PLAYER_HEIGHT) {
    verticalDelta = PLAYER_HEIGHT - playerObject.position.y; // Move exactly to ground height
    playerVelocityY = 0;
    canJump = true;
    isOnGround = true;
    if (!wasOnGround) {
      // <<< LANDING DETECTED >>>
      // Play Landing Sound
      if (landSound && landSound.buffer) {
        if (landSound.isPlaying) landSound.stop();
        // Scale volume slightly by fall speed (optional)
        // const fallSpeed = Math.abs(playerVelocityY); // Velocity before reset
        // landSound.setVolume(Math.min(1.0, 0.1 + fallSpeed * 0.05));
        landSound.play();
      }
      // Trigger Landing Shake
      shakeIntensity = LAND_SHAKE_INTENSITY;
      shakeTime = LAND_SHAKE_DURATION;
    }
  } else {
    isOnGround = false;
    // Ceiling collision
    const ceilingLimit = WALL_HEIGHT - PLAYER_RADIUS * 0.1;
    if (proposedY > ceilingLimit) {
      verticalDelta = ceilingLimit - playerObject.position.y;
      playerVelocityY = Math.min(0, playerVelocityY); // Stop upward movement
    }
  }

  playerObject.position.y += verticalDelta;

  // --- Boundary Checks ---
  const limit = WORLD_SIZE / 2 - PLAYER_RADIUS; // Use exact wall limit now
  playerObject.position.x = Math.max(
    -limit,
    Math.min(limit, playerObject.position.x)
  );
  playerObject.position.z = Math.max(
    -limit,
    Math.min(limit, playerObject.position.z)
  );

  // --- Walking Sound Logic ---
  const actuallyMovedHorizontally = finalDelta.lengthSq() > 0.0001; // Check if there was actual horizontal movement after collision checks
  const shouldBeWalking =
    isTryingToMove && isOnGround && actuallyMovedHorizontally;

  if (shouldBeWalking && !isWalking) {
    if (walkSound && walkSound.buffer && !walkSound.isPlaying) {
      walkSound.play();
    }
    isWalking = true;
  } else if (!shouldBeWalking && isWalking) {
    if (walkSound && walkSound.isPlaying) {
      walkSound.pause(); // Pause instead of stop to resume smoothly
    }
    isWalking = false;
    walkPhase = 0; // Reset walk phase when stopping
  }

  // --- Update Walk Phase for Shake ---
  if (isWalking) {
    walkPhase += delta * PLAYER_SPEED * 0.5; // Adjust multiplier for desired frequency relative to speed
  }
}

// --- Collision Checks (Orbs, Portal) ---
function checkCollisions() {
  if (isGameOver || !controls) return;
  const playerPosition = controls.getObject().position;
  for (let i = orbs.length - 1; i >= 0; i--) {
    const orb = orbs[i];
    // Check distance in 3D space
    const distance = playerPosition.distanceTo(orb.position);
    if (distance < COLLECTION_DISTANCE) {
      scene.remove(orb);
      orbs.splice(i, 1);
      score++;
      currentLightLevel = Math.min(
        100,
        currentLightLevel + LIGHT_BOOST_PER_ORB
      );
      updateHUD();
      if (collectSound && collectSound.buffer) {
        if (collectSound.isPlaying) collectSound.stop();
        collectSound.play();
      }
      if (score >= orbsNeededForLevel && !exitPortalActive) {
        createExitPortal();
      }
    }
  }
  if (exitPortalActive && exitPortal) {
    // Check distance, considering portal is roughly at player height
    const distance = playerPosition.distanceTo(exitPortal.position);
    if (distance < EXIT_RADIUS + PLAYER_RADIUS) {
      // Optional: Add a vertical check if needed, e.g., player is close vertically
      // if (Math.abs(playerPosition.y - exitPortal.position.y) < PLAYER_HEIGHT * 0.5) {
      winGame();
      // }
    }
  }
}

// --- Light Update Logic ---
function updateLight(delta) {
  if (isGameOver || !controls || !controls.isLocked) return;
  currentLightLevel -= currentFadeRate * delta;
  currentLightLevel = Math.max(0, currentLightLevel);
  const lightIntensityFactor = Math.pow(currentLightLevel / 100, 1.5); // Adjust power for feel
  ambientLight.intensity = lightIntensityFactor * 0.15; // Base ambient level
  directionalLight.intensity = lightIntensityFactor * 1.0; // Max directional intensity

  // Adjust fog based on light level - make it denser as light fades
  const fogNearFactor = (100 - currentLightLevel) / 100; // 0 when full light, 1 when no light
  scene.fog.near = 3 + fogNearFactor * (WORLD_SIZE * 0.2); // Fog starts closer as light dims
  scene.fog.far = WORLD_SIZE * 0.75 - fogNearFactor * (WORLD_SIZE * 0.4); // Fog ends much closer as light dims
  scene.fog.far = Math.max(scene.fog.near + 5, scene.fog.far); // Ensure far is always beyond near

  updateHUD();
  if (currentLightLevel < MIN_LIGHT_LEVEL && currentLightLevel > 0) {
    // Trigger slightly before zero
    // Check added to prevent multiple triggers if already zero
    if (!isGameOver) loseGame(); // Only trigger lose game once
  } else if (currentLightLevel <= 0 && !isGameOver) {
    loseGame(); // Final check if it somehow skipped the MIN_LIGHT_LEVEL check
  }
}

// --- Update HUD Display ---
function updateHUD() {
  scoreElement.textContent = `Orbs: ${score} / ${orbsNeededForLevel}`;
  lightLevelElement.textContent = `Light: ${Math.round(
    currentLightLevel
  )}% (Lvl ${currentLevel})`;
}

function animateOrbs(delta) {
  const time = clock.getElapsedTime();
  orbs.forEach((orb, index) => {
    // Gentle bobbing effect
    orb.position.y += Math.sin(time * 2 + index * 0.5) * 0.005;
    // Slow rotation
    orb.rotation.y += delta * 0.5;
  });

  // Animate Exit Portal if active
  if (exitPortalActive && exitPortal) {
    exitPortal.rotation.z += delta * 0.5; // Spin the torus

    // Make the portal light pulse slightly
    const portalLight = exitPortal.children.find((child) => child.isPointLight);
    if (portalLight) {
      portalLight.intensity = 2.0 + Math.sin(time * 3) * 0.5; // Pulse intensity
    }
  }
}

// --- NEW: Update Camera Shake (Using Container) ---
function updateCameraShake(delta) {
  // Find the shake container (safer than assuming it's always the first child)
  const shakeContainer = camera.getObjectByName("ShakeContainer");
  if (!shakeContainer) {
    return; // Exit if not found
  }

  // --- Reset the SHAKE CONTAINER's local transform ---
  shakeContainer.position.set(0, 0, 0);
  shakeContainer.rotation.set(0, 0, 0); // Reset all rotation axes just in case

  let totalShakeOffset = new THREE.Vector3();
  let totalShakeRoll = 0; // Use a variable for roll

  // --- Landing Shake ---
  if (shakeTime > 0) {
    const currentIntensity = shakeIntensity * (shakeTime / LAND_SHAKE_DURATION);
    totalShakeOffset.y += (Math.random() - 0.5) * 2 * currentIntensity;
    // Optional landing roll on container?
    totalShakeRoll += (Math.random() - 0.5) * currentIntensity * 0.1;
    console.log("Landing Shake Offset Y:", totalShakeOffset.y); // Log landing shake
    shakeTime -= delta;
    if (shakeTime <= 0) {
      shakeIntensity = 0;
      shakeTime = 0;
    }
  }

  // --- Walking Shake ---
  if (isWalking && isOnGround) {
    const time = walkPhase;
    const verticalBob =
      Math.sin(time * WALK_SHAKE_FREQUENCY) * WALK_SHAKE_AMOUNT;
    const rollBob =
      Math.cos(time * WALK_SHAKE_FREQUENCY * 0.5) * WALK_SHAKE_ROLL_AMOUNT;
    totalShakeOffset.y += verticalBob;
    totalShakeRoll += rollBob; // Calculate roll
    console.log("Walking Shake Offset Y:", verticalBob, "Roll:", rollBob); // Log walking shake
  }

  // --- Apply combined shake offset and roll to the SHAKE CONTAINER ---
  console.log(
    "Applying Shake - Offset:",
    totalShakeOffset,
    "Roll:",
    totalShakeRoll
  );
  // Apply position offset directly
  shakeContainer.position.copy(totalShakeOffset);

  // Apply roll rotation around the container's Z axis
  shakeContainer.rotation.z = totalShakeRoll;
}

// --- Win Game / Level Progression ---
function winGame() {
  if (isGameOver) return; // Prevent multiple wins
  isGameOver = true; // Set game over state immediately

  // Stop movement sounds
  if (walkSound && walkSound.isPlaying) walkSound.stop();
  isWalking = false;

  if (currentLevel >= FINAL_LEVEL) {
    console.log("Game Completed!");
    messageElement.textContent = `Congratulations! You beat all ${FINAL_LEVEL} levels!`;
    messageElement.classList.remove("hidden");
    setGameOverInstructions("You Won! Click to Restart");
    if (backgroundMusic && backgroundMusic.isPlaying) backgroundMusic.stop();
    if (winSound && winSound.buffer) winSound.play();
    if (controls) controls.unlock(); // Unlock controls after winning the final level
  } else {
    console.log(`Level ${currentLevel} Complete!`);
    // Play a success sound (could be collect or a specific level complete sound)
    if (collectSound && collectSound.buffer) {
      if (collectSound.isPlaying) collectSound.stop();
      collectSound.play(); // Or use winSound briefly?
    }
    messageElement.textContent = `Level ${currentLevel} Complete! Preparing Next Level...`;
    messageElement.classList.remove("hidden");
    if (exitPortal) {
      scene.remove(exitPortal);
      const oldLight = exitPortal.children.find((child) => child.isPointLight);
      if (oldLight) exitPortal.remove(oldLight);
      exitPortal = null;
      exitPortalActive = false;
    }
    if (portalSound && portalSound.isPlaying) portalSound.stop();

    setTimeout(() => {
      if (isGameOver) {
        isGameOver = false; // Reset for next level
        setupLevel(currentLevel + 1);
      }
    }, 1500); // Short delay before starting next level
  }
}

// --- Lose Game Logic ---
function loseGame() {
  if (isGameOver) return;
  console.log("Game Over!");
  isGameOver = true;
  messageElement.textContent = `Game Over on Level ${currentLevel}... Darkness Consumes You!`;
  messageElement.classList.remove("hidden");
  setGameOverInstructions("You Lost! Click to Restart");

  // Make it completely dark
  ambientLight.intensity = 0;
  directionalLight.intensity = 0;

  // Stop all sounds
  if (backgroundMusic && backgroundMusic.isPlaying) backgroundMusic.stop();
  if (walkSound && walkSound.isPlaying) walkSound.stop();
  isWalking = false;
  if (portalSound && portalSound.isPlaying) portalSound.stop();
  if (collectSound && collectSound.isPlaying) collectSound.stop();

  if (loseSound && loseSound.buffer) loseSound.play();
  if (controls) controls.unlock();
}

// --- Full Game Reset Function ---
function resetGame() {
  console.log("Resetting game to Level 1...");
  isGameOver = true; // Prevent actions during reset
  // Stop sounds immediately
  if (backgroundMusic && backgroundMusic.isPlaying) backgroundMusic.stop();
  if (walkSound && walkSound.isPlaying) walkSound.stop();
  isWalking = false;
  if (portalSound && portalSound.isPlaying) portalSound.stop();
  if (collectSound && collectSound.isPlaying) collectSound.stop();
  if (winSound && winSound.isPlaying) winSound.stop();
  if (loseSound && loseSound.isPlaying) loseSound.stop();

  // Reset touch state if needed (though setupLevel should handle flags)
  joystickActive = false;
  lookTouchId = null;

  // Inside resetGame() function, before setupLevel:
  if (camera) {
    const shakeContainer = camera.getObjectByName("ShakeContainer");
    if (shakeContainer) {
      shakeContainer.position.set(0, 0, 0);
      shakeContainer.rotation.set(0, 0, 0);
    }
    // Keep the camera local reset too for good measure
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
  }
  // Reset shake state variables
  shakeIntensity = 0;
  shakeTime = 0;
  walkPhase = 0;

  setupLevel(1); // This will reset game state variables including isGameOver=false
  // Re-enable interaction prompt based on device
  if (isTouchDevice) {
    blocker.style.display = "none";
    touchControlsElement.style.display = "block";
    messageElement.textContent = "Game Reset. Touch controls active.";
    messageElement.classList.remove("hidden");
    // Re-attach interaction listener for music start
    let firstInteraction = false;
    const startMusicOnInteraction = () => {
      /* ... same as in setupControls ... */
    };
    joystickArea.addEventListener("touchstart", startMusicOnInteraction, {
      once: true,
    });
    lookArea.addEventListener("touchstart", startMusicOnInteraction, {
      once: true,
    });
    jumpButton.addEventListener("touchstart", startMusicOnInteraction, {
      once: true,
    });
  } else {
    blocker.style.display = "flex";
    instructions.style.display = ""; // Show instructions block again
    touchControlsElement.style.display = "none";
    messageElement.textContent = "Game Reset. Click to Play";
    messageElement.classList.remove("hidden");
    instructions.style.cursor = "pointer";
  } // Re-enable interaction prompt based on device
  if (isTouchDevice) {
    blocker.style.display = "none";
    touchControlsElement.style.display = "block";
    messageElement.textContent = "Game Reset. Touch controls active.";
    messageElement.classList.remove("hidden");
    // Re-attach interaction listener for music start
    let firstInteraction = false;
    const startMusicOnInteraction = () => {
      /* ... same as in setupControls ... */
    };
    joystickArea.addEventListener("touchstart", startMusicOnInteraction, {
      once: true,
    });
    lookArea.addEventListener("touchstart", startMusicOnInteraction, {
      once: true,
    });
    jumpButton.addEventListener("touchstart", startMusicOnInteraction, {
      once: true,
    });
  } else {
    blocker.style.display = "flex";
    instructions.style.display = ""; // Show instructions block again
    touchControlsElement.style.display = "none";
    messageElement.textContent = "Game Reset. Click to Play";
    messageElement.classList.remove("hidden");
    instructions.style.cursor = "pointer";
  }
  // Ensure isGameOver is false *after* setupLevel finishes its async parts potentially
  // Placing it here is safer.
  isGameOver = false;
}

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);
  if (!assetsLoaded || !scene || !camera || !renderer) {
    // Optionally display a loading message if assets aren't ready
    if (!assetsLoaded && messageElement)
      messageElement.classList.remove("hidden");
    messageElement.textContent = "Loading Assets...";
    return;
  }

  const delta = clock.getDelta();

  // Only run game logic if not game over AND controls exist
  if (!isGameOver && controls) {
    updatePlayer(delta); // Handles movement, gravity, collisions, movement sounds
    checkCollisions(); // Handles orb collection, portal entry
    updateLight(delta); // Handles light fade, game over check for light
  }

  // Always animate visual elements like orbs/portal regardless of game state
  animateOrbs(delta);
  updateCameraShake(delta); // Update shake AFTER player movement/state is determined

  renderer.render(scene, camera);
}

// --- Start the game ---
init();
