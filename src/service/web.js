var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var express = require('express');
var expressSession = require('express-session');
var through = require('through');
var Promise = require('bluebird');
var humanizeDuration = require('humanize-duration');
var GitHubAPI = require('github');

var util = require('../util');
var config = require('../config');
var rpackc = require('./rpackc');
var client = require('./client');
var LogParse = require('./logparse');
var ghauth = require('./github');

Object.values = function (obj) {
  var vals = [];
  for( var key in obj ) {
    if ( obj.hasOwnProperty(key) ) {
      vals.push(obj[key]);
    }
  }
  return vals;
};

var out = client.connect();

var github = new GitHubAPI({
  version: "3.0.0",
  debug: true,
  protocol: "https",
});

github.authenticate({
  type: 'basic',
  username: config.read().github.user,
  password: config.read().github.password,
});

var app = express();

var server = app.listen(process.env.PORT || 3000, function () {
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

app.get('/merge/:org/:repo', githubOAuth.authenticated, function (req, res, next) {
  github.pullRequests.getAll({
    user: req.params.org,
    repo: req.params.repo,
    state: 'open'
  }, function (err, prs) {
    // console.log(err, prs);
    // res.write(JSON.stringify(data) || 'undefined');
    // res.end();
    // prs = (pr for pr in data when not /^\[?(WIP|NRY|NYI)/i.test(pr.title) )
    // return next(err) if err
    res.render('repo-pr', {
      org: req.params.org,
      repo: req.params.repo,
      prs: prs,
    });
  });
  // return
  // res.status(404).end("Not found")
});

app.post('/target/:target/merge/:ref', function (req, res) {
  out.rpc.request('build', {
    ref: {
      id: req.params.target,
    },
    merge: {
      repo: null, // TODO
      ref: req.params.ref,
    }
  })
  .then(function (id) {
    console.error('Build process started.');
    res.redirect('/job/' + String(id.id));
  }, function (err) {
    console.error('Build process finished with error.');
    console.error(err);
    res.redirect('/');
  })
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
    console.log(results);
    res.render('root', {
      title: 'Index',
      jobs: results.jobs,
      plans: results.plans,
      util: util,
      humanizeDuration: humanizeDuration,
    });
  })
})

function withPlan (ref, source) {
  return out.rpc.request('target-plan', ref)
  .then(function (plan) {
    if (plan.build.source) {
      var source = typeof plan.build.source == 'string' ? plan.build.source : plan.build.source.repo;
      if (typeof source == 'string' && source.match(/github\.com/)) {
        // console.log(source);
        var gh = source.match(/github\.com[\/:]([^\/\.]+)\/([^\/]+?)(\.git)?$/);
        if (gh && gh[1] && gh[2]) {
          return Promise.resolve({
            org: gh[1],
            repo: gh[2],
          })
        }
      }
    }

    return Promise.resolve(null);
  })
}

app.get('/target/:target', enforceSlash, function (req, res) {
  var id = req.params.target;

  withPlan({
    id: id,
  })
  .then(function (source) {
    Promise.try(function () {
      if (source) {
        return Promise.promisify(github.pullRequests.getAll)({
          user: source.org,
          repo: source.repo,
          state: 'open'
        });
      }
    })
    .then(function (prs) {
      res.render('target.jade', {
        ref: { id: id },
        org: source && source.org,
        repo: source && source.repo,
        prs: prs,
      });
    });
  }, function () {
    res.status(404);
    res.render('not_found');
  })
})

app.get('/target/:target/branch/', function (req, res) {
  var id = req.params.target;

  withPlan({
    id: id,
  })
  .then(function (source) {
    if (!source) {
      throw new Error('Repo does not exist.');
    }

    github.repos.getBranches({
      user: source.org,
      repo: source.repo,
    }, function (err, branches) {
      res.render('branches.jade', {
        ref: { id: id },
        org: source.org,
        repo: source.repo,
        branches: branches,
      });
    })
  });
});

app.get('/target/:target/branch/:branch', function (req, res) {
  var id = req.params.target;

  withPlan({
    id: id,
  })
  .then(function (source) {
    if (!source) {
      throw new Error('Repo does not exist.');
    }

    github.repos.getCommits({
      user: source.org,
      repo: source.repo,
      sha: req.params.branch,
    }, function (err, data) {
      if (err || !data || !data[0]) {
        res.render('not_found');
      } else {
        console.log(data[0]);
        res.render('target.jade', {
          ref: { id: id },
          org: source.org,
          repo: source.repo,
          commits: data,
        });
      }
    })
  });
})

