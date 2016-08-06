//GLOBALS

var context;
var convolver;
var compressor;

var buffer = 0;
var bufferDuration = 58.0;

var kDiffusionRandomization = 0.2;
var diffusionRandomization = kDiffusionRandomization;

var realTime = 0.0;
var grainTime = 0.0;

var grainDuration = 0.09;
var grainSpacing = 0.5 * 0.09;

var isSourceLoaded = false;
var isImpulseResponseLoaded = false;

var applyGrainWindow = false;
var grainWindow;

var canvas;

//IOS hack
var isUnlocked = false;


var parameters = {
  speed: {value: 0.333, min: -4.0, max: 4.0, gui: true , custom: true},
  pitch: {value: 1.0, min: 1.0, max: 3600, gui: true},
  pitchRandomization: {value: 0.0, min: 0.0, max: 1200.0, gui: true},
  panningRandomization: {value: 0.0 , min:0.0, max:1.0, gui:true },
  timeRandomization:{value: 0.0 , min:0.0, max:1.0, gui:true },
  grainSize:{value: 0.09 , min:0.010, max:0.5, gui:true , custom: true},
}


///////////////////////////////////INTERACTION SETUP////////////////////////////

$('document').ready(function(){

  canvas = $('#canvas')[0];
  canvas.setAttribute('width', window.innerWidth);
  canvas.setAttribute('height', window.innerHeight);
  var ctxt = canvas.getContext('2d');
  ctxt.fillStyle = "black";
  ctxt.fillRect(0,0,canvas.width, canvas.height);
  window.AudioContext = window.AudioContext || window.webkitAudioContext;

  context = new AudioContext();
  realTime = Math.max(0, context.currentTime);

  init(); //makes the gui

  canvas.addEventListener('touchstart', function() {

    if(!isUnlocked){

      unlock();
      initAudio();

    }

  }, false);

  canvas.addEventListener('touchend', function() {


  }, false);


  canvas.addEventListener('mousedown', function() {


    //TODO solve sequence of loading and playback with unlock
    console.log("md");
    if(!isUnlocked){
      initAudio();
      isUnlocked = true;
    }
    else{
      schedule();
    }



  }, false);

  canvas.addEventListener('mouseup', function() {


  }, false);


});







/////////////////////////////////////////////DRAW LOOP///////////////////////////////////////

function schedule() {


  var currentTime = context.currentTime;


  while (realTime < currentTime + 0.100) {
    scheduleGrain();

  }

  setTimeout("schedule()", 20);
}


///////////////////////////////////////////AUDIO HELPERS//////////////////////////////////////

function initAudio() {

  //loads the audio files and sets up nodes

  // This check is a hack and will only be needed temporarily.
  // The reason is that the noteGrainOn() method used to (in older builds) apply a hard-coded amplitude window.
  // The newer and more flexible approach is that noteGrainOn() simply plays a portion of an AudioBuffer,
  // without any gain scaling.  Then we can apply a gain scaling (which is desired in this example)
  // by using an AudioGainNode.
  // We check the existence of the decodeAudioData() only because this is the time when the change in noteGrainOn()
  // behavior happened -- yucky, but only temporary since it can be removed in a few weeks when all builds have the new behavior.
  if (context.decodeAudioData) {
    applyGrainWindow = true;
    // Create a granular synthesis "grain window"
    // Each small audio snippet will have a smooth fade-in / fade-out according to this shape.
    var grainWindowLength = 16384;
    grainWindow = new Float32Array(grainWindowLength);
    for (var i = 0; i < grainWindowLength; ++i)
    grainWindow[i] = Math.sin(Math.PI * i / grainWindowLength);
  } else {
    applyGrainWindow = false;
  }

  if (context.createDynamicsCompressor) {
    // Create dynamics compressor to sweeten the overall mix.
    compressor = context.createDynamicsCompressor();
    compressor.connect(context.destination);
  } else {
    // Compressor is not available on this implementation - bypass and simply point to destination.
    compressor = context.destination;
  }

  // Create a convolver for ambience
  //convolver = context.createConvolver();
  //convolver.connect(compressor);

  load();
}



