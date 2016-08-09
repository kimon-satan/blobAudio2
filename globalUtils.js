/*---------------------------------------------------------GENERIC FUNCTIONS-----------------------------------*/




//hashable random function

rand = function(x){
  var f  = fract(Math.sin(x)*1308153369613);
  return f;
}

fract = function(f)
{
  return (f < 1.0) ? f : (f % Math.floor(f));
}

//seedable object

Rand = function(seed) {

  //ensures seed is a 6 digit number
  this.seed = Math.floor(rand(seed) * 100000);

  this.getRand = function(x){

    var f  = fract(Math.sin(x)*1308153369613 + seed);
    return f;
  }
}

randCol = function(){

	return '#'+Math.floor(Math.random()*16777215).toString(16);
}

/*-----------------------------------------------------------------------*/

generateTempId  = function(n){

  var chars = "abcdefghijklmnnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ!@£$%^&*()-=_+";
  var count = 0;
  var str = "";
  var idx;

  while(count < n){

    idx = Math.random() * (chars.length - 1);
    str += chars[parseInt(idx)];
    count++;
  }

  return str;

}

/* -------------------------------------MAPPING -----------------------------------------*/

linlin = function(input, i_min, i_max, o_min, o_max)
{
  var i_range = Math.abs(i_max - i_min);
  var norm = (input - i_min)/i_range;
  //reversing if min and max are otherway round
  if(i_min > i_max){
    norm = 1.0 - norm;
  }
  if(o_min > o_max)
  {
    norm = 1.0 - norm;
  }
  var o_range = Math.abs(o_max - o_min);
  var out = norm * o_range + Math.min(o_min, o_max);
  return out;
}

linexp = function(input, i_min, i_max, o_min, o_max, exp)
{
  var i_range = Math.abs(i_max - i_min);
  var norm = (input - i_min)/i_range;

  if(i_min > i_max){
    norm = 1.0 - norm;
  }
  if(o_min > o_max)
  {
    norm = 1.0 - norm;
  }

  var o_range = Math.abs(o_max - o_min);
  var out = Math.pow(norm,exp) * o_range + Math.min(o_min, o_max);
  return out;
}

/*------------------------------------------------ONE POLE -----------------------------------*/

//for enveloping

Envelope = function(time, sampleRate)
{
  this.a  = 0;
  this.b = 0;
  this.z = 0.0;
  this.time = time;
  this.targetVal = 0.0;
  this.sampleRate = sampleRate;


  this.step = function()
  {
    this.z = this.targetVal * this.a + this.z * this.b;
    return this.z;
  }

  this.setTime = function()
  {
    this.b = Math.exp(-1.0/(this.time * this.sampleRate));
    this.a = 1.0 - this.b;
  }

  this.setTime(this.time);

}

//////////////////////Different attacks and decays/////////////////////////

Envelope2 = function(attTime, decTime, sampleRate)
{
  this.a_att  = 0;
  this.b_att = 0;
  this.a_dec  = 0;
  this.b_dec = 0;

  this.z = 0.0;

  this.targetVal = 0.0;
  this.sampleRate = sampleRate;


  this.step = function()
  {
    if(this.targetVal == this.z)
    {
      return
    }
    else if(this.targetVal < this.z)
    {
      this.z = this.targetVal * this.a_dec + this.z * this.b_dec;
    }
    else
    {
      this.z = this.targetVal * this.a_att + this.z * this.b_att;
    }

  }

  this.setAttDel = function(attTime, decTime)
  {
    this.attTime = attTime;
    this.decTime = decTime;

    this.b_att = Math.exp(-1.0/(attTime * this.sampleRate));
    this.a_att = 1.0 - this.b_att;
    this.b_dec = Math.exp(-1.0/(decTime * this.sampleRate));
    this.a_dec = 1.0 - this.b_dec;
  }

  this.reset = function(){
    this.setAttDel(this.attTime, this.decTime);
    this.z = 0.0;
  }

  this.setAttDel(attTime, decTime);

}
