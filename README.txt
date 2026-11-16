TURTLE MOUNTAIN CLIMB — VERSION 3 (CLASSROOM TRIAL)

WHAT'S NEW
- Three faster betting races: 3 turtles / 10 seconds, 4 turtles / 12 seconds, 5 turtles / 15 seconds.
- Prior to the betting races, the mountain shows ONLY labeled starting points (A/B/C etc.). Complete paths appear as the turtles race.
- Five starting coins; betting maximum remains three.
- Turtle Workshop: one coin buys +1 slope, or +10 feet starting elevation. Students with fewer than three coins get the free y=3x turtle.
- The Alpine Lake Championship races all students at once (server limit 40), rather than separate heats. Race duration is 20 seconds.
- The lake is a finishing-elevation target between 60 and 110 feet. A turtle below 60 falls short; a turtle above 110 overshoots. Among turtles landing in the lake, the five closest to 85 feet win. Ties: fewer coins spent, then name alphabetically. This is a landing challenge, not literally a first-across-the-finish-line race, since x represents time and all turtles move horizontally at the same rate.
- A celebratory animated lake-swimming scene shows the five successful winners by their actual student names.

BEFORE CLASS
1. Keep a copy of your working Version 2 ZIP.
2. Extract this ZIP. Upload server.js, app.js, index.html, style.css, package.json and README.txt to the ROOT of your existing GitHub repository, replacing matching files.
3. Commit changes. Wait until Render says 'Live'. Render should retain the same URL; don't delete your Render service.
4. Test on a SCHOOL Chromebook, including teacher-hosted session + student join + a bet.
5. Make a new teacher room after deployment. Old in-progress games are not retained across deployments.

RELIABILITY NOTES
- Syntax checked with Node 22.
- Simulated 30 students joining, betting in each round, building turtles, and completing the championship without errors.
- Has NOT been tested on a 30-Chromebook classroom network or on your school's content filter.
- This is a prototype; do not sell access as a production classroom service without further reliability and privacy work.

GAMEPLAY NOTE
Players may enter a nickname rather than a full name. The app keeps game state in server memory, so if Render restarts, room data disappears and the teacher needs to create a new game.
