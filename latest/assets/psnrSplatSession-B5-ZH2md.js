import{t as b,n as q,e as Y,f as he,C as z}from"./index-Dwe7ZoTy.js";import{loadGaussianCloudFromFile as fe}from"./gaussianCloudLoader-DGzkSle7.js";import{G as xe,c as Se}from"./gaussianSceneResourceManager-DTpzRu1O.js";import{n as L,g as H,r as ne}from"./webGpuSplatTelemetry-C1RN5ecG.js";import"./three-vendor-B0uy1enQ.js";import"./react-vendor-Cgg2GOmP.js";import"./ui-vendor-yocre0t3.js";const Te=8,be=64,Pe=1,we=2,K=4,ye=8,Re=16,k=8,Q=new WeakMap;function ve({device:r,source:e,sourceOrigin:t={x:0,y:0},sourceWidth:i=e.width-t.x,sourceHeight:n=e.height-t.y,targetWidth:a,targetHeight:s}){const u=E(e.width,"bitmap width"),c=E(e.height,"bitmap height"),m=Z(t.x,"source origin x"),o=Z(t.y,"source origin y"),l=E(i,"source width"),d=E(n,"source height"),g=E(a,"target width"),h=E(s,"target height");if(m+l>u||o+d>c)throw new Error(`Invalid WebGPU PSNR ground-truth texture source region: ${m},${o} ${l}x${d} exceeds bitmap ${u}x${c}`);const p=r.createTexture({size:{width:l,height:d},format:"rgba8unorm",usage:we|K|Re}),f=b("textures");try{r.queue.copyExternalImageToTexture({source:e,origin:{x:m,y:o}},{texture:p,colorSpace:"srgb",premultipliedAlpha:!1},{width:l,height:d})}catch(S){throw p.destroy(),f(),S}if(l===g&&d===h){let S=!1;return{texture:p,width:g,height:h,dispose:()=>{S||(S=!0,p.destroy(),f())}}}const x=r.createTexture({size:{width:g,height:h},format:"rgba8unorm",usage:Pe|K|ye}),w=b("textures");try{Ee({device:r,sourceTexture:p,targetTexture:x,sourceWidth:l,sourceHeight:d,targetWidth:g,targetHeight:h})}catch(S){throw x.destroy(),p.destroy(),w(),f(),S}let y=!1;return{texture:x,width:g,height:h,dispose:()=>{y||(y=!0,x.destroy(),p.destroy(),w(),f())}}}function Ee({device:r,sourceTexture:e,targetTexture:t,sourceWidth:i,sourceHeight:n,targetWidth:a,targetHeight:s}){const u=Ie(r),c=new Uint32Array([i,n,a,s]),m=Ge(r,c);try{const o=r.createBindGroup({layout:u.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:e.createView()},{binding:1,resource:u.sampler},{binding:2,resource:t.createView()},{binding:3,resource:{buffer:m.buffer}}]}),l=r.createCommandEncoder(),d=l.beginComputePass();d.setPipeline(u.pipeline),d.setBindGroup(0,o),d.dispatchWorkgroups(Math.ceil(a/k),Math.ceil(s/k)),d.end(),r.queue.submit([l.finish()])}finally{m.buffer.destroy(),m.releaseCounter()}}function Ie(r){const e=Q.get(r);if(e)return e;const t=r.createShaderModule({code:Me()}),i={pipeline:r.createComputePipeline({layout:"auto",compute:{module:t,entryPoint:"main"}}),sampler:r.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"})};return Q.set(r,i),i}function Ge(r,e){const t=r.createBuffer({size:Math.max(16,e.byteLength),usage:be|Te}),i=b("buffers");try{const n=new Uint8Array(e.byteLength);return n.set(new Uint8Array(e.buffer,e.byteOffset,e.byteLength)),r.queue.writeBuffer(t,0,n),{buffer:t,releaseCounter:i}}catch(n){throw t.destroy(),i(),n}}function Me(){return`
struct ResizeParams {
  sourceWidth: u32,
  sourceHeight: u32,
  targetWidth: u32,
  targetHeight: u32,
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var targetTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: ResizeParams;

@compute @workgroup_size(${k}, ${k})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (globalId.x >= params.targetWidth || globalId.y >= params.targetHeight) {
    return;
  }

  let uv = vec2<f32>(
    (f32(globalId.x) + 0.5) / f32(params.targetWidth),
    (f32(globalId.y) + 0.5) / f32(params.targetHeight)
  );
  let color = textureSampleLevel(sourceTexture, sourceSampler, uv, 0.0);
  textureStore(targetTexture, vec2<i32>(i32(globalId.x), i32(globalId.y)), color);
}
`}function E(r,e){if(!Number.isInteger(r)||r<=0)throw new Error(`Invalid WebGPU PSNR ground-truth texture ${e}: expected a positive integer`);return r}function Z(r,e){if(!Number.isInteger(r)||r<0)throw new Error(`Invalid WebGPU PSNR ground-truth texture ${e}: expected a non-negative integer`);return r}const T=64,Ce=1,j=4,ue=8,_e=64,ee=128,Ue=1,We=4294967296,oe=5e5,Ne=8,G=Ne*Uint32Array.BYTES_PER_ELEMENT,Be=65535,re=new WeakMap;async function Ae({device:r,renderedTexture:e,groundTruthTexture:t,width:i,height:n,renderedOrigin:a,groundTruthOrigin:s}){return se(await ae({device:r,renderedTexture:e,groundTruthTexture:t,width:i,height:n,renderedOrigin:a,groundTruthOrigin:s}))}async function ae({device:r,renderedTexture:e,groundTruthTexture:t,width:i,height:n,renderedOrigin:a={x:0,y:0},groundTruthOrigin:s={x:0,y:0}}){const u=V(i,"width"),c=V(n,"height"),m=u*c;if(!Number.isSafeInteger(m))throw new Error("Invalid WebGPU PSNR texture size: pixel count exceeds safe integer range");const o=qe(r),l=L(),d=Math.ceil(m/T),g=ie(r,d),h=d*G;let p=null,f=null,x=null,w=q,y=q,S=q;const R=[];try{p=r.createBuffer({size:h,usage:ee|j}),w=b("buffers"),f=r.createBuffer({size:h,usage:ee|j}),y=b("buffers"),x=r.createBuffer({size:G,usage:Ce|ue}),S=b("buffers");const v=r.createCommandEncoder(),C=te(r,new Uint32Array([u,c,A(a.x,"renderedOrigin.x"),A(a.y,"renderedOrigin.y"),A(s.x,"groundTruthOrigin.x"),A(s.y,"groundTruthOrigin.y"),g.x,d]));R.push(C);const ce=r.createBindGroup({layout:o.compare.getBindGroupLayout(0),entries:[{binding:0,resource:e.createView()},{binding:1,resource:t.createView()},{binding:2,resource:{buffer:p}},{binding:3,resource:{buffer:C.buffer}}]}),_=v.beginComputePass();_.setPipeline(o.compare),_.setBindGroup(0,ce),_.dispatchWorkgroups(g.x,g.y),_.end();let U=p,$=f,W=d;for(;W>1;){const F=Math.ceil(W/T),O=ie(r,F),J=te(r,new Uint32Array([W,O.x,F,0]));R.push(J);const ge=r.createBindGroup({layout:o.reduce.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:U}},{binding:1,resource:{buffer:$}},{binding:2,resource:{buffer:J.buffer}}]}),N=v.beginComputePass();N.setPipeline(o.reduce),N.setBindGroup(0,ge),N.dispatchWorkgroups(O.x,O.y),N.end(),W=F;const pe=$;$=U,U=pe}v.copyBufferToBuffer(U,0,x,0,G),r.queue.submit([v.finish()]);const le=L();await x.mapAsync(Ue);const me=H(le),P=new Uint32Array(x.getMappedRange().slice(0,G));return x.unmap(),ne({name:"psnr-reduction",durationMs:H(l),readbackBytes:G,readbackDurationMs:me,details:{width:u,height:c,pixelCount:m,compareWorkgroups:d,compareDispatchX:g.x,compareDispatchY:g.y}}),{sumSquaredError:B(P[0],P[1],"squared error"),validPixelCount:B(P[2],P[3],"valid pixel count"),ssimScaledSum:B(P[4],P[5],"SSIM scaled sum"),ssimWindowCount:B(P[6],P[7],"SSIM window count")}}finally{p?.destroy(),w(),f?.destroy(),y(),x?.destroy(),S();for(const{buffer:v,releaseCounter:C}of R)v.destroy(),C()}}function se({sumSquaredError:r,validPixelCount:e,ssimScaledSum:t,ssimWindowCount:i}){const n=I(r,"sumSquaredError"),a=I(e,"validPixelCount"),s=Fe({ssimScaledSum:t,ssimWindowCount:i});if(a===0)return D(X({sumSquaredError:n,psnr:NaN,mse:NaN,validPixelCount:0},{ssimScaledSum:t,ssimWindowCount:i}),s);const u=n/(a*3);return D(u===0?X({sumSquaredError:n,psnr:1/0,mse:u,validPixelCount:a},{ssimScaledSum:t,ssimWindowCount:i}):X({sumSquaredError:n,psnr:10*Math.log10(65025/u),mse:u,validPixelCount:a},{ssimScaledSum:t,ssimWindowCount:i}),s)}function ke(r){let e=0,t=0,i=0,n=0,a=!0,s=!1;for(const c of r){if(s=!0,e+=I(c.sumSquaredError,"sumSquaredError"),t+=I(c.validPixelCount,"validPixelCount"),$e(c)?(i+=I(c.ssimScaledSum,"ssimScaledSum"),n+=I(c.ssimWindowCount,"ssimWindowCount")):a=!1,!Number.isSafeInteger(e))throw new Error("Invalid WebGPU PSNR sumSquaredError: accumulated value exceeds JavaScript safe integer range");if(!Number.isSafeInteger(t))throw new Error("Invalid WebGPU PSNR validPixelCount: accumulated value exceeds JavaScript safe integer range");if(!Number.isSafeInteger(i))throw new Error("Invalid WebGPU PSNR ssimScaledSum: accumulated value exceeds JavaScript safe integer range");if(!Number.isSafeInteger(n))throw new Error("Invalid WebGPU PSNR ssimWindowCount: accumulated value exceeds JavaScript safe integer range")}const u={sumSquaredError:e,validPixelCount:t};return s&&a&&(u.ssimScaledSum=i,u.ssimWindowCount=n),u}function $e(r){return r.ssimScaledSum!==void 0&&r.ssimWindowCount!==void 0}function Fe({ssimScaledSum:r,ssimWindowCount:e}){if(!(r===void 0||e===void 0||e<=0))return Math.max(-1,Math.min(1,r/(e*oe)-1))}function D(r,e){return e===void 0?r:{...r,ssim:e}}function X(r,e){return e.ssimScaledSum===void 0||e.ssimWindowCount===void 0?r:{...r,ssimScaledSum:e.ssimScaledSum,ssimWindowCount:e.ssimWindowCount}}function te(r,e){const t=r.createBuffer({size:Math.max(16,e.byteLength),usage:_e|ue}),i=b("buffers");try{const n=new Uint8Array(e.byteLength);return n.set(new Uint8Array(e.buffer,e.byteOffset,e.byteLength)),r.queue.writeBuffer(t,0,n),{buffer:t,releaseCounter:i}}catch(n){throw t.destroy(),i(),n}}function ie(r,e){const t=V(e,"workgroup count"),i=Oe(r),n=Math.min(t,i),a=Math.ceil(t/n);if(a>i)throw new Error(`Invalid WebGPU PSNR dispatch: ${t} workgroups exceeds ${i}x${i} grid`);return{x:n,y:a}}function Oe(r){const e=r.limits?.maxComputeWorkgroupsPerDimension;return typeof e=="number"&&Number.isInteger(e)&&e>0?e:Be}function qe(r){const e=re.get(r);if(e)return e;const t=r.createShaderModule({code:De()}),i=r.createShaderModule({code:Xe()}),n={compare:r.createComputePipeline({layout:"auto",compute:{module:t,entryPoint:"main"}}),reduce:r.createComputePipeline({layout:"auto",compute:{module:i,entryPoint:"main"}})};return re.set(r,n),n}function De(){return`
struct CompareParams {
  width: u32,
  height: u32,
  renderedOriginX: u32,
  renderedOriginY: u32,
  groundTruthOriginX: u32,
  groundTruthOriginY: u32,
  dispatchX: u32,
  workgroupCount: u32,
}

@group(0) @binding(0) var renderedTexture: texture_2d<f32>;
@group(0) @binding(1) var groundTruthTexture: texture_2d<f32>;
struct MetricPartial {
  sumSquaredError: vec2<u32>,
  validPixelCount: vec2<u32>,
  ssimScaledSum: vec2<u32>,
  ssimWindowCount: vec2<u32>,
}

@group(0) @binding(2) var<storage, read_write> partials: array<MetricPartial>;
@group(0) @binding(3) var<uniform> params: CompareParams;

var<workgroup> partialSums: array<MetricPartial, ${T}>;

fn rgbaToByte(value: f32) -> i32 {
  return i32(round(clamp(value, 0.0, 1.0) * 255.0));
}

fn rgbaToByteF32(value: f32) -> f32 {
  return round(clamp(value, 0.0, 1.0) * 255.0);
}

fn gaussianWindowWeight(offset: i32) -> f32 {
  let absOffset = select(-offset, offset, offset >= 0);
  if (absOffset == 0) {
    return 0.266011724862;
  }
  if (absOffset == 1) {
    return 0.213005537711;
  }
  if (absOffset == 2) {
    return 0.109360689510;
  }
  if (absOffset == 3) {
    return 0.0360007721284;
  }
  if (absOffset == 4) {
    return 0.00759875813524;
  }
  if (absOffset == 5) {
    return 0.00102838008448;
  }
  return 0.0;
}

fn textureRgbBytes(textureValue: vec4<f32>) -> vec3<f32> {
  return vec3<f32>(
    rgbaToByteF32(textureValue.r),
    rgbaToByteF32(textureValue.g),
    rgbaToByteF32(textureValue.b)
  );
}

fn computeWindowSsim(x: u32, y: u32) -> f32 {
  var weightSum = 0.0;
  var renderedSum = vec3<f32>(0.0);
  var groundTruthSum = vec3<f32>(0.0);
  var renderedSquaredSum = vec3<f32>(0.0);
  var groundTruthSquaredSum = vec3<f32>(0.0);
  var productSum = vec3<f32>(0.0);
  let baseX = i32(x);
  let baseY = i32(y);
  let width = i32(params.width);
  let height = i32(params.height);

  var dy: i32 = -5;
  loop {
    if (dy > 5) {
      break;
    }
    let sampleY = baseY + dy;
    if (sampleY >= 0 && sampleY < height) {
      let yWeight = gaussianWindowWeight(dy);
      var dx: i32 = -5;
      loop {
        if (dx > 5) {
          break;
        }
        let sampleX = baseX + dx;
        if (sampleX >= 0 && sampleX < width) {
          let sampleGroundTruth = textureLoad(
            groundTruthTexture,
            vec2<i32>(
              sampleX + i32(params.groundTruthOriginX),
              sampleY + i32(params.groundTruthOriginY)
            ),
            0
          );
          if (sampleGroundTruth.a > 0.0) {
            let sampleRendered = textureLoad(
              renderedTexture,
              vec2<i32>(
                sampleX + i32(params.renderedOriginX),
                sampleY + i32(params.renderedOriginY)
              ),
              0
            );
            let weight = gaussianWindowWeight(dx) * yWeight;
            let renderedRgb = textureRgbBytes(sampleRendered);
            let groundTruthRgb = textureRgbBytes(sampleGroundTruth);
            weightSum = weightSum + weight;
            renderedSum = renderedSum + renderedRgb * weight;
            groundTruthSum = groundTruthSum + groundTruthRgb * weight;
            renderedSquaredSum = renderedSquaredSum + renderedRgb * renderedRgb * weight;
            groundTruthSquaredSum = groundTruthSquaredSum + groundTruthRgb * groundTruthRgb * weight;
            productSum = productSum + renderedRgb * groundTruthRgb * weight;
          }
        }
        dx = dx + 1;
      }
    }
    dy = dy + 1;
  }

  if (weightSum <= 0.0) {
    return 0.0;
  }

  let renderedMean = renderedSum / weightSum;
  let groundTruthMean = groundTruthSum / weightSum;
  let renderedVariance = max(vec3<f32>(0.0), renderedSquaredSum / weightSum - renderedMean * renderedMean);
  let groundTruthVariance = max(vec3<f32>(0.0), groundTruthSquaredSum / weightSum - groundTruthMean * groundTruthMean);
  let covariance = productSum / weightSum - renderedMean * groundTruthMean;
  let c1 = 6.5025;
  let c2 = 58.5225;
  let numerator = (2.0 * renderedMean * groundTruthMean + vec3<f32>(c1)) * (2.0 * covariance + vec3<f32>(c2));
  let denominator = (renderedMean * renderedMean + groundTruthMean * groundTruthMean + vec3<f32>(c1))
    * (renderedVariance + groundTruthVariance + vec3<f32>(c2));
  let channelSsim = numerator / denominator;
  return clamp((channelSsim.x + channelSsim.y + channelSsim.z) / 3.0, -1.0, 1.0);
}

fn addU64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let lo = a.x + b.x;
  let carry = select(0u, 1u, lo < a.x);
  return vec2<u32>(lo, a.y + b.y + carry);
}

fn emptyPartial() -> MetricPartial {
  return MetricPartial(
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u)
  );
}

