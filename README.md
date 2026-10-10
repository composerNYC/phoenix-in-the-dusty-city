# Phoenix in the Dusty City

An open-world browser game in the spirit of GTA, set at a desert arts festival. You play Phoenix.

## Play it

- **In your browser, nothing to install:** https://composernyc.github.io/phoenix-in-the-dusty-city/
- **Downloaded, on a Mac:** on GitHub click **Code → Download ZIP**, unzip it, then double-click **Play Phoenix.command**. It starts a small local server and opens the game in your browser. Keep the Terminal window open while you play, and close it when you're done.
  - The first time, macOS may ask whether you want to open it. Right-click the file, choose **Open**, then **Open** again.
  - Opening `index.html` directly does not work, because browsers block the 3D models from loading from a plain file.
- **Downloaded, on Windows:** double-click **Play Phoenix.bat**. It needs Python installed (from python.org, or the Microsoft Store). If you don't have Python, just use the browser link above.
- Keyboard and mouse work best. Phones and tablets get touch controls.

Progress saves automatically in the browser you play in. The online and downloaded copies keep separate saves.

## Controls

| Key | Action |
|---|---|
| W A S D, mouse | Move, look (click to lock the mouse) |
| Shift | Run, pedal hard, floor the art car |
| Space | Jump. On a bike: hop. In the air: A/D spin, W/S flip |
| E | Interact: board, talk, gift, high-five, admire art |
| V | Fly (only Phoenix can) |
| X | Melt time (after the Dream quest) |
| Q · F · H | Art car radio, flame cannons, horn |
| G | Dance |
| Tab | Phone: jobs, outfits, stats |
| M · P · K · T | Map, pause and settings, photo mode, skip an hour |

## What's in the folder

| File | What it is |
|---|---|
| `index.html` | Page, HUD and menus |
| `game.js` | The game: world, characters, vehicles, quests, flight, skydiving, crowds |
| `dali.js` | Surreal Dalí creatures and set pieces |
| `masters.js` | Monet, Van Gogh, Picasso and Dalí art installations |
| `artcars.js` | Art cars after Van Gogh, Monet, Picasso and Dalí |
| `artcars2.js` | Art cars after Hokusai, Kahlo, Klimt, Mondrian, Kandinsky, Warhol, Haring, Kusama, Munch, Magritte, Matisse and Seurat |
| `assets/` | 3D characters and vehicles (the `.json` files are what the game loads) |
| `Play Phoenix.command` | Double-click launcher |

## Coming back to work on it

Open this folder in Claude Code and ask for what you want next. Ideas that came up:
- a longer story across the whole week
- more burner variety
- a costume shop
- saving versions with git

## Credits

Characters: KayKit Adventurers by Kay Lousberg (CC0). Vehicles: Car Kit by Kenney (CC0). Engine: three.js. Everything else is generated in code.
