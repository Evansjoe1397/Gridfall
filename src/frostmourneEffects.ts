import * as THREE from 'three';

// Coordinates measured on Frostmourne_Mesh_Optimized in the exported GLB.
// Blade runs from z=0.05 to -0.95; broad faces point along local +/-Y.
const vertexShader = `
varying vec3 bladePosition;
varying vec3 bladeNormal;
uniform float shell;
void main() {
  bladePosition = position;
  bladeNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * shell, 1.0);
}`;
const fragmentShader = `
varying vec3 bladePosition;
varying vec3 bladeNormal;
uniform float time;
uniform float halo;
uniform float effectOpacity;
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa=p-a, ba=b-a;
  return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0));
}
void main() {
  vec3 p=bladePosition;
  if(p.z > 0.025 || p.z < -0.91) discard;
  float row=floor((-p.z-0.08)/0.105);
  vec2 q=vec2(p.x, mod(-p.z-0.08,0.105)-0.0525);
  float d=segment(q,vec2(0.,-.031),vec2(0.,.031));
  float flip=mod(row,2.)*2.-1.;
  q.x*=flip;
  d=min(d,segment(q,vec2(0.,.026),vec2(.020,.009)));
  d=min(d,segment(q,vec2(.020,.009),vec2(0.,-.006)));
  if(mod(row,3.)<1.5) d=min(d,segment(q,vec2(0.,-.010),vec2(-.016,-.026)));
  float rune=(1.-smoothstep(halo>0.5 ? .002 : .0008, halo>0.5 ? .025 : .0032,d));
  rune*=step(0.,row)*step(row,5.)*smoothstep(.45,.85,abs(bladeNormal.y));
  // Edge glint is restricted to the thin blade, never the skull or crossguard.
  float edge=(1.-smoothstep(.001,.008,abs(p.y)))*smoothstep(.025,.06,abs(p.x));
  edge*=(1.-smoothstep(0.,.06,p.z))*smoothstep(-.94,-.80,p.z);
  float pulse=.80+.20*sin(time*1.45-row*.24);
  float alpha=halo>0.5 ? rune*.20+edge*.045 : rune*.9+edge*.13;
  if(alpha<.003) discard;
  gl_FragColor=vec4(2.0*mix(vec3(.17,.55,1.),vec3(.78,.96,1.),rune),alpha*pulse*effectOpacity);
}`;

// Original soft frost/shadow cloud texture, not a pattern painted on the steel.
function cloudTexture() {
  const size=32, bytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const px=(x+0.5)/size*2-1, py=(y+0.5)/size*2-1;
    const radius=Math.hypot(px,py);
    const noise=.78+.22*Math.sin(px*13+Math.sin(py*9))*Math.cos(py*11);
    const i=(y*size+x)*4;
    bytes[i]=bytes[i+1]=bytes[i+2]=255;
    bytes[i+3]=Math.round(Math.pow(Math.max(0,1-radius),2)*noise*255);
  }
  const texture=new THREE.DataTexture(bytes,size,size);
  texture.needsUpdate=true;
  return texture;
}
type Wisp = { sprite: THREE.Sprite; age: number; life: number; velocity: THREE.Vector3; size: number; shadow: boolean; trail: boolean; worldPosition: THREE.Vector3 };

/** Per-character effects. All resources belong to the character hierarchy. */
export class FrostmourneEffects {
  private readonly uniforms={time:{value:0},effectOpacity:{value:1}};
  private readonly pool: Wisp[]=[];
  private readonly cloud=cloudTexture();
  private emission=0;
  private readonly root=new THREE.Group();
  private trailEmission=0;
  private previousTip: THREE.Vector3 | undefined;
  private previousBase: THREE.Vector3 | undefined;
  private readonly flecks: THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;
  private readonly fleckPositions=new Float32Array(48*3);
  private readonly sparks=Array.from({length:48},()=>({age:1,position:new THREE.Vector3(),velocity:new THREE.Vector3()}));
  private lastTime: number | undefined;
  private wasSwinging=false;