fn addPartial(a: MetricPartial, b: MetricPartial) -> MetricPartial {
  return MetricPartial(
    addU64(a.sumSquaredError, b.sumSquaredError),
    addU64(a.validPixelCount, b.validPixelCount),
    addU64(a.ssimScaledSum, b.ssimScaledSum),
    addU64(a.ssimWindowCount, b.ssimWindowCount)
  );
}

@compute @workgroup_size(${T})
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let workgroupIndex = workgroupId.y * params.dispatchX + workgroupId.x;
  let pixelIndex = workgroupIndex * ${T}u + localId.x;
  let localIndex = localId.x;
  let pixelCount = params.width * params.height;
  var partial = emptyPartial();

  if (pixelIndex < pixelCount) {
    let x = pixelIndex % params.width;
    let y = pixelIndex / params.width;
    let rendered = textureLoad(
      renderedTexture,
      vec2<i32>(i32(x + params.renderedOriginX), i32(y + params.renderedOriginY)),
      0
    );
    let groundTruth = textureLoad(
      groundTruthTexture,
      vec2<i32>(i32(x + params.groundTruthOriginX), i32(y + params.groundTruthOriginY)),
      0
    );

    if (groundTruth.a > 0.0) {
      let renderedR = rgbaToByte(rendered.r);
      let renderedG = rgbaToByte(rendered.g);
      let renderedB = rgbaToByte(rendered.b);
      let groundTruthR = rgbaToByte(groundTruth.r);
      let groundTruthG = rgbaToByte(groundTruth.g);
      let groundTruthB = rgbaToByte(groundTruth.b);
      let dr = renderedR - groundTruthR;
      let dg = renderedG - groundTruthG;
      let db = renderedB - groundTruthB;
      let windowSsim = computeWindowSsim(x, y);
      let shiftedScaledSsim = u32(round((windowSsim + 1.0) * ${oe}.0));
      partial = MetricPartial(
        vec2<u32>(u32(dr * dr + dg * dg + db * db), 0u),
        vec2<u32>(1u, 0u),
        vec2<u32>(shiftedScaledSsim, 0u),
        vec2<u32>(1u, 0u)
      );
    }
  }

  partialSums[localIndex] = partial;
  workgroupBarrier();

  var stride = ${T/2}u;
  loop {
    if (localIndex < stride) {
      partialSums[localIndex] = addPartial(partialSums[localIndex], partialSums[localIndex + stride]);
    }
    workgroupBarrier();

    if (stride == 1u) {
      break;
    }
    stride = stride / 2u;
  }

  if (localIndex == 0u && workgroupIndex < params.workgroupCount) {
    partials[workgroupIndex] = partialSums[0];
  }
}
`}function Xe(){return`
struct ReduceParams {
  inputCount: u32,
  dispatchX: u32,
  outputCount: u32,
}

