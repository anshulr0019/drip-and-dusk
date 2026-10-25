"""Prepare the supplied Gemini films as a silent, cyclic website hero.
Usage: python3 scripts/prepare-hero-video.py /path/to/Downloads
Originals are read without modification. Requires ffmpeg and ffprobe.
"""
import argparse,json,pathlib,subprocess
parser=argparse.ArgumentParser();parser.add_argument('source',type=pathlib.Path);args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];assets=root/'dist/assets'
inputs=[args.source/'d&d-v3.mp4',args.source/'d&d-v2.mp4',args.source/'d&d-v1.mp4']
for p in inputs:
 if not p.is_file():raise SystemExit(f'Missing input: {p.name}')
# Two full 10-second shots and the clear portions of the Noir shot.
# Noir has visible ghosting mid-clip: join 0–2.5s to 6.5–10s with a 0.4s dissolve.
# Append the first shot once more, then trim from its 0.8-second point to
# the same point in the appended copy. The end and start therefore meet
# in the same shot, rather than jumping between two different bottles.
normal='fps=24,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,trim=duration=10,settb=AVTB,setpts=PTS-STARTPTS'
graph=(f'[0:v]{normal},split=2[a][again];[1:v]{normal}[b];[2:v]{normal},split=2[cstart][cend];'
 '[cstart]trim=end=2.5,setpts=PTS-STARTPTS[ca];'
 '[cend]trim=start=6.5:end=10,setpts=PTS-STARTPTS[cb];'
 '[ca][cb]xfade=transition=fade:duration=0.4:offset=2.1[c];'
 '[a][b]xfade=transition=fade:duration=0.8:offset=9.2[ab];'
 '[ab][c]xfade=transition=fade:duration=0.8:offset=18.4[abc];'
 '[abc][again]xfade=transition=fade:duration=0.8:offset=23.2[cycle];'
 '[cycle]trim=start=0.8:end=24,setpts=PTS-STARTPTS,format=yuv420p[out]')
cmd=['ffmpeg','-hide_banner','-loglevel','warning','-y']
for p in inputs:cmd+=['-i',str(p)]
cmd+=['-filter_complex',graph,'-map','[out]','-an','-c:v','libx264','-preset','medium','-crf','24','-profile:v','main','-level:v','3.1','-pix_fmt','yuv420p','-movflags','+faststart',str(assets/'fragrance-loop.mp4')]
subprocess.run(cmd,check=True)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(assets/'fragrance-loop.mp4'),'-frames:v','1','-q:v','3',str(assets/'hero-poster.jpg')],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(assets/'fragrance-loop.mp4')]))
assert all(s['codec_type']!='audio' for s in probe['streams'])
print(json.dumps({'duration':probe['format']['duration'],'bytes':(assets/'fragrance-loop.mp4').stat().st_size,'audio':False,'codec':probe['streams'][0]['codec_name'],'width':probe['streams'][0]['width'],'height':probe['streams'][0]['height']}))
