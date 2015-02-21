var request = require('request');
var qs = require('querystring');
var crypto = require('crypto');

module.exports = function(opts) {
  if (!opts.scope) opts.scope = 'user';

  var self = function (req, res, next) {
    req.githubOAuth = self.getAuthentication(req);
    next();
  }

  self.authenticated = function authorize(req, res, next) {
    if (self.getAuthentication(req)) {
      return next();
    }

    req.session.gh_path_after_login = req.originalUrl;
    self.login(req, res);
  };

  self.login = function (req, res) {
    var state = crypto.randomBytes(8).toString('hex');
    req.session.gh_oauth_state = state;

    res.redirect(302, 'https://github.com/login/oauth/authorize?' + qs.stringify({
      client_id: opts.clientId,
      scope: opts.scope,
      state: state,
    }))
  };

  self.callback = function (req, res, next) {
    var originalUrl = req.session.gh_path_after_login;
    delete req.gh_path_after_login;
    var state = req.session.gh_oauth_state;
    delete req.session.gh_oauth_state;

    if (req.query.state != state) {
      var err = new Error("OAuth state mismatch");
      err.status = 400;
      return next(err);
    }

    if (!req.query.code) {
      var err = new Error("OAuth state mismatch");
      err.status = 400;
      return next(err);
    }

    request.get({uri: 'https://github.com/login/oauth/access_token', qs:{
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: req.query.code,
    }}, function(error, clientResp, body) {
      if (error) {
        return next(error);
      }
      var authorization = qs.parse(body);

      self.handleAuthorization(req, res, authorization, function(err) {
        if (err) return next(err);
        req.session.githubOAuth = authorization;
        res.redirect(302, originalUrl);
      });
    });
  };

  self.getUserInfo = self.handleAuthorization = function (req, res, authorization, next) {
    var headers = {"Authorization": "token "+authorization.access_token, 'User-Agent': 'request'};
    request.get({uri: 'https://api.github.com/user', json:true, headers: headers},
      function (error, clientResp, body) {
        if (error || clientResp.statusCode != 200) return next(error || new Error(body.message || body));
        authorization.login = body.login;
        authorization.avatar_url = body.avatar_url;
        request.get({uri: 'https://api.github.com/user/teams', json:true, headers: headers},
          function (error, clientResp, body) {
            if (error || clientResp.statusCode != 200) return next(error || new Error(body.message || body));
            authorization.teams = [];
            body.forEach(function(team) {
              authorization.teams.push(team.organization.login + '/' + team.slug);
            });
            next();
          });
      });
  };

  self.getAuthentication = function (req) {
    return req.session.githubOAuth;
  };

  self.logout = function (req, res, next) {
    delete req.session.githubOAuth;
    next();
  };

  return self;
}
