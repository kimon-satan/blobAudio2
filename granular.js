//GLOBALS

var canvas;
var gui, folders;
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

var envPanel, envGui;

var env = [
  new Envelope2(0.01,0.2,60),
  new Envelope2(0.01,0.2,60),
  new Envelope2(0.01,0.2,60)
];

var files = [
'138344_reverse_crow.wav',
'169830_dino009.wav',
'19997_blackbird.wav',
'19997_blackbird_flap.wav',
'20472_woodpigeonnr_01.wav',
'20472_woodpigeonnr_02.wav',
'20472_woodpigeonnr_03.wav',
'235443_sandhill-crane.wav',
'240476_wings_.wav',
'262307__steffcaffrey__cat-happy-purr-twitter2.wav',
'262308__steffcaffrey__cat-happy-purr-twit3.wav',
'262310__steffcaffrey__cat-purr-twit5.wav',
'262311__steffcaffrey__cat-purr-twit6.wav',
'278903__syntheway__guardians-of-limbo-syntheway-magnus-choir-vsti.wav',
'319512_pigeon_low.wav',
'319512_pigeon_select.wav',
'57271_cat-bird.wav',
'66637_crying-baby-2.wav',
'66637_crying-baby-2b.wav',
'66637_crying-baby-3.wav',
'66637_crying-baby-4.wav',
'66637_crying-baby-select.wav',
 ] 

var parameters =
{
  amp: {value: 0.5, min: 0.0, max: 1.0, gui: true , step: 0.01},
  speed: {value: 0.0, min: -4.0, max: 4.0, gui: true , step: 0.01},
  pitch: {value: 1.0, min: 1.0, max: 3600, gui: true, step: 10},
  pitchRandomization: {value: 0.0, min: 0.0, max: 1200.0, gui: true, step: 10},
  timeRandomization:{value: 0.01 , min:0.0, max:1.0, gui:true , step : 0.01},
  grainSize:{value: 0.09 , min:0.010, max:0.5, gui:true , custom: true, step: 0.01},
  grainDuration:{value: 0.09 , min:0.010, max:0.5, gui:true , step: 0.001},
  grainSpacing:{value: 0.045 , min:0.010, max:0.5, gui:true , step: 0.001},
  regionStart: {value: 0.01 , min:0.0, max:1.0, gui:true , step : 0.001},
  regionLength: {value: 0.01 , min:0.0, max:10.0, gui:true , step : 0.01}
}


///////////////////////////////////INTERACTION SETUP////////////////////////////

$('document').ready(function(){

  canvas = $('#canvas')[0];
  canvas.setAttribute('width', window.innerWidth);
  canvas.setAttribute('height', 250);
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

    for(var i = 0; i < env.length; i++)
    {
      env[i].targetVal = 1.0;
    }

  }, false);

  canvas.addEventListener('touchend', function() {

    for(var i = 0; i < env.length; i++)
    {
      env[i].targetVal = 0.0;
    }

  }, false);


  canvas.addEventListener('mousedown', function() {

    if(!isUnlocked){
      isUnlocked = true;
    }


    for(var i = 0; i < env.length; i++)
    {
      env[i].targetVal = 1.0;
    }


  }, false);

  canvas.addEventListener('mouseup', function() {

    for(var i = 0; i < env.length; i++)
    {
      env[i].targetVal = 0.0;
    }

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

    //Iterate over all controllers
    if(gui !== undefined)
    {
      for( var p in folders)
      {
        for (var i in folders[p].__controllers)
        {

          if(folders[p].__controllers[i].property.substring(0,4) != "map_")
          {
            folders[p].__controllers[i].updateDisplay();
          }

        }
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

  for(var i = 0; i < env.length; i++)
  {
    var radius = env[i].z * 100.0;
    var h = i * 360.0/env.length;
    ctx.fillStyle= 'hsl( ' + h +',100%,50%)';
    ctx.beginPath();
    ctx.arc(125 + 200 * i,125,radius,0,2*Math.PI);
    ctx.fill();
  }

}





////////////////////////////////////////////AUDIO CTRL THREAD///////////////////////////////////

function updateAudio()
{
    var currentTime = audioContext.currentTime;

    for(var i = 0; i < env.length; i++)
    {
      env[i].step();
    }

    for (var property in parameters)
    {

      if(controlPanel["map_" + property] > -1 )
      {
          var i = parseInt(controlPanel["map_" + property]);
          parameters[property].value = linlin(env[i].z,0.0, 1.0,
          controlPanel["min_" + property], controlPanel["max_" + property]);
          controlPanel[property] = parameters[property].value;
      }
    }


    var envsActive = false;

    for(var i = 0; i < env.length; i++)
    {
      if(env[i].z > 0.005)
      {
        envsActive = true;
        break;
      }
    }

    if(envsActive)
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

  loadSample("samples/" + files[0]);


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
  gainNode.gain.value =  parameters.amp.value;

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


  // Update time params
  realTime += parameters.grainSpacing.value;

  if(Math.abs(parameters.speed) > 0)
  {

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

  }else{
    grainTime = parameters.regionStart.value * bufferDuration;
  }

}



/////////////////////////////////////////////// GUI stuff ////////////////////////////////////////

function EnvPanel() {

  for(var i =0; i < env.length; i++)
  {
    this[ i + "_attack" ] = env[i].attTime;
    this[ i + "_decay" ] = env[i].decTime;
  }

}


function ControlPanel()
{

  for (var property in parameters)
  {
    if (parameters.hasOwnProperty(property))
    {
      this[property] = parameters[property].value;
      this[ "map_" + property] = -1;
      this[ "min_" + property] = parameters[property].min;
      this[ "max_" + property] = parameters[property].max;

    }
  }


  this.sample = files[0];

}


function init()
{

  envPanel = new EnvPanel();
  envGui = new dat.GUI({ autoPlace: false });
  envGui.remember(envPanel);

  $('#envGui').append(envGui.domElement);

  for(var i = 0; i < env.length; i++)
  {
    var ae = envGui.add(envPanel, i + "_attack", 0.0, 5.0).step(0.01);
    var de = envGui.add(envPanel, i + "_decay", 0.0, 5.0).step(0.01);

    ae.onChange(function(value){
        var i = parseInt(this.property.substring(0,1));
        env[i].attTime = value;
        env[i].reset();
    })

    de.onChange(function(value){
      var i = parseInt(this.property.substring(0,1));
      env[i].decTime = value;
      env[i].reset();
    })
  }

  controlPanel = new ControlPanel();
  gui = new dat.GUI();
  folders = {};
  gui.remember(controlPanel); //causes problems


  var fileEvent = gui.add(controlPanel, 'sample', files );

  fileEvent.onChange(function(value){

    loadSample("samples/" + value);

  });

  var directEvents = {};


  for (var property in parameters)
  {
    if (parameters.hasOwnProperty(property)) {
      if(parameters[property].gui){

        folders[property] = gui.addFolder(property);
        directEvents[property] = folders[property].add(controlPanel, property, parameters[property].min, parameters[property].max);

        folders[property].add(controlPanel, "map_" + property, [-1, 0, 1, 2] );
        folders[property].add(controlPanel, "min_" + property, parameters[property].min, parameters[property].max ).step(0.01);
        folders[property].add(controlPanel, "max_" + property, parameters[property].min, parameters[property].max ).step(0.01);

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

//////////////////////
