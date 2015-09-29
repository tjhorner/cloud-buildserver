var express = require('express'),
    app = express(),
    http = require('http').Server(app),
    io = require('socket.io')(http),
    spawn = require('child_process').spawn,
    config = require('./config.json'),
    // colors are super important
    colors = require('colors');

app.get('/status', function(req, res){
  res.send({ready: true});
});

function logRemote(message, socket, tag){
  console.log(message.trim());
  // TODO actually fix this bug
  if(message.trim() !== ".") socket.emit("stdout", {stdout: message, tag: tag});
}

function build(scriptIndex, socket, all){
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
        }
        if(all){
          build(scriptIndex + 1, socket);
        }else{
          logRemote("Script run complete, bye!", socket);
          socket.emit("build:complete");
          socket.disconnect();
        }
      });
    }else{
      logRemote("Build complete, bye!", socket);
      socket.emit("build:complete");
      socket.disconnect();
    }
  }catch(e){
    socket.emit("build:complete");
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

http.listen(config.listen_port);
