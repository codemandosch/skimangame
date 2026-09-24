import test from "node:test";
import assert from "node:assert/strict";
import { createState, step, respawn, resolveLanding } from "../src/physics.js";
import { groundHeight, JUMPS, LENGTH } from "../src/course.js";

test("a 180 lands switch, preserves visible yaw, and carries switch into the next jump", () => {
  const s = createState();
  s.airborne = true;
  s.spin = Math.PI - 0.15;
  s.spinTravel = s.spin;
  s.airtime = 2;
  const before = s.stanceYaw + s.spin + s.yawOffset;
  resolveLanding(s);
  assert.equal(s.switch, true);
  assert.ok(Math.abs(s.stanceYaw + s.spin + s.yawOffset - before) < 1e-8);
  advance(s, 0.4);
  assert.equal(s.switch, true);
  step(s, { pop: true }, 1 / 120);
  assert.equal(s.airborne, true);
  assert.equal(s.takeoffSwitch, true);
  assert.equal(s.spinTravel, 0);
  assert.equal(s.stanceYaw, Math.PI);
});
test("switch straight airs and 360s stay switch; another 180 returns to forward", () => {
  const s = createState();
  s.airborne = true;
  s.spin = -Math.PI;
  s.airtime = 2;
  resolveLanding(s);
  assert.equal(s.switch, true);
  for (const spin of [0, Math.PI * 2]) {
    step(s, { pop: true }, 1 / 120);
    s.spin = spin;
    s.spinTravel = Math.abs(spin);
    s.airtime = 2;
    resolveLanding(s);
    assert.equal(s.switch, true);
  }
  step(s, { pop: true }, 1 / 120);
  s.spin = Math.PI;
  s.spinTravel = Math.PI;
  s.airtime = 2;
  resolveLanding(s);
  assert.equal(s.switch, false);
  assert.match(s.lastTrick, /SWITCH.*180/);
  respawn(s);
  assert.equal(s.switch, false);
  assert.equal(s.stanceYaw, 0);
  assert.equal(s.yawOffset, 0);
});
test("automatic ramp takeoff preserves a switch stance and left/right steering remains screen-relative", () => {
  const s = createState();
  s.airborne = true;
  s.spin = Math.PI;
  s.airtime = 2;
  resolveLanding(s);
  advance(s, 0.4, { steer: 1 });
  assert.ok(s.x > 0);
  s.x = 0;
  s.vx = 0;
  while (!s.airborne && s.s < 120) step(s, {}, 1 / 120);
  assert.equal(s.airborne, true);
  assert.equal(s.takeoffSwitch, true);
  assert.equal(s.switch, true);
});

function advance(s, seconds, input = {}) {
  for (let t = 0; t < seconds; t += 1 / 120) step(s, input, 1 / 120);
}

