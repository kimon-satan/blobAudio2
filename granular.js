//GLOBALS

var canvas;
var context;
var compressor;

var buffer = 0;
var bufferDuration = 58.0;

var realTime = 0.0;
var grainTime = 0.0;

var grainDuration = 0.09;
var grainSpacing = 0.5 * 0.09;

var isSourceLoaded = false;
var applyGrainWindow = false;
var grainWindow;

//IOS hack
var isUnlocked = false;
var synthOn = false;

var env;

var parameters =
{
  speed: {value: 0.333, min: -4.0, max: 4.0, gui: true , custom: true, step: 0.01},
  pitch: {value: 1.0, min: 1.0, max: 3600, gui: true, step: 10},
  pitchRandomization: {value: 0.0, min: 0.0, max: 1200.0, gui: true, step: 10},
  timeRandomization:{value: 0.01 , min:0.0, max:1.0, gui:true , step : 0.01},
  grainSize:{value: 0.09 , min:0.010, max:0.5, gui:true , custom: true, step: 0.01}
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
  initAudio();

  canvas.addEventListener('touchstart', function() {

    if(!isUnlocked)
    {
      unlock();

    }

    env.targetVal = 1.0;


  }, false);

  canvas.addEventListener('touchend', function() {

    env.targetVal = 0.0;


  }, false);


  canvas.addEventListener('mousedown', function() {

    if(!isUnlocked){
      isUnlocked = true;
    }

    env.targetVal = 1.0;


  }, false);

  canvas.addEventListener('mouseup', function() {

    env.targetVal = 0.0;

  }, false);


});



/////////////////////////////////////////////DRAW LOOP///////////////////////////////////////

var startTime = new Date().getTime();
var ellapsedTime = 0;
var accumulator = 0;

function render() {

  var n_et = (new Date().getTime() - startTime) * 0.001;
  accumulator += (n_et - ellapsedTime);
  ellapsedTime = n_et;

  if(accumulator > 1.0/60)
  {
    updateAudio();
  }

  requestAnimationFrame(render);
}


render();

////////////////////////////////////////////AUDIO CTRL THREAD///////////////////////////////////

function updateAudio()
{
    var currentTime = context.currentTime;

    env.step();

    if(env.z > 0.05)
    {



      while (realTime < currentTime + 0.100)
      {
        scheduleGrain();
      }

    }
}


///////////////////////////////////////////AUDIO HELPERS//////////////////////////////////////

function initAudio()
{

  if (context.decodeAudioData)
  {
    applyGrainWindow = true;

    var grainWindowLength = 16384;
    grainWindow = new Float32Array(grainWindowLength);
    for (var i = 0; i < grainWindowLength; ++i)
    {
      grainWindow[i] = Math.sin(Math.PI * i / grainWindowLength);
    }
  }
  else
  {
    //grain window not supported
    applyGrainWindow = false;
  }

  if (context.createDynamicsCompressor)
  {
    // Create dynamics compressor to sweeten the overall mix.
    compressor = context.createDynamicsCompressor();
    compressor.connect(context.destination);
  }
  else
  {
    // Compressor is not available on this implementation - bypass and simply point to destination.
    compressor = context.destination;
  }


  load(); //load the audio files

  // this could be made more flexible
  env = new Envelope2(0.5,0.2,60);

}



function scheduleGrain() {

  //plays an individual grain

  if (!buffer)
  {
    return;
  }

  var source = context.createBufferSource();
  source.buffer = buffer;

  var r1 = Math.random();
  var r2 = Math.random();

  r1 = (r1 - 0.5) * 2.0;
  r2 = (r2 - 0.5) * 2.0;


  var grainWindowNode;

  var gainNode = context.createGain();
  gainNode.gain.value =  env.z;

  if (applyGrainWindow) {
    // Create a gain node with a special "grain window" shaping curve.
    grainWindowNode = context.createGain();
    source.connect(grainWindowNode);
    grainWindowNode.connect(gainNode);

  } else {
    source.connect(gainNode);
  }

  // Pitch
  var totalPitch = parameters.pitch.value + r1 * parameters.pitchRandomization.value;
  var pitchRate = Math.pow(2.0, totalPitch / 1200.0);
  source.playbackRate.value = pitchRate;

  gainNode.connect(compressor);

  // Time randomization
  var randomGrainOffset = r2 * parameters.timeRandomization.value;

  // Schedule sound grain
  source.start(realTime, grainTime + randomGrainOffset, grainDuration);

  // Schedule the grain window.
  // This applies a time-varying gain change for smooth fade-in / fade-out.
  if (applyGrainWindow)
  {
    var windowDuration = grainDuration / pitchRate;
    grainWindowNode.gain.value = 0.0; // make default value 0
    grainWindowNode.gain.setValueCurveAtTime(grainWindow, realTime, windowDuration);
  }

  var lastGrainTime = grainTime;

  // Update time params
  realTime += grainSpacing;

  grainTime += parameters.speed.value * grainSpacing;

  //grain time wrapping
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

        if(parameters[property].step !== "undefined")
        {
          events[property].step(parameters[property].step);
        }

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
