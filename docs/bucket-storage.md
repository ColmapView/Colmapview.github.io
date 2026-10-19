# Bucket storage

Use the bucket icon on the loading panel, or choose **Share → Bucket** in the viewer, to read datasets from AWS S3, Cloudflare R2, or MinIO, or upload the current COLMAP scene. Transfers go directly between your browser and the bucket.

## Public reads

Choose **Public URL** and paste a dataset folder, `manifest.json`, ZIP, TAR, or splat URL. Public objects need no access key or secret. A bucket can allow object reads while denying listing: use the object's URL or enter its key in **Dataset path** and choose **Load dataset** in that case.

For browsing an anonymously readable S3 bucket, choose **S3 bucket**, enter its complete bucket URL, and leave credentials empty. After connecting, enter a folder or file in **Dataset path** and choose **Load dataset**, or open **Browse files** to select one. Browsing requires listing permission and shows folders and loadable files. **Up one folder** returns to the parent. Without listing permission, conventional `sparse/0/` and `images/` paths still work through the URL loader.

## Private reads and uploads

Enter the complete **Bucket URL**, then fill in **Access key ID** and **Secret key**:

| Service | Bucket URL | Region |
| --- | --- | --- |
| AWS S3 | `https://BUCKET.s3.REGION.amazonaws.com/` | Inferred from the URL |
| Cloudflare R2 | `https://ACCOUNT_ID.r2.cloudflarestorage.com/BUCKET/` | `auto` |
| MinIO | `https://HOST/BUCKET/` | `us-east-1`, or the server's configured region |
| Local MinIO | `http://localhost:9000/BUCKET/` | `us-east-1`, or the configured region |

Supply an S3 access key ID and secret access key; temporary credentials can include a session token. Keys stay in tab memory and sign requests directly to the configured bucket. ColmapView does not send them to its Worker or persist them in settings, manifests, browser storage or viewer links. The form supports password-manager autofill; any saving is controlled by that manager. Disconnect or reload clears the app connection. Signing is restricted to the configured bucket root and cannot follow redirects. See [browser connections](account-sessions.md).

Read access needs `GetObject`, plus `ListBucket` to browse/discover folders. Uploads also need `PutObject` and `AbortMultipartUpload`. ColmapView verifies the uploaded manifest by reading it back, so upload credentials need read access too. ColmapView does not create buckets or change bucket permissions.

**Upload dataset** saves the edited COLMAP model, original images and masks, all selected splat sources, and `colmapview.yaml`. Choose **Format → Folder** (the default) or **ZIP archive** beside Access. Use **Upload folder** to change the default `dataset/` destination. Each upload uses a new UUID subfolder under that destination, preserving previous uploads. Folder format writes its manifest after every asset succeeds and verifies it before showing a viewer link. ZIP format uploads a single portable `dataset.zip`, verifies its size and signature, and links directly to that archive; it does not publish a loose-file manifest. Both formats preserve original files and image metadata by default.

For ZIPs, **Images → JPEG (85% quality)** creates lossy image copies at the original resolution. Source image metadata is removed and transparency becomes white. Image and mask filenames and COLMAP references are updated together; mask, splat, and model data remain lossless. One worker encodes one image at a time before uploading. JPEG, PNG, WebP, GIF, BMP, and TIFF sources are supported when the browser can decode them, up to 64 megapixels and 128 MiB per image. An unsupported image stops preparation with an error, so you can choose **Original files**. The ZIP limit is checked against encoded bytes, including archive overhead.

ZIP packaging completes before any object is uploaded and can be cancelled. The shared browser packager allows up to **2 GiB including ZIP overhead** and **60,000 entries**; use Folder for larger datasets. Files of 32 MiB or more, including ZIPs, use multipart upload with native Blob slices. The packager stores bounded chunks as Blob parts rather than assembling a whole-dataset JavaScript buffer.

Cancel stops the transfer and attempts to abort unfinished multipart uploads. Completed objects remain in the new folder, and an incomplete dataset has no published manifest. A new upload starts a new folder. Configure your bucket's lifecycle rule to remove incomplete multipart uploads if the tab closes or a cleanup request cannot reach the service.

For an R2 public custom domain or other public endpoint, expand **More options** and supply the public bucket root. This section also contains the region override and optional session token. The public root must serve the same object keys as the S3 endpoint. Generated manifests and viewer links then use that public domain. This setting does not make a private bucket public. Private links contain no credentials; viewers connect to the bucket themselves and retry the link.

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
