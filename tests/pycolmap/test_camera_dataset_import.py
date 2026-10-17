"""Always-running original-schema -> production TypeScript -> PyCOLMAP checks."""
import subprocess
from pathlib import Path
import numpy as np
import pycolmap
import pytest

REPO = Path(__file__).resolve().parents[2]
FIXTURES = REPO / '.tmp' / 'camera-dataset-pycolmap'
SCHEMAS = ['nerf-blender','nerfstudio','instant-ngp','fisheye','opensfm','openmvg','bundler','gaussian-splatting','llff','dtu']

@pytest.fixture(scope='module', autouse=True)
def generate():
    subprocess.run('npx vite-node tests/pycolmap/generate_camera_dataset_fixtures.ts',cwd=REPO,shell=True,check=True)

def project(schema, ray):
    x, y = ray[:2] / ray[2]
    r2 = x*x+y*y
    if schema == 'nerf-blender': return np.array([16*x+16,16*y+12])
    if schema == 'llff': return np.array([20*x+16,20*y+12])
    if schema == 'gaussian-splatting': return np.array([20*x+16,22*y+12])
    if schema == 'dtu': return np.array([20*x,22*y+11])
    if schema == 'fisheye':
        radius=np.sqrt(r2);theta=np.arctan(radius)
        distorted=theta*(1+.1*theta**2-.02*theta**4+.003*theta**6-.0004*theta**8)
        scale=distorted/radius if radius else 1
        return np.array([20*x*scale,22*y*scale+11])
    radial=1+.1*r2-.02*r2*r2+(.003*r2**3 if schema=='openmvg' else 0)
    if schema in ['nerfstudio','instant-ngp']:
        xd=x*radial+2*.003*x*y-.004*(r2+2*x*x)
        yd=y*radial+.003*(r2+2*y*y)+2*(-.004)*x*y
        return np.array([20*xd,22*yd+11])
    focal=24 if schema=='opensfm' else 20
    return np.array([focal*x*radial+(0 if schema=='openmvg' else 16),focal*y*radial+(11 if schema=='openmvg' else 12)])

@pytest.mark.parametrize('schema',SCHEMAS)
@pytest.mark.parametrize('format',['binary','text'])
def test_camera_geometry_and_projection(schema,format):
    model=pycolmap.Reconstruction(str(FIXTURES/schema/format))
    assert model.num_images()==1 and model.num_cameras()==1 and model.num_points3D()==0
    image=model.images[1];camera=model.cameras[1]
    assert image.name=='a.png' and len(image.points2D)==0
    assert (camera.width,camera.height)==(32,24)
    r=np.array([[0,-1,0],[1,0,0],[0,0,1]],dtype=float); c=np.array([1,2,3],dtype=float);t=c.copy();s=np.diag([1,-1,-1])
    if schema in ['nerf-blender','nerfstudio','instant-ngp','fisheye']: expected_r=s@r.T;expected_t=-expected_r@c
    elif schema=='openmvg':expected_r=r;expected_t=-r@c
    elif schema in ['gaussian-splatting','llff']:expected_r=r.T;expected_t=-expected_r@c
    elif schema=='dtu':expected_r=r;expected_t=(r@np.array([4,5,6])+t)/2
    elif schema=='bundler':expected_r=s@r;expected_t=s@t
    else:expected_r=r;expected_t=t
    pose=image.cam_from_world()
    np.testing.assert_allclose(pose.rotation.matrix(),expected_r,atol=1e-12)
    np.testing.assert_allclose(pose.translation,expected_t,atol=1e-12)
    for ray in [np.array([.2,-.3,2]),np.array([-.7,.4,3]),np.array([0.,0.,1])]:
        world=expected_r.T@(ray-expected_t)
        np.testing.assert_allclose(camera.img_from_cam(pose*world),project(schema,ray),atol=1e-9)
