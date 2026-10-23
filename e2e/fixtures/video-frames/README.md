`colors.mp4` is a synthetic two-frame, 64 × 80 H.264 video (red, then green), generated with:

```sh
ffmpeg -f lavfi -i 'color=c=red:s=64x80:r=1:d=1' -f lavfi -i 'color=c=green:s=64x80:r=1:d=1' -filter_complex '[0:v][1:v]concat=n=2:v=1:a=0,scale=in_color_matrix=bt601:out_color_matrix=bt709' -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -c:v libx264 -pix_fmt yuv420p -g 1 -r 1 -frames:v 2 -movflags +faststart colors.mp4
```

The test binds the two poses to timestamps 0 and 1; the camera and pose files contain no source photographs or feature observations.
