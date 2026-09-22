import * as THREE from 'three';

/** Tile-conforming molten seal and a crown of rising fire. No external textures. */
export class JohnRepentFire {
  readonly group = new THREE.Group();
  private readonly materials: THREE.ShaderMaterial[] = [];
  constructor(private readonly startedAt: number, center: THREE.Vector3, tiles: THREE.Vector3[]) {
    this.group.name = 'RepentFlameCircle';
    const vertexShader = `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
    const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}`;
    const material = (offset: THREE.Vector2, flame: boolean) => {
      const result = new THREE.ShaderMaterial({
        uniforms: { elapsed: { value: 0 }, fade: { value: 1 }, offset: { value: offset } },
        vertexShader,
        fragmentShader: `varying vec2 vUv; uniform float elapsed,fade; uniform vec2 offset; ${noise}
          void main(){
            vec2 p=(vUv-.5)*1.9+offset;
            float n=noise(p*4.+vec2(elapsed*.7,-elapsed*2.));
            ${flame ? `float height=vUv.y;
              float tongue=1.-smoothstep(.08,.46,abs(vUv.x-.5+sin(height*7.-elapsed*8.)*.1));
              float energy=tongue*(1.-smoothstep(.2+n*.5,1.,height));` : `float r=length(p);
              float ring=exp(-pow((r-2.65-n*.13)*9.,2.));
              float wave=exp(-pow((r-mod(elapsed*4.,3.9))*6.,2.));
              float energy=(.18+n*.32+ring*.85+wave*.5)*(1.-smoothstep(3.3,3.95,r));`}
            vec3 color=mix(vec3(1.,.055,.005),vec3(1.,.78,.18),clamp(energy,0.,1.));
            gl_FragColor=vec4(color*1.8,energy*fade);
          }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      this.materials.push(result);
      return result;
    };
    for (const tile of tiles) {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), material(new THREE.Vector2(tile.x-center.x, center.z-tile.z), false));
      floor.rotation.x = -Math.PI / 2;
      floor.position.copy(tile).y += .035;
      this.group.add(floor);
      // Two twisting tongues per tile keep the center and diagonal tiles visibly alight.
      for (let i = 0; i < 2; i++) {
        const tongue = new THREE.Mesh(new THREE.PlaneGeometry(.8, .8+i*.35), material(new THREE.Vector2(i*7, tiles.indexOf(tile)*3), true));
        tongue.position.copy(tile).add(new THREE.Vector3(i ? .4 : -.4, .43+i*.175, i ? -.35 : .35));
        tongue.rotation.y = tiles.indexOf(tile)*2.4+i*1.6;
        this.group.add(tongue);
      }
    }
  }
  update(time: number): boolean {
    const elapsed = (time-this.startedAt)/1000;
    for (const material of this.materials) {
      material.uniforms.elapsed.value = elapsed;
      material.uniforms.fade.value = Math.min(1, elapsed/.07)*Math.max(0, Math.min(1,(2.1-elapsed)/.7));
    }
    return elapsed >= 2.1;
  }
  dispose() {
    this.group.removeFromParent();
    this.group.traverse((part) => { if (part instanceof THREE.Mesh) part.geometry.dispose(); });
    this.materials.forEach((material) => material.dispose());
  }
}
