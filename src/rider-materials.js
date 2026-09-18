import * as THREE from "three";
function texture(draw, w = 512, h = 512) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function cloth(base) {
  return texture((c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    let seed = 31;
    for (let i = 0; i < 26000; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = seed % w;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const y = seed % h;
      c.fillStyle = i % 2 ? "#ffffff10" : "#00102217";
      c.fillRect(x, y, 1, 2);
    }
    c.strokeStyle = "#17273455";
    c.lineWidth = 3;
    for (const x of [44, 175, 340, 474]) {
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + 35, 180, x - 35, 350, x, h);
      c.stroke();
    }
    c.strokeStyle = "#ffffff38";
    c.lineWidth = 1;
    c.setLineDash([3, 4]);
    for (const x of [49, 180, 345, 479]) {
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + 35, 180, x - 35, 350, x, h);
      c.stroke();
    }
  });
}
export function createRiderMaterials() {
  const standard = (color, extras = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...extras });
  const jacket = cloth("#c85324"),
    pants = cloth("#293744");
  const badge = texture(
    (c, w, h) => {
      c.fillStyle = "#f0ead3";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#1b2730";
      c.font = "italic 900 50px Arial";
      c.textAlign = "center";
      c.fillText("SKIMAN", w / 2, 67);
      c.fillText("GAME", w / 2, 121);
      c.fillStyle = "#dc542b";
      c.fillRect(20, 144, w - 40, 10);
    },
    256,
    170,
  );
  const ski = texture(
    (c, w, h) => {
      c.fillStyle = "#dde74a";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#202d37";
      c.beginPath();
      c.moveTo(0, 70);
      c.lineTo(w, 210);
      c.lineTo(w, 380);
      c.lineTo(0, 230);
      c.fill();
      c.fillStyle = "#e85229";
      c.fillRect(0, h * 0.76, w, h * 0.08);
      c.save();
      c.translate(w / 2, h * 0.61);
      c.rotate(-Math.PI / 2);
      c.fillStyle = "#182d36";
      c.font = "italic 900 28px Arial";
      c.textAlign = "center";
      c.fillText("SKIMANGAME", 0, 0);
      c.restore();
      c.strokeStyle = "#eff8cc90";
      c.lineWidth = 2;
      for (let i = 0; i < 50; i++) {
        c.beginPath();
        c.moveTo((i * 29) % w, (i * 77) % h);
        c.lineTo(((i * 29) % w) + 2, ((i * 77) % h) + 20);
        c.stroke();
      }
    },
    128,
    1024,
  );
  const lens = texture(
    (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#15394d");
      g.addColorStop(0.35, "#48bfe0");
      g.addColorStop(0.49, "#d2fff6");
      g.addColorStop(0.52, "#355c88");
      g.addColorStop(1, "#152c46");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#ffffff99";
      c.fillRect(w * 0.12, 0, w * 0.07, h);
    },
    128,
    64,
  );
  return {
    jacket: standard("#ffffff", { map: jacket }),
    sleeve: standard("#ffffff", { map: jacket }),
    pants: standard("#ffffff", { map: pants }),
    dark: standard("#182c39"),
    black: standard("#0f1922"),
    white: standard("#e2e1d7"),
    orange: standard("#e6662f"),
    lime: standard("#e2f25e"),
    metal: standard("#b2c2c5", { metalness: 0.6, roughness: 0.3 }),
    ski: standard("#ffffff", { map: ski, roughness: 0.36 }),
    lens: standard("#ffffff", { map: lens, metalness: 0.15, roughness: 0.11 }),
    badge: new THREE.MeshStandardMaterial({ map: badge, roughness: 0.8 }),
  };
}
