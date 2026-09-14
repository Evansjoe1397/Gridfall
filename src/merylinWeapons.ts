import * as THREE from 'three';

export type MerylinWeapon = 'frostmourne' | 'sting' | 'excalibur' | 'moonlight' | 'lightbringer';
const MERYLIN_WEAPON_ORDER:MerylinWeapon[]=['frostmourne','sting','excalibur','moonlight','lightbringer'];
const MERYLIN_WEAPON_CYCLE_SECONDS=5;

export function shuffledMerylinWeapons(random:()=>number=Math.random):MerylinWeapon[] {
  const weapons=[...MERYLIN_WEAPON_ORDER];
  for(let index=weapons.length-1;index>0;index--) {
    const swapIndex=Math.min(index,Math.max(0,Math.floor(random()*(index+1))));
    [weapons[index],weapons[swapIndex]]=[weapons[swapIndex],weapons[index]];
  }
  return weapons;
}

export function randomMerylinWeapon(random:()=>number=Math.random):MerylinWeapon {
  const index=Math.min(MERYLIN_WEAPON_ORDER.length-1,Math.max(0,Math.floor(random()*MERYLIN_WEAPON_ORDER.length)));
  return MERYLIN_WEAPON_ORDER[index];
}
export function merylinWeaponForCard(card?: string): MerylinWeapon {
  return card === 'sting' ? 'sting' : card === 'excalibur' ? 'excalibur' : card === 'moonlight' ? 'moonlight' : card === 'lightbringer' ? 'lightbringer' : 'frostmourne';
}
export function merylinHitSeconds(weapon: MerylinWeapon) {
  // Sting's frame 1 is rebased to time zero; frame 7 is six frames later.
  return weapon === 'sting' ? (7-1)/24 : weapon === 'moonlight' ? 27/24 : 28/24;
}

/** Keep Frostmourne's Object swing queued until its sacrifice dialog resolves. */
export function merylinObjectSwingDeferredByChoice(phase:string,card?:string) {
  return phase==='choosing-frostmourne' && card==='frostmourne';
}

