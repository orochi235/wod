import type { Kit, KitSound } from './kit'
import { CHIME, CHORD, CLANKS, DEAD_HUM, DRONE, HITS, SWOOPS, type Swoop } from './schedule'

const s = (ms: number) => ms / 1000

/** A second of white noise, shared by every hit in one render. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** Soft clipping: the original's grit is a synth driven hard, not added noise. */
function drive(ctx: BaseAudioContext, amount: number): WaveShaperNode {
  const shaper = ctx.createWaveShaper()
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount)
  }
  shaper.curve = curve
  return shaper
}

function envelope(ctx: BaseAudioContext, at: number, peak: number, hold: number, release: number) {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.005)
  gain.gain.setTargetAtTime(peak * 0.35, at + 0.005, hold / 2)
  gain.gain.setTargetAtTime(0, at + hold, release / 3)
  return gain
}

/** How much quieter a rise sits than a fall: it is the machine, not the event. */
const RISE_LEVEL = 0.3

/** How long a hum takes to die away once its rise tops out. */
const HUM_RELEASE_S = 0.8

/**
 * A spin-up as an electrical buzz, in the manner of magicsmoke's arc buzz: a
 * sawtooth driven hard into a band, with a little hiss above it. Here the saw
 * follows the rise and the band climbs with it, so the buzz winds up. It comes
 * in softly and dies away under the mix.
 */
function hum(ctx: BaseAudioContext, out: AudioNode, t0: number, sw: Swoop, noise: AudioBuffer) {
  const at = t0 + s(sw.at)
  const end = at + s(sw.ms)
  const stop = end + HUM_RELEASE_S
  const level = sw.gain * RISE_LEVEL

  const gate = ctx.createGain()
  gate.gain.setValueAtTime(0.0001, at)
  gate.gain.exponentialRampToValueAtTime(level, at + Math.min(0.03, s(sw.ms) / 3))
  gate.gain.setValueAtTime(level, end)
  gate.gain.setTargetAtTime(0, end, HUM_RELEASE_S / 4)
  gate.connect(out)

  const saw = ctx.createOscillator()
  saw.type = 'sawtooth'
  saw.frequency.setValueAtTime(sw.from, at)
  saw.frequency.exponentialRampToValueAtTime(sw.to, end)
  const shaper = drive(ctx, 5)
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 1.2
  band.frequency.setValueAtTime(450, at)
  band.frequency.exponentialRampToValueAtTime(450 * (sw.to / sw.from), end)
  saw.connect(shaper).connect(band).connect(gate)
  saw.start(at)
  saw.stop(stop)

  const hiss = ctx.createBufferSource()
  hiss.buffer = noise
  hiss.loop = true
  const high = ctx.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 5000
  const hissMix = ctx.createGain()
  hissMix.gain.value = 0.06
  hiss.connect(high).connect(hissMix).connect(gate)
  hiss.start(at)
  hiss.stop(stop)
}

function swoop(ctx: BaseAudioContext, out: AudioNode, t0: number, sw: Swoop, noise: AudioBuffer) {
  const at = t0 + s(sw.at)
  const end = at + s(sw.ms)
  const env = envelope(ctx, at, sw.gain, s(sw.ms), 0.18)
  for (const [type, ratio, level] of [
    ['sawtooth', 1, 0.6],
    ['square', 2, 0.25],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(sw.from * ratio, at)
    osc.frequency.exponentialRampToValueAtTime(sw.to * ratio, end)
    const mix = ctx.createGain()
    mix.gain.value = level
    osc.connect(mix).connect(env)
    osc.start(at)
    osc.stop(end + 0.4)
  }
  env.connect(out)

  // The attack's click, which the ear reads as the swoop being struck.
  const hit = ctx.createBufferSource()
  hit.buffer = noise
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 2200
  const hitEnv = envelope(ctx, at, 0.5 * sw.gain, 0.02, 0.04)
  hit.connect(band).connect(hitEnv).connect(out)
  hit.start(at)
  hit.stop(at + 0.15)
}

/** A decaying noise tail, the room a snare is struck in. */
function room(ctx: BaseAudioContext, seconds: number, decay: number): ConvolverNode {
  const length = Math.floor(ctx.sampleRate * seconds)
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay
    }
  }
  const convolver = ctx.createConvolver()
  convolver.buffer = impulse
  return convolver
}

