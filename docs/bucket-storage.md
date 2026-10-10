# Bucket storage

Use the bucket icon on the loading panel or viewer toolbar to read datasets from AWS S3, Cloudflare R2, or MinIO, or upload the current COLMAP scene. Transfers go directly between your browser and the bucket.

## Public reads

Choose **Public URL** and paste a dataset folder, `manifest.json`, ZIP, TAR, or splat URL. Public objects need no access key or secret. A bucket can allow object reads while denying listing: use the object's URL or **Load object** in that case.

For browsing an anonymously readable S3 bucket, choose **S3 bucket**, enter its complete bucket URL, and leave credentials empty. Folder discovery uses the S3 API and requires listing permission. Without listing permission, conventional `sparse/0/` and `images/` paths still work through the URL loader.

## Private reads and uploads

Enter the complete **Bucket URL**, then expand **Credentials for private reads and uploads**:

| Service | Bucket URL | Region |
| --- | --- | --- |
| AWS S3 | `https://BUCKET.s3.REGION.amazonaws.com/` | Inferred from the URL |
| Cloudflare R2 | `https://ACCOUNT_ID.r2.cloudflarestorage.com/BUCKET/` | `auto` |
| MinIO | `https://HOST/BUCKET/` | `us-east-1`, or the server's configured region |
| Local MinIO | `http://localhost:9000/BUCKET/` | `us-east-1`, or the configured region |

Supply an S3 access key ID and secret access key. Temporary credentials can also include a session token. The connection stays only in memory in this tab; disconnect or close the tab to drop it. Credentials are excluded from settings, manifests, browser storage, and viewer links. Signed requests are restricted to the configured bucket root and cannot follow redirects.

Read access needs `GetObject`, plus `ListBucket` to browse/discover folders. Uploads also need `PutObject` and `AbortMultipartUpload`. ColmapView verifies the uploaded manifest by reading it back, so upload credentials need read access too. ColmapView does not create buckets or change bucket permissions.

**Upload dataset** saves the edited COLMAP model, original images and masks, all selected splat sources, and `colmapview.yaml`. Each upload uses a new UUID subfolder under your chosen destination, preserving previous uploads. The manifest is written after every asset succeeds and verified before showing a viewer link. Files of 32 MiB or more use multipart upload with native Blob slices; the browser does not assemble another archive or a whole-file JavaScript buffer.

Cancel stops the transfer and attempts to abort unfinished multipart uploads. Completed objects remain in the new folder, and an incomplete dataset has no published manifest. A new upload starts a new folder. Configure your bucket's lifecycle rule to remove incomplete multipart uploads if the tab closes or a cleanup request cannot reach the service.

For an R2 public custom domain or other public endpoint, expand **Region and public URL** and supply the public bucket root. It must serve the same object keys as the S3 endpoint. Generated manifests and viewer links then use that public domain. This setting does not make a private bucket public. Private links contain no credentials; viewers connect to the bucket themselves and retry the link.

## Browser CORS

The bucket must allow the viewer's origin. For the custom deployment, a policy covering reads and uploads is:

```json
[
  {
    "AllowedOrigins": ["https://colmapview.opsiclear.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Range", "Content-Length", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

Include your localhost origin when using a local viewer. `ETag` is required for multipart uploads; `Content-Range` lets the archive reader validate ranged downloads. A public R2/custom domain needs its own read CORS configuration too. See [R2 CORS configuration](https://developers.cloudflare.com/r2/buckets/cors/) and [S3 CORS configuration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html).
