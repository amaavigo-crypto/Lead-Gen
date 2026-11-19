import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const bgVertex = [
  'varying vec2 vUv;',
  'void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
].join('\n');

const bgFragment = [
  'precision highp float;',
  'uniform float uTime; uniform vec2 uPointer; uniform float uPointerActive;',
  'varying vec2 vUv;',
  'float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }',
  'float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1.0,0.0)),f.x),mix(h(i+vec2(0.0,1.0)),h(i+vec2(1.0,1.0)),f.x),f.y); }',
  'void main(){',
  ' vec2 p=vUv*2.0-1.0; float t=uTime;',
  ' vec2 warp=vec2(n(p*1.45+vec2(t*.025,-t*.018)),n(p*1.62+vec2(-t*.019,t*.022)+8.4));',
  ' float field=n(p*2.3+warp*1.6+vec2(t*.028,-t*.021));',
  ' float detail=n(p*5.2+warp*1.3-vec2(t*.038,t*.026));',
  ' float wisps=smoothstep(.34,.78,field*.76+detail*.24);',
  ' float left=exp(-pow((p.x+.80)/.56,2.0))*(.38+.62*field);',
  ' float right=exp(-pow((p.x-.80)/.56,2.0))*(.38+.62*(1.0-field*.72));',
  ' vec3 color=vec3(.027,.034,.105);',
  ' color+=vec3(.34,.075,.72)*left*(.035+wisps*.14);',
  ' color+=vec3(.015,.24,.72)*right*(.035+wisps*.14);',
  ' color+=vec3(.025,.34,.53)*right*wisps*.055;',
  ' color*=1.0-.70*exp(-pow(p.x/.43,2.0)-pow(p.y/.72,2.0));',
  ' vec2 pointerUv=uPointer*.5+.5;',
  ' float cursorLight=exp(-dot(vUv-pointerUv,vUv-pointerUv)*24.0)*uPointerActive;',
  ' color+=mix(vec3(.38,.10,.92),vec3(.02,.55,.95),smoothstep(.35,.70,pointerUv.x))*cursorLight*.13;',
  ' color*=.78+(1.0-smoothstep(.28,1.35,abs(p.y)))*.22;',
  ' gl_FragColor=vec4(color,1.0);',
  ' #include <colorspace_fragment>',
  '}'
].join('\n');

const particleVertex = [
  'precision highp float;',
  'uniform float uTime,uPixelRatio,uPointerActive,uCursorMotion,uRippleAge,uRippleStrength;',
  'uniform vec2 uPointer,uRippleOrigin;',
  'attribute float aSeed,aSize,aSide,aOpacity,aDepth;',
  'varying vec3 vColor;',
  'varying float vOpacity,vPointerGlow,vRippleGlow,vCenterFade,vDepth;',
  'varying vec2 vScreen;',
  'float h31(vec3 p){ p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }',
  'float n3(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.0-2.0*f);',
  ' float a=mix(h31(i),h31(i+vec3(1,0,0)),f.x);',
  ' float b=mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x);',
  ' float c=mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x);',
  ' float d=mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x); return mix(mix(a,b,f.y),mix(c,d,f.y),f.z); }',
  'void main(){',
  ' float t=uTime; vec3 p=position;',
  ' float nA=n3(p*.38+vec3(t*.045+aSeed*6.0,-t*.032,aSeed*3.7));',
  ' float nB=n3(p*.82+vec3(-t*.031,aSeed*8.0,t*.024));',
  ' float drift=(nA-.5)*.23+(nB-.5)*.10;',
  ' p.x+=sin(p.y*1.24+t*.20+aSeed*8.0)*.12+drift;',
  ' p.y+=sin(p.x*.58-t*.23+aSeed*12.0)*.17+drift*.58;',
  ' p.z+=sin(t*.16+aSeed*18.0)*.16+(nB-.5)*.10;',
  ' vec4 mv=modelViewMatrix*vec4(p,1.0); vec4 clip=projectionMatrix*mv;',
  ' vec2 ndc=clip.xy/max(.0001,clip.w); vec2 delta=ndc-uPointer;',
  ' float dist=length(delta); float influence=exp(-dot(delta,delta)/.050)*uPointerActive;',
  ' vec2 radial=delta/max(.0001,dist);',
  ' ndc+=radial*influence*(.090+uCursorMotion*.060)+vec2(-radial.y,radial.x)*influence*.016;',
  ' float rippleDist=length(ndc-uRippleOrigin); float rippleRadius=uRippleAge*.43;',
  ' float ripple=exp(-pow((rippleDist-rippleRadius)/.058,2.0))*exp(-uRippleAge*1.72)*uRippleStrength;',
  ' ndc+=normalize(ndc-uRippleOrigin+vec2(.0001))*ripple*.022;',
  ' clip.xy=ndc*clip.w; gl_Position=clip;',
  ' gl_PointSize=aSize*(1.35+aDepth*.90)*uPixelRatio*(5.8/max(2.0,-mv.z));',
  ' vec3 violet=vec3(.55,.22,1.0), blue=vec3(.035,.36,1.0), cyan=vec3(.02,.74,1.0);',
  ' float shift=smoothstep(.48,.92,aSeed)*(.16+aDepth*.20);',
  ' vColor=aSide<.5?mix(violet,vec3(.72,.31,1.0),shift):mix(blue,cyan,shift);',
  ' vOpacity=aOpacity*(.70+aDepth*.30)*(.82+.18*sin(t*.58+aSeed*25.0));',
  ' vPointerGlow=influence; vRippleGlow=ripple; vDepth=aDepth; vScreen=ndc;',
  ' float center=1.0-.68*exp(-pow(ndc.x/.43,2.0)-pow(ndc.y/.62,2.0));',
  ' vCenterFade=mix(.34,1.0,smoothstep(.12,.68,abs(ndc.x)))*center;',
  '}'
].join('\n');

