`colors.mp4` is a synthetic two-frame, 64 × 80 H.264 video (red, then green), generated with:

```sh
ffmpeg -f lavfi -i 'color=c=red:s=64x80:r=1:d=1' -f lavfi -i 'color=c=green:s=64x80:r=1:d=1' -filter_complex '[0:v][1:v]concat=n=2:v=1:a=0,scale=in_color_matrix=bt601:out_color_matrix=bt709' -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -c:v libx264 -pix_fmt yuv420p -g 1 -r 1 -frames:v 2 -movflags +faststart colors.mp4
```

The test binds the two poses to timestamps 0 and 1; the camera and pose files contain no source photographs or feature observations.

`bframes.mp4` is a five-second, 5 fps synthetic pattern with open GOPs and B-frame
reordering. Its reference PNGs come from a complete independent FFmpeg decode at
presentation frame indices 9, 11, 21 and 24 (1.8, 2.2, 4.2 and 4.8 seconds):

```sh
ffmpeg -f lavfi -i 'testsrc2=s=64x80:r=5:d=5' -vf 'scale=in_color_matrix=bt601:out_color_matrix=bt709' -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -c:v libx264 -x264-params 'keyint=10:min-keyint=10:scenecut=0:open-gop=1:bframes=3' -pix_fmt yuv420p -movflags +faststart bframes.mp4
ffmpeg -i bframes.mp4 -vf 'select=eq(n\,24)' -fps_mode passthrough -frames:v 1 reference-4.8.png
```
