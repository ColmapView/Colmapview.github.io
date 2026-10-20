import { writeCamerasBinary,writeImagesBinary,writePoints3DBinary } from '../../parsers/colmapBinaryWriters';
import { readImageDimensions, readImageOrientation } from '../../utils/imageDimensions';
import { MAX_VIEWER_STATE_BYTES } from '../../utils/publishedViewerState';
import { findColmapCameraImageFiles } from '../../utils/fileClassification';
import { normalizeNerfTransforms,isNerfTransforms,nerfTransformsSchema, type ResolveCameraFrame } from './nerfTransforms';
import { normalizeOpenSfm,normalizeOpenMvg,normalizeBundler,isOpenSfm,isOpenMvg,bundlerImageList } from './sfmFormats';
import { isGaussianCameraJson, normalizeGaussianCameraJson } from './gaussianCameraJson';
import { readNumpyCameraArray, readDtuCameraArchive, type NumpyCameraArray } from './numpyCameraArrays';
import { normalizeLlff, normalizeDtu, dtuCameraCount } from './arrayCameraFormats';
import { orderedCameraImages } from './orderedCameraImages';
import { indexDtuMasks } from './dtuMaskPaths';
import { findNerfstudioImageVariant, nerfstudioVariantPath } from './nerfstudioImageVariants';
import { readCameraSourceFile } from './sourceAccess';
import { readCompanionPointCloud } from './companionPointCloud';
import { fetchDatasetResource } from '../../utils/fetchDatasetResource';
import { CAMERA_IMAGE_EXTENSIONS,canonicalImageName,isCameraMetadataPath,isCameraImagePath,isAbsoluteResourceUrl,
  normalizeSourcePath,normalizeSourceIndex,parentPath,resolveIndexedImage,indexExtensionlessImages,resolveSourcePath,imageResourceUrl,
  commonSourceRoot,cameraSourceSceneScope,cameraMetadataSceneRoot } from './sourcePaths';
import { requestCameraDatasetSelection,type SelectCameraDataset,type CameraDatasetCandidate } from './selection';
import { importError,MAX_CAMERA_METADATA_BYTES,MAX_CAMERA_METADATA_CANDIDATES,
  type CameraDatasetSource,type CameraDatasetImportContext,type PreparedCameraDataset,type NormalizedCameraDataset,
  type ImportedImageBinding } from './types';

const contexts=new WeakMap<Map<string,File>,CameraDatasetImportContext>();
export const getPreparedCameraContext = (files: Map<string,File>) => contexts.get(files);
export const rememberPreparedCameraContext = (files: Map<string,File>,context: CameraDatasetImportContext) => contexts.set(files,context);

export interface PrepareCameraDatasetOptions {
  metadataPath?: string;
  metadataFile?: File;
  signal?: AbortSignal;
  select?: SelectCameraDataset;
}

function defaultCandidate(paths: readonly string[]): string|undefined {
  return paths.find(path => /(?:^|\/)transforms\.json$/i.test(path))
    ?? paths.find(path => /(?:^|\/)transforms_train\.json$/i.test(path))
    ?? paths.find(path => !/transforms_(?:test|val|validation)\.json$/i.test(path)) ?? paths[0];
}

function sourcePaths(source: CameraDatasetSource): ReadonlySet<string>|undefined {
  return source.kind==='local' ? new Set(source.files.keys()) : source.kind==='archive' ? new Set(source.entries.keys()) : undefined;
}

