import { describe, expect, it } from 'vitest';
import { CameraDatasetManifestSchema } from './cameraDatasetManifest';

const base={format:'colmapview-camera-dataset',metadataUrl:'https://data.test/mic/transforms_train.json'};
const media={...base,version:2,splats:['https://data.test/trained/mic.ply'],viewerStatePath:'mic.state.json'};

describe('explicit Gaussian camera datasets',()=>{
  it('retains the strict version 1 contract and rejects silent attachment on older manifests',()=>{
    expect(CameraDatasetManifestSchema.safeParse({...base,version:1}).success).toBe(true);
    expect(CameraDatasetManifestSchema.safeParse({...media,version:1}).success).toBe(false);
  });
  it('keeps Gaussian sources separate from a companion XYZ cloud',()=>{
    const parsed=CameraDatasetManifestSchema.parse({...media,pointCloud:{url:'https://data.test/mic/points.ply'}});
    expect(parsed.version).toBe(2); expect(parsed.pointCloud?.format).toBe('ply');
    expect(CameraDatasetManifestSchema.safeParse({...media,splats:[]}).success).toBe(false);
    expect(CameraDatasetManifestSchema.safeParse({...media,splats:[...media.splats,...media.splats]}).success).toBe(false);
  });
  it('rejects credential-bearing Gaussian URLs and unsafe sidecar paths',()=>{
    for(const url of ['https://user:secret@data.test/a.ply','https://data.test/a.ply#other','file:///a.ply']) {
      expect(CameraDatasetManifestSchema.safeParse({...media,splats:[url]}).success).toBe(false);
    }
    for(const viewerStatePath of ['../state.json','/state.json','https://other.test/state.json','folder\\state.json']) {
      expect(CameraDatasetManifestSchema.safeParse({...media,viewerStatePath}).success).toBe(false);
    }
  });
});
