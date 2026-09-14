import * as THREE from 'three';
import { SwordSwingRibbon } from './swordSwingRibbon.ts';

/** Silver blade finish and the preserved first-generation icy swing ribbon. */
export class StingEffects {
  private readonly ribbon=new SwordSwingRibbon();
  private readonly base=new THREE.Vector3();
  private readonly tip=new THREE.Vector3();
  private readonly glowOpacity={value:1};

  constructor(private readonly blade:THREE.Mesh,private readonly character:THREE.Group) {
    // Exported blade extends along -X; the guard starts at x=.30.
    for(const material of new Set(Array.isArray(blade.material)?blade.material:[blade.material])) {
      if(!(material instanceof THREE.MeshStandardMaterial)) continue;
      const previousCompile=material.onBeforeCompile;
      const previousKey=material.customProgramCacheKey();
      material.onBeforeCompile=(shader,renderer)=>{
        previousCompile.call(material,shader,renderer);
        shader.vertexShader='varying float stingBladeX;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nstingBladeX=position.x;');
        shader.fragmentShader='varying float stingBladeX;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
          #include <map_fragment>
          float silverBlade=1.0-smoothstep(0.22,0.30,stingBladeX);
          float silverLuma=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(silverLuma)*vec3(0.90,0.96,1.0),silverBlade*0.65);
        `).replace('#include <roughnessmap_fragment>',`
          #include <roughnessmap_fragment>
          roughnessFactor=mix(roughnessFactor,max(0.07,roughnessFactor*0.2),silverBlade);
        `).replace('#include <metalnessmap_fragment>',`
          #include <metalnessmap_fragment>
          metalnessFactor=mix(metalnessFactor,max(0.85,metalnessFactor),silverBlade);
        `).replace('#include <emissivemap_fragment>',`
          #include <emissivemap_fragment>
          totalEmissiveRadiance+=silverBlade*vec3(0.60,0.85,1.25);
        `);
      };
      material.customProgramCacheKey=()=>previousKey+'|sting-silver-blade-v2';
      material.needsUpdate=true;
    }
    // A feathered halo around the blade, readable even in dark arena lighting.
    // The blade's own depth occludes the center; only the soft aura extends out.
    const halo=new THREE.Mesh(new THREE.PlaneGeometry(1.22,.32),new THREE.ShaderMaterial({
      uniforms:{opacity:this.glowOpacity},
      vertexShader:`varying vec2 glowUv;
        void main(){glowUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec2 glowUv; uniform float opacity;
        void main(){
          float across=abs(glowUv.y-.5)*2.0;
          float ends=smoothstep(0.0,.13,glowUv.x)*(1.0-smoothstep(.87,1.0,glowUv.x));
          float glow=pow(max(0.0,1.0-across),2.5)*ends;
          gl_FragColor=vec4(vec3(1.5,2.2,3.0),glow*.30*opacity);
        }`,
      transparent:true,depthWrite:false,side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending,toneMapped:false,
    }));
    halo.name='StingBladeHalo';
    halo.position.set(-.34,.01,0);
    halo.raycast=()=>{};
    blade.add(halo);
    this.ribbon.mesh.name='StingSwingRibbon';
    this.ribbon.mesh.matrixAutoUpdate=false;
    character.add(this.ribbon.mesh);
  }

  update(time:number,visible:boolean,swinging:boolean,opacity=1) {
    this.glowOpacity.value=visible?opacity:0;
    this.blade.updateWorldMatrix(true,false);
    this.character.updateWorldMatrix(true,false);
    // Cancel character motion on the ribbon so old samples stay in world space.
    this.ribbon.mesh.matrix.copy(this.character.matrixWorld).invert();
    this.ribbon.mesh.matrixWorldNeedsUpdate=true;
    this.base.set(.20,0,0).applyMatrix4(this.blade.matrixWorld);
    this.tip.set(-.94,.02,0).applyMatrix4(this.blade.matrixWorld);
    this.ribbon.mesh.material.opacity=.8*opacity;
    this.ribbon.update(time/1000,visible,swinging,this.base,this.tip);
  }
}