export async function prepareCameraDataset(source: CameraDatasetSource,options: PrepareCameraDatasetOptions={}): Promise<PreparedCameraDataset|null> {
  const {signal}=options;
  signal?.throwIfAborted();
  const paths=sourcePaths(source);
  const urlFilePaths=source.kind==='url' && source.filePaths ? new Set(source.filePaths.map(path=>{
    const url=new URL(imageResourceUrl(source.baseUrl,path));return url.origin+url.pathname;
  })) : undefined;
  const imageStems=paths ? indexExtensionlessImages(paths) : undefined;
  const available=options.metadataPath ? [options.metadataPath] : [...paths ?? []].filter(isCameraMetadataPath);
  if (!available.length) return null;
  if (available.length > MAX_CAMERA_METADATA_CANDIDATES) return importError('IMPORT_LIMIT_EXCEEDED','Too many camera metadata candidates. Select a smaller scene folder.');
  let metadataPath=options.metadataPath;
  let component: number|undefined;
  let automaticSelection=false;
  if (!metadataPath) {
    const roots=[...new Set(available.map(cameraMetadataSceneRoot))];
    if (roots.length > 1) {
      const choice=await (options.select ?? requestCameraDatasetSelection)(available.map(path => ({ path,sceneRoot:cameraMetadataSceneRoot(path),label:path })),signal);
      if (!choice) throw new DOMException('Scene selection cancelled.','AbortError');
      metadataPath=choice.path;
    } else {
      metadataPath=defaultCandidate(available)!;
      automaticSelection=true;
    }
  }
  let value: unknown;
  let text='';
  let bundler=false;
  let llff: NumpyCameraArray | undefined;
  let dtu: Map<string,NumpyCameraArray> | undefined;
  let suppliedMetadataFile=options.metadataFile;
  const remainingCandidates=new Set(available);
  for (;;) {
    signal?.throwIfAborted();
    remainingCandidates.delete(metadataPath);
    const file=suppliedMetadataFile ?? await readCameraSourceFile(source,metadataPath,signal,MAX_CAMERA_METADATA_BYTES);
    suppliedMetadataFile=undefined;
    if (!file) return importError('SOURCE_ACCESS_FAILED',`Camera metadata is missing: ${metadataPath}`);
    if (file.size > MAX_CAMERA_METADATA_BYTES) return importError('IMPORT_LIMIT_EXCEEDED','Camera metadata exceeds 16 MiB.');
    if (/poses_bounds\.npy$/i.test(metadataPath)) {
      llff=readNumpyCameraArray(new Uint8Array(await file.arrayBuffer()));
      if (llff.columns!==17) return importError('INVALID_METADATA','Expected an N by 17 LLFF camera array.');
      break;
    }
    if (/cameras(?:_sphere|_normalized)?\.npz$/i.test(metadataPath)) {
      dtu=await readDtuCameraArchive(new Uint8Array(await file.arrayBuffer()),signal);
      break;
    }
    text=(await file.text()).replace(/^\uFEFF/,'');
    bundler=/bundle\.out$/i.test(metadataPath);
    if (bundler) break;
    try { value=JSON.parse(text); } catch { return importError('INVALID_METADATA',`Invalid JSON in ${metadataPath}.`); }
    if (isNerfTransforms(value) || isOpenSfm(value) || isOpenMvg(value) || isGaussianCameraJson(value)) break;
    if (value && typeof value==='object' && 'frames' in value) return importError('INVALID_METADATA',`Unsupported camera frames in ${metadataPath}.`);
    if (!automaticSelection) return importError('INVALID_METADATA',`Unsupported camera metadata in ${metadataPath}.`);
    const next=defaultCandidate([...remainingCandidates]);
    if (!next) return null;
    metadataPath=next;
  }
  let root=parentPath(metadataPath);
  if (isOpenSfm(value) && Array.isArray(value) && value.length > 1) {
    const choices: CameraDatasetCandidate[]=value.map((_,index) => ({ path:metadataPath!,sceneRoot:root,label:`${metadataPath} — reconstruction ${index+1}`,component:index }));
    const choice=await (options.select ?? requestCameraDatasetSelection)(choices,signal);
    if (!choice) throw new DOMException('Reconstruction selection cancelled.','AbortError');
    component=choice.component;
  }
  let names: string[]=[];
  let bundlerImageBase: string | undefined;
  if (bundler) {
    // Bundler's common results/ directory places list.txt beside that directory.
    const candidates=[root ? root+'/list.txt' : 'list.txt',root ? root+'/images.txt' : 'images.txt'];
    if (/\/(?:results|results\.example)$|^(?:results|results\.example)$/.test(root)) {
      candidates.push(parentPath(root) ? parentPath(root)+'/list.txt' : 'list.txt');
    }
    let listPath=candidates.find(path => paths?.has(path));
    let remoteList: File | null = null;
    if (source.kind === 'url') {
      const remoteCandidates = candidates.map(path => imageResourceUrl(source.baseUrl, path));
      if (/\/(?:results|results\.example)\/$/.test(source.baseUrl)) remoteCandidates.push(new URL('../list.txt', source.baseUrl).href);
      for (const url of remoteCandidates) {
        remoteList = await readCameraSourceFile(source, url, signal, MAX_CAMERA_METADATA_BYTES);
        if (remoteList) { listPath = url; bundlerImageBase = new URL('.', url).href; break; }
      }
    }
    if (!listPath) return importError('INVALID_IMAGE_ORDER','Bundler requires list.txt (or images.txt) in camera order.');
    const list=remoteList ?? await readCameraSourceFile(source,listPath,signal,MAX_CAMERA_METADATA_BYTES);
    if (!list) return importError('INVALID_IMAGE_ORDER','Could not read the ordered image list.');
    names=bundlerImageList(await list.text());
    root=source.kind === 'url' ? '' : parentPath(listPath);
  }
  if (llff || dtu) names=await orderedCameraImages(source,metadataPath,llff?.rows ?? dtuCameraCount(dtu!),llff ? 'images' : 'image',signal);
  const nerf=isNerfTransforms(value);
  const gaussian=isGaussianCameraJson(value);
  const defaultImageRoot=gaussian || isOpenSfm(value) || isOpenMvg(value);
  const global=nerf ? value as Record<string,unknown> : {};
  const nerfSchema = nerf ? nerfTransformsSchema(global) : undefined;
  const uniformBlenderDimensions = nerfSchema === 'nerf-blender';
  const mvgRoot = isOpenMvg(value) ? (value as Record<string,unknown>).root_path : undefined;
  const hasPortableMvgRoot = typeof mvgRoot === 'string' && !mvgRoot.startsWith('/') && !mvgRoot.startsWith('\\') && !/^[a-z]:/i.test(mvgRoot);
  const portableMvgRoot = hasPortableMvgRoot ? mvgRoot : 'images';
  const scope=paths ? cameraSourceSceneScope(root,paths) : root;
  let nameRoot=root;
  const sourceReference=(reference: unknown) => resolveSourcePath(root,reference,scope,source.kind==='url',source.kind==='url' ? source.baseUrl : undefined);
  let uniformSize: {width:number;height:number}|undefined;
  const downscaleSizes = new Map<string, { width: number; height: number }>();
  const listedImage = (path: string) => {
    if (paths) return paths.has(path);
    if (!urlFilePaths || source.kind !== 'url') return false;
    const url = new URL(imageResourceUrl(source.baseUrl, path));
    return urlFilePaths.has(url.origin + url.pathname);
  };
  const resolve: ResolveCameraFrame=async (reference,frame) => {
    signal?.throwIfAborted();
    if (frame.mask_path !== undefined && frame.mask_file_path !== undefined && frame.mask_path !== frame.mask_file_path) importError('INVALID_IMAGE_PATH','Conflicting mask_path and mask_file_path.');
    const maskPath = frame.mask_path === undefined ? frame.mask_file_path : frame.mask_path;
    if (maskPath !== undefined && (typeof maskPath !== 'string' || !maskPath.trim())) importError('INVALID_IMAGE_PATH','Explicit mask path must be a nonempty string.');
    let resolvedMask = maskPath === undefined ? undefined : sourceReference(maskPath);
    const imageReference=hasPortableMvgRoot && !isAbsoluteResourceUrl(reference) ? (portableMvgRoot ? portableMvgRoot+'/'+reference : reference) : reference;
    let path=sourceReference(imageReference);
    if (bundlerImageBase) path = imageResourceUrl(bundlerImageBase, path);
    if (source.kind==='url' && defaultImageRoot && !hasPortableMvgRoot && !isAbsoluteResourceUrl(path) && !reference.startsWith('images/')) {
      path=sourceReference(`${portableMvgRoot}/${reference}`);
    }
    // This published example's conventional ./images root is in its companion
    // repository. Other portable roots remain authoritative, including an empty root.
    if (source.kind==='url' && isOpenMvg(value) && !isAbsoluteResourceUrl(reference)
      && (!hasPortableMvgRoot || /^(?:\.\/)?images\/?$/.test(portableMvgRoot))
      && /^https:\/\/raw\.githubusercontent\.com\/openMVG\/openMVG\/[^/]+\/src\/software\/SfM\/python\/sfm_viewer\/sample_data\/$/.test(source.baseUrl)) {
      path=imageResourceUrl('https://raw.githubusercontent.com/openMVG/ImageDataset_SceauxCastle/master/images/',reference);
    }
    let downscaleFactor = 1;
    if (nerfSchema === 'nerfstudio') {
      const variant = findNerfstudioImageVariant(path, listedImage);
      if (variant) {
        path = variant.path;
        downscaleFactor = variant.factor;
        if (resolvedMask !== undefined) {
          const scaledMask = nerfstudioVariantPath(resolvedMask, downscaleFactor, 'masks');
          if (scaledMask && listedImage(scaledMask)) resolvedMask = scaledMask;
        }
      }
    }
    if (paths) {
      let matched=resolveIndexedImage(path,paths,imageStems);
      if (gaussian && !reference.startsWith('images/')) {
        const alternate=resolveIndexedImage(sourceReference('images/'+reference),paths,imageStems);
        if (matched && alternate && matched!==alternate) return importError('AMBIGUOUS_IMAGE_PATH',`3DGS photograph exists at both ${matched} and ${alternate}. Use an explicit images/ reference.`);
        matched ??= alternate;
      }
      // Unportable author-machine roots retain the established images/ relocation fallback.
      // A portable declared root is authoritative and must never bind a same-named sibling file.
      if (!matched && defaultImageRoot && !hasPortableMvgRoot) matched=resolveIndexedImage(sourceReference('images/'+reference),paths,imageStems);
      if (!matched) return null;
      path=matched;
    } else if (source.kind === 'url' && !isCameraImagePath(isAbsoluteResourceUrl(path) ? new URL(path).pathname : path)) {
      const matches=new Map<string,string>();
      const extensions=CAMERA_IMAGE_EXTENSIONS.flatMap(extension=>[extension,extension.toUpperCase()]);
      const resourceUrl=new URL(imageResourceUrl(source.baseUrl,path)),baseUrl=new URL(source.baseUrl);
      const listed=urlFilePaths && resourceUrl.origin===baseUrl.origin && resourceUrl.pathname.startsWith(baseUrl.pathname);
      for (let offset=0;offset<extensions.length;offset+=4) {
        signal?.throwIfAborted();
        const probes=await Promise.allSettled(extensions.slice(offset,offset+4).map(async extension=>{
          const resource=isAbsoluteResourceUrl(path) ? new URL(path) : null;
          if (resource) resource.pathname+=extension;
          const candidate = resource?.href ?? path+extension;
          if (listed) {
            const url=new URL(imageResourceUrl(source.baseUrl,candidate));
            return urlFilePaths!.has(url.origin+url.pathname) ? {candidate,identity:url.origin+url.pathname} : null;
          }
          const response = await fetchDatasetResource(imageResourceUrl(source.baseUrl,candidate),undefined,{signal,headers:{Range:'bytes=0-0'}});
          await response.body?.cancel().catch(() => {});
          if (response.ok) return {candidate,identity:response.url || candidate};
          if (response.status!==404 && response.status!==410) importError('SOURCE_ACCESS_FAILED',`HTTP ${response.status}: cannot resolve ${candidate}.`);
          return null;
        }));
        for (const probe of probes) {
          if (probe.status==='rejected') throw probe.reason;
          if (probe.value && !matches.has(probe.value.identity)) matches.set(probe.value.identity,probe.value.candidate);
        }
      }
      if (!matches.size) return null;
      if (matches.size>1) importError('AMBIGUOUS_IMAGE_PATH',`Multiple extensions match ${path}.`);
      path=matches.values().next().value!;
    }
    if (!isCameraImagePath(isAbsoluteResourceUrl(path) ? new URL(path).pathname : path)) return importError('INVALID_IMAGE_PATH',`Unsupported photograph: ${path}`);
    if (source.kind!=='url') {
      nameRoot=commonSourceRoot(nameRoot,parentPath(path));
      if (resolvedMask!==undefined) nameRoot=commonSourceRoot(nameRoot,parentPath(resolvedMask));
    }
    const name=canonicalImageName(path,scope,source.kind==='url' ? source.baseUrl : undefined);
    const width=frame.w ?? global.w, height=frame.h ?? global.h;
    let size: {width:number;height:number}|undefined;
    const downscaleKey = `${width}x${height}:${downscaleFactor}`;
    if (width===undefined || height===undefined || bundler || downscaleFactor > 1) {
      if (downscaleFactor > 1 && downscaleSizes.has(downscaleKey)) size = downscaleSizes.get(downscaleKey);
      else if (uniformBlenderDimensions && uniformSize) size=uniformSize;
      else {
        const rgb=await readCameraSourceFile(source,path,signal);
        if (!rgb) return null;
        size=await readImageDimensions(rgb,{ signal }) ?? undefined;
        if (!size) return importError('INVALID_CALIBRATION',`Cannot read image dimensions for ${path}.`);
        if (await readImageOrientation(rgb,signal) !== 1) return importError('UNSUPPORTED_IMAGE_ORIENTATION',`Normalize image orientation and calibration before importing ${path}.`);
        if (uniformBlenderDimensions) uniformSize=size;
        if (downscaleFactor > 1) downscaleSizes.set(downscaleKey, size);
      }
    }
    let mask: ImportedImageBinding['mask'];
    if (resolvedMask !== undefined) {
      mask={ kind:'file',path:resolvedMask,role:'validity',invert:false };
    } else if (paths) {
      const relative=root ? path.slice(root.length+1) : path;
      const industrial=/^train\/good\/(.+)\.[^.]+$/.exec(relative);
      if (industrial) {
        const candidate=resolveSourcePath(root,`train/masks/${industrial[1]}_mask.png`,root);
        if (paths.has(candidate)) mask={ kind:'file',path:candidate,role:'unknown',invert:false };
      }
    }
    if (!mask && /\.png$/i.test(isAbsoluteResourceUrl(path) ? new URL(path).pathname : path)) mask={ kind:'alpha',role:'foreground' };
    return { path,name,size,mask, ...(downscaleFactor > 1 ? { downscaleFactor } : {}) };
  };
  let normalized: NormalizedCameraDataset;
  if (llff) normalized=await normalizeLlff(llff,names,resolve,signal);
  else if (dtu) {
    const maskPaths=paths ?? (source.kind==='url' && source.filePaths ? new Set(source.filePaths) : undefined);
    normalized=await normalizeDtu(dtu,names,resolve,signal,maskPaths ? indexDtuMasks(maskPaths,root) : undefined);
  }
  else if (gaussian) normalized=await normalizeGaussianCameraJson(value,resolve,signal);
  else if (bundler) normalized=await normalizeBundler(text,names,resolve,signal);
  else if (isOpenSfm(value)) normalized=await normalizeOpenSfm(value,resolve,signal,component);
  else if (isOpenMvg(value)) normalized=await normalizeOpenMvg(value,resolve,signal);
  else normalized=await normalizeNerfTransforms(value,resolve,signal);
  if (source.kind!=='url' && nameRoot!==scope) {
    const bindings=new Map<string,ImportedImageBinding>(),seen=new Set<string>();
    for (const image of normalized.images.values()) {
      const binding=normalized.bindings.get(image.name)!;
      const name=canonicalImageName(binding.sourceImagePath,nameRoot);
      if (seen.has(name.toLowerCase())) return importError('AMBIGUOUS_IMAGE_PATH',`Duplicate/case-colliding image name: ${name}`);
      seen.add(name.toLowerCase());bindings.set(name,binding);image.name=name;
    }
    normalized.bindings=bindings;
  }
  root=nameRoot;
  signal?.throwIfAborted();
  const pointCloud = nerf ? await readCompanionPointCloud(source, metadataPath, global, normalized.diagnostics, signal) : undefined;
  const modelFiles=new Map<string,File>([
    ['sparse/0/cameras.bin',new File([writeCamerasBinary(normalized.cameras)],'cameras.bin')],
    ['sparse/0/images.bin',new File([writeImagesBinary(normalized.images)],'images.bin')],
    pointCloud ? ['sparse/0/points3D.ply', pointCloud.file]
      : ['sparse/0/points3D.bin',new File([writePoints3DBinary(new Map())],'points3D.bin')],
  ]);
  if (source.kind==='local') {
    for (const [name,binding] of normalized.bindings) {
      const rgb=source.files.get(binding.sourceImagePath);
      if (rgb) modelFiles.set('images/'+name,rgb);
      if (binding.mask?.kind==='file') {
        const mask=source.files.get(binding.mask.path);
        if (mask) modelFiles.set(`masks/${name}.png`,mask);
      }
    }
  }
  const context: CameraDatasetImportContext={ source,bindings:normalized.bindings,diagnostics:normalized.diagnostics,
    ...(pointCloud && { pointCloud: { sourcePath: pointCloud.sourcePath } }),
    metadataFrameCount:normalized.metadataFrameCount,savedWorldMetadata:normalized.savedWorldMetadata,
    selection:{ metadataPath,sceneRoot:root,schema:normalized.schema,split:/transforms_([^/.]+)\.json$/i.exec(metadataPath)?.[1] ?? null,component } };
  const settings=root ? root+'/colmapview.yaml' : 'colmapview.yaml';
  if (paths?.has(settings)) {
    try {
      const yaml=await readCameraSourceFile(source,settings,signal,MAX_VIEWER_STATE_BYTES);
      if (yaml) modelFiles.set('colmapview.yaml',yaml);
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof Error && error.name==='AbortError') throw error;
      normalized.diagnostics.push({code:'UNAVAILABLE_SETTINGS',severity:'warning',path:settings,message:'Skipped unavailable or oversized colmapview.yaml settings.'});
    }
  }
  contexts.set(modelFiles,context);
  return { files:modelFiles,context };
}

export async function prepareLocalCameraDataset(files: Map<string,File>,options: PrepareCameraDatasetOptions={}): Promise<PreparedCameraDataset|null> {
  if (contexts.has(files)) return { files,context:contexts.get(files)! };
  if (!options.metadataPath) {
    const native=findColmapCameraImageFiles(files);
    if (native.camerasFile && native.imagesFile) return null;
  }
  const source: CameraDatasetSource={ kind:'local',files:normalizeSourceIndex(files) };
  return prepareCameraDataset(source,{...options,metadataPath:options.metadataPath ? normalizeSourcePath(options.metadataPath) : undefined});
}
