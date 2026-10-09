# TODO: author a pool in the editor

A preset's `pool` (candidate wedges, how many to draw, and affinity groups) is read, kept, and drawn
at load, but the editor has no controls for it. It shows a pooled preset's static `segments` only,
which for the wheel-of-D sample is none, and saving keeps the pool untouched.

Wanted: a pool section listing candidates like the wedge list, a draw count, and affinity groups
with their boost, plus a "draw again" preview.
