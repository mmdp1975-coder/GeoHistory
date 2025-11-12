
import os
import glob
from PIL import Image
import argparse

def write_video_moviepy(frame_paths, out_path, fps=12):
    try:
        from moviepy.editor import ImageSequenceClip
    except Exception as e:
        raise RuntimeError("moviepy not available: " + str(e))
    clip = ImageSequenceClip(frame_paths, fps=fps)
    # Use a widely compatible codec
    clip.write_videofile(out_path, codec="libx264", audio=False, bitrate="6M", preset="medium")

def write_video_imageio(frame_paths, out_path, fps=12):
    import imageio.v3 as iio
    # imageio uses ffmpeg under the hood; ensure availability
    frames = [iio.imread(p) for p in frame_paths]
    iio.imwrite(out_path, frames, fps=fps, codec="libx264", quality=9)

def main():
    parser = argparse.ArgumentParser(description="Assemble PNG frames into an MP4 video.")
    parser.add_argument("--frames_dir", default="frames_hand_circle_16x9", help="Directory containing frame_####.png")
    parser.add_argument("--out", default="hand_circle.mp4", help="Output MP4 path")
    parser.add_argument("--fps", type=int, default=12, help="Frames per second")
    args = parser.parse_args()

    frame_paths = sorted(glob.glob(os.path.join(args.frames_dir, "frame_*.png")))
    if not frame_paths:
        raise SystemExit(f"No frames found in {args.frames_dir}. Expected files like frame_0001.png")

    # Try moviepy first, then imageio
    try:
        write_video_moviepy(frame_paths, args.out, fps=args.fps)
        print(f"Video written (moviepy): {args.out}")
        return
    except Exception as e:
        print("moviepy path failed:", e)

    try:
        write_video_imageio(frame_paths, args.out, fps=args.fps)
        print(f"Video written (imageio): {args.out}")
    except Exception as e:
        raise SystemExit("Failed to write video with moviepy and imageio. Install one of them (pip install moviepy) or use ffmpeg CLI. Error: " + str(e))

if __name__ == "__main__":
    main()
