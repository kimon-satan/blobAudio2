//GLOBALS

var canvas;
var gui, f1, f2;
var controlPanel;
var audioContext;

var compressor;

var buffer = 0;
var bufferDuration = 58.0;

var realTime = 0.0;
var grainTime = 0.0;

var isSourceLoaded = false;
var applyGrainWindow = false;
var grainWindow;

//IOS hack
var isUnlocked = false;
var synthOn = false;

var env;

var parameters =
{
  speed: {value: 0.333, min: -4.0, max: 4.0, gui: true , step: 0.01},
  pitch: {value: 1.0, min: 1.0, max: 3600, gui: true, step: 10},
  pitchRandomization: {value: 0.0, min: 0.0, max: 1200.0, gui: true, step: 10},
  timeRandomization:{value: 0.01 , min:0.0, max:1.0, gui:true , step : 0.01},
  grainSize:{value: 0.09 , min:0.010, max:0.5, gui:true , custom: true, step: 0.01},
  grainDuration:{value: 0.09 , min:0.010, max:0.5, gui:true , step: 0.001},
  grainSpacing:{value: 0.045 , min:0.010, max:0.5, gui:true , step: 0.001},
  regionStart: {value: 0.01 , min:0.0, max:1.0, gui:true , step : 0.001},
  regionLength: {value: 0.01 , min:0.0, max:2.0, gui:true , step : 0.01}
}


///////////////////////////////////INTERACTION SETUP////////////////////////////

$('document').ready(function(){

  canvas = $('#canvas')[0];
  canvas.setAttribute('width', window.innerWidth);
  canvas.setAttribute('height', window.innerHeight);
  var ctxt = canvas.getContext('2d');

  window.AudioContext = window.AudioContext || window.webkitAudioContext;

  audioContext = new AudioContext();
  realTime = Math.max(0, audioContext.currentTime);

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
    draw();

    // Iterate over all controllers
    if(gui !== undefined)
    {
      for (var i in f1.__controllers) {
        f1.__controllers[i].updateDisplay();
      }
    }

  }

  requestAnimationFrame(render);
}


render();

function draw()
{

  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "black";
  ctx.fillRect(0,0,canvas.width, canvas.height);
  var radius = env.z * 100.0;
  ctx.fillStyle="#FF0000";
  ctx.beginPath();
  ctx.arc(200,200,radius,0,2*Math.PI);
  ctx.fill();

}





////////////////////////////////////////////AUDIO CTRL THREAD///////////////////////////////////

function updateAudio()
{
    var currentTime = audioContext.currentTime;

    env.step();

    for (var property in parameters)
    {
      if(controlPanel["map_" + property] == true)
      {
          parameters[property].value = linlin(env.z,0.0, 1.0, parameters[property].min, parameters[property].max);
          //controlPanel[property] = parameters[property].value;
      }
    }

    if(env.z > 0.05)
    {

      while (realTime < currentTime + 0.100)
      {
        nextGrain();
      }

    }
}


///////////////////////////////////////////AUDIO HELPERS//////////////////////////////////////

function initAudio()
{

  if (audioContext.decodeAudioData)
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

  if (audioContext.createDynamicsCompressor)
  {
    // Create dynamics compressor to sweeten the overall mix.
    compressor = audioContext.createDynamicsCompressor();
    compressor.connect(audioContext.destination);
  }
  else
  {
    // Compressor is not available on this implementation - bypass and simply point to destination.
    compressor = audioContext.destination;
  }


  //loadSample("samples/138344_reverse_crow.wav");
  //loadSample("samples/19997_blackbird_flap.wav");
  //loadSample("samples/19997_blackbird.wav");
  //loadSample("samples/57271_cat-bird.wav");
  loadSample("samples/169830_dino009.wav");
  // this could be made more flexible
  env = new Envelope2(0.5,0.2,60);

}