/** A fixed 0..1 per hit, so each one has its own character but replays the same. */
const vary = (n: number, salt: number): number => {
  const x = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Ratios with no common root, so the partials never add up to a pitch. */
const METAL = [1, 1.47, 1.93, 2.61, 3.37, 4.12]

/**
 * Struck metal: inharmonic squares through a resonant band, an impact of noise,
 * a short feedback delay that rings like a pipe, and a sub thud under it. `hz`
 * sets how large the struck thing is; `n` gives it its own shape and ring.
 */
function clank(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  gain: number,
  baseHz: number,
  n: number,
  noise: AudioBuffer,
) {
  const hz = baseHz * (0.8 + 0.4 * vary(n, 1))
  const decay = 0.25 + 0.6 * vary(n, 2)
  const stretch = 0.9 + 0.25 * vary(n, 3)
  const weight = 0.8 + 0.7 * vary(n, 4)

  const hit = ctx.createGain()
  hit.gain.value = gain
  hit.connect(drive(ctx, 3 + 3 * vary(n, 5))).connect(out)

  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = hz * (4 + 4 * vary(n, 6))
  band.Q.value = 0.8 + 2 * vary(n, 7)
  const ring = ctx.createGain()
  ring.gain.setValueAtTime(0, at)
  ring.gain.linearRampToValueAtTime(0.9, at + 0.001)
  ring.gain.exponentialRampToValueAtTime(0.25, at + 0.06)
  ring.gain.exponentialRampToValueAtTime(0.001, at + decay)
  band.connect(ring).connect(hit)
  METAL.forEach((ratio, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    // Stretching the partials apart changes what the metal is, not just its size.
    osc.frequency.value = hz * ratio ** stretch
    const mix = ctx.createGain()
    mix.gain.value = 0.18 * (0.6 + 0.8 * vary(n, 10 + i))
    osc.connect(mix).connect(band)
    osc.start(at)
    osc.stop(at + decay + 0.05)
  })

  const impact = ctx.createBufferSource()
  impact.buffer = noise
  const snap = ctx.createBiquadFilter()
  snap.type = 'bandpass'
  snap.frequency.value = 1000 * (0.6 + 0.8 * vary(n, 9))
  const snapEnv = ctx.createGain()
  snapEnv.gain.setValueAtTime(1, at)
  snapEnv.gain.exponentialRampToValueAtTime(0.001, at + 0.05)
  impact.connect(snap).connect(snapEnv).connect(hit)
  impact.start(at)
  impact.stop(at + 0.08)

  // The pipe: a few milliseconds of delay fed back on itself rings at its own pitch.
  const pipe = ctx.createDelay(0.1)
  pipe.delayTime.value = 1 / (hz * (1.3 + vary(n, 16)))
  const feedback = ctx.createGain()
  feedback.gain.setValueAtTime(0.6 + 0.3 * vary(n, 17), at)
  feedback.gain.linearRampToValueAtTime(0, at + decay)
  const damp = ctx.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 2500 + 3000 * vary(n, 18)
  snapEnv.connect(pipe)
  ring.connect(pipe)
  pipe.connect(damp).connect(feedback).connect(pipe)
  const pipeOut = ctx.createGain()
  pipeOut.gain.value = 0.5
  damp.connect(pipeOut).connect(hit)

  const thud = ctx.createOscillator()
  thud.type = 'sine'
  thud.frequency.setValueAtTime(Math.max(45, hz * 1.2), at)
  thud.frequency.exponentialRampToValueAtTime(28 + 12 * vary(n, 19), at + 0.12)
  const thudEnv = ctx.createGain()
  thudEnv.gain.setValueAtTime(0, at)
  thudEnv.gain.linearRampToValueAtTime(1.2 * weight, at + 0.002)
  thudEnv.gain.exponentialRampToValueAtTime(0.001, at + 0.2 + 0.25 * vary(n, 20))
  thud.connect(thudEnv).connect(out)
  thud.start(at)
  thud.stop(at + 0.5)

  // A hard room, left to ring: a factory, not a studio.
  const space = ctx.createGain()
  space.gain.value = 0.2 + 0.2 * vary(n, 21)
  ring
    .connect(room(ctx, 1.2, 2))
    .connect(space)
    .connect(out)
}

/**
 * A whack: a tight, punchy drum body, a broad slap and a hard stick crack,
 * saturated and almost dry. No wires, so it hits rather than sizzles.
 */
function smack(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  gain: number,
  n: number,
  noise: AudioBuffer,
) {
  const hit = ctx.createGain()
  hit.gain.value = gain
  hit.connect(drive(ctx, 4)).connect(out)
  const space = ctx.createGain()
  space.gain.value = 0.04
  hit
    .connect(room(ctx, 0.25, 3))
    .connect(space)
    .connect(out)

  const tune = 0.95 + 0.1 * vary(n, 70)
  for (const [hz, level, life] of [
    [200, 1, 0.09],
    [330, 0.45, 0.06],
  ] as const) {
    const body = ctx.createOscillator()
    body.type = 'triangle'
    body.frequency.setValueAtTime(hz * tune * 1.25, at)
    body.frequency.exponentialRampToValueAtTime(hz * tune, at + 0.012)
    const env = ctx.createGain()
    env.gain.setValueAtTime(level, at)
    env.gain.exponentialRampToValueAtTime(0.001, at + life)
    body.connect(env).connect(hit)
    body.start(at)
    body.stop(at + life + 0.02)
  }

  // The whack: a broad slap of the stick flat on the head, loud and gone.
  const slap = ctx.createBufferSource()
  slap.buffer = noise
  const flat = ctx.createBiquadFilter()
  flat.type = 'bandpass'
  flat.frequency.value = 900 * (0.85 + 0.3 * vary(n, 71))
  flat.Q.value = 0.8
  const slapEnv = ctx.createGain()
  slapEnv.gain.setValueAtTime(2, at)
  slapEnv.gain.exponentialRampToValueAtTime(0.001, at + 0.025)
  slap.connect(flat).connect(slapEnv).connect(hit)
  slap.start(at, vary(n, 72) * (noise.duration - 0.05), 0.05)

  // The stick: a hard crack at the very front.
  const stick = ctx.createBufferSource()
  stick.buffer = noise
  const edge = ctx.createBiquadFilter()
  edge.type = 'bandpass'
  edge.frequency.value = 3500
  const crack = ctx.createGain()
  crack.gain.setValueAtTime(1.4, at)
  crack.gain.exponentialRampToValueAtTime(0.001, at + 0.006)
  stick.connect(edge).connect(crack).connect(hit)
  stick.start(at, vary(n, 73) * (noise.duration - 0.02), 0.02)
}

/** The room's power still on in the dark: mains and two harmonics, swelling slowly. */
/** A valve's clack: a few fixed partials, the same every stroke, as a machined part is. */
const VALVE = [
  [1, 1],
  [1.51, 0.6],
  [2.23, 0.35],
] as const

/**
 * One stroke of a big, well-built engine: a heavy thunk, a chug of the body, a
 * valve's clean clack and a puff of steam after it. Strokes alternate between
 * two tunings, as a two-stroke does, and climb in pitch and weight across the
 * run as the machine comes up to speed. Nothing is randomized: it is machined.
 */
function piston(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  gain: number,
  stroke: number,
  of: number,
  noise: AudioBuffer,
) {
  const progress = of > 1 ? stroke / (of - 1) : 1
  const tune = (stroke % 2 === 0 ? 1 : 1.12) * (1 + 0.2 * progress)
  const weight = gain * (0.85 + 0.35 * progress)

  const hit = ctx.createGain()
  hit.gain.value = weight
  hit.connect(drive(ctx, 2)).connect(out)
  const space = ctx.createGain()
  space.gain.value = 0.03
  hit
    .connect(room(ctx, 0.3, 3))
    .connect(space)
    .connect(out)

  // The strike: the piston's face meeting the head, before anything else sounds.
  const strike = ctx.createBufferSource()
  strike.buffer = noise
  const face = ctx.createBiquadFilter()
  face.type = 'highpass'
  face.frequency.value = 1000
  const strikeEnv = ctx.createGain()
  strikeEnv.gain.setValueAtTime(1.8, at)
  strikeEnv.gain.exponentialRampToValueAtTime(0.001, at + 0.004)
  strike.connect(face).connect(strikeEnv).connect(hit)
  strike.start(at, (stroke * 0.211) % (noise.duration - 0.01), 0.01)

  // The punch: the thunk lands high and drops fast, which is what makes it hit.
  const thunk = ctx.createOscillator()
  thunk.type = 'sine'
  thunk.frequency.setValueAtTime(140 * tune, at)
  thunk.frequency.exponentialRampToValueAtTime(45 * tune, at + 0.03)
  const thunkEnv = ctx.createGain()
  thunkEnv.gain.setValueAtTime(1.3, at)
  thunkEnv.gain.exponentialRampToValueAtTime(0.001, at + 0.14)
  thunk.connect(thunkEnv).connect(hit)
  thunk.start(at)
  thunk.stop(at + 0.16)

  const chug = ctx.createOscillator()
  chug.type = 'square'
  chug.frequency.value = 110 * tune
  const chugTone = ctx.createBiquadFilter()
  chugTone.type = 'lowpass'
  chugTone.frequency.value = 600
  const chugEnv = ctx.createGain()
  chugEnv.gain.setValueAtTime(0.35, at)
  chugEnv.gain.exponentialRampToValueAtTime(0.001, at + 0.05)
  chug.connect(chugTone).connect(chugEnv).connect(hit)
  chug.start(at)
  chug.stop(at + 0.07)

  const clack = ctx.createBiquadFilter()
  clack.type = 'bandpass'
  clack.frequency.value = 900 * tune
  clack.Q.value = 1.5
  const clackEnv = ctx.createGain()
  clackEnv.gain.setValueAtTime(0.7, at)
  clackEnv.gain.exponentialRampToValueAtTime(0.001, at + 0.05)
  clack.connect(clackEnv).connect(hit)
  for (const [ratio, level] of VALVE) {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 400 * tune * ratio
    const mix = ctx.createGain()
    mix.gain.value = 0.25 * level
    osc.connect(mix).connect(clack)
    osc.start(at)
    osc.stop(at + 0.09)
  }

  // The steam: a short breath out just after the stroke.
  const puff = ctx.createBufferSource()
  puff.buffer = noise
  const steam = ctx.createBiquadFilter()
  steam.type = 'bandpass'
  steam.frequency.value = 5500
  steam.Q.value = 0.8
  const puffEnv = ctx.createGain()
  const breath = at + 0.02
  puffEnv.gain.setValueAtTime(0, at)
  puffEnv.gain.linearRampToValueAtTime(0.08, breath + 0.015)
  puffEnv.gain.exponentialRampToValueAtTime(0.001, breath + 0.1)
  puff.connect(steam).connect(puffEnv).connect(hit)
  puff.start(at, (stroke * 0.137) % (noise.duration - 0.2), 0.2)
}

/**
 * A rimshot: the stick catching head and rim at once. A sharp, bright tock with
 * a short cutting ring and little body under it.
 */
function rimshot(
  ctx: BaseAudioContext,
  out: AudioNode,
  at: number,
  gain: number,
  n: number,
  noise: AudioBuffer,
) {
  const hit = ctx.createGain()
  hit.gain.value = gain
  hit.connect(out)
  const space = ctx.createGain()
  space.gain.value = 0.12
  hit
    .connect(room(ctx, 0.4, 3))
    .connect(space)
    .connect(out)

  const tune = 0.97 + 0.06 * vary(n, 80)
  for (const [hz, level, life] of [
    [470, 1, 0.05],
    [1720, 0.6, 0.035],
    [2650, 0.3, 0.025],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = hz * tune
    const env = ctx.createGain()
    env.gain.setValueAtTime(level, at)
    env.gain.exponentialRampToValueAtTime(0.001, at + life)
    osc.connect(env).connect(hit)
    osc.start(at)
    osc.stop(at + life + 0.01)
  }

  const crack = ctx.createBufferSource()
  crack.buffer = noise
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 3000
  band.Q.value = 1.2
  const crackEnv = ctx.createGain()
  crackEnv.gain.setValueAtTime(1.6, at)
  crackEnv.gain.exponentialRampToValueAtTime(0.001, at + 0.04)
  crack.connect(band).connect(crackEnv).connect(hit)
  crack.start(at, vary(n, 81) * (noise.duration - 0.05), 0.05)
}

function deadHum(ctx: BaseAudioContext, out: AudioNode, t0: number) {
  const at = t0 + s(DEAD_HUM.from)
  const end = t0 + s(DEAD_HUM.to)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.22, at + 0.35)
  gain.gain.setValueAtTime(0.22, end - 0.3)
  gain.gain.linearRampToValueAtTime(0, end)
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 400
  gain.connect(low).connect(out)

  // A slow warble, like a transformer under load.
  const warble = ctx.createGain()
  warble.gain.value = 0.85
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.7
  const depth = ctx.createGain()
  depth.gain.value = 0.15
  lfo.connect(depth).connect(warble.gain)
  warble.connect(gain)
  lfo.start(at)
  lfo.stop(end)

  for (const [ratio, level] of [
    [1, 1],
    [2, 0.45],
    [3, 0.2],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = DEAD_HUM.hz * ratio
    const mix = ctx.createGain()
    mix.gain.value = level
    osc.connect(mix).connect(warble)
    osc.start(at)
    osc.stop(end)
  }
}

function drone(ctx: BaseAudioContext, out: AudioNode, t0: number) {
  const at = t0 + s(DRONE.from)
  const end = t0 + s(DRONE.to)
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = DRONE.hz
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 320
  // Swells up out of the pop rather than starting with it, and lets go slowly.
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.7)
  gain.gain.setValueAtTime(0.35, end)
  gain.gain.linearRampToValueAtTime(0, end + 0.5)
  osc.connect(low).connect(gain).connect(out)
  osc.start(at)
  osc.stop(end + 0.55)
}

/**
 * The chord as machinery that happens to be in tune: each note is mostly noise
 * ringing through a narrow band at that pitch, like air singing in a pipe, over
 * a quieter tone, a mains hum and a motor's flutter. It swells in rather than
 * striking, holds, then settles into its room as it fades.
 */
function chord(ctx: BaseAudioContext, out: AudioNode, t0: number, noise: AudioBuffer) {
  const at = t0 + s(CHORD.at)
  const hold = at + s(CHORD.holdMs)
  const end = hold + s(CHORD.fadeMs)
  const stop = end + 0.1

  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.setValueAtTime(500, at)
  low.frequency.exponentialRampToValueAtTime(2000, at + 0.15)
  low.frequency.exponentialRampToValueAtTime(1400, hold)
  low.frequency.exponentialRampToValueAtTime(450, end)
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, at)
  env.gain.exponentialRampToValueAtTime(0.28, at + 0.08)
  env.gain.setValueAtTime(0.28, hold)
  env.gain.exponentialRampToValueAtTime(0.001, end)
  low.connect(env)

  // A motor's flutter on the level: it is a machine, not a player.
  const flutter = ctx.createGain()
  flutter.gain.value = 1
  const ripple = ctx.createOscillator()
  ripple.frequency.value = 11
  const rippleDepth = ctx.createGain()
  rippleDepth.gain.value = 0.08
  ripple.connect(rippleDepth).connect(flutter.gain)
  ripple.start(at)
  ripple.stop(stop)
  env.connect(flutter)

  // The settle: the dry chord fades faster than its room.
  const dry = ctx.createGain()
  dry.gain.setValueAtTime(1, hold)
  dry.gain.linearRampToValueAtTime(0.35, end)
  const wet = ctx.createGain()
  wet.gain.setValueAtTime(0.3, at)
  wet.gain.linearRampToValueAtTime(0.7, end)
  flutter.connect(dry).connect(out)
  flutter
    .connect(room(ctx, 3.5, 2.5))
    .connect(wet)
    .connect(out)

  // Slow drift, wide at first and easing off as the chord settles.
  const drift = ctx.createOscillator()
  drift.frequency.value = 0.6
  const drifting = ctx.createGain()
  drifting.gain.setValueAtTime(6, at)
  drifting.gain.linearRampToValueAtTime(1, end)
  drift.connect(drifting)
  drift.start(at)
  drift.stop(stop)

  const tone = (hz: number, type: OscillatorType, level: number) => {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = hz
    drifting.connect(osc.detune)
    const mix = ctx.createGain()
    mix.gain.value = level
    osc.connect(mix).connect(low)
    osc.start(at)
    osc.stop(stop)
  }

  const air = ctx.createBufferSource()
  air.buffer = noise
  air.loop = true
  air.start(at)
  air.stop(stop)
  const pipe = (hz: number, level: number) => {
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = hz
    band.Q.value = 60
    const mix = ctx.createGain()
    // A narrow band passes little, so it is made up here.
    mix.gain.value = level
    air.connect(band).connect(mix).connect(low)
  }

  for (const hz of CHORD.hz) {
    pipe(hz, 1.6)
    tone(hz, 'triangle', 0.055)
  }
  for (const hz of CHORD.low) {
    if (hz < 90) tone(hz, 'sine', 0.35)
    else {
      pipe(hz, 2.2)
      tone(hz, 'triangle', 0.05)
    }
  }
  // The choir: each note sung by three voices a few cents apart, over its own
  // breath of resonant noise, so it reads as a section and not one tone.
  for (const hz of CHORD.choir) {
    pipe(hz, 2)
    for (const cents of [-11, 0, 11]) {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = hz
      osc.detune.value = cents
      drifting.connect(osc.detune)
      const mix = ctx.createGain()
      mix.gain.value = 0.045
      osc.connect(mix).connect(low)
      osc.start(at)
      osc.stop(stop)
    }
  }
  // The mains under it all.
  for (const [hz, level] of [
    [60, 0.3],
    [120, 0.15],
    [180, 0.08],
  ] as const) {
    tone(hz, 'sine', level)
  }
}