  constructor(private readonly blade: THREE.Mesh, private readonly character: THREE.Group) {
    // Polish only the blade region of this combined sword mesh. Preserve the
    // original textures, metalness, and the skull/guard/handle's roughness.
    for(const material of new Set(Array.isArray(blade.material) ? blade.material : [blade.material])) {
      if(!(material instanceof THREE.MeshStandardMaterial)) continue;
      const previousCompile=material.onBeforeCompile;
      const previousKey=material.customProgramCacheKey();
      material.onBeforeCompile=(shader,renderer)=>{
        previousCompile.call(material,shader,renderer);
        shader.vertexShader='varying float frostBladeZ;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nfrostBladeZ=position.z;');
        shader.fragmentShader='varying float frostBladeZ;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
          #include <roughnessmap_fragment>
          float frostBladeMask=1.0-smoothstep(0.0,0.05,frostBladeZ);
          roughnessFactor=mix(roughnessFactor,max(0.06,roughnessFactor*0.18),frostBladeMask);
        `);
      };
      material.customProgramCacheKey=()=>previousKey+'|frostmourne-polished-blade-v2';
      material.needsUpdate=true;
    }
    this.root.name='FrostmourneAtmosphere';
    character.add(this.root);
    for(const halo of [0,1]) {
      const material=new THREE.ShaderMaterial({
        vertexShader,fragmentShader,
        uniforms:{...this.uniforms,halo:{value:halo},shell:{value:halo ? .004 : .0007}},
        transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
        side:THREE.DoubleSide,toneMapped:false,
      });
      const overlay=new THREE.Mesh(blade.geometry,material);
      overlay.name=halo ? 'FrostmourneRuneHalo' : 'FrostmourneRunes';
      overlay.raycast=()=>{};
      blade.add(overlay);
    }
    // The final 32 wisps form a faint world-space wake, not a solid ribbon.
    for(let i=0;i<92;i++) {
      const shadow=i%4===0;
      const trail=i>=60;
      const material=new THREE.SpriteMaterial({map:this.cloud,color:shadow?0x171e2c:0xa4dfff,
        transparent:true,opacity:0,depthWrite:false,toneMapped:false,
        blending:shadow?THREE.NormalBlending:THREE.AdditiveBlending});
      const sprite=new THREE.Sprite(material);
      sprite.name=trail ? (shadow?'FrostmourneShadowTrail':'FrostmourneFrostTrail') : shadow?'FrostmourneShadowWisp':'FrostmourneFrostWisp';
      sprite.raycast=()=>{};
      this.root.add(sprite);
      this.pool.push({sprite,age:2,life:1,velocity:new THREE.Vector3(),size:0,shadow,trail,worldPosition:new THREE.Vector3()});
    }
    const sparkGeometry=new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position',new THREE.BufferAttribute(this.fleckPositions,3).setUsage(THREE.DynamicDrawUsage));
    this.flecks=new THREE.Points(sparkGeometry,new THREE.PointsMaterial({color:0xdaf7ff,size:.022,
      transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    this.flecks.frustumCulled=false; this.flecks.raycast=()=>{};
    this.root.add(this.flecks);
  }

  private bladePoint(z:number, out:THREE.Vector3) {
    out.set(0,0,z).applyMatrix4(this.blade.matrixWorld);
    return this.character.worldToLocal(out);
  }

  update(time:number, visible:boolean, swinging:boolean, opacity=1) {
    const seconds=time/1000;
    const dt=this.lastTime===undefined ? 0 : Math.min(.05,Math.max(0,seconds-this.lastTime));
    this.lastTime=seconds;
    this.uniforms.time.value=seconds;
    this.uniforms.effectOpacity.value=opacity;
    this.flecks.material.opacity=.8*opacity;
    this.root.visible=visible;
    if(!visible) {
      this.previousBase=undefined; this.previousTip=undefined;
      this.wasSwinging=false; this.emission=0; this.trailEmission=0;
      for(const w of this.pool) { w.age=w.life; w.sprite.material.opacity=0; }
      for(const s of this.sparks) s.age=1;
      return;
    }
    this.blade.updateWorldMatrix(true,false);
    const base=new THREE.Vector3(0,0,-.15).applyMatrix4(this.blade.matrixWorld);
    const tip=new THREE.Vector3(0,0,-.91).applyMatrix4(this.blade.matrixWorld);
    const continuous=this.wasSwinging && this.previousTip && this.previousTip.distanceTo(tip)<1;
    this.trailEmission=swinging ? Math.min(32,this.trailEmission+dt*60) : 0;
    // Three times the original emission, with a wider, softer cloud envelope.
    this.emission=Math.min(this.pool.length,this.emission+dt*27);
    for(const w of this.pool) {
      w.age+=dt;
      if(w.age>=w.life && (w.trail ? this.trailEmission : this.emission)>=1) {
        if(w.trail) this.trailEmission-=1; else this.emission-=1;
        w.age=0; w.life=w.trail ? .35+Math.random()*.2 : .65+Math.random()*.55;
        this.bladePoint(-.12-Math.random()*.69,w.sprite.position);
        if(w.trail) {
          const along=Math.random(), between=Math.random();
          w.worldPosition.copy(base).lerp(tip,along);
          if(continuous && this.previousBase && this.previousTip) {
            const previous=this.previousBase.clone().lerp(this.previousTip,along);
            w.worldPosition.lerp(previous,between);
          }
        }
        w.velocity.set((Math.random()-.5)*.12,.045+Math.random()*.04,(Math.random()-.5)*.12);
        w.size=w.shadow ? .15 : .10;
        w.sprite.material.rotation=Math.random()*Math.PI*2;
      }
      const phase=Math.min(1,w.age/w.life);
      if(w.trail) {
        w.worldPosition.addScaledVector(w.velocity,dt*.35);
        this.character.worldToLocal(w.sprite.position.copy(w.worldPosition));
      } else w.sprite.position.addScaledVector(w.velocity,dt);
      const size=w.size*(1+phase*1.8);
      // Keep clouds diffuse and elongated rather than resembling little balls.
      w.sprite.scale.set(size*1.4,size*.75,1);
      w.sprite.material.opacity=w.trail
        ? Math.pow(1-phase,2)*(w.shadow ? .12 : .10)
        : Math.sin(phase*Math.PI)*(w.shadow ? .27 : .22);
      w.sprite.material.opacity*=opacity;
    }
    this.previousBase=base; this.previousTip=tip;
    if(swinging && !this.wasSwinging) {
      for(const s of this.sparks) {
        s.age=0; this.bladePoint(-.25-Math.random()*.6,s.position);
        s.velocity.set((Math.random()-.5)*.7,.2+Math.random()*.35,(Math.random()-.5)*.7);
      }
    }
    this.wasSwinging=swinging;
    for(let i=0;i<this.sparks.length;i++) {
      const s=this.sparks[i]; s.age+=dt; s.velocity.y-=dt*.5;
      s.position.addScaledVector(s.velocity,dt);
      this.fleckPositions.set(s.age<.48?s.position.toArray():[0,-10000,0],i*3);
    }
    this.flecks.geometry.attributes.position.needsUpdate=true;
  }
}