test("gravity accelerates skiing and braking reduces speed", () => {
  const s = createState();
  const initial = s.speed;
  advance(s, 2);
  assert.ok(s.speed > initial);
  const fast = s.speed;
  advance(s, 1, { brake: true });
  assert.ok(s.speed < fast);
});
test("an unsteered run launches from all five ramps and reaches the finish", () => {
  const s = createState();
  let takeoffs = 0,
    landings = 0,
    air = false;
  for (let i = 0; i < 120 * 120 && !s.finished; i++) {
    step(s, {}, 1 / 120);
    if (s.airborne && !air) takeoffs++;
    if (!s.airborne && air) landings++;
    air = s.airborne;
  }
  assert.equal(takeoffs, 5);
  assert.equal(landings, 5);
  assert.equal(s.jumps, 5);
  assert.ok(s.finished);
  assert.ok(s.s >= LENGTH);
});
test("charging before releasing space produces a higher jump", () => {
  const short = createState(),
    charged = createState();
  advance(charged, 0.9, { charge: true });
  step(charged, { pop: true }, 1 / 120);
  step(short, { pop: true }, 1 / 120);
  assert.ok(charged.airborne);
  assert.ok(charged.vy > short.vy + 1.5);
  assert.ok(charged.vy < short.vy + 3.5);
});
test("air controls rotate the skier and a held grab builds trick value", () => {
  const s = createState();
  step(s, { pop: true }, 1 / 120);
  advance(s, 0.25, { spin: 1, flip: 1, grab: 1 });
  assert.ok(s.spin > 0.5);
  assert.ok(s.flip > 0.5);
  assert.ok(s.grabTime > 0.15);
});
test("clean rotations bank score, while an upside-down landing loses the combo", () => {
  const s = createState();
  s.airborne = true;
  s.spin = Math.PI * 2;
  s.flip = 0;
  s.spinTravel = Math.PI * 2;
  s.airtime = 2;
  s.grabTime = 0.8;
  s.grabs.add(1);
  resolveLanding(s);
  assert.ok(s.score >= 600);
  assert.equal(s.bailTimer, 0);
  const b = createState();
  b.airborne = true;
  b.flip = Math.PI;
  b.flipTravel = Math.PI;
  b.airtime = 2;
  resolveLanding(b);
  assert.equal(b.score, 0);
  assert.ok(b.bailTimer > 0);
});
test("pause freezes simulation and respawn clears all transient run state", () => {
  const s = createState();
  advance(s, 2);
  s.paused = true;
  const pos = s.s;
  advance(s, 2, { steer: 1 });
  assert.equal(s.s, pos);
  s.score = 900;
  s.airborne = true;
  s.charge = 1;
  respawn(s);
  assert.equal(s.s, 0);
  assert.equal(s.score, 0);
  assert.equal(s.airborne, false);
  assert.equal(s.charge, 0);
  assert.equal(s.paused, false);
});
test("slope contact stays finite and lateral steering is contained", () => {
  const s = createState();
  advance(s, 18, { steer: 1 });
  assert.ok(Number.isFinite(s.y));
  assert.ok(Math.abs(s.x) < 80);
  assert.ok(s.y >= groundHeight(s.x, s.s) - 0.1);
});
test("ramps have actual raised surfaces and sufficient spacing for landings", () => {
  assert.equal(JUMPS.length, 5);
  for (const j of JUMPS) {
    assert.ok(groundHeight(j.x, j.lip) > groundHeight(j.x + 25, j.lip) + 3);
  }
});

test("releasing spin brakes smoothly without completing a 180", () => {
  const s = createState();
  while (!s.airborne) step(s, {}, 1 / 120);
  advance(s, 0.5, { spin: 1 });
  const angle = s.spin;
  advance(s, 0.4);
  assert.equal(s.airborne, true);
  assert.ok(s.spin > angle && s.spin < Math.PI);
  assert.ok(s.spinVelocity < 0.3);
});
test("releasing flip slows rotation without rescuing an inverted landing", () => {
  const s = createState();
  s.airborne = true;
  s.y += 40;
  advance(s, 0.8, { flip: 1 });
  const angle = s.flip;
  advance(s, 0.4);
  assert.equal(s.airborne, true);
  assert.ok(s.flip > angle && s.flip < angle + 0.65);
  while (s.airborne) step(s, {}, 1 / 120);
  assert.equal(s.score, 0);
  assert.ok(s.bailTimer > 0);
});

test("a tilted spin retains its off-axis pitch after flip momentum settles", () => {
  for (const direction of [-1, 1]) {
    const s = createState();
    s.s = JUMPS[0].lip - 0.05;
    s.y = groundHeight(s.x, s.s);
    s.charge = 1;
    step(s, { pop: true }, 1 / 120);
    for (let i = 0; i < 20; i++) step(s, { flip: direction }, 1 / 120);
    advance(s, 1);
    const pitch = s.flip;
    advance(s, 0.2, { spin: direction, grab: 1 });
    assert.equal(s.flip, pitch);
    assert.ok(Math.abs(s.spin) > 0 && Math.abs(s.spin) < 0.1, "late spin input only makes a small correction");
    const yaw = s.spin;
    for (let i = 0; i < 20; i++) step(s, { flip: -direction }, 1 / 120);
    assert.ok(Math.abs(s.flip) < Math.abs(pitch));
    assert.ok(Math.abs(s.spin) > Math.abs(yaw), "spin coasts while braking");
  }
});

