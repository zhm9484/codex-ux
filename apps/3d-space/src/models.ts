import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';

export interface LoadedModel {
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
  warnings: string[];
}
export async function loadModel(url: string, renderer: THREE.WebGLRenderer): Promise<LoadedModel> {
  const manager = new THREE.LoadingManager();
  const warnings: string[] = [];
  const complete = new Promise<void>((resolve) => {
    manager.onLoad = resolve;
  });
  manager.onError = (resource) =>
    warnings.push(`Missing resource: ${decodeURIComponent(resource.split('/').pop() ?? resource)}`);
  manager.itemStart('scene-model');
  const draco = new DRACOLoader(manager)
    .setDecoderPath('/media/3d-space/engine/addons/libs/draco/gltf/')
    .setWorkerLimit(2);
  const ktx = new KTX2Loader(manager)
    .setTranscoderPath('/media/3d-space/engine/addons/libs/basis/')
    .setWorkerLimit(2)
    .detectSupport(renderer);
  let object: THREE.Object3D;
  let animations: THREE.AnimationClip[] = [];
  try {
    const extension = new URL(url, location.href).pathname.split('.').pop()!.toLowerCase();
    switch (extension) {
      case 'glb':
      case 'gltf': {
        const result = await new GLTFLoader(manager)
          .setDRACOLoader(draco)
          .setKTX2Loader(ktx)
          .setMeshoptDecoder(MeshoptDecoder)
          .loadAsync(url);
        object = result.scene;
        animations = result.animations;
        break;
      }
      case 'obj': {
        const response = await fetch(url);
        if (!response.ok) throw new Error('The model file could not be read.');
        const text = await response.text();
        const loader = new OBJLoader(manager);
        const materialLibrary = /^mtllib\s+(.+)$/m.exec(text)?.[1]?.trim();
        if (materialLibrary) {
          try {
            const materials = await new MTLLoader(manager).loadAsync(
              new URL(materialLibrary, new URL(url, location.href)).href,
            );
            materials.preload();
            loader.setMaterials(materials);
          } catch {
            warnings.push(
              'Material file not found. Import the OBJ together with its MTL and textures.',
            );
          }
        }
        object = loader.parse(text);
        break;
      }
      case 'fbx':
        object = await new FBXLoader(manager).loadAsync(url);
        animations = object.animations;
        break;
      case 'stl':
      case 'ply': {
        const geometry =
          extension === 'stl'
            ? await new STLLoader(manager).loadAsync(url)
            : await new PLYLoader(manager).loadAsync(url);
        if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
        object = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: '#ccc5b8',
            vertexColors: geometry.hasAttribute('color'),
            roughness: 0.65,
          }),
        );
        if (extension === 'stl') object.rotation.x = -Math.PI / 2;
        break;
      }
      case '3mf':
        object = await new ThreeMFLoader(manager).loadAsync(url);
        object.rotation.x = -Math.PI / 2;
        break;
      case 'usd':
      case 'usda':
      case 'usdc':
      case 'usdz':
        object = await new USDLoader(manager).loadAsync(url);
        break;
      default:
        throw new Error(`The .${extension} format is not supported yet.`);
    }
  } finally {
    manager.itemEnd('scene-model');
    await complete;
    draco.dispose();
    ktx.dispose();
  }
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return { object, animations, warnings };
}

function isTexture(value: unknown): value is THREE.Texture {
  return value instanceof THREE.Texture;
}

export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points
    ) {
      const renderable = object as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.Material | THREE.Material[]
      >;
      geometries.add(renderable.geometry);
      for (const material of Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (isTexture(value)) textures.add(value);
        if (material instanceof THREE.ShaderMaterial) {
          for (const uniform of Object.values(material.uniforms))
            if (isTexture(uniform.value)) textures.add(uniform.value);
        }
      }
    }
  });
  for (const texture of textures) {
    texture.dispose();
    const image: unknown = texture.source.data;
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
  }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