/** Per-character weapon visibility, idle cycling, and authored attachment presets. */
export class MerylinWeapons {
  current: MerylinWeapon='frostmourne';
  private idleSeconds=0;
  private transition=0;
  private next: MerylinWeapon | null=null;
  private wasSummoned=false;
  private opacity=1;
  private readonly materials=new Map<THREE.Material,{opacity:number;transparent:boolean;depthWrite:boolean}>();
  private readonly stingIdle:THREE.Matrix4;
  private readonly stingRunning:THREE.Matrix4;
  private readonly excaliburIdle:THREE.Matrix4;
  private readonly excaliburRunning:THREE.Matrix4;
  private readonly excaliburAttack:THREE.Matrix4;
  private readonly moonlightIdle:THREE.Matrix4;
  private readonly moonlightAlert:THREE.Matrix4;
  private readonly moonlightCasual:THREE.Matrix4;
  private readonly moonlightRunning:THREE.Matrix4;
  private readonly moonlightAttack:THREE.Matrix4;
  private readonly lightbringerIdle:THREE.Matrix4;
  private readonly lightbringerAlert:THREE.Matrix4;
  private readonly lightbringerCasual:THREE.Matrix4;
  private readonly lightbringerRunning:THREE.Matrix4;
  private readonly lightbringerAttack:THREE.Matrix4;
  constructor(private readonly frost:THREE.Object3D, private readonly sting:THREE.Object3D, private readonly excalibur:THREE.Object3D, private readonly moonlight:THREE.Object3D, private readonly lightbringer:THREE.Object3D, private readonly random:()=>number=Math.random) {
    this.stingIdle=new THREE.Matrix4().fromArray(sting.userData.sting_idle_matrix);
    this.stingRunning=new THREE.Matrix4().fromArray(sting.userData.sting_running_matrix);
    this.excaliburIdle=new THREE.Matrix4().fromArray(excalibur.userData.excalibur_idle_matrix);
    this.excaliburRunning=new THREE.Matrix4().fromArray(excalibur.userData.excalibur_running_matrix);
    this.excaliburAttack=new THREE.Matrix4().fromArray(excalibur.userData.excalibur_attack_matrix);
    this.moonlightIdle=new THREE.Matrix4().fromArray(moonlight.userData.moonlight_idle_matrix);
    this.moonlightAlert=new THREE.Matrix4().fromArray(moonlight.userData.moonlight_alert_matrix);
    this.moonlightCasual=new THREE.Matrix4().fromArray(moonlight.userData.moonlight_casual_matrix);
    this.moonlightRunning=new THREE.Matrix4().fromArray(moonlight.userData.moonlight_running_matrix);
    this.moonlightAttack=new THREE.Matrix4().fromArray(moonlight.userData.moonlight_attack_matrix);
    this.lightbringerIdle=new THREE.Matrix4().fromArray(lightbringer.userData.lightbringer_idle_matrix);
    this.lightbringerAlert=new THREE.Matrix4().fromArray(lightbringer.userData.lightbringer_alert_matrix);
    this.lightbringerCasual=new THREE.Matrix4().fromArray(lightbringer.userData.lightbringer_casual_matrix);
    this.lightbringerRunning=new THREE.Matrix4().fromArray(lightbringer.userData.lightbringer_running_matrix);
    this.lightbringerAttack=new THREE.Matrix4().fromArray(lightbringer.userData.lightbringer_attack_matrix);
    for(const root of [frost,sting,excalibur,moonlight,lightbringer]) root.traverse(o=>{
      if(!(o instanceof THREE.Mesh)) return;
      for(const m of Array.isArray(o.material)?o.material:[o.material]) this.materials.set(m,{opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite});
    });
    frost.visible=false; sting.visible=false; excalibur.visible=false; moonlight.visible=false; lightbringer.visible=false;
  }
  attack(weapon:MerylinWeapon) {
    // Every Merylin Attack consumes the current Summon. If that card grants a
    // fresh Summon, choose a new random starting sword after the swing ends.
    this.wasSummoned=false;
    this.current=weapon; this.next=null; this.transition=0; this.idleSeconds=0;
    this.apply(true,1);
  }
  private apply(visible:boolean,opacity:number) {
    this.opacity=opacity;
    this.frost.visible=visible && this.current==='frostmourne';
    this.sting.visible=visible && this.current==='sting';
    this.excalibur.visible=visible && this.current==='excalibur';
    this.moonlight.visible=visible && this.current==='moonlight';
    this.lightbringer.visible=visible && this.current==='lightbringer';
    for(const [m,original] of this.materials) {
      const transparent=opacity<1 || original.transparent;
      if(m.transparent!==transparent) { m.transparent=transparent; m.needsUpdate=true; }
      m.opacity=original.opacity*opacity;
      m.depthWrite=opacity<1 ? false : original.depthWrite;
    }
  }
  update(delta:number,summoned:boolean,attacking:boolean,clip:string,busy:boolean,forcedWeapon?:MerylinWeapon) {
    const stingOffset=clip==='Running' || clip==='Attack_DoubleSwing' ? this.stingRunning : this.stingIdle;
    stingOffset.decompose(this.sting.position,this.sting.quaternion,this.sting.scale);
    const excaliburOffset=clip==='Attack' ? this.excaliburAttack : clip==='Running' ? this.excaliburRunning : this.excaliburIdle;
    excaliburOffset.decompose(this.excalibur.position,this.excalibur.quaternion,this.excalibur.scale);
    const moonlightOffset=clip==='Attack_Swing' ? this.moonlightAttack : clip==='Running' ? this.moonlightRunning : clip==='Casual_Walk' ? this.moonlightCasual : clip==='Alert_Wielding' ? this.moonlightAlert : this.moonlightIdle;
    moonlightOffset.decompose(this.moonlight.position,this.moonlight.quaternion,this.moonlight.scale);
    const lightbringerOffset=clip==='Attack' ? this.lightbringerAttack : clip==='Running' ? this.lightbringerRunning : clip==='Casual_Walk' ? this.lightbringerCasual : clip==='Alert_Wielding' ? this.lightbringerAlert : this.lightbringerIdle;
    lightbringerOffset.decompose(this.lightbringer.position,this.lightbringer.quaternion,this.lightbringer.scale);
    if(attacking) { this.apply(true,1); return; }
    if(!summoned) {
      this.wasSummoned=false; this.idleSeconds=0; this.next=null; this.transition=0; this.apply(false,1); return;
    }
    if(!this.wasSummoned) {
      this.wasSummoned=true;
      this.current=forcedWeapon ?? randomMerylinWeapon(this.random);
      this.idleSeconds=0; this.next=null; this.transition=0;
    }
    if(forcedWeapon && this.current!==forcedWeapon) {
      this.current=forcedWeapon; this.idleSeconds=0; this.next=null; this.transition=0;
    }
    if(!busy && (clip==='Idle_Wielding' || clip==='Alert_Wielding')) {
      this.idleSeconds+=delta;
      if(!forcedWeapon && this.idleSeconds>=MERYLIN_WEAPON_CYCLE_SECONDS && !this.next) {
        this.idleSeconds%=MERYLIN_WEAPON_CYCLE_SECONDS;
        this.next=MERYLIN_WEAPON_ORDER[(MERYLIN_WEAPON_ORDER.indexOf(this.current)+1)%MERYLIN_WEAPON_ORDER.length];
        this.transition=0;
      }
    }
    let opacity=1;
    if(this.next) {
      this.transition+=delta;
      if(this.transition>=.3) this.current=this.next;
      opacity=Math.min(1,Math.abs(this.transition-.3)/.3);
      if(this.transition>=.6) { this.next=null; opacity=1; }
    }
    this.apply(true,opacity);
  }
  get frostVisible() { return this.frost.visible; }
  get frostOpacity() { return this.frost.visible ? this.opacity : 0; }
  get stingVisible() { return this.sting.visible; }
  get stingOpacity() { return this.sting.visible ? this.opacity : 0; }
  get excaliburVisible() { return this.excalibur.visible; }
  get moonlightVisible() { return this.moonlight.visible; }
  get moonlightOpacity() { return this.moonlight.visible ? this.opacity : 0; }
  get lightbringerVisible() { return this.lightbringer.visible; }
  get lightbringerOpacity() { return this.lightbringer.visible ? this.opacity : 0; }
}