/** A startup chime: detuned organ saws on a wide major chord, a quick swell, a long ring. */
function chime(ctx: BaseAudioContext, out: AudioNode, t0: number) {
  const at = t0 + s(CHIME.at)
  const end = at + s(CHIME.ringMs)
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.setValueAtTime(1200, at)
  low.frequency.exponentialRampToValueAtTime(5000, at + 0.05)
  low.frequency.exponentialRampToValueAtTime(700, end)
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, at)
  env.gain.exponentialRampToValueAtTime(0.35, at + 0.03)
  env.gain.setTargetAtTime(0.22, at + 0.03, 0.4)
  env.gain.exponentialRampToValueAtTime(0.001, end)
  const wet = ctx.createGain()
  wet.gain.value = 0.45
  low.connect(env).connect(out)
  env
    .connect(room(ctx, 3, 2.5))
    .connect(wet)
    .connect(out)
  CHIME.hz.forEach((hz, i) => {
    for (const cents of [-6, 6]) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = hz
      osc.detune.value = cents
      const mix = ctx.createGain()
      // The top octave is a sheen, not a voice.
      mix.gain.value = i === CHIME.hz.length - 1 ? 0.02 : 0.06
      osc.connect(mix).connect(low)
      osc.start(at)
      osc.stop(end + 0.1)
    }
  })
}

