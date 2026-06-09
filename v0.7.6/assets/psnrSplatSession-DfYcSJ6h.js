import{t as P,n as X,j as z,k as Se,C as L}from"./index-BjmBSf6d.js";import{loadGaussianCloudFromFile as Te}from"./gaussianCloudLoader-DWGTO8IA.js";import{G as be,c as we}from"./gaussianSceneResourceManager-BNTlGAl2.js";import{n as H,g as J,r as oe}from"./webGpuSplatTelemetry-C1RN5ecG.js";import"./three-vendor-DLtonGIU.js";import"./react-vendor-Cgg2GOmP.js";import"./ui-vendor-BtLQg2Oc.js";const Pe=8,ye=64,Re=1,ve=2,Q=4,Ee=8,Ie=16,O=8,Z=new WeakMap;function Ge({device:r,source:e,sourceOrigin:i={x:0,y:0},sourceWidth:t=e.width-i.x,sourceHeight:u=e.height-i.y,targetWidth:a,targetHeight:s}){const o=I(e.width,"bitmap width"),l=I(e.height,"bitmap height"),d=ee(i.x,"source origin x"),p=ee(i.y,"source origin y"),m=I(t,"source width"),n=I(u,"source height"),h=I(a,"target width"),c=I(s,"target height");if(d+m>o||p+n>l)throw new Error(`Invalid WebGPU PSNR ground-truth texture source region: ${d},${p} ${m}x${n} exceeds bitmap ${o}x${l}`);const g=r.createTexture({size:{width:m,height:n},format:"rgba8unorm",usage:ve|Q|Ie}),x=P("textures");try{r.queue.copyExternalImageToTexture({source:e,origin:{x:d,y:p}},{texture:g,colorSpace:"srgb",premultipliedAlpha:!1},{width:m,height:n})}catch(b){throw g.destroy(),x(),b}if(m===h&&n===c){let b=!1;return{texture:g,width:h,height:c,dispose:()=>{b||(b=!0,g.destroy(),x())}}}const f=r.createTexture({size:{width:h,height:c},format:"rgba8unorm",usage:Re|Q|Ee}),T=P("textures");try{Me({device:r,sourceTexture:g,targetTexture:f,sourceWidth:m,sourceHeight:n,targetWidth:h,targetHeight:c})}catch(b){throw f.destroy(),g.destroy(),T(),x(),b}let S=!1;return{texture:f,width:h,height:c,dispose:()=>{S||(S=!0,f.destroy(),g.destroy(),T(),x())}}}function Me({device:r,sourceTexture:e,targetTexture:i,sourceWidth:t,sourceHeight:u,targetWidth:a,targetHeight:s}){const o=Ce(r),l=new Uint32Array([t,u,a,s]),d=_e(r,l);try{const p=r.createBindGroup({layout:o.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:e.createView()},{binding:1,resource:o.sampler},{binding:2,resource:i.createView()},{binding:3,resource:{buffer:d.buffer}}]}),m=r.createCommandEncoder(),n=m.beginComputePass();n.setPipeline(o.pipeline),n.setBindGroup(0,p),n.dispatchWorkgroups(Math.ceil(a/O),Math.ceil(s/O)),n.end(),r.queue.submit([m.finish()])}finally{d.buffer.destroy(),d.releaseCounter()}}function Ce(r){const e=Z.get(r);if(e)return e;const i=r.createShaderModule({code:Ue()}),t={pipeline:r.createComputePipeline({layout:"auto",compute:{module:i,entryPoint:"main"}}),sampler:r.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"})};return Z.set(r,t),t}function _e(r,e){const i=r.createBuffer({size:Math.max(16,e.byteLength),usage:ye|Pe}),t=P("buffers");try{const u=new Uint8Array(e.byteLength);return u.set(new Uint8Array(e.buffer,e.byteOffset,e.byteLength)),r.queue.writeBuffer(i,0,u),{buffer:i,releaseCounter:t}}catch(u){throw i.destroy(),t(),u}}function Ue(){return`
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

@compute @workgroup_size(${O}, ${O})
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
`}function I(r,e){if(!Number.isInteger(r)||r<=0)throw new Error(`Invalid WebGPU PSNR ground-truth texture ${e}: expected a positive integer`);return r}function ee(r,e){if(!Number.isInteger(r)||r<0)throw new Error(`Invalid WebGPU PSNR ground-truth texture ${e}: expected a non-negative integer`);return r}const w=64,Be=1,re=4,se=8,We=64,te=128,ke=1,Ne=4294967296,de=5e5,Ae=8,U=Ae*Uint32Array.BYTES_PER_ELEMENT,$e=65535,ie=new WeakMap;async function Oe({device:r,renderedTexture:e,groundTruthTexture:i,maskTexture:t,width:u,height:a,renderedOrigin:s,groundTruthOrigin:o,maskOrigin:l}){return le(await ce({device:r,renderedTexture:e,groundTruthTexture:i,maskTexture:t,width:u,height:a,renderedOrigin:s,groundTruthOrigin:o,maskOrigin:l}))}async function ce({device:r,renderedTexture:e,groundTruthTexture:i,maskTexture:t,width:u,height:a,renderedOrigin:s={x:0,y:0},groundTruthOrigin:o={x:0,y:0},maskOrigin:l=o}){const d=K(u,"width"),p=K(a,"height"),m=d*p;if(!Number.isSafeInteger(m))throw new Error("Invalid WebGPU PSNR texture size: pixel count exceeds safe integer range");const n=Ye(r),h=H(),c=Math.ceil(m/w),g=ne(r,c),x=c*U;let f=null,T=null,S=null,b=X,B=X,C=X;const _=[];try{f=r.createBuffer({size:x,usage:te|re}),b=P("buffers"),T=r.createBuffer({size:x,usage:te|re}),B=P("buffers"),S=r.createBuffer({size:U,usage:Be|se}),C=P("buffers");const y=r.createCommandEncoder(),v=ue(r,new Uint32Array([d,p,G(s.x,"renderedOrigin.x"),G(s.y,"renderedOrigin.y"),G(o.x,"groundTruthOrigin.x"),G(o.y,"groundTruthOrigin.y"),G(l.x,"maskOrigin.x"),G(l.y,"maskOrigin.y"),t?1:0,g.x,c,0]));_.push(v);const ge=r.createBindGroup({layout:n.compare.getBindGroupLayout(0),entries:[{binding:0,resource:e.createView()},{binding:1,resource:i.createView()},{binding:2,resource:(t??i).createView()},{binding:3,resource:{buffer:f}},{binding:4,resource:{buffer:v.buffer}}]}),W=y.beginComputePass();W.setPipeline(n.compare),W.setBindGroup(0,ge),W.dispatchWorkgroups(g.x,g.y),W.end();let k=f,F=T,N=c;for(;N>1;){const q=Math.ceil(N/w),D=ne(r,q),j=ue(r,new Uint32Array([N,D.x,q,0]));_.push(j);const fe=r.createBindGroup({layout:n.reduce.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:k}},{binding:1,resource:{buffer:F}},{binding:2,resource:{buffer:j.buffer}}]}),A=y.beginComputePass();A.setPipeline(n.reduce),A.setBindGroup(0,fe),A.dispatchWorkgroups(D.x,D.y),A.end(),N=q;const xe=F;F=k,k=xe}y.copyBufferToBuffer(k,0,S,0,U),r.queue.submit([y.finish()]);const he=H();await S.mapAsync(ke);const pe=J(he),R=new Uint32Array(S.getMappedRange().slice(0,U));return S.unmap(),oe({name:"psnr-reduction",durationMs:J(h),readbackBytes:U,readbackDurationMs:pe,details:{width:d,height:p,pixelCount:m,masked:!!t,compareWorkgroups:c,compareDispatchX:g.x,compareDispatchY:g.y}}),{sumSquaredError:$(R[0],R[1],"squared error"),validPixelCount:$(R[2],R[3],"valid pixel count"),ssimScaledSum:$(R[4],R[5],"SSIM scaled sum"),ssimWindowCount:$(R[6],R[7],"SSIM window count")}}finally{f?.destroy(),b(),T?.destroy(),B(),S?.destroy(),C();for(const{buffer:y,releaseCounter:v}of _)y.destroy(),v()}}function le({sumSquaredError:r,validPixelCount:e,ssimScaledSum:i,ssimWindowCount:t}){const u=M(r,"sumSquaredError"),a=M(e,"validPixelCount"),s=De({ssimScaledSum:i,ssimWindowCount:t});if(a===0)return Y(V({sumSquaredError:u,psnr:NaN,mse:NaN,validPixelCount:0},{ssimScaledSum:i,ssimWindowCount:t}),s);const o=u/(a*3);return Y(o===0?V({sumSquaredError:u,psnr:1/0,mse:o,validPixelCount:a},{ssimScaledSum:i,ssimWindowCount:t}):V({sumSquaredError:u,psnr:10*Math.log10(65025/o),mse:o,validPixelCount:a},{ssimScaledSum:i,ssimWindowCount:t}),s)}function Fe(r){let e=0,i=0,t=0,u=0,a=!0,s=!1;for(const l of r){if(s=!0,e+=M(l.sumSquaredError,"sumSquaredError"),i+=M(l.validPixelCount,"validPixelCount"),qe(l)?(t+=M(l.ssimScaledSum,"ssimScaledSum"),u+=M(l.ssimWindowCount,"ssimWindowCount")):a=!1,!Number.isSafeInteger(e))throw new Error("Invalid WebGPU PSNR sumSquaredError: accumulated value exceeds JavaScript safe integer range");if(!Number.isSafeInteger(i))throw new Error("Invalid WebGPU PSNR validPixelCount: accumulated value exceeds JavaScript safe integer range");if(!Number.isSafeInteger(t))throw new Error("Invalid WebGPU PSNR ssimScaledSum: accumulated value exceeds JavaScript safe integer range");if(!Number.isSafeInteger(u))throw new Error("Invalid WebGPU PSNR ssimWindowCount: accumulated value exceeds JavaScript safe integer range")}const o={sumSquaredError:e,validPixelCount:i};return s&&a&&(o.ssimScaledSum=t,o.ssimWindowCount=u),o}function qe(r){return r.ssimScaledSum!==void 0&&r.ssimWindowCount!==void 0}function De({ssimScaledSum:r,ssimWindowCount:e}){if(!(r===void 0||e===void 0||e<=0))return Math.max(-1,Math.min(1,r/(e*de)-1))}function Y(r,e){return e===void 0?r:{...r,ssim:e}}function V(r,e){return e.ssimScaledSum===void 0||e.ssimWindowCount===void 0?r:{...r,ssimScaledSum:e.ssimScaledSum,ssimWindowCount:e.ssimWindowCount}}function ue(r,e){const i=r.createBuffer({size:Math.max(16,e.byteLength),usage:We|se}),t=P("buffers");try{const u=new Uint8Array(e.byteLength);return u.set(new Uint8Array(e.buffer,e.byteOffset,e.byteLength)),r.queue.writeBuffer(i,0,u),{buffer:i,releaseCounter:t}}catch(u){throw i.destroy(),t(),u}}function ne(r,e){const i=K(e,"workgroup count"),t=Xe(r),u=Math.min(i,t),a=Math.ceil(i/u);if(a>t)throw new Error(`Invalid WebGPU PSNR dispatch: ${i} workgroups exceeds ${t}x${t} grid`);return{x:u,y:a}}function Xe(r){const e=r.limits?.maxComputeWorkgroupsPerDimension;return typeof e=="number"&&Number.isInteger(e)&&e>0?e:$e}function Ye(r){const e=ie.get(r);if(e)return e;const i=r.createShaderModule({code:Ve()}),t=r.createShaderModule({code:ze()}),u={compare:r.createComputePipeline({layout:"auto",compute:{module:i,entryPoint:"main"}}),reduce:r.createComputePipeline({layout:"auto",compute:{module:t,entryPoint:"main"}})};return ie.set(r,u),u}function Ve(){return`
struct CompareParams {
  width: u32,
  height: u32,
  renderedOriginX: u32,
  renderedOriginY: u32,
  groundTruthOriginX: u32,
  groundTruthOriginY: u32,
  maskOriginX: u32,
  maskOriginY: u32,
  hasMask: u32,
  dispatchX: u32,
  workgroupCount: u32,
}

@group(0) @binding(0) var renderedTexture: texture_2d<f32>;
@group(0) @binding(1) var groundTruthTexture: texture_2d<f32>;
@group(0) @binding(2) var maskTexture: texture_2d<f32>;
struct MetricPartial {
  sumSquaredError: vec2<u32>,
  validPixelCount: vec2<u32>,
  ssimScaledSum: vec2<u32>,
  ssimWindowCount: vec2<u32>,
}

@group(0) @binding(3) var<storage, read_write> partials: array<MetricPartial>;
@group(0) @binding(4) var<uniform> params: CompareParams;

var<workgroup> partialSums: array<MetricPartial, ${w}>;

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

fn isMaskValueValid(maskValue: vec4<f32>) -> bool {
  let maskBrightness = max(maskValue.r, max(maskValue.g, maskValue.b));
  return maskValue.a > 0.0 && maskBrightness > 0.5;
}

fn isSampleValid(x: u32, y: u32, groundTruthValue: vec4<f32>) -> bool {
  if (groundTruthValue.a <= 0.0) {
    return false;
  }
  if (params.hasMask == 0u) {
    return true;
  }
  let maskValue = textureLoad(
    maskTexture,
    vec2<i32>(
      i32(x + params.maskOriginX),
      i32(y + params.maskOriginY)
    ),
    0
  );
  return isMaskValueValid(maskValue);
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
          if (isSampleValid(u32(sampleX), u32(sampleY), sampleGroundTruth)) {
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

@compute @workgroup_size(${w})
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let workgroupIndex = workgroupId.y * params.dispatchX + workgroupId.x;
  let pixelIndex = workgroupIndex * ${w}u + localId.x;
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

    if (isSampleValid(x, y, groundTruth)) {
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
      let shiftedScaledSsim = u32(round((windowSsim + 1.0) * ${de}.0));
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

  var stride = ${w/2}u;
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
`}function ze(){return`
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

var<workgroup> partialSums: array<MetricPartial, ${w}>;

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

@compute @workgroup_size(${w})
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let workgroupIndex = workgroupId.y * params.dispatchX + workgroupId.x;
  let index = workgroupIndex * ${w}u + localId.x;
  let localIndex = localId.x;
  var partial = emptyPartial();

  if (index < params.inputCount) {
    partial = inputPartials[index];
  }

  partialSums[localIndex] = partial;
  workgroupBarrier();

  var stride = ${w/2}u;
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
`}function $(r,e,i){const t=e*Ne+r;if(!Number.isSafeInteger(t))throw new Error(`Invalid WebGPU PSNR ${i}: reduced value exceeds JavaScript safe integer range`);return t}function M(r,e){if(!Number.isSafeInteger(r)||r<0)throw new Error(`Invalid WebGPU PSNR ${e}: expected a non-negative safe integer`);return r}function K(r,e){if(!Number.isInteger(r)||r<=0)throw new Error(`Invalid WebGPU PSNR texture ${e}: expected a positive integer`);return r}function G(r,e){if(!Number.isInteger(r)||r<0)throw new Error(`Invalid WebGPU PSNR texture ${e}: expected a non-negative integer`);return r}const Le=1,He=4,Je=16,me="rgba8unorm",Ke=Le|He|Je,je=(r,e)=>globalThis.createImageBitmap(r,e);function ae(r){r.dispose?.()}async function xr({device:r,splatFile:e,loadedCloud:i,sharedScene:t,deps:u={}}){const a=u.loadGaussianCloudFromFile??Te,s=u.createSceneResourceManager??(()=>new be),o=u.createRenderSession??we,l=i??await a(e),d=t?.resourceManager??s(),p=!t,m=d.acquire(r,{sceneId:t?.sceneId??er(e,l),cloud:l.cloud,labelPrefix:`psnr ${e.name}`});try{const n=o({device:r,scene:m,format:me,width:1,height:1,backgroundColor:z(),sortAlgorithm:"radix"});return new Qe({device:r,renderSession:n,disposeResourceManager:p?()=>ae(d):void 0,deps:u})}catch(n){throw m.release(),p&&ae(d),n}}class Qe{device;renderSession;disposeResourceManager;createBitmap;createGroundTruthTexture;computePsnrFromTextures;computePsnrTextureReductionFromTextures;createMetricFrame;activeResourceScopes=new Set;releasePsnrSessionCounter=P("psnrSessions");renderQueue=Promise.resolve();disposed=!1;constructor({device:e,renderSession:i,disposeResourceManager:t,deps:u}){this.device=e,this.renderSession=i,this.disposeResourceManager=t,this.createBitmap=u.createBitmap??je,this.createGroundTruthTexture=u.createGroundTruthTexture??Ge,this.computePsnrFromTextures=u.computePsnrFromTextures??Oe,this.computePsnrTextureReductionFromTextures=u.computePsnrTextureReductionFromTextures??ce,this.createMetricFrame=u.createMetricFrame??Se}async computeImageMetric({imageFile:e,maskFile:i,image:t,camera:u,width:a,height:s,transform:o,modelTransform:l}){const d=await this.submitImageMetric({imageFile:e,maskFile:i,image:t,camera:u,width:a,height:s,transform:o,modelTransform:l});try{return await d.result}finally{d.dispose()}}async submitImageMetric({imageFile:e,maskFile:i,image:t,camera:u,width:a,height:s,transform:o,modelTransform:l}){this.assertNotDisposed();const d=E(a,"width"),p=E(s,"height");rr(u),tr({camera:u,width:d,height:p,imageName:t.name});const m=this.createResourceScope(),n=P("activePsnrImageJobs"),h=H();try{const c=await this.createBitmap(e,{colorSpaceConversion:"none",premultiplyAlpha:"none"});m.setBitmap(c),this.assertNotDisposed();const g=E(c.width,"source width"),x=E(c.height,"source height");ir({camera:u,sourceWidth:g,sourceHeight:x,imageName:t.name});let f=null;i&&(f=await this.createBitmap(i,{colorSpaceConversion:"none",premultiplyAlpha:"none"}),m.setMaskBitmap(f),this.assertNotDisposed(),ur({camera:u,sourceWidth:E(f.width,"mask source width"),sourceHeight:E(f.height,"mask source height"),imageName:t.name}));const T=ar(this.device);if(or(T,d,p,g,x))return this.submitSingleImageMetric({resources:m,bitmap:c,maskBitmap:f,releaseActiveJobCounter:n,telemetryStart:h,image:t,camera:u,width:d,height:p,transform:o,modelTransform:l});sr({maxTextureDimension2D:T,sourceWidth:g,sourceHeight:x,targetWidth:d,targetHeight:p});const S=await this.computeTiledImageMetric({resources:m,bitmap:c,maskBitmap:f,image:t,camera:u,width:d,height:p,transform:o,modelTransform:l,maxTextureDimension2D:T});return this.recordImageTelemetry({telemetryStart:h,image:t,width:d,height:p,tiled:!0,result:S}),m.releaseAll(),this.activeResourceScopes.delete(m),n(),{result:Promise.resolve(S),dispose:()=>{}}}catch(c){throw m.releaseAll(),this.activeResourceScopes.delete(m),n(),c}}dispose(){if(!this.disposed){this.disposed=!0;for(const e of this.activeResourceScopes)e.releaseAll();this.activeResourceScopes.clear(),this.renderSession.dispose(),this.disposeResourceManager?.(),this.releasePsnrSessionCounter()}}submitSingleImageMetric({resources:e,bitmap:i,maskBitmap:t,releaseActiveJobCounter:u,telemetryStart:a,image:s,camera:o,width:l,height:d,transform:p,modelTransform:m}){let n=null,h=null,c=null,g=null,x=!1,f=!1;try{h=this.createGroundTruthTexture({device:this.device,source:i,targetWidth:l,targetHeight:d}),e.trackGroundTruthTexture(h),t&&(c=this.createGroundTruthTexture({device:this.device,source:t,targetWidth:l,targetHeight:d}),e.trackGroundTruthTexture(c)),n=this.createRenderedTexture(l,d,s.name),e.trackRenderedTexture(n);const T=this.createMetricFrame({image:s,camera:o,width:l,height:d,transform:p,modelTransform:m}),S=this.renderMetricFrameToTexture({frame:T,target:n.texture,backgroundColor:z()}),b=n,B=h,C=c;this.assertNotDisposed();const _=async()=>{if(await S,this.assertNotDisposed(),x)throw new Error("WebGPU splat PSNR image metric has been disposed");const v=await this.computePsnrFromTextures({device:this.device,renderedTexture:b.texture,groundTruthTexture:B.texture,...C?{maskTexture:C.texture}:{},width:l,height:d});if(this.assertNotDisposed(),x)throw new Error("WebGPU splat PSNR image metric has been disposed");return this.recordImageTelemetry({telemetryStart:a,image:s,width:l,height:d,tiled:!1,result:v}),v},y=()=>{f||(f=!0,n&&e.destroyRenderedTexture(n),h&&e.disposeGroundTruthTexture(h),c&&e.disposeGroundTruthTexture(c),e.releaseAll(),this.activeResourceScopes.delete(e),u())};return g=_().finally(y),{result:g,dispose(){x=!0,y()}}}finally{g||(n&&e.destroyRenderedTexture(n),h&&e.disposeGroundTruthTexture(h),c&&e.disposeGroundTruthTexture(c))}}async computeTiledImageMetric({resources:e,bitmap:i,maskBitmap:t,image:u,camera:a,width:s,height:o,transform:l,modelTransform:d,maxTextureDimension2D:p}){const m=[];for(const n of dr(s,o,p)){this.assertNotDisposed();let h=null,c=null,g=null;try{c=this.createGroundTruthTexture({device:this.device,source:i,sourceOrigin:{x:n.originX,y:n.originY},sourceWidth:n.width,sourceHeight:n.height,targetWidth:n.width,targetHeight:n.height}),e.trackGroundTruthTexture(c),t&&(g=this.createGroundTruthTexture({device:this.device,source:t,sourceOrigin:{x:n.originX,y:n.originY},sourceWidth:n.width,sourceHeight:n.height,targetWidth:n.width,targetHeight:n.height}),e.trackGroundTruthTexture(g)),h=this.createRenderedTexture(n.width,n.height,u.name,n),e.trackRenderedTexture(h);const x=this.createMetricFrame({image:u,camera:a,width:n.width,height:n.height,transform:l,modelTransform:d,tile:{fullWidth:s,fullHeight:o,originX:n.originX,originY:n.originY}});await this.renderMetricFrameToTexture({frame:x,target:h.texture,backgroundColor:z()}),this.assertNotDisposed(),m.push(await this.computePsnrTextureReductionFromTextures({device:this.device,renderedTexture:h.texture,groundTruthTexture:c.texture,...g?{maskTexture:g.texture}:{},width:n.width,height:n.height})),this.assertNotDisposed()}finally{h&&e.destroyRenderedTexture(h),c&&e.disposeGroundTruthTexture(c),g&&e.disposeGroundTruthTexture(g)}}return le(Fe(m))}renderMetricFrameToTexture({frame:e,target:i,backgroundColor:t}){return this.enqueueRender(async()=>{this.renderSession.setCamera(e),this.renderSession.setBackgroundColor(t),this.assertNotDisposed(),await this.renderSession.renderToTexture(i,{completion:"completed"}),this.assertNotDisposed()})}enqueueRender(e){const i=this.renderQueue.then(e,e);return this.renderQueue=i.then(()=>{},()=>{}),i}createResourceScope(){const e=new Ze;return this.activeResourceScopes.add(e),e}recordImageTelemetry({telemetryStart:e,image:i,width:t,height:u,tiled:a,result:s}){const o=J(e);oe({name:"psnr-image",durationMs:o,imagesPerSecond:o>0?1e3/o:0,details:{imageName:i.name,width:t,height:u,tiled:a,validPixelCount:s.validPixelCount}})}createRenderedTexture(e,i,t,u){return{texture:this.device.createTexture({label:u?`webgpu splat psnr rendered ${t} tile ${u.originX},${u.originY}`:`webgpu splat psnr rendered ${t}`,size:{width:e,height:i},format:me,usage:Ke}),releaseCounter:P("textures")}}assertNotDisposed(){if(this.disposed)throw new Error("WebGPU splat PSNR session has been disposed")}}class Ze{bitmap=null;maskBitmap=null;renderedTextures=new Set;groundTruthTextures=new Set;released=!1;setBitmap(e){if(this.released){e.close();return}this.bitmap=e}setMaskBitmap(e){if(this.released){e.close();return}this.maskBitmap=e}trackRenderedTexture(e){if(this.released){e.texture.destroy(),e.releaseCounter();return}this.renderedTextures.add(e)}destroyRenderedTexture(e){this.renderedTextures.delete(e)&&(e.texture.destroy(),e.releaseCounter())}trackGroundTruthTexture(e){if(this.released){e.dispose();return}this.groundTruthTextures.add(e)}disposeGroundTruthTexture(e){this.groundTruthTextures.delete(e)&&e.dispose()}releaseAll(){if(!this.released){this.released=!0,this.bitmap?.close(),this.bitmap=null,this.maskBitmap?.close(),this.maskBitmap=null;for(const e of this.renderedTextures)e.texture.destroy(),e.releaseCounter();this.renderedTextures.clear();for(const e of this.groundTruthTextures)e.dispose();this.groundTruthTextures.clear()}}}function er(r,e){return["psnr",e.format,r.name,r.size,r.lastModified,e.byteLength].join(":")}function rr(r){if(!(r.modelId===L.SIMPLE_PINHOLE||r.modelId===L.PINHOLE))throw new Error(`WebGPU PSNR currently requires an undistorted pinhole ground-truth image for camera model ${nr(r.modelId)}`)}function tr({camera:r,width:e,height:i,imageName:t}){if(!(e===r.width&&i===r.height))throw new Error(`WebGPU PSNR requires full-resolution metric rendering for ${t}: requested ${e}x${i}, camera is ${r.width}x${r.height}`)}function ir({camera:r,sourceWidth:e,sourceHeight:i,imageName:t}){if(!(e===r.width&&i===r.height))throw new Error(`WebGPU PSNR requires an undistorted metric image matching the PINHOLE camera for ${t}: decoded ${e}x${i}, camera is ${r.width}x${r.height}. Load the image set that belongs to the sparse model.`)}function ur({camera:r,sourceWidth:e,sourceHeight:i,imageName:t}){if(!(e===r.width&&i===r.height))throw new Error(`WebGPU PSNR requires a mask matching the PINHOLE camera for ${t}: decoded ${e}x${i}, camera is ${r.width}x${r.height}.`)}function nr(r){for(const[e,i]of Object.entries(L))if(i===r)return e;return String(r)}function ar(r){const e=r.limits?.maxTextureDimension2D;return typeof e=="number"&&Number.isInteger(e)&&e>0?e:Number.MAX_SAFE_INTEGER}function or(r,e,i,t,u){return e<=r&&i<=r&&t<=r&&u<=r}function sr({maxTextureDimension2D:r,sourceWidth:e,sourceHeight:i,targetWidth:t,targetHeight:u}){if(e!==t||i!==u)throw new Error(`WebGPU PSNR texture-limit tiling currently requires decoded source size ${e}x${i} to match target size ${t}x${u}`);if(!Number.isInteger(r)||r<=0)throw new Error("WebGPU PSNR texture-limit tiling requires a positive maxTextureDimension2D")}function dr(r,e,i){const t=[],u=E(i,"tile size");for(let a=0;a<e;a+=u)for(let s=0;s<r;s+=u)t.push({originX:s,originY:a,width:Math.min(u,r-s),height:Math.min(u,e-a)});return t}function E(r,e){if(!Number.isInteger(r)||r<=0)throw new Error(`Invalid WebGPU splat PSNR ${e}: expected a positive integer`);return r}export{xr as createWebGpuSplatPsnrSession};
