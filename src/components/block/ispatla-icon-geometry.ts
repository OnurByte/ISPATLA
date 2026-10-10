import * as THREE from 'three';

type Point = [number, number];

// Trace the solid silhouette of public/brand/ispatla-symbol.png, including its eight openings.
export function createIspatlaIconGeometry(): THREE.ExtrudeGeometry {
  const scale = 3.4 / 992;
  const points = (vertices: Point[]) =>
    vertices.map(([x, y]) => new THREE.Vector2((x - 627) * scale, (637.5 - y) * scale));
  const rectangle = (left: number, top: number, right: number, bottom: number): Point[] => [
    [left, top], [right, top], [right, bottom], [left, bottom],
  ];
  const top = new THREE.Shape(points(rectangle(499, 174, 755, 427)));
  top.closePath();
  const topHole = new THREE.Path(points(rectangle(579, 255, 675, 351)));
  topHole.closePath();
  top.holes.push(topHole);

  const base = new THREE.Shape(points([
    [499, 491], [755, 491], [755, 668], [947, 668],
    [947, 849], [1123, 849], [1123, 1101], [867, 1101],
    [867, 925], [755, 925], [755, 1101], [499, 1101],
    [499, 925], [387, 925], [387, 1101], [131, 1101],
    [131, 849], [307, 849], [307, 668], [499, 668],
  ]));
  base.closePath();
  for (const [left, topEdge, right, bottom] of [
    [579, 567, 675, 668],
    [387, 747, 499, 849], [579, 747, 675, 849], [755, 747, 867, 849],
    [210, 925, 307, 1027], [579, 925, 675, 1027], [947, 925, 1044, 1027],
  ]) {
    const hole = new THREE.Path(points(rectangle(left, topEdge, right, bottom)));
    hole.closePath();
    base.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry([top, base], {
    depth: 0.35,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -0.175);
  return geometry;
}