const particleFragment = [
  'precision highp float;',
  'varying vec3 vColor;',
  'varying float vOpacity,vPointerGlow,vRippleGlow,vCenterFade,vDepth;',
  'varying vec2 vScreen;',
  'void main(){',
  ' vec2 pt=gl_PointCoord-vec2(.5); float r=length(pt)*2.0;',
  ' float core=exp(-r*r*24.0),halo=exp(-r*5.2),shape=1.0-smoothstep(.76,1.0,r);',
  ' float pulse=.78+.22*sin(vDepth*9.0+vScreen.x*4.0);',
  ' float alpha=(core*.76+halo*.24)*shape*vOpacity*vCenterFade*pulse;',
  ' vec3 color=vColor*(.66+core*.82+vPointerGlow*.70+vRippleGlow*1.85);',
  ' gl_FragColor=vec4(color*alpha*1.38,alpha);',
  ' #include <colorspace_fragment>',
  '}'
].join('\n');

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => { value=(value*1664525+1013904223)>>>0; return value/4294967296; };
}
function gaussian(random: () => number) {
  return (random()+random()+random()+random()-2.0)*.72;
}
function particleCountFor(width: number) {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowPower=(nav.deviceMemory!==undefined&&nav.deviceMemory<=4)||(navigator.hardwareConcurrency>0&&navigator.hardwareConcurrency<=4);
  const base=width<600?9000:width<980?17000:28000;
  return lowPower?Math.round(base*.68):base;
}

interface AiParticleEnvironmentProps {
  onPointerPosition?: (x: number, y: number, active: boolean) => void;
}