struct MetricPartial {
  sumSquaredError: vec2<u32>,
  validPixelCount: vec2<u32>,
  ssimScaledSum: vec2<u32>,
  ssimWindowCount: vec2<u32>,
}

@group(0) @binding(0) var<storage, read> inputPartials: array<MetricPartial>;
@group(0) @binding(1) var<storage, read_write> outputPartials: array<MetricPartial>;
@group(0) @binding(2) var<uniform> params: ReduceParams;

var<workgroup> partialSums: array<MetricPartial, ${T}>;

fn addU64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let lo = a.x + b.x;
  let carry = select(0u, 1u, lo < a.x);
  return vec2<u32>(lo, a.y + b.y + carry);
}

fn emptyPartial() -> MetricPartial {
  return MetricPartial(
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u)
  );
}

fn addPartial(a: MetricPartial, b: MetricPartial) -> MetricPartial {
  return MetricPartial(
    addU64(a.sumSquaredError, b.sumSquaredError),
    addU64(a.validPixelCount, b.validPixelCount),
    addU64(a.ssimScaledSum, b.ssimScaledSum),
    addU64(a.ssimWindowCount, b.ssimWindowCount)
  );
}

@compute @workgroup_size(${T})
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let workgroupIndex = workgroupId.y * params.dispatchX + workgroupId.x;
  let index = workgroupIndex * ${T}u + localId.x;
  let localIndex = localId.x;
  var partial = emptyPartial();

  if (index < params.inputCount) {
    partial = inputPartials[index];
  }

  partialSums[localIndex] = partial;
  workgroupBarrier();

  var stride = ${T/2}u;
  loop {
    if (localIndex < stride) {
      partialSums[localIndex] = addPartial(partialSums[localIndex], partialSums[localIndex + stride]);
    }
    workgroupBarrier();

    if (stride == 1u) {
      break;
    }
    stride = stride / 2u;
  }

  if (localIndex == 0u && workgroupIndex < params.outputCount) {
    outputPartials[workgroupIndex] = partialSums[0];
  }
}
`}function B(r,e,t){const i=e*We+r;if(!Number.isSafeInteger(i))throw new Error(`Invalid WebGPU PSNR ${t}: reduced value exceeds JavaScript safe integer range`);return i}function I(r,e){if(!Number.isSafeInteger(r)||r<0)throw new Error(`Invalid WebGPU PSNR ${e}: expected a non-negative safe integer`);return r}function V(r,e){if(!Number.isInteger(r)||r<=0)throw new Error(`Invalid WebGPU PSNR texture ${e}: expected a positive integer`);return r}function A(r,e){if(!Number.isInteger(r)||r<0)throw new Error(`Invalid WebGPU PSNR texture ${e}: expected a non-negative integer`);return r}const Ye=1,ze=4,Le=16,de="rgba8unorm",He=Ye|ze|Le,Ve=(r,e)=>globalThis.createImageBitmap(r,e);async function gr({device:r,splatFile:e,loadedCloud:t,deps:i={}}){const n=i.loadGaussianCloudFromFile??fe,a=i.createSceneResourceManager??(()=>new xe),s=i.createRenderSession??Se,u=t??await n(e),c=a(),m=c.acquire(r,{sceneId:Qe(e,u),cloud:u.cloud,labelPrefix:`psnr ${e.name}`});try{const o=s({device:r,scene:m,format:de,width:1,height:1,backgroundColor:Y(),sortAlgorithm:"radix"});return new Je({device:r,renderSession:o,resourceManager:c,deps:i})}catch(o){throw m.release(),c.dispose(),o}}class Je{device;renderSession;resourceManager;createBitmap;createGroundTruthTexture;computePsnrFromTextures;computePsnrTextureReductionFromTextures;createMetricFrame;activeResourceScopes=new Set;releasePsnrSessionCounter=b("psnrSessions");renderQueue=Promise.resolve();disposed=!1;constructor({device:e,renderSession:t,resourceManager:i,deps:n}){this.device=e,this.renderSession=t,this.resourceManager=i,this.createBitmap=n.createBitmap??Ve,this.createGroundTruthTexture=n.createGroundTruthTexture??ve,this.computePsnrFromTextures=n.computePsnrFromTextures??Ae,this.computePsnrTextureReductionFromTextures=n.computePsnrTextureReductionFromTextures??ae,this.createMetricFrame=n.createMetricFrame??he}async computeImageMetric({imageFile:e,image:t,camera:i,width:n,height:a,transform:s}){const u=await this.submitImageMetric({imageFile:e,image:t,camera:i,width:n,height:a,transform:s});try{return await u.result}finally{u.dispose()}}async submitImageMetric({imageFile:e,image:t,camera:i,width:n,height:a,transform:s}){this.assertNotDisposed();const u=M(n,"width"),c=M(a,"height");Ze(i),je({camera:i,width:u,height:c,imageName:t.name});const m=this.createResourceScope(),o=b("activePsnrImageJobs"),l=L();try{const d=await this.createBitmap(e,{colorSpaceConversion:"none",premultiplyAlpha:"none"});m.setBitmap(d),this.assertNotDisposed();const g=M(d.width,"source width"),h=M(d.height,"source height");er({camera:i,sourceWidth:g,sourceHeight:h,imageName:t.name});const p=tr(this.device);if(ir(p,u,c,g,h))return this.submitSingleImageMetric({resources:m,bitmap:d,releaseActiveJobCounter:o,telemetryStart:l,image:t,camera:i,width:u,height:c,transform:s});nr({maxTextureDimension2D:p,sourceWidth:g,sourceHeight:h,targetWidth:u,targetHeight:c});const f=await this.computeTiledImageMetric({resources:m,bitmap:d,image:t,camera:i,width:u,height:c,transform:s,maxTextureDimension2D:p});return this.recordImageTelemetry({telemetryStart:l,image:t,width:u,height:c,tiled:!0,result:f}),m.releaseAll(),this.activeResourceScopes.delete(m),o(),{result:Promise.resolve(f),dispose:()=>{}}}catch(d){throw m.releaseAll(),this.activeResourceScopes.delete(m),o(),d}}dispose(){if(!this.disposed){this.disposed=!0;for(const e of this.activeResourceScopes)e.releaseAll();this.activeResourceScopes.clear(),this.renderSession.dispose(),this.resourceManager.dispose(),this.releasePsnrSessionCounter()}}submitSingleImageMetric({resources:e,bitmap:t,releaseActiveJobCounter:i,telemetryStart:n,image:a,camera:s,width:u,height:c,transform:m}){let o=null,l=null,d=null,g=!1,h=!1;try{l=this.createGroundTruthTexture({device:this.device,source:t,targetWidth:u,targetHeight:c}),e.trackGroundTruthTexture(l),o=this.createRenderedTexture(u,c,a.name),e.trackRenderedTexture(o);const p=this.createMetricFrame({image:a,camera:s,width:u,height:c,transform:m}),f=this.renderMetricFrameToTexture({frame:p,target:o.texture,backgroundColor:Y()}),x=o,w=l;this.assertNotDisposed();const y=async()=>{if(await f,this.assertNotDisposed(),g)throw new Error("WebGPU splat PSNR image metric has been disposed");const R=await this.computePsnrFromTextures({device:this.device,renderedTexture:x.texture,groundTruthTexture:w.texture,width:u,height:c});if(this.assertNotDisposed(),g)throw new Error("WebGPU splat PSNR image metric has been disposed");return this.recordImageTelemetry({telemetryStart:n,image:a,width:u,height:c,tiled:!1,result:R}),R},S=()=>{h||(h=!0,o&&e.destroyRenderedTexture(o),l&&e.disposeGroundTruthTexture(l),e.releaseAll(),this.activeResourceScopes.delete(e),i())};return d=y().finally(S),{result:d,dispose(){g=!0,S()}}}finally{d||(o&&e.destroyRenderedTexture(o),l&&e.disposeGroundTruthTexture(l))}}async computeTiledImageMetric({resources:e,bitmap:t,image:i,camera:n,width:a,height:s,transform:u,maxTextureDimension2D:c}){const m=[];for(const o of ur(a,s,c)){this.assertNotDisposed();let l=null,d=null;try{d=this.createGroundTruthTexture({device:this.device,source:t,sourceOrigin:{x:o.originX,y:o.originY},sourceWidth:o.width,sourceHeight:o.height,targetWidth:o.width,targetHeight:o.height}),e.trackGroundTruthTexture(d),l=this.createRenderedTexture(o.width,o.height,i.name,o),e.trackRenderedTexture(l);const g=this.createMetricFrame({image:i,camera:n,width:o.width,height:o.height,transform:u,tile:{fullWidth:a,fullHeight:s,originX:o.originX,originY:o.originY}});await this.renderMetricFrameToTexture({frame:g,target:l.texture,backgroundColor:Y()}),this.assertNotDisposed(),m.push(await this.computePsnrTextureReductionFromTextures({device:this.device,renderedTexture:l.texture,groundTruthTexture:d.texture,width:o.width,height:o.height})),this.assertNotDisposed()}finally{l&&e.destroyRenderedTexture(l),d&&e.disposeGroundTruthTexture(d)}}return se(ke(m))}renderMetricFrameToTexture({frame:e,target:t,backgroundColor:i}){return this.enqueueRender(async()=>{this.renderSession.setCamera(e),this.renderSession.setBackgroundColor(i),this.assertNotDisposed(),await this.renderSession.renderToTexture(t,{completion:"completed"}),this.assertNotDisposed()})}enqueueRender(e){const t=this.renderQueue.then(e,e);return this.renderQueue=t.then(()=>{},()=>{}),t}createResourceScope(){const e=new Ke;return this.activeResourceScopes.add(e),e}recordImageTelemetry({telemetryStart:e,image:t,width:i,height:n,tiled:a,result:s}){const u=H(e);ne({name:"psnr-image",durationMs:u,imagesPerSecond:u>0?1e3/u:0,details:{imageName:t.name,width:i,height:n,tiled:a,validPixelCount:s.validPixelCount}})}createRenderedTexture(e,t,i,n){return{texture:this.device.createTexture({label:n?`webgpu splat psnr rendered ${i} tile ${n.originX},${n.originY}`:`webgpu splat psnr rendered ${i}`,size:{width:e,height:t},format:de,usage:He}),releaseCounter:b("textures")}}assertNotDisposed(){if(this.disposed)throw new Error("WebGPU splat PSNR session has been disposed")}}class Ke{bitmap=null;renderedTextures=new Set;groundTruthTextures=new Set;released=!1;setBitmap(e){if(this.released){e.close();return}this.bitmap=e}trackRenderedTexture(e){if(this.released){e.texture.destroy(),e.releaseCounter();return}this.renderedTextures.add(e)}destroyRenderedTexture(e){this.renderedTextures.delete(e)&&(e.texture.destroy(),e.releaseCounter())}trackGroundTruthTexture(e){if(this.released){e.dispose();return}this.groundTruthTextures.add(e)}disposeGroundTruthTexture(e){this.groundTruthTextures.delete(e)&&e.dispose()}releaseAll(){if(!this.released){this.released=!0,this.bitmap?.close(),this.bitmap=null;for(const e of this.renderedTextures)e.texture.destroy(),e.releaseCounter();this.renderedTextures.clear();for(const e of this.groundTruthTextures)e.dispose();this.groundTruthTextures.clear()}}}function Qe(r,e){return["psnr",e.format,r.name,r.size,r.lastModified,e.byteLength].join(":")}function Ze(r){if(!(r.modelId===z.SIMPLE_PINHOLE||r.modelId===z.PINHOLE))throw new Error(`WebGPU PSNR currently requires an undistorted pinhole ground-truth image for camera model ${rr(r.modelId)}`)}function je({camera:r,width:e,height:t,imageName:i}){if(!(e===r.width&&t===r.height))throw new Error(`WebGPU PSNR requires full-resolution metric rendering for ${i}: requested ${e}x${t}, camera is ${r.width}x${r.height}`)}function er({camera:r,sourceWidth:e,sourceHeight:t,imageName:i}){if(!(e===r.width&&t===r.height))throw new Error(`WebGPU PSNR requires an undistorted metric image matching the PINHOLE camera for ${i}: decoded ${e}x${t}, camera is ${r.width}x${r.height}. Load the image set that belongs to the sparse model.`)}function rr(r){for(const[e,t]of Object.entries(z))if(t===r)return e;return String(r)}function tr(r){const e=r.limits?.maxTextureDimension2D;return typeof e=="number"&&Number.isInteger(e)&&e>0?e:Number.MAX_SAFE_INTEGER}function ir(r,e,t,i,n){return e<=r&&t<=r&&i<=r&&n<=r}function nr({maxTextureDimension2D:r,sourceWidth:e,sourceHeight:t,targetWidth:i,targetHeight:n}){if(e!==i||t!==n)throw new Error(`WebGPU PSNR texture-limit tiling currently requires decoded source size ${e}x${t} to match target size ${i}x${n}`);if(!Number.isInteger(r)||r<=0)throw new Error("WebGPU PSNR texture-limit tiling requires a positive maxTextureDimension2D")}function ur(r,e,t){const i=[],n=M(t,"tile size");for(let a=0;a<e;a+=n)for(let s=0;s<r;s+=n)i.push({originX:s,originY:a,width:Math.min(n,r-s),height:Math.min(n,e-a)});return i}function M(r,e){if(!Number.isInteger(r)||r<=0)throw new Error(`Invalid WebGPU splat PSNR ${e}: expected a positive integer`);return r}export{gr as createWebGpuSplatPsnrSession};