function nextGrain()
{
  //plays an individual grain

  if (!buffer)
  {
    return;
  }

  var source = audioContext.createBufferSource();
  source.buffer = buffer;

  var r1 = Math.random();
  var r2 = Math.random();

  r1 = (r1 - 0.5) * 2.0;
  r2 = (r2 - 0.5) * 2.0;


  var grainWindowNode;

  var gainNode = audioContext.createGain();
  gainNode.gain.value =  env.z;

  if (applyGrainWindow) {
    // Create a gain node with a special "grain window" shaping curve.
    grainWindowNode = audioContext.createGain();
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
  var offset = Math.max(0,grainTime + randomGrainOffset);
  source.start(realTime,offset , parameters.grainDuration.value);

  // Schedule the grain window.
  // This applies a time-varying gain change for smooth fade-in / fade-out.
  if (applyGrainWindow)
  {
    var windowDuration = parameters.grainDuration.value / pitchRate;
    grainWindowNode.gain.value = 0.0; // make default value 0
    grainWindowNode.gain.setValueCurveAtTime(grainWindow, realTime, windowDuration);
  }

  var lastGrainTime = grainTime;

  // Update time params
  realTime += parameters.grainSpacing.value;

  grainTime += parameters.speed.value * parameters.grainDuration.value;

  //grain time wrapping
  var regionStart = parameters.regionStart.value * bufferDuration;
  var regionEnd = Math.min(bufferDuration, regionStart  + parameters.regionLength.value);

  if (grainTime > regionEnd)
  {
    grainTime = regionStart;
  }
  else if (grainTime < regionStart)
  {
    grainTime += Math.min( bufferDuration - regionStart, parameters.regionLength.value);
  }

}



/////////////////////////////////////////////// GUI stuff ////////////////////////////////////////

function ControlPanel()
{

  for (var property in parameters)
  {
    if (parameters.hasOwnProperty(property))
    {
      this[property] = parameters[property].value;
      this[ "map_" + property] = false;
      this[ "range_" + property] = 0.01;
    }
  }

}

function init()
{


  controlPanel = new ControlPanel();
  gui = new dat.GUI();
  gui.remember(controlPanel);
  f1 = gui.addFolder('fixedControl');
  f2 = gui.addFolder('map');

  var directEvents = {};
  var mapEvents = {};


  for (var property in parameters)
  {
    if (parameters.hasOwnProperty(property)) {
      if(parameters[property].gui){


        directEvents[property] = f1.add(controlPanel, property, parameters[property].min, parameters[property].max);

        mapEvents[property] = f2.add(controlPanel, "map_" + property );
        mapEvents[property] = f2.add(controlPanel, "range_" + property );


        if(parameters[property].step !== "undefined")
        {
          directEvents[property].step(parameters[property].step);
        }

        if(!parameters[property].custom){

          directEvents[property].onChange(function(value) {
            parameters[this.property].value = value;
            controlPanel[this.property] = value;
          });

        }

      }
    }
  }



  //CUSTOM HANDLERS


  directEvents.grainSize.onChange (function(val){
    parameters.grainDuration.value = val;
    parameters.grainSpacing.value = 0.5 * parameters.grainDuration.value;
    parameters.grainSize.value = val;
    controlPanel.grainDuration = parameters.grainDuration.value;
    controlPanel.grainSpacing = parameters.grainSpacing.value;
  });


}

/////////////////////////////////////////FILE LOADING///////////////////////////////////////




function loadSample(url) {
  // Load asynchronously

  var request = new XMLHttpRequest();
  request.open("GET", url, true);
  request.responseType = "arraybuffer";

  request.onload = function() {
    audioContext.decodeAudioData(
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
  var buffer = audioContext.createBuffer(1, 1, 22050);
  var source = audioContext.createBufferSource();

  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.noteOn(0);

  // by checking the play state after some time, we know if we're really unlocked
  setTimeout(function() {
    if((source.playbackState === source.PLAYING_STATE || source.playbackState === source.FINISHED_STATE)) {
      isUnlocked = true;
    }
  }, 10);

}
