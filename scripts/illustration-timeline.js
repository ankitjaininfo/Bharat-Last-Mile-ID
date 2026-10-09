/* Reusable, seekable clock for self-contained illustration timelines. */
class IllustrationTimeline {
  constructor({duration, render, onState = () => {}}) {
    this.duration = duration; this.render = render; this.onState = onState;
    this.time = 0; this.playing = false; this.previous = null;
    this.tick = this.tick.bind(this); this.render(0);
  }
  tick(now) {
    if (!this.playing) return;
    if (this.previous !== null) this.time = Math.min(this.duration, this.time + (now-this.previous)/1000);
    this.previous = now; this.render(this.time);
    if (this.time >= this.duration) { this.pause(); return; }
    requestAnimationFrame(this.tick);
  }
  play() { if(this.playing) return; if(this.time >= this.duration) this.time=0; this.playing=true; this.previous=null; this.onState(this); requestAnimationFrame(this.tick); }
  pause() { this.playing=false; this.previous=null; this.onState(this); }
  seek(time) { this.time=Math.max(0,Math.min(this.duration,time)); this.previous=null; this.render(this.time); this.onState(this); }
  replay() { this.pause(); this.seek(0); this.play(); }
}
