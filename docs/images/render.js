// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Renders an SVG to a PNG. usage: gjs -m docs/images/render.js <in.svg> <out.png> <width> <height>
import Rsvg from 'gi://Rsvg';
import cairo from 'cairo';

const [input, output, width, height] = [ARGV[0], ARGV[1], Number(ARGV[2]), Number(ARGV[3])];
const handle = Rsvg.Handle.new_from_file(input);
const surface = new cairo.ImageSurface(cairo.Format.ARGB32, width, height);
const cr = new cairo.Context(surface);
handle.render_document(cr, new Rsvg.Rectangle({ x: 0, y: 0, width, height }));
cr.$dispose();
surface.writeToPNG(output);
print(`${output} ${width}x${height}`);
