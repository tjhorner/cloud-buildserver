var express = require('express'),
    app = express(),
    http = require('http').Server(app),
    io = require('socket.io')(http),
    spawn = require('child_process').spawn,
    config = require('./config.json'),
    bodyParser = require('body-parser'),
    crypto = require('crypto'),
    // colors are super important
    colors = require('colors');

// get a key at https://github.com/settings/tokens/new?description=Cloud%20build%20server&scopes=repo
if(config.keys.github){
  var GitHub = require('github'),
      github = new GitHub({
        version: "3.0.0",
        headers: {
          "user-agent": "cloud build server. source at tjhorner/cloud-buildserver. nothing malicious here :)"
        }
      });

  github.authenticate({
    type: "oauth",
    token: config.keys.github
  });
}

app.use(bodyParser.json());

function logRemote(message, socket, tag){
  // TODO actually fix this bug
  if(message.trim() !== "." && socket) socket.emit("stdout", {stdout: message, tag: tag});
}

function build(scriptIndex, socket, all, hook){
  if(!all) all = true;
  try{
    if(config.scripts[scriptIndex]){
      var scriptName = config.scripts[scriptIndex],
          cleanScriptName = scriptName.split(".")[0];
      logRemote("Running build script " + scriptName + ".", socket);

      var script = spawn("./scripts/" + scriptName);

      script.stdout.setEncoding('utf8');
      script.stdout.on('data', function(data) {
        logRemote(data, socket, cleanScriptName);
      });

      script.on('exit', function(code){
        logRemote("Build script complete with exit code " + code + ".", socket);
        if(code !== 0){
          logRemote("WARNING: Script exited with non-zero exit code. Please check.".red, socket);
          if(hook){
            github.statuses.create({
              user: hook.repository.owner.name,
              repo: hook.repository.name,
              sha: hook.head,
              state: "failure",
              description: "Cloud deployment",
              context: "cloud/deployment"
            });
          }
        }
        if(all){
          build(scriptIndex + 1, socket, true, hook);
        }else{
          logRemote("Script run complete, bye!", socket);
          if(hook){
            github.statuses.create({
              user: hook.repository.owner.name,
              repo: hook.repository.name,
              sha: hook.head,
              state: "success",
              description: "Cloud deployment",
              context: "cloud/deployment"
            });
          }
          if(socket){
            socket.emit("build:complete");
            socket.disconnect();
          }
        }
      });
    }else{
      logRemote("Build complete, bye!", socket);
      if(socket){
        socket.emit("build:complete");
        socket.disconnect();
      }
    }
  }catch(e){
    if(socket) socket.emit("build:complete");
    logRemote("Internal build error, exiting. Error:\n" + e, socket);
  }
}

io.on('connection', function(socket){
  console.log("Incoming connection, awaiting authentication.");

  socket.authenticated = false;

  if(config.auth.type === "plaintext_password"){
    socket.on("key:send", function(key){
      if(key === config.auth.password){
        console.log("Client authentication success.");
        socket.emit("key:success");
        socket.authenticated = true;
      }else{
        console.log("Client authentication failed, disconnecting.");
        socket.emit("key:fail");
        socket.disconnect();
      }
    });
  }

  socket.on("build:run", function(){
    if(socket.authenticated){
      // run the first build script
      build(0, socket);
    }
  });

  socket.on("script:run", function(script){
    if(socket.authenticated){
      // run the script specified by
      // the user
      var script;
      if(config.scripts.indexOf(script) !== -1) script = config.scripts.indexOf(script);
      if(!script) socket.emit("script:noexist"); return;
      build(script, socket, false);
    }
  });

  socket.emit("key:send");

  // authentication timeout
  setTimeout(function(){
    if(!socket.authenticated){
      socket.emit("key:fail");
      console.log("Client did not authenticate within 5 seconds, disconnecting.");
      socket.disconnect();
    }
  }, 5000);
});

app.get("/", function(req, res){
  res.redirect("https://github.com/tjhorner/cloud-buildserver");
});

app.get('/status', function(req, res){
  res.send({ready: true});
});

if(config.keys.github){
  app.post("/github", function(req, res){
    var hook = req.body;
    build(0, undefined, true, hook);
    github.statuses.create({
      user: hook.repository.owner.name,
      repo: hook.repository.name,
      sha: hook.head,
      state: "pending",
      description: "Cloud deployment",
      context: "cloud/deployment"
    });
    res.send({ success: true });
  });
}

http.listen(config.listen_port);
