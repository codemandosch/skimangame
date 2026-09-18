const chargeHeld = keys => keys.has("Space");

// Only releasing Space triggers the charged pop.
export function releaseKey(keys, code) {
  const wasHeld = chargeHeld(keys);
  keys.delete(code);
  return wasHeld && !chargeHeld(keys);
}

// Arrow keys and IJKL both control the skiing line and aerial rotation.
export function keyboardInput(keys, pop = false) {
  const held = (...codes) => codes.some(code => keys.has(code));
  const axis = (positive, negative) => Number(held(...positive)) - Number(held(...negative));
  return {
    steer: axis(["ArrowRight", "KeyL"], ["ArrowLeft", "KeyJ"]),
    pitch: 0,
    spin: axis(["ArrowRight", "KeyL"], ["ArrowLeft", "KeyJ"]),
    flip: axis(["ArrowUp", "KeyI"], ["ArrowDown", "KeyK"]),
    tuck: chargeHeld(keys),
    skate: held("ControlLeft", "ControlRight"),
    brake: false,
    charge: chargeHeld(keys),
    pop,
    daffy: keys.has("KeyA"),
    grab: keys.has("KeyF") ? 7 : keys.has("KeyR") ? 6 : keys.has("KeyD") ? 5 : keys.has("KeyS") ? 4 : keys.has("KeyQ") ? 3 : keys.has("KeyW") ? 1 : keys.has("KeyE") ? 2 : 0,
  };
}