app.post('/target/:target/build', function (req, res) {
  out.rpc.request('build', {
    ref: { id: req.params.target }
  })
  .then(function (id) {
    console.error('Build process started.');
    res.redirect('/job/' + id.id);
  }, function (err) {
    console.error('Build process finished with error.');
    console.error(err);
    res.status(500);
    res.write(String(err.message || err));
    res.end();
  })
})

app.post('/target/:target/build/:sha', function (req, res) {
  out.rpc.request('build', {
    ref: {
      id: req.params.target,
      sha: req.params.sha
    }
  })
  .then(function (id) {
    console.error('Build process started.');
    res.redirect('/job/' + id.id);
  }, function (err) {
    console.error('Build process finished with error.');
    console.error(err);
    res.status(500);
    res.write(String(err.message || err));
    res.end();
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

function enforceSlash (req, res, next) {
  if (req.url.substr(-1) != '/') {
    res.redirect(301, req.url + '/');
  } else {
    next();
  }
}

app.get('/job/:id/', enforceSlash, function (req, res) {
  var id = parseInt(req.params.id);

  out.rpc.request('job-list')
  .then(function (jobs) {
    if (!jobs[id]) {
      res.status(404);
      res.render('not_found');
    } else {
      console.log(jobs);
      res.render('job', {
        title: 'Job #' + req.params.id,
        job: jobs[id],
        jobs: jobs,
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

  res.write('<!DOCTYPE html>')
  // res.write('');
  // res.write('<script>doscroll = true; lastheight = document.body.scrollHeight; function tobottom () { doscroll && window.scrollTo(0, 1e7); lastheight = document.body.scrollHeight; }</script>');
  // res.write('<script>
  res.write('<script>var xhr = new XMLHttpRequest(); xhr.open("GET", "logstream", true); var last = 0; var halted = false; xhr.addEventListener("progress", function (e) { if (halted) { return; } if (document.hidden) { halted = true; xhr.abort(); document.write("<h1 onclick=\\"location.reload()\\" style=\\"cursor: pointer;\\">CLICK TO REFRESH</h1>"); document.close(); window.stop(); document.addEventListener("visibilitychange", function () { if (document.hidden == false) { location.reload(); } }, false); return; } var chunk = xhr.responseText.slice(last); requestAnimationFrame(function () { if (halted) { return; } document.write(chunk); scrollTo(0, 1e7); }); last = e.loaded; }); xhr.send();</script>');
  res.write('<script>setTimeout(function () { document.write(' + JSON.stringify('<style>' + fs.readFileSync(__dirname + '/static/logstyle.css', 'utf-8') + '</style><pre class="ansi">') + '); }, 0); </script>');
  // res.write('s.addEventListener("message", function(e) { requestAnimationFrame(function () { document.write(e.data); window.scrollTo(0, 1e7); }); })</script>');
  res.end();
});

app.get('/job/:id/logstream', function (req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  var logstream = through(function (data) {
    log.push(data.toString('utf-8'));
  });
  var log = new LogParse(function (data) {
    logstream.queue(data);
  });

  // Polling operator
  // var id = setInterval(function () {
  //   try {
  //     res.write('<script>requestAnimationFrame(tobottom);</script>');
  //   } catch (e) {
  //     clearInterval(id);
  //   }
  // }, 100);

  res.on('error', function () {
    // ignore !
  })


  out.rpc.request('job-output', req.params.id)
  .then(function (stream) {
    stream
    .pipe(logstream)
    .pipe(res);
  }, function (err) {
    // res.status(500).write('<div style="background: red; color: black">' + err.stack);
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

app.get('/admin/killserver', function (req, res) {
  out.rpc.request('die')
  .then(function () {
    res.write('Die request sent.');
    res.end();
  })
})

app.get('/admin/killclient', function (req, res) {
  res.write('Dying brb.')
  res.end();
  setTimeout(function () {
    res.write('Death.')
    process.exit(1);
  }, 3000);
})

app.get('/admin/clean', function (req, res) {
  out.rpc.request('clean')
  .finally(function () {
    res.write('All VMs cleaned up.');
    res.end();
  })
})

app.use(express.static(__dirname + '/static'));

app.use(function (req, res) {
  res.render('not_found');
});