test("takeoff preserves residual switch heading throughout a straight air", () => {
  const s = createState();
  s.stanceYaw = Math.PI;
  s.switch = true;
  s.yawOffset = 0.3;
  step(s, { pop: true }, 1 / 120);
  const heading = s.stanceYaw + s.yawOffset;
  advance(s, 0.2);
  assert.equal(s.stanceYaw + s.yawOffset, heading);
});

test("partial turns across successive jumps allow sideways upright landings", () => {
  const s = createState();
  for (let jump = 0; jump < 2; jump++) {
    step(s, { pop: true }, 1 / 120);
    for (let i = 0; i < 4; i++) step(s, { spin: 1 }, 1 / 120);
    while (s.airborne) step(s, {}, 1 / 120);
    if (jump === 0) assert.equal(s.bailTimer, 0);
  }
  assert.equal(s.bailTimer, 0, "sideways skis are still horizontal");
});

test("landing wipes out at 65 degrees of tilt from the snow or beyond regardless of yaw", () => {
  for (const degrees of [0, 49, 64.9, 65.1, 89.9, 135, 180]) {
    for (const direction of [-1, 1]) {
      for (const turns of [-2, 0, 2]) {
        for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
          const s = createState();
          s.flip = direction * degrees * Math.PI / 180 + turns * Math.PI * 2;
          s.spin = yaw;
          resolveLanding(s);
          assert.equal(s.bailTimer > 0, degrees >= 65,
            `tilt ${degrees}, direction ${direction}, turns ${turns}, yaw ${yaw}`);
        }
      }
    }
  }
});
test("a charged pop just before the ramp lip preserves the kicker launch strength", () => {
  const s = createState();
  s.s = 114.8;
  s.y = groundHeight(0, s.s);
  s.speed = 26;
  s.charge = 1;
  step(s, { pop: true }, 1 / 120);
  assert.ok(s.airborne);
  assert.ok(s.vy > 13.5, `expected ramp kick plus reduced charge, got ${s.vy}`);
});

test("clean landings award points without a speed resource", () => {
  const s = createState();
  s.airtime = 2;
  const speed = s.speed;
  resolveLanding(s);
  assert.equal(s.score, 100);
  assert.equal(s.speed, speed);
  assert.equal("boost" in s, false);
  assert.equal("boosting" in s, false);
});
test("the scoring window pauses, expires without ending play, and blocks later points", () => {
  const s = createState();
  advance(s, 74);
  const remaining = s.scoringTimeRemaining;
  s.paused = true;
  advance(s, 2);
  assert.equal(s.scoringTimeRemaining, remaining);
  s.paused = false;
  advance(s, 2);
  assert.equal(s.scoreLocked, true);
  assert.equal(s.finished, false);
  s.airtime = 2;
  resolveLanding(s);
  assert.equal(s.score, 0);
  assert.equal(s.lastPoints, 0);
  respawn(s);
  assert.equal(s.scoringTimeRemaining, 75);
  assert.equal(s.scoreLocked, false);
});
test("a scripted spin, flip and grab run banks all five jumps and finishes without bailing", () => {
  const s = createState();
  let bailed = false;
  for (let i = 0; i < 120 * 90 && !s.finished; i++) {
    const air = s.airborne,
      sign = s.jumps % 2 ? 1 : -1;
    // Exercise spins, flips, and combined corks. A cork finishes one rotation
    // around its shared axis, rather than two independent Euler rotations.
    const mode = s.jumps % 3;
    const corkHeld = Math.hypot(s.spin + s.spinVelocity / 7, s.flip + s.flipVelocity / 7) < Math.PI * 2;
    step(
      s,
      {
        spin: air && (mode === 0 ? corkHeld : mode === 1 && Math.abs(s.spin + s.spinVelocity / 7) < Math.PI) ? sign : 0,
        flip: air && (mode === 0 ? corkHeld : mode === 2 && s.flip + s.flipVelocity / 7 < Math.PI * 2) ? 1 : 0,
        grab: air && s.airtime < 1.4 ? 1 : 0,
      },
      1 / 120,
    );
    bailed ||= s.bailTimer > 0;
  }
  assert.equal(bailed, false);
  assert.equal(s.jumps, 5);
  assert.equal(s.finished, true);
  assert.ok(s.score > 3000, `score ${s.score}`);
});
