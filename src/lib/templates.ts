import type { BlockKind, TextKind } from './supabase'

export type KindMeta = { label: string; tagline: string; hint: string }

export const KINDS: Record<BlockKind, KindMeta> = {
  text: { label: 'Notes', tagline: 'Loose thoughts, loglines, to-dos', hint: 'Formatted text' },
  poetry: { label: 'Poetry', tagline: 'Verse, lyrics, voice-over', hint: 'Line breaks & stanzas kept' },
  drama: { label: 'Drama', tagline: 'Screenplays & stage plays', hint: 'Scene, character, dialogue' },
  prose: { label: 'Prose', tagline: 'Stories, treatments, synopses', hint: 'Chapters & scene breaks' },
  file: { label: 'File', tagline: 'PDF, video, audio or image', hint: 'Previewed inline' },
  link: { label: 'Link', tagline: 'A web page, video or reference', hint: 'Rich preview card' },
  resources: { label: 'Resources', tagline: 'A reading list of references', hint: 'Links with notes' },
}

export const PALETTE: BlockKind[] = ['poetry', 'drama', 'prose', 'text', 'file', 'link', 'resources']

export type Template = { id: string; name: string; description: string; title: string; body: string }

const blank = (kind: TextKind): Template => ({
  id: 'blank',
  name: 'Blank page',
  description: 'Start from nothing',
  title: { text: 'Notes', poetry: 'Untitled poem', drama: 'Untitled scene', prose: 'Untitled' }[kind],
  body: '',
})

export const TEMPLATES: Record<TextKind, Template[]> = {
  text: [
    blank('text'),
    {
      id: 'pitch',
      name: 'Film pitch',
      description: 'Logline, hook, tone and audience',
      title: 'The pitch',
      body: `# Working title

**Logline:** When *someone* wants *something*, they must *do something hard* before *it's too late*.

## Why this, why now
A sentence or two on what makes this idea urgent.

## Tone & references
- Feels like:
- Looks like:
- Sounds like:

## Format
Short film · 8–12 minutes · 3 locations`,
    },
    {
      id: 'shotlist',
      name: 'Shot list',
      description: 'Numbered shots with framing notes',
      title: 'Shot list',
      body: `## Scene 1

1. **Wide** — establishing shot of the location at dawn
2. **Medium** — our lead enters frame left
3. **Close-up** — hands, trembling
4. **Insert** — the letter on the table

> Note: shoot golden hour if possible.`,
    },
    {
      id: 'character',
      name: 'Character sheet',
      description: 'Want, need, flaw and voice',
      title: 'Character',
      body: `# Name

**Age:**   **Occupation:**

## Wants
What they're chasing on the surface.

## Needs
What they actually need to learn.

## Flaw
What stands in their way — from the inside.

## Voice
> A line of dialogue only they would say.`,
    },
  ],
  poetry: [
    blank('poetry'),
    {
      id: 'free',
      name: 'Free verse',
      description: 'Open form for voice-over or spoken word',
      title: 'Untitled poem',
      body: `->**Title**<-
->*for someone*<-

The first line lands like light through blinds,
  the second leans in, a little quieter —
    and the third lets go.

A new stanza begins after an empty line,
carrying the image somewhere new.`,
    },
    {
      id: 'sonnet',
      name: 'Sonnet',
      description: '14 lines, three quatrains and a couplet',
      title: 'Sonnet',
      body: `### I

Line one (A)
Line two (B)
Line three (A)
Line four (B)

Line five (C)
Line six (D)
Line seven (C)
Line eight (D)

Line nine (E)
Line ten (F)
Line eleven (E)
Line twelve (F)

  *The turn — line thirteen (G)*
  *and the couplet closes (G)*`,
    },
    {
      id: 'haiku',
      name: 'Haiku sequence',
      description: 'Three 5–7–5 images, one per shot',
      title: 'Haiku',
      body: `Five syllables here
seven syllables follow
five to close the frame

* * *

Second image wakes
a different light, a new room
the cut lands softly`,
    },
    {
      id: 'lyrics',
      name: 'Song / lyrics',
      description: 'Verses, chorus and bridge',
      title: 'Song',
      body: `### Verse 1
First line of the verse
Second line of the verse

### Chorus
**The line everyone remembers**
**Sing it twice**

### Verse 2
…

### Bridge
*Something changes here*`,
    },
  ],
  drama: [
    blank('drama'),
    {
      id: 'screenplay',
      name: 'Screenplay scene',
      description: 'Industry-style film scene',
      title: 'Scene 1',
      body: `FADE IN:

INT. KITCHEN - NIGHT

A single bulb swings over a table set for two. Only one chair is taken. MAYA (30s, paint on her sleeves) stares at the door.

@MAYA
(quietly)
You said eight.

The door opens. LEO (30s) steps in, soaked.

@LEO
I said I'd try.

He sets down a small box. She doesn't touch it.

CUT TO:

EXT. ROOFTOP - CONTINUOUS

Rain. The city hums below.`,
    },
    {
      id: 'stageplay',
      name: 'Stage play',
      description: 'Acts, scenes and stage directions',
      title: 'Act One',
      body: `# Act One

## Scene 1

*A small apartment. Evening. A record player turns, unplayed.*

@ANNA
Did you hear that?

@BEN
(not looking up)
It's the radiator.

@ANNA
Radiators don't knock three times.

*BEN finally looks up. Lights narrow to a single spot.*

---

## Scene 2

*The same room, morning.*`,
    },
    {
      id: 'treatment',
      name: 'Short film beats',
      description: 'Beat sheet for a 5–15 minute film',
      title: 'Beat sheet',
      body: `# Short film beats

## Opening image
What do we see first? Set the tone.

## Setup
Who are we with, and what's their world?

## Inciting moment
The thing that changes everything.

## Escalation
1. First attempt
2. It gets worse
3. Point of no return

## Climax
The hardest choice.

## Final image
Mirror or contradict the opening.`,
    },
  ],
  prose: [
    blank('prose'),
    {
      id: 'story',
      name: 'Short story',
      description: 'Chapters with scene breaks',
      title: 'Short story',
      body: `# The Title

## One

The opening line should make a promise. Write it, then write the next one. Let the paragraph breathe — an empty line starts a new one.

Dialogue lives inside paragraphs here: "Like this," she said.

* * *

A scene break jumps time or place.

## Two

…`,
    },
    {
      id: 'synopsis',
      name: 'Synopsis',
      description: 'One-page summary of the whole story',
      title: 'Synopsis',
      body: `# Synopsis

**Logline:** One sentence that sells it.

## Beginning
Introduce the protagonist, their world and the problem.

## Middle
The struggle escalates. What do they try, and how does it fail?

## End
How it resolves — and what has changed in them.`,
    },
    {
      id: 'treatment',
      name: 'Film treatment',
      description: 'Present-tense prose version of the film',
      title: 'Treatment',
      body: `# Treatment

*Written in the present tense, the way the audience will see it.*

We open on a quiet street at dawn. A girl on a bicycle cuts through the fog, a camera bag bouncing on her back.

* * *

Later, in the darkroom, an image surfaces that she doesn't remember taking.

> Tone: hushed, uncanny, warm.`,
    },
  ],
}