export const AiParticleEnvironment: React.FC<AiParticleEnvironmentProps> = ({ onPointerPosition }) => {
  const hostRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    const host=hostRef.current, hero=host?.parentElement;
    if(!host||!hero) return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let renderer:any,scene:any,camera:any,points:any,bgMesh:any;
    let pointGeometry:any,bgGeometry:any,pointMaterial:any,bgMaterial:any;
    let raf=0,running=false,disposed=false,contextLost=false,visible=true;
    let width=0,height=0,pixelRatio=1,elapsed=0,previous=0,lastPointerAt=0,rippleStart=-10;
    let ripplePower=0,pointerActive=0,cursorMotion=0,cursorMotionTarget=0;
    let pointerActiveTarget=0;
    const pointer=new THREE.Vector2(0,0),targetPointer=new THREE.Vector2(0,0),rippleOrigin=new THREE.Vector2(0,0);
    const fov=45,cameraZ=6.2,bgZ=-5.4;

    const stop=()=>{ running=false; if(raf)window.cancelAnimationFrame(raf); raf=0; previous=0; };
    const uniform=(material:any,key:string,value:any)=>{if(material?.uniforms?.[key])material.uniforms[key].value=value;};
    const renderStatic=()=>{
      if(!renderer||!scene||!camera||contextLost||disposed)return;
      uniform(pointMaterial,'uTime',0);uniform(bgMaterial,'uTime',0);
      uniform(pointMaterial,'uPointer',pointer);uniform(bgMaterial,'uPointer',pointer);
      uniform(pointMaterial,'uPointerActive',0);uniform(bgMaterial,'uPointerActive',0);
      uniform(pointMaterial,'uCursorMotion',0);uniform(pointMaterial,'uRippleStrength',0);
      renderer.render(scene,camera);
    };

    const buildPoints=(aspect:number,count:number)=>{
      const positions=new Float32Array(count*3),seeds=new Float32Array(count),sizes=new Float32Array(count);
      const sides=new Float32Array(count),opacities=new Float32Array(count),depths=new Float32Array(count);
      const rand=seededRandom(0x6d2b79f5+count),halfFov=fov*Math.PI/360;
      const centers=[-.91,-.58,-.22,.17,.55,.89];
      for(let i=0;i<count;i++){
        const side=i<count*.5?0:1,depth=rand(),z=-2.35+depth*3.55;
        const hh=Math.tan(halfFov)*(cameraZ-z),hw=hh*aspect;
        const x=side===0?-1.28+rand()*1.58:1.28-rand()*1.58;
        const strand=Math.floor(rand()*centers.length);
        const curve=centers[strand]+Math.sin(x*3.6+side*1.7+depth*4)*.17
          +Math.sin(x*7.4-depth*5+side)*.055+gaussian(rand)*(.11+depth*.05);
        const y=rand()>.68?rand()*2.5-1.25:curve;
        const organicX=x+Math.sin(y*3.1+depth*4+side)*.055+gaussian(rand)*.035;
        positions[i*3]=organicX*hw;positions[i*3+1]=y*hh;positions[i*3+2]=z;
        seeds[i]=rand();sizes[i]=.58+rand()*1.75;sides[i]=side;opacities[i]=.30+rand()*.70;depths[i]=depth;
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
      geometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
      geometry.setAttribute('aSide',new THREE.BufferAttribute(sides,1));
      geometry.setAttribute('aOpacity',new THREE.BufferAttribute(opacities,1));
      geometry.setAttribute('aDepth',new THREE.BufferAttribute(depths,1));
      geometry.computeBoundingSphere();
      return geometry;
    };

    const resize=()=>{
      const rect=host.getBoundingClientRect();
      if(rect.width<20||rect.height<20||!renderer||!camera)return;
      const w=Math.round(rect.width),h=Math.round(rect.height);
      if(w===width&&h===height)return;
      width=w;height=h;
      pixelRatio=Math.min(window.devicePixelRatio||1,width<600?1.0:width<980?1.15:1.35);
      renderer.setPixelRatio(pixelRatio);renderer.setSize(width,height,false);
      camera.aspect=width/height;camera.updateProjectionMatrix();
      const bgHalfH=Math.tan(fov*Math.PI/360)*(cameraZ-bgZ);
      bgGeometry?.dispose?.();
      bgGeometry=new THREE.PlaneGeometry(bgHalfH*2*camera.aspect*1.04,bgHalfH*2*1.04);
      if(bgMesh)bgMesh.geometry=bgGeometry;
      const next=buildPoints(camera.aspect,particleCountFor(width));
      pointGeometry?.dispose?.();pointGeometry=next;if(points)points.geometry=pointGeometry;
      if(reduced.matches)renderStatic();
    };

    try{
      renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:false});
      renderer.setClearColor(0x07091f,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
      const canvas=renderer.domElement;
      canvas.setAttribute('aria-hidden','true');
      Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block',pointerEvents:'none'});
      host.appendChild(canvas);

      scene=new THREE.Scene();
      camera=new THREE.PerspectiveCamera(fov,1,.1,80);camera.position.set(0,0,cameraZ);camera.lookAt(0,0,0);

      bgMaterial=new THREE.ShaderMaterial({
        uniforms:{uTime:{value:0},uPointer:{value:pointer},uPointerActive:{value:0}},
        vertexShader:bgVertex,fragmentShader:bgFragment,depthTest:false,depthWrite:false,side:THREE.DoubleSide
      });
      bgGeometry=new THREE.PlaneGeometry(2,2);
      bgMesh=new THREE.Mesh(bgGeometry,bgMaterial);bgMesh.position.z=bgZ;scene.add(bgMesh);

      pointMaterial=new THREE.ShaderMaterial({
        uniforms:{
          uTime:{value:0},uPixelRatio:{value:1},uPointer:{value:pointer},uPointerActive:{value:0},
          uCursorMotion:{value:0},uRippleOrigin:{value:rippleOrigin},uRippleAge:{value:0},uRippleStrength:{value:0}
        },
        vertexShader:particleVertex,fragmentShader:particleFragment,transparent:true,
        depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false
      });
      pointGeometry=buildPoints(1,particleCountFor(host.clientWidth||1200));
      points=new THREE.Points(pointGeometry,pointMaterial);points.frustumCulled=false;scene.add(points);

      const onLost=(event:Event)=>{event.preventDefault();contextLost=true;stop();};
      const onRestored=()=>{contextLost=false;renderer?.resetState?.();resize();start();};
      canvas.addEventListener('webglcontextlost',onLost,false);
      canvas.addEventListener('webglcontextrestored',onRestored,false);

      const onPointerMove=(event:PointerEvent)=>{
        if(reduced.matches || event.pointerType === 'touch')return;
        const rect=host.getBoundingClientRect();if(!rect.width||!rect.height)return;
        const x=((event.clientX-rect.left)/rect.width)*2-1;
        const y=1-((event.clientY-rect.top)/rect.height)*2;
        const now=performance.now(),travel=Math.hypot(x-targetPointer.x,y-targetPointer.y);
        const dt=Math.max(12,now-(lastPointerAt||now-16)),speed=Math.min(1,travel/dt*8);
        targetPointer.set(x,y);pointerActiveTarget=1;cursorMotionTarget=Math.max(cursorMotionTarget,speed);
        rippleOrigin.set(x,y);rippleStart=elapsed;ripplePower=.32+speed*.68;lastPointerAt=now;
        onPointerPosition?.((x+1)*.5,(1-y)*.5,true);
      };
      const onPointerLeave=()=>{
        pointerActiveTarget=0;cursorMotionTarget=0;
        onPointerPosition?.(.5,.5,false);
      };
      hero.addEventListener('pointermove',onPointerMove,{passive:true});
      hero.addEventListener('pointerleave',onPointerLeave,{passive:true});

      const tick=(timestamp:number)=>{
        if(disposed||contextLost||!visible||document.hidden||reduced.matches){stop();return;}
        const dt=previous?Math.min((timestamp-previous)/1000,.05):0;previous=timestamp;elapsed+=dt;
        pointer.lerp(targetPointer,1-Math.exp(-dt*5.2));
        const fresh=pointerActiveTarget>0&&performance.now()-lastPointerAt<190?1:0;
        pointerActive+=(fresh-pointerActive)*(1-Math.exp(-dt*4.0));
        cursorMotionTarget*=Math.exp(-dt*2.1);
        cursorMotion+=(cursorMotionTarget-cursorMotion)*(1-Math.exp(-dt*7.0));
        uniform(pointMaterial,'uTime',elapsed);uniform(bgMaterial,'uTime',elapsed);
        uniform(pointMaterial,'uPointer',pointer);uniform(bgMaterial,'uPointer',pointer);
        uniform(pointMaterial,'uPointerActive',pointerActive);uniform(bgMaterial,'uPointerActive',pointerActive);
        uniform(pointMaterial,'uCursorMotion',cursorMotion);uniform(pointMaterial,'uRippleOrigin',rippleOrigin);
        uniform(pointMaterial,'uRippleAge',Math.max(0,elapsed-rippleStart));uniform(pointMaterial,'uRippleStrength',ripplePower);
        uniform(pointMaterial,'uPixelRatio',pixelRatio);
        renderer.render(scene,camera);
        if(running)raf=window.requestAnimationFrame(tick);
      };
      const start=()=>{
        stop();if(contextLost||disposed||!renderer)return;
        if(reduced.matches){renderStatic();return;}
        if(visible&&!document.hidden){running=true;raf=window.requestAnimationFrame(tick);}
      };
      const onVisibility=()=>{if(document.hidden)stop();else start();};
      const onReduced=()=>{if(reduced.matches){pointerActiveTarget=0;pointerActive=0;onPointerPosition?.(.5,.5,false);renderStatic();stop();}else start();};
      document.addEventListener('visibilitychange',onVisibility);
      reduced.addEventListener?.('change',onReduced);
      const ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;
      if(ro)ro.observe(host);else window.addEventListener('resize',resize);
      const io=typeof IntersectionObserver!=='undefined'?new IntersectionObserver((entries)=>{
        visible=entries.some(entry=>entry.isIntersecting);
        if(!visible){pointerActiveTarget=0;onPointerPosition?.(.5,.5,false);stop();}else start();
      },{threshold:.01}):null;
      if(io)io.observe(host);
      resize();start();

      return ()=>{
        disposed=true;stop();onPointerPosition?.(.5,.5,false);ro?.disconnect();io?.disconnect();
        window.removeEventListener('resize',resize);
        document.removeEventListener('visibilitychange',onVisibility);
        reduced.removeEventListener?.('change',onReduced);
        hero.removeEventListener('pointermove',onPointerMove);hero.removeEventListener('pointerleave',onPointerLeave);
        canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);
        pointGeometry?.dispose?.();bgGeometry?.dispose?.();pointMaterial?.dispose?.();bgMaterial?.dispose?.();renderer?.dispose?.();
        if(canvas.parentNode===host)host.removeChild(canvas);
      };
    }catch(error){
      console.warn('[AI Particle Environment] WebGL unavailable; keeping the CSS fallback.',error);
      renderer?.dispose?.();
      return ()=>{disposed=true;renderer?.dispose?.();};
    }
  },[onPointerPosition]);

  return <div ref={hostRef} className="dashboard-ai-webgl-host" aria-hidden="true" style={{
    position:'absolute',inset:0,zIndex:0,overflow:'hidden',pointerEvents:'none'
  }}/>;
};

export default AiParticleEnvironment;