/**
 * Plays a recorded one-shot. `rate` pitches it, slower being lower and heavier.
 * Returns false when the kit has no such sound, so the caller can fall back.
 */
function sample(
  ctx: BaseAudioContext,
  out: AudioNode,
  kit: Kit,
  name: KitSound,
  at: number,
  gain: number,
  rate = 1,
): boolean {
  const buffer = kit[name]
  if (!buffer) return false
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = rate
  const level = ctx.createGain()
  level.gain.value = gain
  source.connect(level).connect(out)
  source.start(at)
  return true
}

export type PlayOptions = {
  volume?: number
  /** Recorded drums to play the percussion on. Without it, every hit is synthesized. */
  kit?: Kit
  /**
   * Ids from the schedule to leave out, for auditioning one part at a time.
   * Defaults to the chime, the chord's alternative.
   */
  skip?: ReadonlySet<string>
}

/**
 * Schedules the whole passage with the pop at context time `when`. Returns the
 * gain everything runs through, so a caller can mute it mid-flight.
 */
export function playOutage(
  ctx: BaseAudioContext,
  when: number,
  { volume = 0.6, skip = new Set([CHIME.id]), kit = {} }: PlayOptions = {},
): GainNode {
  const master = ctx.createGain()
  master.gain.value = volume
  const squash = ctx.createDynamicsCompressor()
  master.connect(squash).connect(ctx.destination)

  const noise = noiseBuffer(ctx)
  const grit = drive(ctx, 3)
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2600
  grit.connect(tone).connect(master)

  for (const sw of SWOOPS) {
    if (skip.has(sw.id)) continue
    // Rises stay clean: through the drive, a hum turns into a bark.
    if (sw.to > sw.from) hum(ctx, master, when, sw, noise)
    else swoop(ctx, grit, when, sw, noise)
  }
  HITS.forEach((hit, index) => {
    if (skip.has(hit.id)) return
    const at = when + s(hit.at)
    if (hit.sound === 'whack') smack(ctx, master, at, hit.gain * 2.2, index, noise)
    else if (hit.sound === 'piston') {
      // A kick and a low tom's rimshot are the weight; the synth keeps the machine on top.
      const heavy = sample(ctx, master, kit, 'kick', at, hit.gain * 1.3)
      sample(ctx, master, kit, 'tom-rimshot', at, hit.gain * 1.1, 0.85 + 0.05 * (hit.stroke % 2))
      piston(ctx, master, at, hit.gain * (heavy ? 0.7 : 1.6), hit.stroke, hit.of, noise)
    } else if (hit.sound === 'rimshot') {
      const take = index % 2 === 0 ? 'rimshot' : 'rimshot-soft'
      if (!sample(ctx, master, kit, take, at, hit.gain * 1.6)) {
        rimshot(ctx, master, at, hit.gain * 1.4, index, noise)
      }
    } else {
      // The stick's body under the metal, pitched down with the size of the metal.
      const body = sample(
        ctx,
        master,
        kit,
        'stickshot',
        at,
        hit.gain,
        Math.min(1, hit.hz / 110) * 0.8,
      )
      clank(ctx, master, at, hit.gain * (body ? 0.7 : 1), hit.hz, index, noise)
    }
  })

  CLANKS.forEach((c, i) => {
    if (skip.has(c.id)) return
    const at = when + s(c.at)
    const body = sample(ctx, master, kit, 'stickshot', at, 1, Math.min(1, c.hz / 110) * 0.8)
    clank(ctx, master, at, body ? 0.7 : 1, c.hz, 200 + i, noise)
  })
  if (!skip.has(DRONE.id)) drone(ctx, grit, when)
  if (!skip.has(DEAD_HUM.id)) deadHum(ctx, master, when)
  if (!skip.has(CHORD.id)) chord(ctx, master, when, noise)
  if (!skip.has(CHIME.id)) chime(ctx, master, when)
  return master
}
