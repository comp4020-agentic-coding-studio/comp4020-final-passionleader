# Crit 10 reflection

## The breakthrough that moved the work forward

You never know when or where a good idea will come. I wrote one down every
time it came, and kept it as a list to work through later. Those notes
became my two planning files, and the agent turned them into the repo's
documents, so it stopped asking me the same things again.

The other half: UX is something AI doesn't know. It can't tell what feels
awkward and what feels easy; only human experience can fix and improve
that. I found the phone bugs by using the app myself. I also cared a lot
about the music and assets, but the AI doesn't know what the real campus
looks like, so I had to draw it or take photos for it. However good an LLM
is, it can't fully carry real-world data across, and I think jobs might
grow around exactly that.

## What this changed about who I want to be as a developer

I moved files to AWS S3 this week, and what I felt is that infrastructure
still needs human hands. At the very least, someone has to give the server
(or an LLM) an IAM policy with only the permissions it needs. AI doesn't
manage permissions by itself, and even if it could, the risk would be huge.
So I think people will matter more as developers around permissions, and
I'm thinking about a career in cloud permissions management.

I can also see where my own setup is weak. One Fly machine runs the server
and the database in one process, and one bucket holds every kind of file.
If I take this further, I want an internet-facing server kept apart from a
database nothing outside can reach, and buckets split by how secret their
files are.
