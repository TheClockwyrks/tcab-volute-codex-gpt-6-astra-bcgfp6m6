# Volute — Controls

This file fixes the input contract: the actions the game reads, what each one is
bound to, how the injector's aim is steered, and which actions each screen
answers. The keyboard and the pointer are the whole input surface, and a mouse,
a pen, and a touch contact all reach the game as one pointer.

## Where input reaches the game

The Simple 2D engine owns the keyboard and the pointer, and the
documentation it ships in `engine/` defines how an action is registered and
read. The build registers every action `ACTIONS` names, under the keys
`BINDINGS` binds it to, and reads the pointer's position for the aim and its
press edge for the shot and for confirm.

## Actions

| Action | Read as | Does |
| --- | --- | --- |
| `left` | held | turns the aim counter-clockwise |
| `right` | held | turns the aim clockwise |
| `a` | edge | fires the loaded core along the aim |
| `b` | edge | exchanges the loaded and queued cores |
| `confirm` | edge | starts a run, and dismisses an ending |
| `pause` | edge | pauses, and resumes |
| `mute` | edge | toggles the audio between muted and unmuted |

A pointer press on `playing` raises `a`, so a shot leaves the injector where the
pointer put the aim. `Space` is bound to both `a` and `confirm`, and the two
never answer on the same screen. `mute` answers on every screen. `up`, `down`,
and `back` come with the layout and drive nothing. The backtick toggles the
engine's debug overlay on every screen.

## Aiming

An update resolves the pointer first and the turn actions second. A pointer
position delivered that update sets the aim to the angle from the injector's
center to that position, and a pointer position exactly at the injector's center
leaves the aim unchanged. A held turn action then turns the aim by 180 degrees
for every second of simulation time the update advances, counter-clockwise on
screen for turn left and clockwise for turn right, and the two held together
turn the aim by nothing.

## Firing and swapping

Fire and swap each raise one request on the press edge, so a held control raises
no further request until it is released and pressed again.
Both are live on `playing` alone, and the frame that raises a request is the
frame that consumes it.

## Confirming with the pointer

`title`, `gameover`, and `victory` read a primary pointer press anywhere on the
field as confirm, on the press edge and once per press, exactly as the keyboard
raises it. A run therefore starts and an ending dismisses without a keyboard.
The whole field is the region, so no part of it answers differently from any
other, and a press outside the field raises nothing.

A touch contact is a pointer, so a contact landing on the field raises confirm
on those three screens as a mouse press does.

The pointer raises no confirm on `playing`, `paused`, `cleared`, or `setback`. A
primary press is the fire control on `playing` and nothing on the other three,
so the pointer's two meanings never answer on the same screen, as `Space`'s two
never do.

## Pausing

Pause is bound to `Escape` and to `KeyP`. Either key opens the pause from
`playing`, and either key returns the game to `playing` from `paused`. The two
keys are interchangeable on both transitions.

## What each screen reads

| Screen | Live |
| --- | --- |
| `title` | confirm starts a run, from the keyboard or a primary pointer press |
| `playing` | the pointer, the two turn actions, fire, swap, and pause, which pauses |
| `paused` | pause, which resumes |
| `cleared`, `setback` | nothing; the interlude runs on its own timer |
| `gameover`, `victory` | confirm dismisses the ending, from the keyboard or a primary pointer press |

An action a row omits does nothing on that screen. Mute is live on every screen.
