# cloud-buildserver

The build server written in Node.js that I use for my local server that's sitting right next to me at the time of writing this document.

## How to set up

```bash
git clone git@github.com:tjhorner/cloud-buildserver.git
cd cloud-buildserver
cp config.example.json config.json
```

Edit `config.json` and add your build scripts in the scripts folder. Change the authentication password as well. I'll add SSH authentication later somehow.

## Adding a build script

1. Make a script in the `scripts` folder.

2. Make sure it's runnable. Do this by running `chmod +x scripts/yourscript.sh` in a terminal.

3. Add it to your config file. The server will run your scripts the way you put them in your config.
