var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var express = require('express');
var expressSession = require('express-session');
var through = require('through');
var Promise = require('bluebird');
var humanizeDuration = require('humanize-duration')

var util = require('../util');
var config = require('../config');
var rpackc = require('./rpackc');
var client = require('./client');
var LogParse = require('./logparse');
var ghauth = require('./github');

var out = client.connect();

var app = express();

var server = app.listen(3000, function () {
  var host = server.address().address
  var port = server.address().port
  console.log('Example app listening at http://localhost:%s', port)
})

app.use(expressSession({
  secret: config.read().web.session_secret,
  saveUninitialized: true,
  resave: true
}));

var githubOAuth = ghauth({
  clientId: config.read().github.client_id,
  clientSecret: config.read().github.client_secret,
  scope: 'read:org',
});

githubOAuth.handleAuthorization = function (req, res, authorization, next) {
  githubOAuth.getUserInfo(req, res, authorization, function (err) {
    if (err) {
      return next(err);
    }
    if (authorization.teams.indexOf('tessel/owners') >= 0) {
      req.auth = authorization;
      return next();
    } else {
      err = new Error("Not a Tessel committer")
      err.status = 401
      return next(err);
    }
  });
}

app.use(githubOAuth)
app.get('/login', githubOAuth.authenticated, function (req, res) {
  res.redirect('/');
});
app.use('/auth/github/callback', githubOAuth.callback)
app.get('/logout', githubOAuth.logout, function (req, res) {
  res.redirect(403, '/');
});

app.get('/auth', githubOAuth, function (req, res, next) {
  res.write((req.githubOAuth || {}).login || '');
  res.end();
})

// Views

app.set('views', __dirname + '/views')
app.set('view engine', 'jade');

app.get('/', function (req, res) {
  Promise.props({
    jobs: out.rpc.request('job-list'),
    plans: config.listPlans(),
  })
  .then(function (results) {
    res.render('root', {
      title: 'Index',
      jobs: results.jobs,
      plans: results.plans,
      util: util,
      humanizeDuration: humanizeDuration,
    });
  })
})

app.post('/target/:target/build', function (req, res) {
  out.rpc.request('build', { id: req.params.target })
  .then(function (id) {
    console.error('Build process started.');
  }, function (err) {
    console.error('Build process finished with error.');
    console.error(err);
  })
  .finally(function () {
    res.redirect('/');
    console.log('sent request');
  })
})

app.post('/job/:id/cancel', function (req, res) {
  out.rpc.request('job-cancel', { id: req.params.id })
  .then(function (id) {
    console.log('Cancel without error');
  }, function (err) {
    console.log('Cancel with error', err);
  })
  .finally(function () {
    res.redirect('/job/' + req.params.id);
  })
})

app.get('/job/:id/', function(req, res, next) {
  if (req.url.substr(-1) != '/') {
    res.redirect(301, req.url + '/');
  } else {
    next();
  }
}, function (req, res) {
  var id = parseInt(req.params.id);

  out.rpc.request('job-list')
  .then(function (jobs) {
    if (!jobs[id]) {
      res.status(404);
      res.render('not_found');
    } else {
      res.render('job', {
        title: 'Job #' + req.params.id,
        job: jobs[id],
        id: id,
        humanizeDuration: humanizeDuration,
      });
    }
  });
});

app.get('/job/:id/log', function (req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  var logstream = through(function (data) {
    log.push(data.toString('utf-8'));
  });
  var log = new LogParse(function (data) {
    logstream.queue(data);
  });

  // var stream = out.plex.remoteStream('FS')
  // var stream = fs.createReadStream(__dirname + '/../etc/ok/temp.txt');

  res.write('<!DOCTYPE html>')
  res.write('<style>' + fs.readFileSync(__dirname + '/static/style.css', 'utf-8') + '</style>');
  res.write('<script>doscroll = true; lastheight = document.body.scrollHeight; function tobottom () { doscroll && window.scrollTo(0, 1e7); lastheight = document.body.scrollHeight; }</script>');
  res.write('<pre class="ansi">')

  // Polling operator
  var id = setInterval(function () {
    try {
      res.write('<script>requestAnimationFrame(tobottom);</script>');
    } catch (e) {
      clearInterval(id);
    }
  }, 100);

  res.on('error', function () {
    // ignore !
  })

  out.rpc.request('job-output', req.params.id)
  .then(function (stream) {
    stream.pipe(logstream).pipe(res);
    stream.on('end', function () {
      clearInterval(id);
    })
  }, function (err) {
    res.status(500).write('<div style="background: red; color: black">' + err.stack);
    res.end();
  })
});

app.get('/job/:id/artifact', function(req, res, next) {
  var id = parseInt(req.params.id);

  out.rpc.request('job-artifact', id)
  .then(function (artifact) {
    if (artifact.cached) {
      res.redirect(artifact.url);
    } else {
      res.status(404).write('Artifact not found.').end();
    }
  }, function (err) {
    console.log(err);
    res.status(500).write('Error in retrieving artifact:\n' + err.message)
    res.end();
  });
});

app.use(express.static(__dirname + '/static'));
