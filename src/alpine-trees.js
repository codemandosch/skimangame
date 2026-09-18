import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// One instanced batch per material and variant, independent of tree count.
// A small fallback also keeps offline/failed asset loads playable.
export function createAlpineTrees(scene, trees) {
  const group = new THREE.Group();
  group.name = 'Lower mountain / sparse alpine firs';
  scene.add(group);
  const fallback = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.3, 8, 9),
    new THREE.MeshStandardMaterial({ color: '#658179', roughness: 1 }), trees.length);
  const transform = new THREE.Object3D();
  const batches=[];
  let lastPosition=null;
  const update=(state,force=false)=>{
    if(!force && lastPosition && Math.hypot(state.x-lastPosition.x,state.s-lastPosition.s,(state.y || 0)-lastPosition.y)<35)return;
    lastPosition={x:state.x,s:state.s,y:state.y || 0};
    for(const {batch,instances,distant} of batches) {
      let index=0;
      for(const tree of instances) {
        const distance=Math.hypot(tree.x-state.x,tree.s-state.s,tree.y-(state.y || 0));
        if(distant ? distance<220 || distance>1500 : distance>=220)continue;
        transform.position.set(tree.x,tree.y,-tree.s);
        transform.rotation.set(0,tree.x*1.73,0);
        transform.scale.set(tree.scale,tree.scale*(1+.08*Math.sin(tree.s)),tree.scale);
        transform.updateMatrix();batch.setMatrixAt(index++,transform.matrix);
      }
      batch.count=index;batch.instanceMatrix.needsUpdate=true;
      if(index)batch.computeBoundingSphere();
    }
  };
  group.userData.update=update;
  trees.forEach((tree, i) => {
    transform.position.set(tree.x, tree.y + 4 * tree.scale, -tree.s);
    transform.scale.setScalar(tree.scale); transform.updateMatrix();
    fallback.setMatrixAt(i, transform.matrix);
  });
  fallback.castShadow = fallback.receiveShadow = true;
  group.add(fallback);
  // No DOM or asset requests during deterministic Node terrain tests.
  if (typeof document === 'undefined') return group;
  new GLTFLoader().load('/models/snow-firs.glb', gltf => {
    gltf.scene.updateMatrixWorld(true);
    for (let variant = 0; variant < 3; variant++) for(const distant of [false,true]) {
      const source = gltf.scene.getObjectByName(`AlpineFir_${variant}${distant ? '_LOD' : ''}`);
      if (!source) continue;
      const instances = trees.filter((_, i) => i % 3 === variant);
      source.traverse(node => {
        if (!node.isMesh) return;
        const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
        const batch = new THREE.InstancedMesh(geometry, node.material, instances.length);
        batch.name = `Snow fir ${variant} / ${node.name}`;
        batch.castShadow = batch.receiveShadow = true;
        batches.push({batch,instances,distant});group.add(batch);
      });
    }
    if (group.children.length > 1) {
      group.remove(fallback); fallback.geometry.dispose(); fallback.material.dispose();
    }
    update(lastPosition || {x:0,s:0,y:0},true);
  }, undefined, error => console.warn('Snow fir asset unavailable; using fallback.', error));
  return group;
}
