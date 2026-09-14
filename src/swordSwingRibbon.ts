import * as THREE from 'three';

/** Reusable original icy swing blur. Not used by Frostmourne.
 * Add mesh to a stationary effects root; pass blade base/tip in that root's
 * local space each frame, with time in seconds. Call dispose on removal.
 */
export class SwordSwingRibbon {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly positions=new Float32Array(18*6);
  private readonly history: Array<{base:THREE.Vector3;tip:THREE.Vector3;time:number}>=[];
  private lastSample=0;

  constructor(color: THREE.ColorRepresentation=0x7cd9ff, opacity=.8) {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    const indices:number[]=[];
    for(let i=0;i<17;i++) indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
    geometry.setIndex(indices); geometry.setDrawRange(0,0);
    this.mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,
      transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending,toneMapped:false}));
    this.mesh.name='SwordSwingRibbon';
    this.mesh.frustumCulled=false;
    this.mesh.raycast=()=>{};
  }

  update(seconds:number, visible:boolean, swinging:boolean, base:THREE.Vector3, tip:THREE.Vector3) {
    this.mesh.visible=visible;
    if(!visible) { this.history.length=0; this.mesh.geometry.setDrawRange(0,0); return; }
    if(swinging && seconds-this.lastSample>1/90) {
      this.lastSample=seconds;
      const previous=this.history.at(-1);
      if(previous && previous.tip.distanceTo(tip)>1) this.history.length=0;
      this.history.push({base:base.clone(),tip:tip.clone(),time:seconds});
    }
    while(this.history.length && (seconds-this.history[0].time>.14 || this.history.length>18)) this.history.shift();
    this.history.forEach((h,i)=>{h.base.toArray(this.positions,i*6); h.tip.toArray(this.positions,i*6+3);});
    this.mesh.geometry.attributes.position.needsUpdate=true;
    this.mesh.geometry.setDrawRange(0,Math.max(0,this.history.length-1)*6);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