function scheduleGrain() {

  //plays an individual grain

  if (!buffer)
  return;

  var source = context.createBufferSource();
  source.buffer = buffer;

  var r = Math.random();
  var r2 = Math.random();
  var r3 = Math.random();
  var r4 = Math.random();
  var r5 = Math.random();
  r1 = (r - 0.5) * 2.0;
  r2 = (r2 - 0.5) * 2.0;
  r3 = (r3 - 0.5) * 2.0;
  r4 = (r4 - 0.5) * 2.0;

  // Spatialization
  var panner = context.createPanner();

  var grainWindowNode;
  if (applyGrainWindow) {
    // Create a gain node with a special "grain window" shaping curve.
    grainWindowNode = context.createGain();
    source.connect(grainWindowNode);
    grainWindowNode.connect(panner);
  } else {
    source.connect(panner);
  }

  var distance = 2.0;
  var azimuth = Math.PI * parameters.panningRandomization.value * r3;
  var elevation = Math.PI * (0.25 + 0.75 * parameters.panningRandomization.value * r4);

  var x = Math.sin(azimuth);
  var z = Math.cos(azimuth);
  var y = Math.sin(elevation);
  var scaleXZ = Math.cos(elevation);

  x *= distance * scaleXZ;
  y *= distance;
  z *= distance * scaleXZ;

  panner.panningModel = "HRTF";
  panner.setPosition(x, y, z);

  var dryGainNode = context.createGain();
  var wetGainNode = context.createGain();
  wetGainNode.gain.value = 0.5 * diffusionRandomization * r5;
  dryGainNode.gain.value = 1.0 - wetGainNode.gain.value;

  // Pitch
  var totalPitch = parameters.pitch.value + r1 * parameters.pitchRandomization.value;
  var pitchRate = Math.pow(2.0, totalPitch / 1200.0);
  source.playbackRate.value = pitchRate;

  // Connect dry mix
  panner.connect(dryGainNode);
  dryGainNode.connect(compressor);

  // Connect wet mix
  panner.connect(wetGainNode);
  wetGainNode.connect(compressor);

  // Time randomization
  var randomGrainOffset = r2 * parameters.timeRandomization.value;

  // Schedule sound grain
  source.start(realTime, grainTime + randomGrainOffset, grainDuration);

  // Schedule the grain window.
  // This applies a time-varying gain change for smooth fade-in / fade-out.
  if (applyGrainWindow) {
    var windowDuration = grainDuration / pitchRate;
    grainWindowNode.gain.value = 0.0; // make default value 0
    grainWindowNode.gain.setValueCurveAtTime(grainWindow, realTime, windowDuration);
  }

  var lastGrainTime = grainTime;

  // Update time params
  realTime += grainSpacing;

  console.log("rt: " , realTime);

  grainTime += parameters.speed.value * grainSpacing;
  if (grainTime > bufferDuration) grainTime = 0.0;
  if (grainTime < 0.0) grainTime += bufferDuration; // backwards wrap-around

}



/////////////////////////////////////////////// GUI stuff ////////////////////////////////////////

function ControlPanel()
{

  for (var property in parameters)
  {
    if (parameters.hasOwnProperty(property))
    {
      this[property] = parameters[property].value;
    }
  }

}

function init()
{


  var controlPanel = new ControlPanel();
  var gui = new dat.GUI();
  gui.remember(controlPanel);
  var events = {};

  for (var property in parameters)
  {
    if (parameters.hasOwnProperty(property)) {
      if(parameters[property].gui){

        events[property] = gui.add(controlPanel, property, parameters[property].min, parameters[property].max);

        if(!parameters[property].custom){

          events[property].onChange(function(value) {
            parameters[this.property].value = value;
          });

        }

      }
    }
  }

  //CUSTOM HANDLERS

  events.speed.onChange (function(val){
    parameters.speed.value = Math.max(Math.abs(val),0.05);
    parameters.speed.value *= Math.sign(val);
  });

  events.grainSize.onChange (function(val){
    grainDuration = val;
    grainSpacing = 0.5 * grainDuration;
    parameters.grainSize.value = val;
  });


}

/////////////////////////////////////////FILE LOADING///////////////////////////////////////

function load() {
  // loadImpulseResponse('impulse-responses/spatialized4.wav');
  //loadImpulseResponse('impulse-responses/matrix-reverb5.wav');
  loadHumanVoice("samples/138344_reverse_crow.wav");
}

function loadImpulseResponse(url) {
  // Load impulse response asynchronously

  var request = new XMLHttpRequest();
  request.open("GET", url, true);
  request.responseType = "arraybuffer";

  request.onload = function() {
    context.decodeAudioData(
      request.response,
      function(buffer) {
        convolver.buffer = buffer;
        isImpulseResponseLoaded = true;
        finishLoading();
      },

      function(buffer) {
        console.log("Error decoding impulse response!");
      }
    );
  }
  request.onerror = function() {
    alert("error loading reverb");
  }

  request.send();
}

function loadHumanVoice(url) {
  // Load asynchronously

  var request = new XMLHttpRequest();
  request.open("GET", url, true);
  request.responseType = "arraybuffer";

  request.onload = function() {
    context.decodeAudioData(
      request.response,
      function(b) {
        buffer = b;
        bufferDuration = buffer.duration - 0.050;
        isSourceLoaded = true;

      },

      function(buffer) {
        console.log("Error decoding human voice!");
      }
    );
  };

  request.onerror = function() {
    alert("error loading");
  };

  request.send();
}



//IOS workaround

function unlock() {

  console.log("unlocking")

  // create empty buffer and play it
  var buffer = context.createBuffer(1, 1, 22050);
  var source = context.createBufferSource();

  source.buffer = buffer;
  source.connect(context.destination);
  source.noteOn(0);

  // by checking the play state after some time, we know if we're really unlocked
  setTimeout(function() {
    if((source.playbackState === source.PLAYING_STATE || source.playbackState === source.FINISHED_STATE)) {
      isUnlocked = true;
    }
  }, 10);

}
